import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function navigation(state) {
    const calls = [], events = new EventTarget(), exports = {};
    const code = ts.transpileModule(readFileSync(new URL('../src/lib/contactNavigation.ts', import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, { exports, history: { state }, window: events,
        require: () => ({ drillTo: target => calls.push(target) }) });
    return { calls, events, navigate: exports.navigateFromContact };
}

test('C-dialog record navigation waits for Back and happens only once', () => {
    const n = navigation({ relationship: 'test-contact' });
    const target = { entity: 'deals', filter: { deal: 'test-deal' } };
    let closed = false;
    n.navigate(target, () => { closed = true; });
    assert.equal(closed, true);
    assert.equal(n.calls.length, 0);
    n.events.dispatchEvent(new Event('popstate'));
    n.events.dispatchEvent(new Event('popstate'));
    assert.deepEqual(n.calls, [target]);
});

test('Contacts-drawer record navigation closes and opens the exact record immediately', () => {
    const n = navigation({});
    const target = { entity: 'team', filter: { member: 'test-member' } };
    let closed = false;
    n.navigate(target, () => { closed = true; });
    assert.equal(closed, true);
    assert.deepEqual(n.calls, [target]);
});
