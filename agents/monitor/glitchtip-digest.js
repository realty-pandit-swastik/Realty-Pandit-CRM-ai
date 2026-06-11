#!/usr/bin/env node
/**
 * GlitchTip Error Digest
 * Fetches unresolved production errors from GlitchTip, maps them to source files,
 * reads code context, generates fix hints, and writes a structured memory file
 * so Claude can immediately know what to fix without investigating.
 *
 * Run: node glitchtip-digest.js
 * Scheduled: Windows Task Scheduler — nightly at midnight
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// ─── Config ───────────────────────────────────────────────────────────────────

const ENV_FILE = path.join(__dirname, '.env.monitor');
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('[digest] Missing .env.monitor — copy .env.monitor.example and fill values');
    process.exit(1);
  }
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.trim().split('=');
    if (k && v.length) process.env[k] = v.join('=');
  });
}
loadEnv();

const GLITCHTIP_URL = (process.env.GLITCHTIP_URL || 'https://errors.realtypandit.in').replace(/\/$/, '');
const TOKEN         = process.env.GLITCHTIP_TOKEN;
const ORG           = process.env.GLITCHTIP_ORG || 'realty-pandit';

if (!TOKEN) { console.error('[digest] GLITCHTIP_TOKEN not set in .env.monitor'); process.exit(1); }

const PROJECTS = [
  {
    slug:    'main-website',
    name:    'Main Website',
    appKey:  'realty-pandit-website',
    srcRoot: 'C:/Users/Varchasv Bhardwaj/Project/realty-pandit/website/src',
  },
  {
    slug:    'agents-website',
    name:    'Agents Website',
    appKey:  'realty-pandit-agents-website',
    srcRoot: 'C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/website/src',
  },
  {
    slug:    'admin-crm',
    name:    'Admin CRM',
    appKey:  'realty-pandit-admin',
    srcRoot: 'C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/frontend/src',
  },
  {
    slug:    'backend',
    name:    'Backend',
    appKey:  'realty-pandit-backend',
    srcRoot: 'C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend/src',
  },
];

const MEMORY_DIR  = 'C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory';
const REPORT_DIR  = path.join(__dirname, 'reports');
const MEMORY_FILE = path.join(MEMORY_DIR, 'glitchtip_errors.md');
const JSON_FILE   = path.join(REPORT_DIR, 'latest-glitchtip.json');

// ─── Fix Hints ────────────────────────────────────────────────────────────────

const HINTS = [
  [/cannot read prop|of null|of undefined/i,
    'Null/undefined access — add null guard before accessing the property'],
  [/is not a function/i,
    'Missing or wrong import — verify the function is exported and imported correctly'],
  [/failed to fetch|network error|econnrefused/i,
    'API/service unreachable — check CORS config and whether the target process is running'],
  [/chunkloaderror/i,
    'Stale JS chunk after deploy — ensure old chunks are purged on deploy'],
  [/unexpected token|syntaxerror.*json|json\.parse/i,
    'JSON parse error — API returned HTML or error page instead of JSON; check error handler'],
  [/maximum update depth/i,
    'Infinite render loop — audit useEffect dependency array for missing or circular deps'],
  [/hydration|text content did not match/i,
    'SSR/CSR mismatch — isolate browser-only code behind `typeof window !== "undefined"`'],
  [/prisma|p\d{4}|unique constraint|foreign key/i,
    'Database error — check query params, unique constraints, and Postgres logs'],
  [/jwt|jsonwebtoken|invalid signature|token expired/i,
    'Auth token issue — check expiry, signing secret match, and Authorization header format'],
  [/timeout|etimedout|socket hang up/i,
    'Operation timed out — check DB query cost, add an index, or increase timeout config'],
  [/enoent|no such file/i,
    'Missing file — check file path and ensure file exists on server after deploy'],
  [/heap out of memory|javascript heap/i,
    'Memory leak — profile with --inspect, check for growing arrays or uncleaned listeners'],
];

function getFixHint(title, type) {
  const text = `${title} ${type || ''}`;
  for (const [re, hint] of HINTS) {
    if (re.test(text)) return hint;
  }
  return 'Review stack trace in GlitchTip for root cause';
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// ─── File search ─────────────────────────────────────────────────────────────

function findFileInRoot(srcRoot, filename) {
  const base = path.basename(filename);
  const direct = path.join(srcRoot, filename);
  if (fs.existsSync(direct)) return direct;

  // Recursive search for the filename
  function walk(dir, depth = 0) {
    if (depth > 6) return null;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = walk(full, depth + 1);
          if (found) return found;
        } else if (entry.name === base) {
          return full;
        }
      }
    } catch { /* skip unreadable dirs */ }
    return null;
  }
  return walk(srcRoot);
}

