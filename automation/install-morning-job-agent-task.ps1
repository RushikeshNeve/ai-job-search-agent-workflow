[CmdletBinding()]
param(
    [string]$TaskName = "Morning Job Application Agent",
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$At = "09:00",
    [string]$GoogleSheetId,
    [string]$GoogleSheetName = "Job Applications",
    [string]$GoogleCredentialsPath,
    [switch]$FullPermission,
    [switch]$RunElevated
)

$ErrorActionPreference = "Stop"

$runner = Join-Path $RepoRoot "automation\run-morning-job-agent.ps1"
$arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$runner`"",
    "-RepoRoot", "`"$RepoRoot`""
)

if ($GoogleSheetId) {
    $arguments += @("-GoogleSheetId", "`"$GoogleSheetId`"")
}
if ($GoogleSheetName) {
    $arguments += @("-GoogleSheetName", "`"$GoogleSheetName`"")
}
if ($GoogleCredentialsPath) {
    $arguments += @("-GoogleCredentialsPath", "`"$GoogleCredentialsPath`"")
}
if ($FullPermission) {
    $arguments += "-FullPermission"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ($arguments -join " ") -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At ([DateTime]::Parse($At))
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principalArgs = @{
    UserId = $env:USERNAME
    LogonType = "Interactive"
}
if ($RunElevated) {
    $principalArgs.RunLevel = "Highest"
}
$principal = New-ScheduledTaskPrincipal @principalArgs

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' for every day at $At."
Write-Host "Runner: $runner"
