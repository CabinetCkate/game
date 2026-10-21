param([switch]$DryRun, [switch]$WindowsAuthentication)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Import-Environment.ps1')
$taskSqlFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'database/sqlserver/03_ShowSessions.sql'
if ($DryRun) { Get-Content -LiteralPath $taskSqlFile; return }
if (-not $env:DATABASE_URL.StartsWith('sqlserver://')) { throw 'DATABASE_URL must use SQL Server.' }
$taskParts = $env:DATABASE_URL.Substring(12).Split(';')
$taskBuilder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$taskBuilder['Data Source'] = $taskParts[0].Replace(':', ',')
$taskBuilder['Connect Timeout'] = 10
foreach ($taskPart in $taskParts | Select-Object -Skip 1) {
    if ($taskPart -match '^([^=]+)=(.*)$') {
        switch ($Matches[1]) {
            'database' { $taskBuilder['Initial Catalog'] = $Matches[2] }
            'user' { $taskBuilder['User ID'] = $Matches[2] }
            'password' { $taskBuilder['Password'] = $Matches[2] }
            'encrypt' { $taskBuilder['Encrypt'] = $Matches[2] }
            'trustServerCertificate' { $taskBuilder['TrustServerCertificate'] = $Matches[2] }
        }
    }
}
if ($WindowsAuthentication) {
    $taskBuilder.Remove('User ID') | Out-Null
    $taskBuilder.Remove('Password') | Out-Null
    $taskBuilder['Integrated Security'] = $true
}
$taskConnection = [System.Data.SqlClient.SqlConnection]::new($taskBuilder.ConnectionString)
try {
    $taskConnection.Open()
    $taskCommand = $taskConnection.CreateCommand()
    $taskCommand.CommandTimeout = 30
    $taskCommand.CommandText = [IO.File]::ReadAllText($taskSqlFile)
    [void]$taskCommand.ExecuteNonQuery()
    Write-Host 'Show migration applied. Existing progress preserved.'
} finally { $taskConnection.Dispose() }