function getCodeContext(filePath, lineNumber) {
  if (!filePath || !lineNumber) return null;
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const errLine = parseInt(lineNumber) - 1;
    if (errLine < 0 || errLine >= lines.length) return null;
    const start = Math.max(0, errLine - 3);
    const end   = Math.min(lines.length, errLine + 4);
    return lines.slice(start, end).map((l, i) => {
      const num    = String(start + i + 1).padStart(4);
      const marker = (start + i) === errLine ? '→' : ' ';
      return `${num} ${marker} ${l}`;
    }).join('\n');
  } catch {
    return null;
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreIssue(issue) {
  const level    = issue.level || 'error';
  const count    = parseInt(issue.count) || 0;
  const users    = parseInt(issue.userCount) || 0;
  const hoursAgo = (Date.now() - new Date(issue.lastSeen).getTime()) / 3600000;

  return (level === 'fatal'   ? 1000 : 0)
       + (level === 'error'   ?  100 : 0)
       + (level === 'warning' ?   10 : 0)
       + (count * 2)
       + (users * 5)
       + (hoursAgo < 24 ? 50 : 0);
}

function classify(score) {
  if (score >= 200) return 'CRITICAL';
  if (score >= 50)  return 'HIGH';
  return 'LOW';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function fetchProjectIssues(project) {
  const url = `${GLITCHTIP_URL}/api/0/projects/${ORG}/${project.slug}/issues/?query=is%3Aunresolved&sort=-last_seen&limit=25`;
  try {
    const { status, body } = await fetchJson(url, { Authorization: `Bearer ${TOKEN}` });
    if (status !== 200 || !Array.isArray(body)) {
      console.error(`[digest] ${project.name}: API returned ${status}`);
      return [];
    }
    return body;
  } catch (e) {
    console.error(`[digest] ${project.name}: fetch failed — ${e.message}`);
    return [];
  }
}

async function enrichIssue(issue, project) {
  const meta     = issue.metadata || {};
  const filename = meta.filename || '';
  const lineMatch = (issue.culprit || '').match(/:(\d+)$/);
  const lineNum  = lineMatch ? lineMatch[1] : null;

  let localFile   = null;
  let displayPath = null;
  let context     = null;

  if (filename) {
    localFile = findFileInRoot(project.srcRoot, filename);
    if (localFile) {
      // Make display path relative to project root (not srcRoot)
      const projectRoot = project.srcRoot.split('/src')[0];
      displayPath = localFile.replace(/\\/g, '/').replace(projectRoot.replace(/\\/g, '/') + '/', '');
      context = getCodeContext(localFile, lineNum);
    }
  }

  const score    = scoreIssue(issue);
  const priority = classify(score);
  const lastSeen = new Date(issue.lastSeen);
  const hoursAgo = Math.round((Date.now() - lastSeen.getTime()) / 3600000);
  const timeAgo  = hoursAgo < 1 ? 'just now'
                 : hoursAgo < 24 ? `${hoursAgo}h ago`
                 : `${Math.round(hoursAgo / 24)}d ago`;

  return {
    id:          issue.id,
    project:     project.name,
    projectSlug: project.slug,
    title:       issue.title,
    culprit:     issue.culprit || '',
    level:       issue.level || 'error',
    status:      issue.status,
    count:       parseInt(issue.count) || 0,
    userCount:   parseInt(issue.userCount) || 0,
    firstSeen:   issue.firstSeen,
    lastSeen:    issue.lastSeen,
    timeAgo,
    permalink:   issue.permalink || `${GLITCHTIP_URL}/${ORG}/issues/${issue.id}/`,
    filename,
    lineNumber:  lineNum,
    functionName: meta.function || '',
    errorType:   meta.type || '',
    localFile,
    displayPath,
    context,
    fixHint:     getFixHint(issue.title, meta.type),
    score,
    priority,
  };
}

function renderIssue(issue) {
  const lines = [];
  lines.push(`### [${issue.project}] ${issue.title}`);
  if (issue.displayPath) {
    const loc = issue.lineNumber ? `${issue.displayPath}:${issue.lineNumber}` : issue.displayPath;
    lines.push(`- **File**: \`${loc}\``);
  } else if (issue.culprit) {
    lines.push(`- **Culprit**: \`${issue.culprit}\` _(source file not found locally)_`);
  }
  if (issue.functionName) lines.push(`- **Function**: \`${issue.functionName}\``);
  lines.push(`- **Impact**: ${issue.count} occurrence${issue.count !== 1 ? 's' : ''} · ${issue.userCount} user${issue.userCount !== 1 ? 's' : ''} · last seen ${issue.timeAgo}`);
  lines.push(`- **Fix hint**: ${issue.fixHint}`);
  if (issue.context) {
    lines.push(`- **Code context**:`);
    lines.push('```');
    lines.push(issue.context);
    lines.push('```');
  }
  lines.push(`- **GlitchTip**: ${issue.permalink}`);
  return lines.join('\n');
}

function buildMarkdown(allIssues, runTime) {
  const critical = allIssues.filter(i => i.priority === 'CRITICAL');
  const high     = allIssues.filter(i => i.priority === 'HIGH');
  const low      = allIssues.filter(i => i.priority === 'LOW');
  const total    = allIssues.length;

  const header = [
    '---',
    'name: GlitchTip Error Digest',
    'description: Auto-updated nightly — unresolved production errors ranked by severity + impact',
    'type: project',
    `updated: ${runTime.toISOString()}`,
    '---',
    '',
    `> Last run: ${runTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST | 4 apps scanned | ${total} unresolved: **${critical.length} CRITICAL** · ${high.length} HIGH · ${low.length} LOW`,
    '',
    '---',
  ].join('\n');

  const sections = [];

  if (critical.length) {
    sections.push('## CRITICAL — Fix This Session\n');
    sections.push(critical.map(renderIssue).join('\n\n---\n\n'));
  } else {
    sections.push('## CRITICAL\n\n_None — all clear._');
  }

  if (high.length) {
    sections.push('\n\n## HIGH — Fix This Week\n');
    sections.push(high.map(renderIssue).join('\n\n---\n\n'));
  }

  if (low.length) {
    sections.push('\n\n## LOW — Monitor\n');
    sections.push(low.map(i => `- **[${i.project}]** ${i.title} — ${i.count} hits · ${i.timeAgo} · [GlitchTip](${i.permalink})`).join('\n'));
  }

  if (!total) {
    sections.push('## No unresolved issues\n\n_All clear across all 4 apps._');
  }

  return `${header}\n\n${sections.join('\n')}`;
}

async function main() {
  const runTime = new Date();
  console.log(`[digest] Starting GlitchTip digest — ${runTime.toISOString()}`);

  // Fetch all projects in parallel
  const allIssues = [];
  await Promise.all(PROJECTS.map(async project => {
    console.log(`[digest] Fetching ${project.name}...`);
    const raw = await fetchProjectIssues(project);
    console.log(`[digest] ${project.name}: ${raw.length} unresolved issues`);
    const enriched = await Promise.all(raw.map(issue => enrichIssue(issue, project)));
    allIssues.push(...enriched);
  }));

  // Sort by score descending
  allIssues.sort((a, b) => b.score - a.score);

  const markdown = buildMarkdown(allIssues, runTime);
  const jsonData = { updatedAt: runTime.toISOString(), issues: allIssues };

  // Write memory file
  if (!fs.existsSync(MEMORY_DIR)) {
    console.error(`[digest] Memory dir not found: ${MEMORY_DIR}`);
  } else {
    fs.writeFileSync(MEMORY_FILE, markdown, 'utf8');
    console.log(`[digest] Memory file written: ${MEMORY_FILE}`);
  }

  // Write JSON report
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(JSON_FILE, JSON.stringify(jsonData, null, 2), 'utf8');
  console.log(`[digest] JSON report written: ${JSON_FILE}`);

  // Summary
  const c = allIssues.filter(i => i.priority === 'CRITICAL').length;
  const h = allIssues.filter(i => i.priority === 'HIGH').length;
  const l = allIssues.filter(i => i.priority === 'LOW').length;
  console.log(`[digest] Done — ${c} CRITICAL · ${h} HIGH · ${l} LOW`);
}

main().catch(e => {
  console.error('[digest] Fatal error:', e.message);
  process.exit(1);
});
