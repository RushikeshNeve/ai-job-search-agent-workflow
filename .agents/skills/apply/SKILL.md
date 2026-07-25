---
name: apply
description: Drafts a tailored CV and cover letter for a specific job posting (URL or pasted text), gets them critiqued by a reviewer subagent, revises, compiles to PDF, and runs the verification checklist. Trigger on "apply to this job", "draft a CV for", "cover letter for this posting", or $apply.
---

# Drafter-reviewer job application workflow

You are orchestrating a two-stage job application workflow: you are the drafter, and a `reviewer` subagent (defined at `.codex/agents/reviewer.toml`) critiques your drafts before you finalize them. The job posting is whatever URL or pasted text follows this skill invocation.

Follow these steps **exactly in order**. Do not skip steps.

**Token-efficiency rules for this workflow:**
- Never re-read a file whose contents are already in your context from an earlier step. If you read it in Step 1, it is still available in Step 2.
- When delegating to the reviewer subagent, pass draft content **inline in the delegation instruction** rather than asking it to read files you already have in memory.
- Run the full verification checklist exactly once, at the end (Step 6). The reviewer focuses on content critique, not verification.
- Step 5 (compile and inspect PDFs) is mandatory and non-skippable - LaTeX page-break decisions are unpredictable, and `.tex` files that look fine often produce broken PDFs (orphaned entry titles, cover letters spilling to page 2, bullet fonts mismatching).

---

## Step 0: Parse input

- If the input looks like a URL, fetch the job posting content from it.
- If it is pasted text, use it directly.
- Extract: **company name**, **role title**, **department** (if mentioned), **location**, and **language** of the posting (Danish or English).
- Store these for use throughout the workflow.

---

## Step 1: Evaluate fit

Read the evaluation framework:
- `.claude/skills/job-application-assistant/04-job-evaluation.md`
- `.claude/skills/job-application-assistant/01-candidate-profile.md`

Using the framework from `04-job-evaluation.md`, evaluate the job posting against the candidate's profile. If the salary lookup tool is configured, run:

```bash
python salary_lookup.py "<Company Name>" --json
```

If the posting specifies a city, add `--city "<City>"` to narrow results. Parse the JSON output and include the salary benchmark in the evaluation. If the tool is not configured or returns an error, skip the salary benchmark.

Present the evaluation to the user with:

1. **Skills match** - which required/preferred skills match vs. gaps
2. **Experience match** - how work history maps to the role
3. **Behavioral/culture match** - how behavioral profile fits the role/company culture
4. **Salary benchmark** - salary index for the company (if available)
5. **Overall fit score** and recommendation (strong fit / moderate fit / weak fit)

After presenting the evaluation, ask the user:
> "Should I proceed with drafting the CV and cover letter for this role?"

**If the user says no, stop here.** If yes, continue to Step 2.

---

## Step 2: Draft CV + cover letter

You already have `01-candidate-profile.md` and `04-job-evaluation.md` in context from Step 1. **Do not re-read them.**

Read only the reference files you do not yet have:
- `.claude/skills/job-application-assistant/03-writing-style.md`
- `.claude/skills/job-application-assistant/05-cv-templates.md`
- `.claude/skills/job-application-assistant/06-cover-letter-templates.md`

Also read the most recent existing CV and cover letter files for concrete structural reference (one of each is enough):
- Any existing `cv/main_*.tex` file as a LaTeX template reference
- Any existing `cover_letters/cover_*.tex` or `cover_letters/Cover_*.tex` file as a template reference

### CV (`cv/main_<company>.tex`)
- Always in **English**
- Follow the moderncv/banking format from `05-cv-templates.md`
- Tailor the profile statement and experience bullets to the specific role
- Reframe skills and achievements to match job requirements
- Keep to 2 pages

### Cover letter (`cover_letters/cover_<company>_<role>.tex`)
- **Match the language of the job posting** (Danish posting -> Danish cover letter, English posting -> English cover letter)
- Follow the structure from `06-cover-letter-templates.md`
- Use the `cover.cls` template
- Tailor the opening paragraph to the specific role and company
- Address to a named person if available in the posting, otherwise "Dear Hiring Manager" (or equivalent in posting language)
- Keep to approximately one page
- Any mention of agentic coding or AI tooling must name the tool actually used for that context (see the wording note in `AGENTS.md`)

