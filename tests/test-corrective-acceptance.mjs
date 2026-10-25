import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { build, buildSource, buildSettingsInventory } = require('../scripts/build-corrective-checklist.cjs');

test('All118 original lines retain independent acceptance criteria without section status inheritance', () => {
  const original = buildSource(), detailed = build();
  assert.equal(detailed.rows.length, 118);
  assert.equal(new Set(detailed.rows.map(row => row.id)).size, 118);
  assert.deepEqual(detailed.sources, original.sources);
  const ids = new Set(), statuses = new Set(['DONE', 'PARTIAL', 'NOT DONE', 'BLOCKED', 'NOT TESTED']);
  for (const [index, row] of detailed.rows.entries()) {
    assert.equal(row.requirement, original.rows[index].requirement);
    assert.equal(row.sourceLine, original.rows[index].sourceLine);
    assert.ok(row.criteria.length);
    assert.equal(row.status === 'DONE', row.criteria.every(criterion => criterion.status === 'DONE'));
    for (const criterion of row.criteria) {
      assert.ok(!ids.has(criterion.id)); ids.add(criterion.id);
      assert.ok(statuses.has(criterion.status)); assert.ok(criterion.testEvidence);
      if (criterion.status !== 'DONE') assert.ok(criterion.missing);
      for (const file of criterion.files) {
        assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, file.file))).digest('hex'), file.sha256);
      }
    }
  }
  assert.ok(ids.size > 230);
  const language = detailed.rows.find(row => row.id === 'R08.L004');
  assert.deepEqual(language.criteria.map(item => item.status), ['DONE', 'NOT TESTED']);
  assert.equal(language.status, 'PARTIAL');
  assert.equal(detailed.runtimeGuarantee, false);
});

test('Cleanup inventory preserves unknown personal families and does not claim a private profile scan', () => {
  const inventory = buildSettingsInventory();
  assert.equal(inventory.privateProfileInspected, false);
  for (const name of ['cSpell.language / cSpell.*', 'docker-mcp / github-mcp-server', 'editor.renderValidationDecorations and language-local copies']) {
    const entry = inventory.retired.find(item => item.key === name);
    assert.match(entry.action, /PRESERVE/); assert.ok(entry.test); assert.ok(entry.otherExtensionImpact);
  }
  assert.ok(inventory.active.length > 100);
});
