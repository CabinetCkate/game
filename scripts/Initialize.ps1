$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) { Write-Host '.env already exists; keeping your configuration.'; return }
function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
$content = Get-Content -LiteralPath (Join-Path $projectRoot '.env.example') -Raw
$content = $content.Replace('replace-with-a-random-secret-at-least-32-characters', (New-Secret))
$content = $content.Replace('replace-with-another-random-secret-at-least-32-characters', (New-Secret))
[System.IO.File]::WriteAllText($envPath, $content, (New-Object System.Text.UTF8Encoding $false))
Write-Host 'Created .env with app secrets. Set DATABASE_URL after running database/sqlserver scripts in SSMS. Do not commit it.'
