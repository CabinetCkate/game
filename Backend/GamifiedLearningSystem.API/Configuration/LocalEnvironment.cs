namespace GamifiedLearningSystem.API.Configuration;

// Local IDE launches share the repository .env with the data service.
// Deployment and test environment variables still take precedence.
public static class LocalEnvironment
{
    public static string ApiUrl(string? configuredUrls, string? environmentPort, IReadOnlyDictionary<string, string> local)
    {
        // Explicit --urls / ASPNETCORE_URLS bindings still control deployment and tests.
        if (!string.IsNullOrWhiteSpace(configuredUrls)) return configuredUrls;
        var portValue = !string.IsNullOrWhiteSpace(environmentPort) ? environmentPort
            : local.TryGetValue("API_PORT", out var localPort) ? localPort : "5080";
        if (!int.TryParse(portValue, out var port) || port is < 1 or > 65535)
            throw new InvalidOperationException("API_PORT must be a port number between 1 and 65535.");
        return $"http://localhost:{port}";
    }

    public static Dictionary<string, string> Read(string startDirectory)
    {
        for (var directory = new DirectoryInfo(startDirectory); directory is not null; directory = directory.Parent)
        {
            var path = Path.Combine(directory.FullName, ".env");
            if (!File.Exists(path)) continue;
            var values = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var line in File.ReadLines(path))
            {
                var separator = line.IndexOf('=');
                if (separator <= 0 || line.StartsWith('#')) continue;
                values[line[..separator].Trim()] = line[(separator + 1)..];
            }
            return values;
        }
        return new(StringComparer.Ordinal);
    }
}
