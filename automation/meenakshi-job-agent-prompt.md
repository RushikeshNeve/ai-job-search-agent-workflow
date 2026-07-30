# Meenakshi Job Agent Prompt

Run the daily job-search workflow for Meenakshi Sutar.

Mandatory setup:
- Read `CLAUDE.md` first because this repository requires it.
- Then read `automation/meenakshi-resume-profile.md`.
- This run is for Meenakshi Sutar only. Do not use Rushikesh Neve's candidate profile, hard filters, tracker, or document claims for scoring.
- Do not submit applications on external websites.

Important isolation rule:
- The standard `$scrape`, `$rank`, and `$apply` skills are configured around Rushikesh's `.claude` profile and shared state files.
- For this Meenakshi automation, mirror the same workflow manually using the installed portal-search CLI tools and the state paths below.
- Use `job_scraper/meenakshi_seen_jobs.json` for seen jobs.
- Use `automation/meenakshi_job_search_tracker.csv` for tracked applications.

Hard filters:
- Primary target: full-time fresher, 0 years experience, entry-level, new-graduate, campus, and Graduate Engineer Trainee jobs.
- Preferred titles: AI Engineer, GenAI Engineer, Data Engineer, ML Engineer, Backend Engineer, Software Engineer, Data Analyst, Graduate Engineer Trainee, Junior AI/Data/Backend Engineer, or equivalent.
- Primary location: Bengaluru/Bangalore. Pune and India remote are acceptable only as secondary options when the role is an especially strong fit.
- Strongly prefer postings that explicitly say fresher, freshers, 0 years, 0-1 years, graduate engineer trainee, GET, campus, new grad, or entry level.
- Skip roles requiring more than 1 year of professional experience unless the posting clearly accepts freshers, students, new graduates, or project experience.
- Skip internships, trainee-only unpaid programs, senior, lead, staff, manager, SRE, DevOps, support, sales, testing-only QA, and infrastructure-administration roles.
- Strong matches should involve Python, SQL, RAG, LangChain, OpenAI APIs, vector databases, FastAPI, Node.js, ETL/data pipelines, analytics, or backend APIs.

Workflow:
1. Load or initialize `job_scraper/meenakshi_seen_jobs.json` as `{"seen":{}}`.
2. Load or initialize `automation/meenakshi_job_search_tracker.csv` with columns: `company,role,source,status,cv_file,cover_letter_file,notes`.
3. Search live job postings from the installed portal CLI skills under `.agents/skills/*-search/`. Read each portal skill's `SKILL.md` before running its CLI. Use JSON output where available.
4. Suggested search queries:
   - `"AI Engineer" fresher Bangalore`
   - `"GenAI Engineer" "0 years" Bengaluru`
   - `"Data Engineer" fresher Python SQL Bangalore`
   - `"Machine Learning Engineer" freshers LangChain Bengaluru`
   - `"Software Engineer" Python Node.js Bangalore fresher`
   - `"Junior AI Engineer" "0-1 years" RAG Bengaluru`
   - `"Graduate Engineer Trainee" Python SQL Bangalore`
   - `"entry level" "AI Engineer" Bangalore fresher`
5. Deduplicate against `job_scraper/meenakshi_seen_jobs.json` and `automation/meenakshi_job_search_tracker.csv`.
6. Fetch detail for promising results only. Do not score from title alone if the posting body cannot be fetched.
7. Rank the new jobs with triage scores from 0-100:
   - Technical match: 35%
   - Fresher/0-year experience fit: 30%
   - Bengaluru/Bangalore location fit: 20%
   - Career alignment with GenAI/data/backend: 15%
8. Store every fetched posting additively in `job_scraper/meenakshi_seen_jobs.json` with fields: `title`, `company`, `url`, `first_seen`, `fit`, `status`, `rank_score`, `rank_verdict`, `rank_date`, and `notes` where available.
9. For Strong Fit jobs only, create a short application note in `automation/meenakshi_applications/` summarizing why it fits, resume bullets to emphasize, and any missing requirements. Do not create tailored LaTeX CV or cover-letter files unless a Meenakshi-specific template/profile setup is added later.
10. Leave a concise final summary with:
   - new job links
   - ranked shortlist
   - application note files
   - skipped reasons
   - anything that needs manual review

After Codex finishes, the wrapper or GitHub Actions workflow will sync `job_scraper/meenakshi_seen_jobs.json` and `automation/meenakshi_job_search_tracker.csv` to Google Sheets if the required Google configuration is present.
