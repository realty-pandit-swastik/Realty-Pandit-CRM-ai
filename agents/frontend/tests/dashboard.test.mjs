import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Compile the real component with stubbed API/hooks so failures can be checked without a browser.
function dashboard(failing = []) {
  let result;
  const responses = {
    getContacts: [], getManagementAlerts: { alerts: [] }, getWorkflowTaskQueue: { tasks: [] },
    getMarketTrends: { leads: [{ date: '2026-10-13', count: 7 }], visits: [], sales: [] },
    getFinancialSummary: { total_commission: 0 }, getInventory: { total: 0 },
    getDealPipeline: {}, getTeamActivity: { shares: [], appointments: [] },
    getSpeedToLead: { median_minutes: null },
  };
  const api = Object.fromEntries(Object.entries(responses).map(([key, value]) => [key, async () => {
    if (failing.includes(key)) throw new Error('Unavailable');
    return value;
  }]));
  const box = ({ children, label, value, sub }) => React.createElement('div', null, label, value, sub, children);
  const stubs = {
    '../../api/client': api,
    '../../contexts/AuthContext': { useAuth: () => ({ agent: { name: 'Test' } }) },
    '../../hooks/useIsMobile': { useIsMobile: () => false },
    './analytics/clay': { ClayCard: box, SectionLabel: box, KpiCard: box, formatNum: String, formatINR: String, formatMins: String },
    './analytics/charts': { HealthBar: box },
    './analytics/FilterBar': { RangeBar: box, defaultRange: () => ({ from: new Date('2026-10-12T18:30:00Z'), to: new Date('2026-10-13T18:29:59Z') }) },
    './analytics/AsyncState': { useAsyncData: () => ({ status: 'success', data: result, reload() {} }), LoadingState: box, ErrorState: box },
    '../../lib/drill': { drillTo() {} },
  };
  const source = fs.readFileSync(new URL('../src/components/dashboard/MainDashboard.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source + '\nexport { loadCockpit, inRange };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const context = { exports: {}, require: name => name === 'react' ? React : stubs[name], console: { error() {} } };
  vm.runInNewContext(compiled, context);
  return {
    ...context.exports,
    render(data) { result = data; return renderToStaticMarkup(React.createElement(context.exports.MainDashboard)); },
  };
}

const range = { from: new Date('2026-10-12T18:30:00Z'), to: new Date('2026-10-13T18:29:59Z') };

test('IST buckets include the early morning window and exclude adjacent dates', async () => {
  const d = dashboard();
  assert.equal(d.inRange('2026-10-13', range.from, range.to), true);
  assert.equal(d.inRange('2026-10-12', range.from, range.to), false);
  assert.equal(d.inRange('2026-10-14', range.from, range.to), false);
  assert.equal((await d.loadCockpit(range)).pulse.leads.cur, 7);
});

test('failed feeds show failure, never a zero headline or successful empty state', async () => {
  const d = dashboard(['getMarketTrends', 'getWorkflowTaskQueue', 'getManagementAlerts', 'getTeamActivity']);
  const data = await d.loadCockpit(range);
  assert.deepEqual(Array.from(data.failed).sort(), ['activity', 'alerts', 'tasks', 'trends']);
  const html = d.render(data);
  assert.match(html, /Some dashboard figures couldn’t load/);
  assert.match(html, /Couldn’t load tasks/);
  assert.match(html, /Couldn’t load activity/);
  assert.doesNotMatch(html, /0 new leads|0 things need action|All caught up|No activity in this period/);
});

test('successful empty feeds retain honest empty states', async () => {
  const d = dashboard();
  const html = d.render(await d.loadCockpit(range));
  assert.match(html, /7 new leads/);
  assert.match(html, /All caught up/);
  assert.match(html, /No activity in this period/);
});

test('contacts failure rejects the entire dashboard load', async () => {
  await assert.rejects(dashboard(['getContacts']).loadCockpit(range), /Unavailable/);
});
