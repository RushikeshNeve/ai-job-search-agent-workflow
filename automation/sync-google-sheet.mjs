import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const sheetName = process.env.GOOGLE_SHEET_NAME || "Job Applications";
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const requestTimeoutMs = Number(process.env.GOOGLE_SHEETS_REQUEST_TIMEOUT_MS || 30000);

if (!spreadsheetId) {
  console.log("Google Sheets sync skipped: GOOGLE_SHEET_ID is not set.");
  process.exit(0);
}

if (!credentialsPath && !serviceAccountJson) {
  console.log("Google Sheets sync skipped: set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON.");
  process.exit(0);
}

if (credentialsPath && !fs.existsSync(credentialsPath)) {
  console.log(`Google Sheets sync skipped: credential file not found at ${credentialsPath}.`);
  process.exit(0);
}

const headers = [
  "RunDate",
  "FirstSeen",
  "Status",
  "RankScore",
  "RankVerdict",
  "Fit",
  "Title",
  "Company",
  "JobUrl",
  "CVFile",
  "CoverLetterFile",
  "Notes",
];

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function loadCredentials() {
  if (serviceAccountJson) return JSON.parse(serviceAccountJson);
  return JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
}

async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const encodedHeader = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedClaim = base64url(JSON.stringify(claim));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${encodedHeader}.${encodedClaim}`);
  const signature = signer.sign(credentials.private_key, "base64url");
  const assertion = `${encodedHeader}.${encodedClaim}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token request failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).access_token;
}

async function sheetsRequest(token, urlPath, options = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${urlPath}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(requestTimeoutMs),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Sheets API failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function csvParse(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (quoted && c === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (!quoted && c === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function readTracker() {
  const trackerPath = path.join(repoRoot, "job_search_tracker.csv");
  if (!fs.existsSync(trackerPath)) return new Map();
  const parsed = csvParse(fs.readFileSync(trackerPath, "utf8"));
  const [header, ...records] = parsed;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const byUrl = new Map();
  for (const record of records) {
    const source = record[index.source] || "";
    if (!source) continue;
    byUrl.set(source, {
      cvFile: record[index.cv_file] || "",
      coverLetterFile: record[index.cover_letter_file] || "",
      notes: record[index.notes] || "",
      trackerStatus: record[index.status] || "",
    });
  }
  return byUrl;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function readSeenRows() {
  const seenPath = path.join(repoRoot, "job_scraper", "seen_jobs.json");
  if (!fs.existsSync(seenPath)) return [];
  const seen = readJson(seenPath).seen || {};
  const tracker = readTracker();
  const runDate = new Date().toISOString().slice(0, 10);
  return Object.values(seen)
    .filter((job) => job && job.url)
    .map((job) => {
      const tracked = tracker.get(job.url) || {};
      return [
        runDate,
        job.first_seen || "",
        tracked.trackerStatus || job.status || "",
        job.rank_score ?? "",
        job.rank_verdict || "",
        job.fit || "",
        job.title || "",
        job.company || "",
        job.url || "",
        tracked.cvFile || job.cv_file || "",
        tracked.coverLetterFile || job.cover_letter_file || "",
        tracked.notes || job.notes || "",
      ];
    });
}

async function ensureSheet(token) {
  const metadata = await sheetsRequest(token, "?fields=sheets.properties");
  const exists = metadata.sheets?.some((sheet) => sheet.properties?.title === sheetName);
  if (!exists) {
    await sheetsRequest(token, ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
    });
  }
  await sheetsRequest(token, `/values/${encodeURIComponent(sheetName)}!A1:L1?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [headers] }),
  });
}

async function syncRows(token, rows) {
  const existing = await sheetsRequest(token, `/values/${encodeURIComponent(sheetName)}!A:L`);
  const values = existing.values || [];
  const urlToRow = new Map();
  for (let i = 1; i < values.length; i += 1) {
    const url = values[i][8];
    if (url) urlToRow.set(url, i + 1);
  }

  const appends = [];
  const updates = [];
  for (const row of rows) {
    const url = row[8];
    const rowNumber = urlToRow.get(url);
    if (rowNumber) {
      updates.push({
        range: `${sheetName}!A${rowNumber}:L${rowNumber}`,
        values: [row],
      });
    } else {
      appends.push(row);
    }
  }

  if (updates.length) {
    await sheetsRequest(token, "/values:batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: updates,
      }),
    });
  }

  if (appends.length) {
    await sheetsRequest(token, `/values/${encodeURIComponent(sheetName)}!A:L:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: appends }),
    });
  }

  console.log(`Google Sheets sync complete: ${appends.length} appended, ${updates.length} updated.`);
}

const credentials = loadCredentials();
const token = await getAccessToken(credentials);
await ensureSheet(token);
await syncRows(token, readSeenRows());
