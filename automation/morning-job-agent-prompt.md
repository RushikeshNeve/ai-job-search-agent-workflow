# Morning Job Agent Prompt

Run the daily morning job-search workflow for Rushikesh Neve.

Mandatory setup:
- Read `CLAUDE.md` first.
- Use the existing `$scrape`, `$rank`, and `$apply` skill instructions.
- Today's workflow is unattended, but it is still not allowed to submit applications externally.

Hard filters:
- Prefer product-based companies.
- Prefer Bengaluru/Bangalore roles; India remote is acceptable only if the company and role are otherwise strong.
- No DevOps, SRE, platform operations, infrastructure administration, database administration, cloud administration, or on-call-heavy operations roles.
- Backend/Node.js roles should match Rushikesh's Pattern backend experience and target about 2 years of experience.
- AI Engineer roles must be 0-2 years or clearly early-career.
- Company must have at least 300 employees in India; skip if this cannot be verified.

Workflow:
1. Run `$scrape new jobs`.
2. Run `$rank --top 5` on the new jobs.
3. For jobs ranked Strong Fit only, run `$apply` to create tailored CV and cover-letter drafts. Treat this prompt as standing authorization to proceed with drafting for Strong Fit roles that pass every hard filter. Do not submit any application on external websites.
4. Update local state files additively.
5. Leave a concise final summary with:
   - new job links
   - ranked shortlist
   - generated CV/cover-letter files
   - skipped reasons
   - anything that needs manual review

After Codex finishes, the wrapper script will sync links and document paths to Google Sheets if the required Google configuration is present.
