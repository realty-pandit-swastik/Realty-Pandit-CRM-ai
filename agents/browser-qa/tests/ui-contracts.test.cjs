// Read-only characterization against the checked-in pre-redesign revision.
// No database, provider, fixture credentials or production requests involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('../../frontend/node_modules/typescript');
const root = path.resolve(__dirname, '../../..');
const files = ['ExternalLeads', 'InventoryList', 'DealPipeline', 'InventoryDetailView', 'dashboard/MainDashboard', 'AgentLogs', 'CalendarView', 'dashboard/TeamPerformanceDashboard', 'mobile/MobileInventoryList', 'dashboard/analytics/FilterBar', 'LoginPage', 'AdvancedAnalytics', 'leads/DemandRequirementsForm', 'InventoryModal',
  'ContactsPage', 'ContactList', 'TeamManagement', 'TeamMemberProfile', 'ReportsView', 'EmailManagement', 'AddInventory', 'AIStatusBadge', 'QuickCallStrip', 'CopyChip', 'GoogleAccountCard', 'EmailAccountCard', 'MyProfile', 'ConvertToPartnerModal', 'DuplicateAddressWarning', 'BookVisitModal', 'InventoryQuickView', 'ShareToClientModal', 'SharePropertyOptions', 'ShareContentPicker', 'PropertyLiveStatus', 'TaskBoard', 'MarketingCampaign', 'WorkflowBuilder',
  'leads/LeadCard', 'leads/MatchedPropertiesSection', 'deal/DealWorkspace', 'deal/TimelineTab', 'deal/MatchShareTab', 'deal/InventoryFilterCommandBar', 'deal/LogCallOverlay', 'deal/QualifiedActionsModal', 'mobile/MobileContactList', 'mobile/MobileCalendar', 'mobile/MobileChatView', 'mobile/MobileTeamView', 'ui/ConfirmDialog'];
const normalize = text => text.replace(/\s+/g, '');

function contracts(source) {
  const ast = ts.createSourceFile('view.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const apiNames = new Set();
  const clients = new Set();
  for (const node of ast.statements) {
    if (ts.isImportDeclaration(node) && /(?:api\/client|lib\/api)$/.test(node.moduleSpecifier.text)) {
      if (node.importClause?.name) clients.add(node.importClause.name.text);
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) clients.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach(el => apiNames.add(el.name.text));
    }
  }
  const network = [], permissions = [], defaults = [];
  const walk = node => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if ((ts.isIdentifier(expr) && apiNames.has(expr.text)) ||
          (ts.isPropertyAccessExpression(expr) && clients.has(expr.expression.getText(ast)))) {
        network.push(normalize(node.getText(ast)));
      }
      if (ts.isIdentifier(expr) && expr.text === 'hasPermission') permissions.push(normalize(node.getText(ast)));
    }
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer &&
        ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useState') {
      // Multiple components in one file can each have loading/reason state.
      // Compare by owning function as well as variable, never the first name match.
      let owner = node.parent;
      while (owner && !ts.isFunctionDeclaration(owner) && !ts.isFunctionExpression(owner) && !ts.isArrowFunction(owner)) owner = owner.parent;
      const scope = owner?.name?.getText(ast) ||
        (owner?.parent && ts.isVariableDeclaration(owner.parent) ? owner.parent.name.getText(ast) : '<anonymous>');
      defaults.push([`${scope}:${node.name.elements[0]?.name?.getText(ast)}`, normalize(node.initializer.getText(ast))]);
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  return { network, permissions, defaults };
}

for (const component of files) {
  const name = `agents/frontend/src/components/${component}.tsx`;
  test(`${component}: API call expressions, permission checks and existing state defaults unchanged`, () => {
    const before = contracts(execFileSync('git', ['show', `HEAD:${name}`], { cwd: root, encoding: 'utf8' }));
    const after = contracts(fs.readFileSync(path.join(root, name), 'utf8'));
    assert.deepEqual(after.network, before.network, 'network arguments changed');
    assert.deepEqual(after.permissions, before.permissions, 'permission calls changed');
    for (const [name, initializer] of before.defaults) {
      assert.equal(after.defaults.find(([n]) => n === name)?.[1], initializer, `${name} default changed`);
    }
  });
}

test('External leads retain all columns, sort defaults and load-more increment', () => {
  const source = fs.readFileSync(path.join(root, 'agents/frontend/src/components/ExternalLeads.tsx'), 'utf8');
  for (const column of ['Name', 'Phone', 'Client Type', 'Source', 'Status', 'Stage', 'Assigned to', 'Budget', 'Score', 'Intent', 'Location', 'Date']) {
    assert.ok(source.includes(`['${column}',`), `Missing ${column}`);
  }
  assert.match(source, /useState<string>\('date'\)/);
  assert.match(source, /useState<'asc' \| 'desc'>\('desc'\)/);
  assert.match(source, /useState\(500\)/);
  assert.match(source, /setPageLimit\(l => l \+ 500\)/);
});

test('Inventory retains 20-item pagination and property privacy conditions', () => {
  const inventory = fs.readFileSync(path.join(root, 'agents/frontend/src/components/InventoryList.tsx'), 'utf8');
  const detail = fs.readFileSync(path.join(root, 'agents/frontend/src/components/InventoryDetailView.tsx'), 'utf8');
  assert.match(inventory, /const pageSize = 20;/);
  assert.match(detail, /const fullAccess = agent\?\.role === 'super_boss' \|\| agent\?\.role === 'manager';/);
  assert.match(detail, /const unitLine = fullAccess \? formatUnitLabel\(inv\) : '';/);
  assert.ok(detail.includes('(inv.customer_price || inv.price) && fullAccess'));
  assert.ok(detail.includes('canEdit && inv?.can_edit && onEdit'));
});

test('Semantic label pairs meet 4.5:1 in both themes', () => {
  const css = fs.readFileSync(path.join(root, 'agents/frontend/src/index.css'), 'utf8');
  function luminance(hex) {
    const channels = hex.match(/[a-f0-9]{2}/gi).map(c => parseInt(c, 16) / 255)
      .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  }
  for (const tone of ['info', 'danger', 'success', 'warn']) {
    const backgrounds = [...css.matchAll(new RegExp(`--rp-${tone}-bg:\\s*(#[0-9a-f]{6})`, 'g'))];
    const texts = [...css.matchAll(new RegExp(`--rp-${tone}-text:\\s*(#[0-9a-f]{6})`, 'g'))];
    assert.equal(backgrounds.length, 2);
    backgrounds.forEach((bg, i) => {
      const a = luminance(bg[1]), b = luminance(texts[i][1]);
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      assert.ok(ratio >= 4.5, `${tone} theme ${i}: ${ratio.toFixed(2)}:1`);
    });
  }
});

test('Consolidated dashboard currency preserves legacy rounding, nulls and negative amounts', () => {
  const source = fs.readFileSync(path.join(root, 'agents/frontend/src/lib/format.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports = {};
  new Function('exports', outputText)(exports);
  const legacy = n => {
    if (!n || !isFinite(n)) return '₹0';
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
  };
  for (const value of [null, undefined, NaN, Infinity, 0, .25, 1.5, -1.5, 99999.7, 100000, -100000, 1e7, -1e7, 987654321]) {
    assert.equal(exports.formatCurrency(value), legacy(value), `Changed dashboard value ${value}`);
  }
});