Write both files to disk. Keep the exact text of both drafts in working memory - you will pass them inline to the reviewer subagent in Step 3 and revise them in Step 4 without re-reading.

---

## Step 3: Delegate to the reviewer subagent

Delegate to the `reviewer` custom agent (`.codex/agents/reviewer.toml`) for research and critique. It gets a fresh context, so pass the drafts **inline in the delegation instruction** below - do not have it read the draft files. Wait for it to finish before continuing.

Fill in `<COMPANY>`, `<ROLE>`, the job posting text, and both full draft texts, then delegate:

> Delegate to the `reviewer` agent with this task: review this job application as a hiring-manager proxy.
>
> Job posting for `<ROLE>` at `<COMPANY>`:
> ```
> <full job posting text>
> ```
>
> CV draft (`cv/main_<COMPANY>.tex`):
> ```
> <full CV draft text>
> ```
>
> Cover letter draft (`cover_letters/cover_<COMPANY>_<ROLE>.tex`):
> ```
> <full cover letter draft text>
> ```
>
> Follow your standard research-and-critique process and return Part A (structured JSON edits) and Part B (narrative suggestions) as described in your instructions.

---

## Step 4: Revise based on feedback

Once the reviewer subagent returns its feedback:

1. **Apply Part A (structured edits) directly.** Do NOT re-read the draft files - you already have them in context from Step 2, and the reviewer's `old_string` values were quoted from that same text. For each edit in the JSON array, edit the given `file`, replacing `old_string` with `new_string`. Skip any whose rationale would require fabricating content.
2. **Apply Part B (narrative suggestions)** using judgment. These need interpretation, not mechanical replacement. Walk through every Part B category the reviewer returned and address it:
   - **Missed keywords/requirements:** add the keyword or capability where it fits naturally in the CV or cover letter. Prefer the experience bullets (concrete evidence) over the profile statement (abstract claim).
   - **Company/department-specific angles:** weave the reviewer's research into the cover letter opening or motivation paragraph. Verify every company claim yourself via a web search/fetch before including it - do not trust reviewer research at face value.
   - **Action-oriented reframing:** rewrite passive or generic phrasing (CV profile statement, cover letter opening, bullet leads). Structural weakness that the reviewer flagged without a clean edit lives here.
   - **Tone and style issues:** apply the writing-style-guide fixes (no em-dashes, no cliches, no apologetic hedging, consistent first-person active voice).
   Only re-read a file if an edit fails because the surrounding text has shifted.
3. Do NOT incorporate any suggestion that would fabricate skills or experience. If a posting requirement is a genuine gap, acknowledge it honestly and frame adjacent experience instead.

After all edits are applied, the two files on disk are the final drafts.

---

## Step 5: Compile & inspect PDFs (MANDATORY)

**Never skip this step.** The `.tex` files looking fine is not sufficient - LaTeX page-break decisions are unpredictable and commonly produce broken layouts (orphaned job titles separated from their bullets, cover letters spilling to 2 pages, bullet fonts not matching body text). Compile both documents and visually verify the PDFs before presenting.

### 5a. Compile

```bash
cd cv && lualatex -interaction=nonstopmode main_<company>.tex
cd ../cover_letters && xelatex -interaction=nonstopmode cover_<company>_<role>.tex
```

- CV uses **lualatex** - pdflatex fails on modern MiKTeX with fontawesome5 font-expansion errors. lualatex handles the same sources cleanly.
- Cover letter uses **xelatex** - cover.cls requires fontspec.

If either compile fails, fix the error and re-compile until clean.

### 5b. Inspect layout

Read both PDFs and verify:

**CV (`cv/main_<company>.pdf`):**
- [ ] Exactly 2 pages (not 1, not 3)
- [ ] No orphaned `\cventry` titles - a job/education title line must never sit alone at the bottom of page 1 with its bullets on page 2. This is the most common failure.
- [ ] Section headings are not isolated at the top of page 2 with only 1-2 lines below
- [ ] No awkward whitespace gaps

