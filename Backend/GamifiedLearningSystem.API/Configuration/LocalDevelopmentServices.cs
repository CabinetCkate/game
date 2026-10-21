using System.Diagnostics;

namespace GamifiedLearningSystem.API.Configuration;

// Enabled by the Visual Studio Development launch profiles, never by deployment.
public sealed class LocalDevelopmentServices(IHostEnvironment environment, IConfiguration config,
    string apiUrl, ILogger<LocalDevelopmentServices> logger) : IHostedLifecycleService, IDisposable
{
    private readonly List<Process> children = [];
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(5) };

    public Task StartingAsync(CancellationToken ct) => Task.CompletedTask;
    public Task StoppingAsync(CancellationToken ct) => Task.CompletedTask;
    public Task StoppedAsync(CancellationToken ct) => Task.CompletedTask;

    public async Task StartedAsync(CancellationToken ct)
    {
        // Kestrel is listening now. A loaded HTML page alone does not prove that login works.
        var website = new Uri($"http://localhost:{config.GetValue("LocalDevelopment:FrontendPort", 8080)}/");
        await WaitUntilReadyAsync("API and database", new Uri(apiUrl.Split(';')[0].TrimEnd('/') + "/health"), 200, null, ct);
        await WaitUntilReadyAsync("Website API connection", new Uri(website, "api/students/me"), 401, null, ct);
        logger.LogInformation("Game is ready: {Url}", website);
        if (config.GetValue<bool>("LocalDevelopment:OpenBrowser"))
            Process.Start(new ProcessStartInfo(new Uri(website, "#login").AbsoluteUri) { UseShellExecute = true });
    }

    public async Task StartAsync(CancellationToken ct)
    {
        var root = new DirectoryInfo(environment.ContentRootPath);
        while (root is not null && !File.Exists(Path.Combine(root.FullName, "GamifiedLearningSystem.sln"))) root = root.Parent;
        if (root is null) throw new InvalidOperationException("Open GamifiedLearningSystem.sln from the complete game folder.");
        var local = LocalEnvironment.Read(root.FullName);
        var dataUrl = new Uri(config["DataService:Url"] ?? "http://localhost:4000/");
        var frontendPort = config.GetValue("LocalDevelopment:FrontendPort", 8080);
        // An IDE can inherit an older API_PORT. Tell an already running Vite server
        // which binding this debug session actually uses, without restarting the website.
        var runtimeDirectory = Path.Combine(root.FullName, "artifacts");
        Directory.CreateDirectory(runtimeDirectory);
        var bindingPath = Path.Combine(runtimeDirectory, $"local-api-{frontendPort}.json");
        var temporaryPath = bindingPath + $".{Environment.ProcessId}.tmp";
        await File.WriteAllTextAsync(temporaryPath, System.Text.Json.JsonSerializer.Serialize(new
            { pid = Environment.ProcessId, url = apiUrl.Split(';')[0] }), ct);
        File.Move(temporaryPath, bindingPath, overwrite: true);
        try
        {
            await EnsureAsync("Data service", Path.Combine(root.FullName, "PrismaService"),
                "node_modules/tsx/dist/cli.mjs", ["watch", "src/server.ts"], new Uri(dataUrl, "health/ready"),
                new() { ["PORT"] = dataUrl.Port.ToString(), ["DATA_SERVICE_KEY"] = config["DataService:Key"]! }, local, ct);
            await EnsureAsync("Website", Path.Combine(root.FullName, "Frontend"),
                "node_modules/vite/bin/vite.js", ["--host", "0.0.0.0", "--port", frontendPort.ToString(), "--strictPort"],
                new Uri($"http://localhost:{frontendPort}/"), new() { ["API_PROXY_TARGET"] = apiUrl.Split(';')[0] }, local, ct);
            logger.LogInformation("Game website: http://localhost:{Port}", frontendPort);
        }
        catch { StopChildren(); throw; }
    }

    private async Task EnsureAsync(string name, string directory, string entry, string[] arguments,
        Uri health, Dictionary<string, string> overrides, Dictionary<string, string> local, CancellationToken ct)
    {
        var status = await StatusAsync(health, ct);
        if (status == 200) { logger.LogInformation("Using the running {Service} at {Url}", name, health); return; }
        if (status is not null)
        {
            // SQL Server can still be warming up after the laptop starts.
            await WaitUntilReadyAsync(name, health, 200, null, ct);
            return;
        }
        if (!health.IsLoopback) throw new InvalidOperationException($"Start the remote {name} at {health} before debugging.");
        var script = Path.Combine(directory, entry.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(script)) throw new InvalidOperationException($"Missing {script}. Run npm ci in {directory} first.");
        var start = new ProcessStartInfo("node.exe")
        {
            WorkingDirectory = directory, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true
        };
        start.ArgumentList.Add(script);
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        foreach (var (key, value) in local) if (!start.Environment.ContainsKey(key)) start.Environment[key] = value;
        foreach (var (key, value) in overrides) start.Environment[key] = value;
        var process = new Process { StartInfo = start };
        process.OutputDataReceived += (_, e) => { if (e.Data is not null) logger.LogInformation("{Service}: {Output}", name, e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) logger.LogWarning("{Service}: {Output}", name, e.Data); };
        if (!process.Start()) { process.Dispose(); throw new InvalidOperationException($"Could not start {name}."); }
        children.Add(process); process.BeginOutputReadLine(); process.BeginErrorReadLine();
        await WaitUntilReadyAsync(name, health, 200, process, ct);
    }

    private async Task WaitUntilReadyAsync(string name, Uri health, int expectedStatus, Process? process, CancellationToken ct)
    {
        var deadline = DateTime.UtcNow.AddSeconds(120);
        do
        {
            ct.ThrowIfCancellationRequested();
            if (process?.HasExited == true) throw new InvalidOperationException($"{name} stopped with exit code {process.ExitCode}. Check its output above.");
            var status = await StatusAsync(health, ct);
            if (status == expectedStatus) return;
            if (health.AbsolutePath == "/health/ready" && status == 401)
                throw new InvalidOperationException("Data service authentication failed. DATA_SERVICE_KEY must match the shared .env; restart the old data service.");
            await Task.Delay(500, ct);
        } while (DateTime.UtcNow < deadline);
        throw new InvalidOperationException($"{name} did not become ready at {health}. Check SQL Server, API_PORT, API_PROXY_TARGET and the service output.");
    }

    private async Task<int?> StatusAsync(Uri url, CancellationToken ct)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            if (url.AbsolutePath == "/health/ready") request.Headers.Add("X-Service-Key", config["DataService:Key"]);
            using var response = await http.SendAsync(request, ct);
            return (int)response.StatusCode;
        }
        catch (HttpRequestException) { return null; }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return null; }
    }

    private void StopChildren()
    {
        foreach (var process in children.AsEnumerable().Reverse())
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) { }
            finally { process.Dispose(); }
        }
        children.Clear();
    }

    public Task StopAsync(CancellationToken ct) { StopChildren(); return Task.CompletedTask; }
    public void Dispose() { StopChildren(); http.Dispose(); }
}
