# Morning Job Agent Automation

This automation runs the existing job-search workflow every morning:

1. `$scrape new jobs`
2. `$rank --top 5`
3. `$apply` for Strong Fit jobs that pass all hard filters
4. Sync job links, rank status, and generated document paths to Google Sheets

The automation creates draft application documents only. It does not submit applications on external websites.

## Files

- `.codex/agents/morning-job-agent.toml` - custom agent definition.
- `automation/morning-job-agent-prompt.md` - non-interactive Codex prompt used by the scheduled run.
- `automation/run-morning-job-agent.ps1` - runner used by Windows Task Scheduler.
- `automation/sync-google-sheet.mjs` - Google Sheets upsert sync.
- `automation/install-morning-job-agent-task.ps1` - scheduled-task installer.
- `automation/morning-job-agent.env.example` - copy to `automation/morning-job-agent.env` and fill in.

## Google Sheets Setup

1. Create or choose a Google Sheet.
2. Create a Google Cloud service account and enable the Google Sheets API.
3. Download the service-account JSON file into this folder, for example:
   `automation/google-service-account.json`
4. Share the Google Sheet with the service account's `client_email` as an editor.
5. Copy the env example:
   ```powershell
   Copy-Item automation\morning-job-agent.env.example automation\morning-job-agent.env
   ```
6. Fill these values:
   ```powershell
   GOOGLE_SHEET_ID=<spreadsheet id from the Google Sheet URL>
   GOOGLE_SHEET_NAME=Job Applications
   GOOGLE_APPLICATION_CREDENTIALS=D:\Career\Resumes\ai-job-search\automation\google-service-account.json
   ```

The `.env` file and credential JSON files are ignored by git.

## Manual Test

Run the whole workflow manually:

```powershell
automation\run-morning-job-agent.ps1 -FullPermission
```

Run only the Sheets sync:

```powershell
node automation\sync-google-sheet.mjs
```

## Scheduled Task

The task is installed as:

```text
Morning Job Application Agent
```

It runs daily at 09:00 using:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Career\Resumes\ai-job-search\automation\run-morning-job-agent.ps1" -RepoRoot "D:\Career\Resumes\ai-job-search" -GoogleSheetName "Job Applications" -FullPermission
```

Reinstall or update it with:

```powershell
automation\install-morning-job-agent-task.ps1 -At "09:00" -FullPermission
```

## Cloud Deployment With GitHub Actions

The GitHub Actions workflow is defined at:

```text
.github/workflows/morning-job-agent.yml
```

It runs every day at `03:30 UTC`, which is `09:00 Asia/Kolkata`, and can also be started manually from the GitHub Actions tab.

Use this only from a private personal repository or private fork. GitHub Actions logs in a public repository can expose job-search activity, company names, and generated document paths.

### Required GitHub Secrets

In GitHub, open the repository, then go to:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

Add:

```text
OPENAI_API_KEY
```

Value: an OpenAI API key that Codex can use in GitHub Actions.

Add:

```text
GOOGLE_SHEET_ID
```

Value: the spreadsheet ID from the Google Sheet URL.

Add:

```text
GOOGLE_SERVICE_ACCOUNT_JSON
```

Value: the full raw contents of `automation/google-service-account.json`.

Optional repository variable:

```text
GOOGLE_SHEET_NAME=Job Applications
```

If this variable is absent, the workflow uses `Job Applications`.

### Important State Detail

GitHub Actions runners are fresh machines. The workflow restores and saves these ignored personal files through the GitHub Actions cache:

```text
job_scraper/seen_jobs.json
job_search_tracker.csv
cv/main_*.tex
cover_letters/cover_*.tex
cover_letters/Cover_*.tex
```

This avoids committing personal job-search state into git while still letting the next scheduled run remember what it has already seen.

### Deploy

Commit and push the workflow:

```powershell
git add .github\workflows\morning-job-agent.yml automation\README.md automation\sync-google-sheet.mjs
git commit -m "Add cloud scheduled morning job agent"
git push
```

Then open:

```text
GitHub -> Actions -> Morning Job Application Agent -> Run workflow
```

Use the manual run once to verify secrets and Sheets sync before waiting for the next 09:00 scheduled run.

## Meenakshi Job Agent Automation

This folder also contains a separate automation for Meenakshi Sutar, based on:

```text
automation/meenakshi-resume-profile.md
```

It uses separate state so it does not mix with Rushikesh's job-search history:

```text
job_scraper/meenakshi_seen_jobs.json
automation/meenakshi_job_search_tracker.csv
automation/meenakshi_applications/
```

The GitHub Actions workflow is defined at:

```text
.github/workflows/meenakshi-job-agent.yml
```

It runs every day at `04:00 UTC`, which is `09:30 Asia/Kolkata`, and can also be started manually from the GitHub Actions tab.

### Required GitHub Secrets

The workflow always needs:

```text
OPENAI_API_KEY
```

For Google Sheets, either reuse the existing sheet secrets:

```text
GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON
```

Or add Meenakshi-specific secrets:

```text
MEENAKSHI_GOOGLE_SHEET_ID
MEENAKSHI_GOOGLE_SERVICE_ACCOUNT_JSON
```

Optional repository variable:

```text
MEENAKSHI_GOOGLE_SHEET_NAME=Meenakshi Job Applications
```

If this variable is absent, the workflow uses `Meenakshi Job Applications`.

### Manual Test

Run the Meenakshi workflow locally:

```powershell
automation\run-meenakshi-job-agent.ps1 -FullPermission
```

Run only the Sheets sync against Meenakshi's state:

```powershell
$env:SEEN_JOBS_PATH = "job_scraper/meenakshi_seen_jobs.json"
$env:TRACKER_CSV_PATH = "automation/meenakshi_job_search_tracker.csv"
$env:GOOGLE_SHEET_NAME = "Meenakshi Job Applications"
node automation\sync-google-sheet.mjs
```

### Current Scope

The Meenakshi automation searches, ranks, saves state, writes short application notes for Strong Fit jobs, and syncs to Google Sheets.

It does not currently generate tailored LaTeX CVs or cover letters, because the existing `$apply` workflow and templates are Rushikesh-specific. Add a Meenakshi-specific profile/template setup before enabling automated document drafting.
