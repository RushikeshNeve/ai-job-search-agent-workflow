import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seenJobsPath = path.resolve(repoRoot, process.env.SEEN_JOBS_PATH || "job_scraper/meenakshi_seen_jobs.json");

const allowedSignalPatterns = [
  /\bfresher(?:s)?\b/i,
  /\bfresh graduate(?:s)?\b/i,
  /\bnew grad(?:uate)?(?:s)?\b/i,
  /\bgraduate engineer trainee\b/i,
  /\bGET\b/,
  /\bcampus (?:hire|hiring|recruitment|placement)\b/i,
  /\bentry[-\s]?level\b/i,
  /\b0\s*(?:years?|yrs?)\b/i,
  /\bzero\s*(?:years?|yrs?)\b/i,
  /\b0\s*(?:-|to)\s*1\s*(?:years?|yrs?)\b/i,
  /\b(?:less than|under|below)\s*1\s*(?:year|yr)\b/i,
  /<\s*1\s*(?:year|yr)\b/i,
];

const disallowedExperiencePatterns = [
  /\b(?:[2-9]|[1-9]\d)\s*\+?\s*(?:years?|yrs?)\b/i,
  /\b[1-9]\s*(?:-|to)\s*(?:[1-9]|\d{2,})\s*(?:years?|yrs?)\b/i,
  /\b(?:minimum|min\.?|at least|more than|over)\s*1\s*(?:year|yr)\b/i,
  /\b1\s*\+\s*(?:year|yr)s?\b/i,
  /\b1\s*(?:year|yr)s?\s+(?:of\s+)?(?:experience|exp)\b/i,
];

const allowedExperienceMasks = [
  /\b0\s*(?:-|to)\s*1\s*(?:years?|yrs?)\b/gi,
  /\b0\s*(?:years?|yrs?)\b/gi,
  /\b(?:less than|under|below)\s*1\s*(?:year|yr)\b/gi,
  /<\s*1\s*(?:year|yr)\b/gi,
];

function flatten(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  if (typeof value === "object") return Object.values(value).map(flatten).join(" ");
  return "";
}

function maskAllowedExperience(text) {
  return allowedExperienceMasks.reduce((current, pattern) => current.replace(pattern, " ZERO_YEARS_ALLOWED "), text);
}

function rejectionReason(job) {
  const text = flatten(job);
  const masked = maskAllowedExperience(text);
  const disallowed = disallowedExperiencePatterns.find((pattern) => pattern.test(masked));
  if (disallowed) {
    return "Rejected by strict Meenakshi filter: posting requires 1+ years or more of experience.";
  }

  const hasAllowedSignal = allowedSignalPatterns.some((pattern) => pattern.test(text));
  if (!hasAllowedSignal) {
    return "Rejected by strict Meenakshi filter: posting does not clearly say fresher, 0 years, less than 1 year, new grad, campus, GET, or entry-level.";
  }

  return "";
}

if (!fs.existsSync(seenJobsPath)) {
  console.log(`Meenakshi strict filter skipped: ${seenJobsPath} does not exist.`);
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(seenJobsPath, "utf8").replace(/^\uFEFF/, ""));
const seen = data.seen || {};
let skipped = 0;
let kept = 0;

for (const [key, job] of Object.entries(seen)) {
  if (!job || typeof job !== "object") continue;
  const reason = rejectionReason(job);
  if (reason) {
    job.status = "skipped";
    job.fit = "low";
    job.rank_verdict = "Rejected";
    job.rank_score = 0;
    job.notes = job.notes ? `${job.notes} | ${reason}` : reason;
    skipped += 1;
  } else {
    kept += 1;
  }
  seen[key] = job;
}

data.seen = seen;
fs.writeFileSync(seenJobsPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Meenakshi strict filter complete: ${kept} kept, ${skipped} skipped.`);