**Cover letter (`cover_letters/cover_<company>_<role>.pdf`):**
- [ ] Exactly 1 page
- [ ] Signature block visible, not cut off or pushed to a second page
- [ ] Bullet list font matches surrounding body text (both should be Raleway-Medium)

### 5c. Iterate until clean

If the layout has problems, edit the `.tex` files and recompile. Common fixes (see `05-cv-templates.md` and `06-cover-letter-templates.md` for full details):

- **Orphaned CV entry title:** `\usepackage{needspace}` in preamble, then `\needspace{5\baselineskip}` immediately before the problematic `\cventry`
- **CV spills to page 3 with only a trailing section:** `\enlargethispage{2-3\baselineskip}` before a late section
- **Substantial content on page 3:** cut content using **relevance-weighted cutting** (see `05-cv-templates.md` -> "Relevance-weighted cutting"). Score each candidate line by (a) relevance to THIS posting's keywords and responsibilities, (b) uniqueness (is it duplicated elsewhere?), (c) narrative load (does the cover letter depend on it?). Cut the lowest-total-score line first, regardless of section.
- **Cover letter itemize breaks compile or uses wrong font:** close `\lettercontent{}` before the list, wrap the list in `{\raggedright\fontspec[Path = OpenFonts/fonts/raleway/]{Raleway-Medium}\fontsize{11pt}{13pt}\selectfont \begin{itemize}...\end{itemize}\par}`
- **Cover letter spills to 2 pages:** trim using the same relevance-weighted logic. First cut: sentences that restate what a bullet already said. Second cut: a bullet that does not hit posting keywords. Last resort: a bullet that does hit posting keywords. Never reduce geometry or line spacing.

Do not proceed to Step 6 until both PDFs pass inspection.

### 5d. ATS & keyword verification (CV)

An ATS parser reads the PDF's embedded **text layer**, not the rendered page. This step verifies what a parser actually sees. Applies to the **CV only**.

**Availability check:** run `pdftotext -v`. If missing, print a one-line warning that the mechanical parse check is skipped, do the keyword-coverage check (item 3 below) against your visual read of the PDF instead, and note the degraded mode in the Step 6 report.

**1. Extract the text layer:**
```bash
cd cv && pdftotext -layout main_<company>.pdf main_<company>.txt
```
Read the `.txt` file.

**2. Parseability checks:**
- [ ] Text extracted at all, with no garbage runs: no `(cid:NNN)` markers, no replacement characters, no stretches of missing text that are visible in the PDF
- [ ] Email and phone survive as literal text (icon-glyph noise is harmless, but the address and digits must be present as text, not only an icon or hyperlink)
- [ ] Reading order matches the visual order
- [ ] Dates recognizable for each role and degree

Failures here are template-level problems: fix the `.tex`, re-run 5a-5c, re-extract.

**3. Keyword coverage.** Reuse the required/preferred keyword list from Step 1. Match each against the extracted text, in the posting's language. Report a table (Keyword | Priority | Status | Note) with status one of: covered, synonym-only, missing (have it - add it, then re-run 5a-5c), missing (gap - leave it, never stuff keywords).

**4. Clean up:** delete the extracted `.txt` file.

### 5e. Clean up build artifacts

After the final clean compile, delete the `.aux`, `.log`, `.out` files (keep the `.tex` and `.pdf`).

---

## Step 6: Present final output

Run the full verification checklist from `CLAUDE.md` now - this is the **only** verification pass in the workflow. Re-read both files once here to verify final state on disk matches your mental model after the Step 4 and Step 5 edits.

Report pass/fail for each item in the CLAUDE.md verification checklist (factual accuracy, targeting, consistency, quality).

Summarize 3-5 key tailoring decisions: what was emphasized and why, what company-specific angles were incorporated, what the reviewer suggested that was most impactful, and any gaps that were acknowledged or reframed.

List the files written: `cv/main_<company>.tex`, `cover_letters/cover_<company>_<role>.tex`.

Tell the user: "Both files are ready for your review. Open them to check the final output before compiling."

Next steps:
- **Submitted?** the `outcome` skill (`$outcome <company>`) logs it in the tracker and starts the per-application record that `setup` later uses to calibrate the fit framework.
- **Interview scheduled?** the `interview` skill (`$interview`) builds a stage-specific prep pack from this posting and the documents you just created.
