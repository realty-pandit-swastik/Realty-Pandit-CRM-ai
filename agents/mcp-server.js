#!/usr/bin/env node
/**
 * Realty Pandit Browser QA MCP Server
 * Exposes browser QA and task verification as Claude tools.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const AGENTS_DIR = __dirname;
const BROWSER_QA_DIR = path.join(AGENTS_DIR, 'browser-qa');

const server = new Server(
  { name: 'realty-pandit-qa', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

function runScript(cwd, script, args = [], timeoutMs = 300000) {
  try {
    const result = spawnSync('node', [script, ...args], {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf8',
      env: { ...process.env }
    });
    return {
      success: result.status === 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      status: result.status
    };
  } catch (e) {
    return { success: false, stdout: '', stderr: e.message, status: -1 };
  }
}

function getLatestReport() {
  const latestJson = path.join(BROWSER_QA_DIR, 'reports', 'latest-report.json');
  const latestMd = path.join(BROWSER_QA_DIR, 'reports', 'latest-summary.md');
  if (fs.existsSync(latestMd)) {
    return fs.readFileSync(latestMd, 'utf8');
  }
  if (fs.existsSync(latestJson)) {
    const report = JSON.parse(fs.readFileSync(latestJson, 'utf8'));
    return JSON.stringify(report.summary, null, 2);
  }
  return 'No report found. Run qa_scan first.';
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'qa_scan',
      description: 'Run a browser QA scan on the live Realty Pandit website. Crawls all pages, checks for errors, broken images, layout issues, SEO, accessibility, and performance.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['desktop', 'mobile', 'full'],
            description: 'Viewport mode: desktop (default), mobile, or full (all viewports)',
            default: 'desktop'
          }
        }
      }
    },
    {
      name: 'qa_verify_task',
      description: 'Verify that a specific task/feature works on the live site. Runs targeted checks after a deployment.',
      inputSchema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'What was implemented/changed (e.g. "Added contact form on /contact page")'
          },
          checks: {
            type: 'array',
            description: 'Shorthand checks to run. Format: "exists:/page#selector", "text:/page:visible text", "noerrors:/page", "api:/endpoint:200", "loads:/page:3000", "count:/page#sel:min", "responsive:/page", "image:/page#sel", "link:/page#sel"',
            items: { type: 'string' }
          }
        },
        required: ['description', 'checks']
      }
    },
    {
      name: 'qa_report',
      description: 'Get the latest QA scan report for Realty Pandit.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'server_health',
      description: 'Check the health of the Realty Pandit server: PM2 processes, disk, memory, and API endpoints.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'glitchtip_digest',
      description: 'Fetch a fresh GlitchTip error digest right now and update Claude memory. Returns ranked unresolved errors with file location, code context, and fix hints.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'deploy',
      description: 'Deploy a component to the Realty Pandit production server.',
      inputSchema: {
        type: 'object',
        properties: {
          component: {
            type: 'string',
            enum: ['website', 'backend', 'frontend', 'all'],
            description: 'Which component to deploy'
          }
        },
        required: ['component']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'qa_scan') {
    const mode = args?.mode || 'desktop';
    const flags = mode === 'mobile' ? ['--mobile'] : mode === 'full' ? ['--full'] : [];

    const result = runScript(BROWSER_QA_DIR, 'run.js', flags, 360000);
    const report = getLatestReport();

    return {
      content: [{
        type: 'text',
        text: result.success
          ? `QA Scan Complete (${mode} mode):\n\n${report}`
          : `QA Scan failed:\n${result.stderr}\n\nPartial output:\n${result.stdout.slice(-2000)}`
      }]
    };
  }

  if (name === 'qa_verify_task') {
    const { description, checks } = args;

    // Build task JSON using create-task.js
    const createArgs = [description, ...checks];
    const createResult = runScript(BROWSER_QA_DIR, 'create-task.js', createArgs, 10000);

    if (!createResult.success && !fs.existsSync(path.join(BROWSER_QA_DIR, 'tasks', 'last-task.json'))) {
      return {
        content: [{
          type: 'text',
          text: `Failed to create task: ${createResult.stderr}\n${createResult.stdout}`
        }]
      };
    }

    // Run task verification
    const verifyResult = runScript(BROWSER_QA_DIR, 'task-verify.js', ['--last'], 180000);

    // Read task report
    const taskReportPath = path.join(BROWSER_QA_DIR, 'reports', 'last-task-result.json');
    let taskSummary = verifyResult.stdout.slice(-3000);

    if (fs.existsSync(taskReportPath)) {
      try {
        const taskReport = JSON.parse(fs.readFileSync(taskReportPath, 'utf8'));
        const passed = taskReport.results?.filter(r => r.passed).length || 0;
        const total = taskReport.results?.length || 0;
        const failed = taskReport.results?.filter(r => !r.passed) || [];
        taskSummary = `Task Verification: ${passed}/${total} checks passed\n\n`;
        if (failed.length > 0) {
          taskSummary += `FAILED CHECKS:\n${failed.map(f => `  - ${f.description}: ${f.error || f.message || 'failed'}`).join('\n')}\n\n`;
        }
        taskSummary += `Full output:\n${verifyResult.stdout.slice(-2000)}`;
      } catch (e) {
        // use stdout
      }
    }

    return {
      content: [{
        type: 'text',
        text: verifyResult.success
          ? `Task Verification PASSED:\n\n${taskSummary}`
          : `Task Verification FAILED - fixes needed:\n\n${taskSummary}\nStderr: ${verifyResult.stderr.slice(-500)}`
      }]
    };
  }

  if (name === 'qa_report') {
    return {
      content: [{ type: 'text', text: getLatestReport() }]
    };
  }

  if (name === 'server_health') {
    const monitorDir = path.join(AGENTS_DIR, 'monitor');
    const result = runScript(monitorDir, 'run.js', [], 60000);
    return {
      content: [{
        type: 'text',
        text: result.success
          ? result.stdout.slice(-3000)
          : `Health check failed:\n${result.stderr}\n${result.stdout.slice(-1000)}`
      }]
    };
  }

  if (name === 'glitchtip_digest') {
    const monitorDir = path.join(AGENTS_DIR, 'monitor');
    const result = runScript(monitorDir, 'glitchtip-digest.js', [], 60000);
    const memoryDir = 'C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory';
    const digestFile = path.join(memoryDir, 'glitchtip_errors.md');
    let output = result.stdout.slice(-500);
    if (fs.existsSync(digestFile)) {
      output = fs.readFileSync(digestFile, 'utf8');
    }
    return {
      content: [{
        type: 'text',
        text: result.success
          ? `GlitchTip digest complete:\n\n${output}`
          : `Digest failed:\n${result.stderr}\n${result.stdout.slice(-500)}`
      }]
    };
  }

  if (name === 'deploy') {
    const component = args?.component || 'website';
    const deployDir = path.join(AGENTS_DIR, 'deployment');
    const result = runScript(deployDir, 'deploy-agent.js', [component], 600000);
    return {
      content: [{
        type: 'text',
        text: result.success
          ? `Deploy of ${component} completed:\n${result.stdout.slice(-2000)}`
          : `Deploy of ${component} FAILED:\n${result.stderr}\n${result.stdout.slice(-1000)}`
      }]
    };
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(e => {
  process.stderr.write(`MCP Server error: ${e.message}\n`);
  process.exit(1);
});
