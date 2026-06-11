/**
 * Create Task Verification JSON
 *
 * Helper to quickly create task verification files.
 * Called by Claude or manually to define what to check after a deploy.
 *
 * Usage:
 *   node create-task.js "Description" "check1" "check2" ...
 *
 * Check shorthand format:
 *   "exists:/page#selector"           → element_exists
 *   "text:/page:Some visible text"    → text_visible
 *   "noerrors:/page"                  → no_console_errors
 *   "api:/endpoint:200"               → api_returns
 *   "loads:/page:3000"                → page_loads (max ms)
 *   "count:/page#selector:min:max"    → element_count
 *   "content:/page#selector:text"     → element_text (contains)
 *   "responsive:/page"                → responsive
 *   "image:/page#selector"            → image_loads
 *   "link:/page#selector"             → link_works
 *
 * Example:
 *   node create-task.js "Fixed hero section" "exists:/#.hero" "text:/:Realty Pandit" "noerrors:/" "responsive:/" "loads:/:5000"
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const description = args[0];
const checkArgs = args.slice(1);

if (!description || checkArgs.length === 0) {
  console.log('Usage: node create-task.js "Description" "check1" "check2" ...');
  console.log('Run without args to see full help above.');
  process.exit(1);
}

function parseCheck(shorthand) {
  const [type, ...rest] = shorthand.split(':');

  switch (type) {
    case 'exists': {
      const [pageSel] = rest.join(':').split('#');
      const selector = rest.join(':').split('#').slice(1).join('#');
      return { type: 'element_exists', page: pageSel || '/', selector, description: `Element "${selector}" exists on ${pageSel || '/'}` };
    }
    case 'text': {
      const page = rest[0] || '/';
      const text = rest.slice(1).join(':');
      return { type: 'text_visible', page, text, description: `Text "${text}" visible on ${page}` };
    }
    case 'noerrors': {
      const page = rest[0] || '/';
      return { type: 'no_console_errors', page, description: `No JS errors on ${page}` };
    }
    case 'api': {
      const url = rest[0];
      const status = parseInt(rest[1]) || 200;
      return { type: 'api_returns', url, status, description: `API ${url} returns ${status}` };
    }
    case 'loads': {
      const page = rest[0] || '/';
      const maxTime = parseInt(rest[1]) || 5000;
      return { type: 'page_loads', page, max_time: maxTime, description: `${page} loads under ${maxTime}ms` };
    }
    case 'count': {
      const [pageSel] = rest[0].split('#');
      const selector = rest[0].split('#').slice(1).join('#');
      const min = parseInt(rest[1]) || 1;
      const max = rest[2] ? parseInt(rest[2]) : undefined;
      return { type: 'element_count', page: pageSel, selector, min, ...(max && { max }), description: `${min}+ "${selector}" on ${pageSel}` };
    }
    case 'content': {
      const [pageSel] = rest[0].split('#');
      const selector = rest[0].split('#').slice(1).join('#');
      const text = rest.slice(1).join(':');
      return { type: 'element_text', page: pageSel, selector, contains: text, description: `"${selector}" contains "${text}" on ${pageSel}` };
    }
    case 'responsive': {
      const page = rest[0] || '/';
      return { type: 'responsive', page, description: `${page} is responsive on mobile` };
    }
    case 'image': {
      const [pageSel] = rest[0].split('#');
      const selector = rest[0].split('#').slice(1).join('#');
      return { type: 'image_loads', page: pageSel, selector, description: `Image "${selector}" loads on ${pageSel}` };
    }
    case 'link': {
      const [pageSel] = rest[0].split('#');
      const selector = rest[0].split('#').slice(1).join('#');
      return { type: 'link_works', page: pageSel, selector, description: `Link "${selector}" works on ${pageSel}` };
    }
    default:
      console.warn(`Unknown check type: ${type}`);
      return null;
  }
}

const checks = checkArgs.map(parseCheck).filter(Boolean);

const task = { description, checks };

// Save as last task and as named file
const tasksDir = path.join(__dirname, 'tasks');
fs.mkdirSync(tasksDir, { recursive: true });

const fileName = description.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50) + '.json';
const filePath = path.join(tasksDir, fileName);

fs.writeFileSync(filePath, JSON.stringify(task, null, 2));
fs.writeFileSync(path.join(tasksDir, 'last-task.json'), JSON.stringify(task, null, 2));

// Also log to deploy-log
const deployLogPath = path.join(tasksDir, 'deploy-log.json');
const deployLog = fs.existsSync(deployLogPath) ? JSON.parse(fs.readFileSync(deployLogPath, 'utf8')) : { deployments: [] };
deployLog.deployments.push({
  timestamp: new Date().toISOString(),
  description,
  taskFile: fileName,
  checksCount: checks.length
});
// Keep last 50 entries
if (deployLog.deployments.length > 50) deployLog.deployments = deployLog.deployments.slice(-50);
fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

console.log(`Task created: ${filePath}`);
console.log(`Checks: ${checks.length}`);
console.log(JSON.stringify(task, null, 2));
