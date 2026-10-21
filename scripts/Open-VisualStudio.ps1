$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Install Visual Studio 2022 with the ASP.NET and web development workload.' }
$ide = & $vswhere -latest -version '[17.12,18.0)' -products '*' -requires Microsoft.VisualStudio.Workload.NetWeb -property productPath | Select-Object -First 1
if (-not $ide -or -not (Test-Path -LiteralPath $ide)) { throw 'Visual Studio 2022 17.12 or newer with ASP.NET and web development is required.' }
# Opening the IDE is the requested interactive action.
Start-Process -FilePath $ide -ArgumentList ('"{0}"' -f (Join-Path $projectRoot 'GamifiedLearningSystem.sln'))
