[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$PromptPath = (Join-Path $PSScriptRoot "meenakshi-job-agent-prompt.md"),
    [string]$GoogleSheetId = $env:GOOGLE_SHEET_ID,
    [string]$GoogleSheetName = $(if ($env:GOOGLE_SHEET_NAME) { $env:GOOGLE_SHEET_NAME } else { "Meenakshi Job Applications" }),
    [string]$GoogleCredentialsPath = $env:GOOGLE_APPLICATION_CREDENTIALS,
    [switch]$FullPermission
)

$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot "meenakshi-job-agent.env"
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
if (-not $GoogleSheetName) { $GoogleSheetName = if ($env:GOOGLE_SHEET_NAME) { $env:GOOGLE_SHEET_NAME } else { "Meenakshi Job Applications" } }
if (-not $GoogleCredentialsPath) { $GoogleCredentialsPath = $env:GOOGLE_APPLICATION_CREDENTIALS }

$env:SEEN_JOBS_PATH = if ($env:SEEN_JOBS_PATH) { $env:SEEN_JOBS_PATH } else { "job_scraper/meenakshi_seen_jobs.json" }
$env:TRACKER_CSV_PATH = if ($env:TRACKER_CSV_PATH) { $env:TRACKER_CSV_PATH } else { "automation/meenakshi_job_search_tracker.csv" }
$env:SYNC_EXCLUDE_STATUSES = if ($env:SYNC_EXCLUDE_STATUSES) { $env:SYNC_EXCLUDE_STATUSES } else { "skipped,expired" }
$env:SYNC_REPLACE_SHEET = if ($env:SYNC_REPLACE_SHEET) { $env:SYNC_REPLACE_SHEET } else { "true" }

$logDir = Join-Path $RepoRoot "automation\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$codexLog = Join-Path $logDir "meenakshi-job-agent-$timestamp.log"
$syncLog = Join-Path $logDir "meenakshi-google-sheet-sync-$timestamp.log"

Set-Location $RepoRoot

$prompt = Get-Content -Raw $PromptPath
$outputLastMessage = Join-Path $logDir "meenakshi-job-agent-last-message.md"
$codexArgs = @(
    "exec",
    "--cd", $RepoRoot,
    "--search",
    "--sandbox", "danger-full-access",
    "--ask-for-approval", "never",
    "--output-last-message", $outputLastMessage,
    $prompt
)

if ($FullPermission) {
    $codexArgs = @("exec", "--cd", $RepoRoot, "--search", "--dangerously-bypass-approvals-and-sandbox", "--output-last-message", $outputLastMessage, $prompt)
}

Write-Host "Starting Codex Meenakshi job agent..."
& codex @codexArgs *>&1 | Tee-Object -FilePath $codexLog
$codexExit = $LASTEXITCODE
if ($codexExit -ne 0) {
    throw "Codex Meenakshi job agent failed with exit code $codexExit. See $codexLog"
}

Write-Host "Enforcing strict Meenakshi fresher filter..."
& node (Join-Path $PSScriptRoot "filter-meenakshi-jobs.mjs")
$filterExit = $LASTEXITCODE
if ($filterExit -ne 0) {
    throw "Meenakshi strict filter failed with exit code $filterExit."
}

if ($GoogleSheetId) {
    $env:GOOGLE_SHEET_ID = $GoogleSheetId
    $env:GOOGLE_SHEET_NAME = $GoogleSheetName
    if ($GoogleCredentialsPath) {
        $env:GOOGLE_APPLICATION_CREDENTIALS = $GoogleCredentialsPath
    }
    Write-Host "Syncing Meenakshi results to Google Sheets..."
    & node (Join-Path $PSScriptRoot "sync-google-sheet.mjs") *>&1 | Tee-Object -FilePath $syncLog
    $syncExit = $LASTEXITCODE
    if ($syncExit -ne 0) {
        throw "Google Sheets sync failed with exit code $syncExit. See $syncLog"
    }
} else {
    "Google Sheets sync skipped: GOOGLE_SHEET_ID is not set." | Tee-Object -FilePath $syncLog
}

Write-Host "Meenakshi job agent completed. Logs:"
Write-Host $codexLog
Write-Host $syncLog
