# Project Command Center — one scheduled sync tick (TODO.md CC-9).
#
# Runs /command-center-sync headlessly. Registered in Task Scheduler to fire every
# 10 minutes on weekdays across business hours; see scripts/install-sync-task.ps1.
# Deliberately quiet: it writes one line per run to logs/sync-<month>.log and
# nothing to the console, because ~48 runs a day is only tolerable if it is silent.

$ErrorActionPreference = 'Continue'   # a failed tick must not kill the schedule

$repo    = 'C:\Users\AlexChang\project-command-center'
$claude  = 'C:\Users\AlexChang\.local\bin\claude.exe'
$nodeDir = 'C:\Users\AlexChang\Tools\node'   # portable node — no admin on this machine
$logDir  = Join-Path $repo 'logs'
$lock    = Join-Path $repo 'data\.sync.lock'
$log     = Join-Path $logDir ('sync-' + (Get-Date -Format 'yyyy-MM') + '.log')
$outFile = Join-Path $logDir 'last-run.out'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
function Note($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content -Path $log -Encoding utf8 }

# A sync takes minutes and the tick is every 10, so a slow run must never be joined
# by the next one — both would write data/tasks.json and the later write would win
# (CC-4). Task Scheduler's IgnoreNew covers scheduled-vs-scheduled; this lock also
# covers the dashboard's own Sync button, and reclaims itself after 15 minutes so a
# crashed run cannot wedge the schedule permanently.
if (Test-Path $lock) {
  $age = (Get-Date) - (Get-Item $lock).LastWriteTime
  if ($age.TotalMinutes -lt 15) {
    Note ("skip: a sync has been running for {0:n0}m" -f $age.TotalMinutes)
    exit 0
  }
  Note ("reclaiming stale lock ({0:n0}m old)" -f $age.TotalMinutes)
}
Set-Content -Path $lock -Value $PID -Encoding utf8

try {
  Set-Location $repo
  $env:PATH = "$nodeDir;$env:PATH"
  $started = Get-Date

  # Redirection is handed to cmd.exe on purpose: in Windows PowerShell 5.1, `2>&1`
  # on a native exe wraps each stderr line in an ErrorRecord and reports failure
  # even on a clean exit 0. Letting cmd do it keeps the exit code honest.
  $cmd = '"{0}" -p "/command-center-sync" --permission-mode bypassPermissions > "{1}" 2>&1' -f $claude, $outFile
  & cmd.exe /c $cmd
  $code = $LASTEXITCODE
  $secs = [int]((Get-Date) - $started).TotalSeconds

  $tail = ''
  if (Test-Path $outFile) {
    $tail = ((Get-Content $outFile | Where-Object { $_.Trim() } | Select-Object -Last 2) -join ' | ')
    if ($tail.Length -gt 300) { $tail = $tail.Substring(0, 300) }
  }
  Note "exit=$code ${secs}s :: $tail"
} catch {
  Note "FAILED: $($_.Exception.Message)"
} finally {
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
}
