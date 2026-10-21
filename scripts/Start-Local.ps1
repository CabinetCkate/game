param(
    [ValidateSet('All', 'Data', 'Api', 'Frontend')]
    [string]$Service = 'All',
    [switch]$DryRun,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Import-Environment.ps1')
$apiPort = if ($env:API_PORT) { [int]$env:API_PORT } else { 5080 }

$services = @{
    Data = @{ Title = 'Game - Data service (4000)'; Directory = 'PrismaService'; Command = 'npm run dev' }
    Api = @{ Title = "Game - API ($apiPort)"; Directory = ''; Command = "dotnet run --project Backend/GamifiedLearningSystem.API --no-launch-profile --urls http://localhost:$apiPort" }
    Frontend = @{ Title = 'Game - Website (8080)'; Directory = 'Frontend'; Command = 'npm run dev -- --strictPort' }
}

function Get-ServiceStatus([string]$Url, [hashtable]$Headers = @{}) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers $Headers -TimeoutSec 3
        return [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return $null
    }
}

if ($Service -eq 'All') {
    foreach ($command in @('powershell.exe', 'node', 'npm.cmd', 'dotnet')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is not installed or is missing from PATH." }
    }
    foreach ($relativePath in @('.env', 'PrismaService/node_modules', 'Frontend/node_modules')) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relativePath))) { throw "Missing $relativePath. Complete the project setup first." }
    }
    $checks = @{
        Data = @{ Url = 'http://localhost:4000/health/ready'; Headers = @{ 'X-Service-Key' = $env:DATA_SERVICE_KEY } }
        Api = @{ Url = "http://localhost:$apiPort/health"; Headers = @{} }
        Frontend = @{ Url = 'http://localhost:8080/'; Headers = @{} }
    }
    $logDirectory = Join-Path $projectRoot 'artifacts'
    if (-not $DryRun) { New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null }
    foreach ($serviceName in @('Data', 'Api', 'Frontend')) {
        if ($DryRun) {
            $entry = $services[$serviceName]
            Write-Host "$serviceName : $(Join-Path $projectRoot $entry.Directory)"
            Write-Host $entry.Command
            continue
        }
        $check = $checks[$serviceName]
        $status = Get-ServiceStatus $check.Url $check.Headers
        if ($serviceName -eq 'Frontend' -and $status -eq 200 -and
            (Get-ServiceStatus 'http://localhost:8080/api/students/me') -ne 401) {
            # Only restart this project's Vite server, never another app on port 8080.
            $vitePath = Join-Path $projectRoot 'Frontend\node_modules\vite\bin\vite.js'
            $viteProcesses = @(Get-CimInstance Win32_Process | Where-Object {
                $_.Name -eq 'node.exe' -and $_.CommandLine -and
                $_.CommandLine.Contains($vitePath) -and
                $_.CommandLine -match '--port\s+8080(?:\s|$)'
            })
            if ($viteProcesses.Count -ne 1) {
                throw 'The website proxy is unavailable. Close this project''s old frontend and run Start-Game.cmd again.'
            }
            Write-Host 'Restarting the project website to refresh its API connection.'
            Stop-Process -Id $viteProcesses[0].ProcessId
            $status = $null
        }
        if ($status -eq 200) {
            Write-Host "Using running $serviceName at $($check.Url)"
            continue
        }
        if ($null -ne $status) {
            Write-Host "Waiting for $serviceName and SQL Server to become ready..."
            $deadline = (Get-Date).AddSeconds(120)
            do {
                if ($serviceName -eq 'Data' -and $status -eq 401) {
                    throw 'Data service authentication failed. Restart the old data service with the shared DATA_SERVICE_KEY from .env.'
                }
                Start-Sleep -Milliseconds 500
                $status = Get-ServiceStatus $check.Url $check.Headers
                if ($status -eq 200) { break }
            } while ((Get-Date) -lt $deadline)
            if ($status -ne 200) { throw "$serviceName did not become ready. Check SQL Server and .env settings." }
            continue
        }
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $stdout = Join-Path $logDirectory "local-$serviceName-$stamp.stdout.log"
        $stderr = Join-Path $logDirectory "local-$serviceName-$stamp.stderr.log"
        Write-Host "Starting $serviceName. Logs: $stdout"
        $process = Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -PassThru -WorkingDirectory $projectRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', ('"{0}"' -f $PSCommandPath), '-Service', $serviceName
        )
        $deadline = (Get-Date).AddSeconds(120)
        do {
            $process.Refresh()
            if ($process.HasExited) { throw "$serviceName stopped. Check $stdout and $stderr." }
            $status = Get-ServiceStatus $check.Url $check.Headers
            if ($status -eq 200) { break }
            Start-Sleep -Milliseconds 500
        } while ((Get-Date) -lt $deadline)
        if ($status -ne 200) { throw "$serviceName did not become ready. Check $stdout and $stderr." }
    }
    if ($DryRun) { return }
    # A page can load even when an older Vite process points to a stopped API.
    if ((Get-ServiceStatus 'http://localhost:8080/api/students/me') -ne 401) {
        throw "The website cannot reach the API. Restart the frontend so its proxy uses API_PORT=$apiPort from .env."
    }
    Write-Host 'Website: http://localhost:8080'
    Write-Host 'All services are ready. Logs are saved in artifacts. Running services are reused on the next launch.'
    if (-not $NoBrowser) { Start-Process 'http://localhost:8080/#login' }
    return
}

$entry = $services[$Service]
$Host.UI.RawUI.WindowTitle = $entry.Title
Set-Location -LiteralPath (Join-Path $projectRoot $entry.Directory)
Write-Host $entry.Title
Write-Host "Folder: $((Get-Location).Path)"
Write-Host $entry.Command
if ($DryRun) { return }

switch ($Service) {
    'Data' {
        . (Join-Path $PSScriptRoot 'Import-Environment.ps1')
        & npm.cmd run dev
    }
    'Api' {
        . (Join-Path $PSScriptRoot 'Import-Environment.ps1')
        # Limit MSBuild workers on local machines, and surface build errors before launch.
        & dotnet build Backend/GamifiedLearningSystem.API -m:1 --verbosity minimal
        if ($LASTEXITCODE -ne 0) { throw 'API build failed. Check the build output above.' }
        & dotnet run --project Backend/GamifiedLearningSystem.API --no-build --no-launch-profile --urls "http://localhost:$apiPort"
    }
    'Frontend' { & npm.cmd run dev -- --strictPort }
}
if ($LASTEXITCODE -ne 0) { throw "$Service stopped with exit code $LASTEXITCODE. Check the error above." }
