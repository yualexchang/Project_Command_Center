# Registers the Project Command Center scheduled sync (TODO.md CC-9).
#
# Every 10 minutes, Mon-Fri, 08:00-18:00 local. User-level — no admin rights are
# needed or requested on this machine. Re-run to change the schedule; it replaces
# any existing registration. Remove with:
#   schtasks /Delete /TN ProjectCommandCenterSync /F

param(
  [string]$StartTime = '08:00:00',
  [string]$Duration  = 'PT10H',      # 08:00 -> 18:00
  [string]$Interval  = 'PT10M'
)

$repo   = 'C:\Users\AlexChang\project-command-center'
$script = Join-Path $repo 'scripts\sync-tick.ps1'
$name   = 'ProjectCommandCenterSync'
$user   = "$env:USERDOMAIN\$env:USERNAME"
$start  = (Get-Date -Format 'yyyy-MM-dd') + 'T' + $StartTime

# Written as XML rather than a schtasks one-liner because four of the settings that
# matter most here are not reachable from the CLI flags: IgnoreNew (never overlap
# two syncs), the battery pair (the CLI default silently skips every run on
# battery — fatal for a laptop tool), and ExecutionTimeLimit (a wedged run is
# killed before the next tick rather than blocking the schedule for hours).
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Project Command Center: triage new Outlook mail into tasks.json via Claude Code (/command-center-sync). See TODO.md CC-9.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$start</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>$Interval</Interval>
        <Duration>$Duration</Duration>
        <StopAtDurationEnd>true</StopAtDurationEnd>
      </Repetition>
      <ScheduleByWeek>
        <DaysOfWeek><Monday /><Tuesday /><Wednesday /><Thursday /><Friday /></DaysOfWeek>
        <WeeksInterval>1</WeeksInterval>
      </ScheduleByWeek>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$user</UserId>
      <!-- InteractiveToken, not S4U: the sync reaches Outlook through this
           session's Claude MCP connectors, which need the logged-on user context. -->
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT9M</ExecutionTimeLimit>
    <Priority>7</Priority>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$script"</Arguments>
      <WorkingDirectory>$repo</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

$tmp = Join-Path $env:TEMP 'pcc-sync-task.xml'
# Unicode: schtasks /XML rejects a UTF-8 file whose declaration says UTF-16.
[System.IO.File]::WriteAllText($tmp, $xml, [System.Text.Encoding]::Unicode)

schtasks /Create /TN $name /XML "$tmp" /F
if ($LASTEXITCODE -ne 0) { throw "schtasks /Create failed with $LASTEXITCODE" }
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

Write-Output "Registered '$name': every $Interval, Mon-Fri, from $StartTime for $Duration."
