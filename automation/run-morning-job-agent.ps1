[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$PromptPath = (Join-Path $PSScriptRoot "morning-job-agent-prompt.md"),
    [string]$GoogleSheetId = $env:GOOGLE_SHEET_ID,
    [string]$GoogleSheetName = $(if ($env:GOOGLE_SHEET_NAME) { $env:GOOGLE_SHEET_NAME } else { "Job Applications" }),
    [string]$GoogleCredentialsPath = $env:GOOGLE_APPLICATION_CREDENTIALS,
    [switch]$FullPermission
)

$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot "morning-job-agent.env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }
        $name, $value = $line.Split("=", 2)
        $name = $name.Trim()
        $value = $value.Trim().Trim('"')
        if ($name) {
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

if (-not $GoogleSheetId) { $GoogleSheetId = $env:GOOGLE_SHEET_ID }
if (-not $GoogleSheetName) { $GoogleSheetName = if ($env:GOOGLE_SHEET_NAME) { $env:GOOGLE_SHEET_NAME } else { "Job Applications" } }
if (-not $GoogleCredentialsPath) { $GoogleCredentialsPath = $env:GOOGLE_APPLICATION_CREDENTIALS }

$logDir = Join-Path $RepoRoot "automation\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$codexLog = Join-Path $logDir "morning-job-agent-$timestamp.log"
$syncLog = Join-Path $logDir "google-sheet-sync-$timestamp.log"

Set-Location $RepoRoot

$prompt = Get-Content -Raw $PromptPath
$codexArgs = @(
    "exec",
    "--cd", $RepoRoot,
    "--search",
    "--sandbox", "danger-full-access",
    "--ask-for-approval", "never",
    "--output-last-message", (Join-Path $logDir "morning-job-agent-last-message.md"),
    $prompt
)

if ($FullPermission) {
    $codexArgs = @("exec", "--cd", $RepoRoot, "--search", "--dangerously-bypass-approvals-and-sandbox", "--output-last-message", (Join-Path $logDir "morning-job-agent-last-message.md"), $prompt)
}

Write-Host "Starting Codex morning job agent..."
& codex @codexArgs *>&1 | Tee-Object -FilePath $codexLog
$codexExit = $LASTEXITCODE
if ($codexExit -ne 0) {
    throw "Codex morning job agent failed with exit code $codexExit. See $codexLog"
}

if ($GoogleSheetId) {
    $env:GOOGLE_SHEET_ID = $GoogleSheetId
    $env:GOOGLE_SHEET_NAME = $GoogleSheetName
    if ($GoogleCredentialsPath) {
        $env:GOOGLE_APPLICATION_CREDENTIALS = $GoogleCredentialsPath
    }
    Write-Host "Syncing results to Google Sheets..."
    & node (Join-Path $PSScriptRoot "sync-google-sheet.mjs") *>&1 | Tee-Object -FilePath $syncLog
    $syncExit = $LASTEXITCODE
    if ($syncExit -ne 0) {
        throw "Google Sheets sync failed with exit code $syncExit. See $syncLog"
    }
} else {
    "Google Sheets sync skipped: GOOGLE_SHEET_ID is not set." | Tee-Object -FilePath $syncLog
}

Write-Host "Morning job agent completed. Logs:"
Write-Host $codexLog
Write-Host $syncLog
