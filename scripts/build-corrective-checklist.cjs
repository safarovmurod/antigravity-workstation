'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sections = {
  1: ['PARTIAL', 'docs/requests; docs/CORRECTIVE-AUDIT-WIP-2026-10-25.md', 'Compare the complete archived primary prompt and supplied tail against this checklist; preserve original image bytes when available.'],
  2: ['PARTIAL', 'lib/config-merge.js; lib/installer.js; lib/doctor.js; extensions/workstation-stability/profile.cjs; tests/test-personal-config-preservation.mjs', 'Fresh/update/repeat with personal nested keys, hook arrays, Light+ rules; exact-byte rollback; actual Windows restart and Doctor checks.'],
  3: ['PARTIAL', 'docs/feature-guides; extension README/VSIX; tests/docs-screenshots', 'Two real installed UI recordings were captured and visually inspected at e103cdf; Stability readability is being improved and six Git recordings remain. Verify all eight installed Details preview/playback/reload URLs. Text cards fail this acceptance.'],
  4: ['PARTIAL', 'extensions/git-branch-panel/extension.js; tests/test-github-panel-workflows.mjs', 'Disposable real Git refs verify default -d, explicit remote/force, unmerged/unpublished, dirty buffers, protected refs, remote lease and PR head/base. New matching video still needed.'],
  5: ['PARTIAL', 'lib/extensions.js; scripts/install-gallery-extension.cjs; extensions/workstation-stability/gallery-updates.cjs; tests/windows-gallery-update', 'Production trackLatest repeats must do metadata only; actual old3.29.0→latest3.30.0→restart passed on e96a3f4 Windows2025/2022. Re-run current final commit; inspect pin honestly and separate local VSIX update.'],
  6: ['PARTIAL', 'lib/profile-settings.js; extensions/workstation-stability/profile.cjs; tests/test-stability.mjs', 'Personal theme/tokens and unknown namespaces survive repeat/update/rollback and actual project/profile changes. Only proven owned retired values can be removed; removal ledger must cover each.'],
  7: ['PARTIAL', 'docs/CONTEXT-INVENTORY.json; rules; skills; agents; resources/gsd-core; resources/mcp-runtime', 'Verify complete1.18.0 manifest/runtime/lock migration and rollback; global deployment and actual new/existing/multi-root/session discovery; count bytes separately from active tokens and latency.'],
  8: ['PARTIAL', 'rules/GEMINI.template.md; skills/workstation-frontend-mentor; skills/project-coding-rules; skills/workstation-practice; docs/OWNED-COMMENT-CLEANUP.json', 'Run actual Gemini task matrix in Tajik/Russian and new/existing projects; check three proposals/one implementation, minimal diff, consent/ignoring, comments and same-viewport visual comparison. Files alone are not live proof.'],
  9: ['PARTIAL', 'extensions/workstation-stability/questions.cjs; extensions/workstation-stability/repair-chat.cjs; tests/windows-gallery-update/extension.cjs', 'Actual host/current-chat inline checkbox/custom Submit/Cancel and no restart duplicates. Present QuickPick+clipboard is only fallback; live authenticated send and inline form are not verified.'],
  10: ['PARTIAL', 'docs/upstream; docs/SOURCES-CORRECTIVE-2026-10-25.md; skills/in-chat-screenshot-to-code; tests/test-personal-config-preservation.mjs', 'Original11938-byte uploaded ZIP and four original file hashes verified; LICENSE is absent, not invented. Adaptation actually copied to global skills with no Mac metadata. Four sources read; live Gemini activation and real reconstruction comparison still need authenticated host evidence. Network redirect remains blocked but no longer blocks the supplied source.'],
  11: ['PARTIAL', 'tests; .github/workflows; docs/evidence', 'Complete A/B/C with2–3 stable repetitions, current-commit Windows/PowerShell/Git/README, native model transcripts and media. Record failed attempts and exact blockers; other tester site is separately policy-blocked.'],
  12: ['PARTIAL', 'README.md; package.json; config/extensions.json; extension manifests/VSIX; scripts/bootstrap.ps1', 'Link-check and immutable candidate package/installed-version alignment, path spaces, cache/downgrade/truncation/repeat. Main stays baseline until candidate is accepted; do not advertise unreleased source as available from main.'],
  13: ['NOT DONE', 'Final report; docs/CORRECTIVE-AUDIT-WIP-2026-10-25.md; docs/evidence', 'Compare every original line with this ledger and report name/before/after/file+commit/test/status, exact commands/environment/CI/live/media/removals/install path plus every unfinished item.'],
};
function build() {
  const names = ['corrective-primary-verbatim-2026-10-25.txt', 'corrective-tail-verbatim-2026-10-25.txt'];
  const rows = [], counters = {}, sources = [];
  let section = 1;
  for (const name of names) {
    const file = path.join(root, 'docs/requests', name), bytes = fs.readFileSync(file);
    sources.push({ file: 'docs/requests/' + name, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    if (name.includes('tail')) section = 13;
    const lines = bytes.toString('utf8').split('\n');
    for (let index = 0; index < lines.length; index++) {
      const text = lines[index]; if (!text.trim()) continue;
      const heading = /^(\d+)\. (Аввал талабҳоро|Аввал гумшавии|Ҳашт видеои|Git Panel|Error Lens|One Dark Pro|Ҳамаи skills|Қоидаҳои рафтори|Саволҳо дар чат|Screenshot skill|Проверкаи воқеӣ|README, package|Отчёти охир)/.exec(text);
      if (heading) section = Number(heading[1]);
      const [defaultStatus, files, acceptance] = sections[section];
      const status = section === 3 && /^[1-6]\. /.test(text) ? 'NOT DONE' : defaultStatus;
      const number = counters[section] = (counters[section] || 0) + 1;
      rows.push({ id: 'R' + String(section).padStart(2, '0') + '.L' + String(number).padStart(3, '0'),
        source: 'docs/requests/' + name, sourceLine: index + 1, requirement: text,
        status, files, workNeeded: acceptance, acceptance });
    }
  }
  return { schema: 1, sources, method: 'Every nonempty received source line has its own ID. Requirement text is retained; status is conservative and inherited by section until finer acceptance is verified. This is a coverage ledger, not a claim that every clause in a multi-clause line passed.',
    runtimeGuarantee: false, rows };
}
const statusNames = { D: 'DONE', P: 'PARTIAL', N: 'NOT DONE', B: 'BLOCKED', T: 'NOT TESTED' };
const evidence = {
  source: ['docs/requests/corrective-primary-verbatim-2026-10-25.txt', 'docs/requests/corrective-tail-verbatim-2026-10-25.txt'],
  report: ['docs/CORRECTIVE-CRITERIA.json', 'docs/CORRECTIVE-AUDIT-WIP-2026-10-25.md'],
  config: ['lib/config-merge.js', 'lib/installer.js', 'lib/doctor.js', 'tests/test-personal-config-preservation.mjs', 'tests/test-installer.mjs'],
  native: ['tests/windows-native-smoke/gallery-update-roundtrip.cjs', 'tests/windows-gallery-update/extension.cjs', 'docs/evidence/native-f76c13d-windows-2025.json'],
  git: ['extensions/git-branch-panel/extension.js', 'tests/test-github-panel.mjs', 'tests/test-github-panel-workflows.mjs'],
  gallery: ['lib/extensions.js', 'extensions/workstation-stability/gallery-updates.cjs', 'tests/test-gallery-compatibility.mjs', 'tests/test-managed-gallery-updates.mjs'],
  theme: ['lib/profile-settings.js', 'extensions/workstation-stability/profile.cjs', 'tests/test-stability.mjs', 'tests/test-personal-config-preservation.mjs'],
  cleanup: ['docs/SETTINGS-CLEANUP-INVENTORY.json', 'lib/profile-settings.js', 'lib/extensions.js', 'docs/OWNED-COMMENT-CLEANUP.json'],
  context: ['docs/CONTEXT-INVENTORY.json', 'scripts/install-gsd-bundle.cjs', 'rules/GEMINI.template.md'],
  rules: ['rules/GEMINI.template.md', 'skills/workstation-frontend-mentor/SKILL.md', 'skills/project-coding-rules/SKILL.md'],
  chat: ['extensions/workstation-stability/questions.cjs', 'extensions/workstation-stability/repair-chat.cjs', 'tests/test-questions.mjs', 'docs/evidence/native-f76c13d-windows-2025.json'],
  screenshot: ['skills/in-chat-screenshot-to-code/SKILL.md', 'skills/in-chat-screenshot-to-code/SOURCE.md', 'docs/upstream/in-chat-screenshot-to-code-original.zip'],
  sources: ['docs/SOURCES-CORRECTIVE-2026-10-25.md', 'docs/upstream/IN-CHAT-SCREENSHOT-TO-CODE-PROVENANCE.md'],
  media: ['docs/feature-guides/real-recordings.json', 'tests/docs-screenshots/panel-recording.cjs', 'docs/LOCAL-RECORDING-RUNBOOK.md'],
  comments: ['scripts/clean-owned-comments.cjs', 'docs/OWNED-COMMENT-CLEANUP.json', 'tests/test-comment-and-report-guards.mjs'],
  suite: ['package.json', 'tests/test-personal-config-preservation.mjs', '.github/workflows/setup-checks.yml'],
  release: ['README.md', 'package.json', 'config/extensions.json', 'scripts/bootstrap.ps1'],
  live: ['docs/LIVE-GEMINI-ACCEPTANCE.json', 'docs/evidence/native-f76c13d-windows-2025.json'],
  external: ['docs/CORRECTIVE-AUDIT-WIP-2026-10-25.md'],
};
function reference(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) throw new Error('Acceptance evidence file missing: ' + file);
  const bytes = fs.readFileSync(absolute);
  const anchors = { 'lib/profile-settings.js': 'function mergeSettings', 'lib/installer.js': 'function updateMcpConfig',
    'extensions/workstation-stability/profile.cjs': 'function mergeManagedValue', 'lib/config-merge.js': 'function ',
    'extensions/git-branch-panel/extension.js': 'async _handleDeleteBranches',
    'scripts/clean-owned-comments.cjs': 'function isProtectedComment' };
  const index = anchors[file] ? bytes.toString('utf8').indexOf(anchors[file]) : 0;
  return { file, line: index < 0 ? 1 : bytes.toString('utf8').slice(0, index).split('\n').length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    scope: 'Evidence entry point, not a claim that every line proves runtime behavior' };
}
function buildDetailed() {
  const source = build(), definitions = JSON.parse(fs.readFileSync(path.join(root, 'docs/CORRECTIVE-CRITERIA.json'))).rows;
  const ids = new Set(source.rows.map(row => row.id));
  for (const id of Object.keys(definitions)) if (!ids.has(id)) throw new Error('Unknown acceptance source ID: ' + id);
  const rows = source.rows.map(row => {
    const definitionsForRow = definitions[row.id];
    if (!Array.isArray(definitionsForRow) || !definitionsForRow.length) throw new Error('No independent criteria for ' + row.id);
    const criteria = definitionsForRow.map((encoded, index) => {
      const [code, requirement, key, ...extra] = encoded.split('|');
      if (!statusNames[code] || !requirement || !evidence[key] || extra.length) throw new Error('Invalid criterion: ' + row.id);
      const status = statusNames[code];
      return { id: row.id + '.C' + String(index + 1).padStart(2, '0'), requirement, status,
        implemented: status === 'DONE' ? requirement : 'Partial implementation or explicit boundary; inspect referenced code and evidence.',
        missing: status === 'DONE' ? null : requirement,
        files: evidence[key].map(reference), changedCode: evidence[key].filter(file => /^(lib|extensions|rules|skills|scripts)\//.test(file)),
        testEvidence: key,
        result: status === 'DONE' ? 'Scoped evidence accepted; not an assertion about sibling criteria.'
          : key === 'live' || key === 'chat' ? 'No authenticated current-chat receipt/transcript available; native command discovery is not live behavior.'
          : key === 'media' ? 'Only two committed real clips; six Git clips/current installed playback not accepted. Normal host onboarding and test-host dialog refusal are separate blockers.'
          : 'Acceptance remains open; no section-level PASS is inherited.' };
    });
    const states = criteria.map(item => item.status);
    const status = states.every(value => value === 'DONE') ? 'DONE'
      : states.every(value => value === 'BLOCKED') ? 'BLOCKED'
      : states.every(value => value === 'NOT TESTED') ? 'NOT TESTED'
      : states.every(value => value === 'NOT DONE') ? 'NOT DONE' : 'PARTIAL';
    return { id: row.id, source: row.source, sourceLine: row.sourceLine, requirement: row.requirement,
      status, files: [...new Set(criteria.flatMap(item => item.files.map(file => file.file)))],
      workNeeded: criteria.filter(item => item.status !== 'DONE').map(item => item.requirement), criteria };
  });
  const { execFileSync } = require('node:child_process');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const implementationDiff = execFileSync('git', ['diff', '--unified=3', 'f76c13dc9ef88ab776172723a98c2fb9c5c5f305', '--',
    'lib', 'extensions/workstation-stability/profile.cjs', 'extensions/workstation-stability/package.json', 'scripts/clean-owned-comments.cjs',
    'tests/test-editor-tooling.mjs', 'tests/test-stability.mjs', 'tests/test-comment-and-report-guards.mjs'], { cwd: root, encoding: 'utf8' });
  return { schema: 2, sources: source.sources, sourceHead: head,
    sourceBinding: 'File hashes identify the actual audited bytes; HEAD can precede uncommitted changes. Native CI is separately bound to f76c13d, never silently transferred to changed runtime code.',
    method: 'All118 original nonempty source lines retained. Each criterion was manually decomposed and independently classified in CORRECTIVE-CRITERIA.json; no section status inheritance. This is derived analysis, not a verbatim replacement.',
    runtimeGuarantee: false, implementationDiff: { baseCommit: 'f76c13dc9ef88ab776172723a98c2fb9c5c5f305', patch: implementationDiff }, evidenceTypes: evidence,
    verifiedBaselineCI: { commit: 'f76c13dc9ef88ab776172723a98c2fb9c5c5f305',
      setup: 'https://github.com/safarovmurod/antigravity-workstation/actions/runs/40193087204',
      native: 'https://github.com/safarovmurod/antigravity-workstation/actions/runs/40193087202',
      browserMcp: 'https://github.com/safarovmurod/antigravity-workstation/actions/runs/40193087207' },
    rows };
}
function buildSettingsInventory() {
  const templates = ['config/settings.json', 'config/antigravity-settings.json', 'config/gemini-config.json',
    'config/hooks.json', 'config/argv.json', 'config/mcp/active.template.json', 'config/mcp/mcp_antigravity.template.json'];
  const active = templates.flatMap(file => {
    const content = fs.readFileSync(path.join(root, file), 'utf8'), json = JSON.parse(content);
    const values = file === 'config/settings.json' ? json : Object.fromEntries(Object.entries(json));
    return Object.entries(values).map(([key, value]) => ({ key, file,
      sourceLine: Math.max(1, content.slice(0, content.indexOf(JSON.stringify(key))).split('\n').length),
      ownership: 'Current template owns its declared members only; extra personal nested keys are not owned',
      usage: 'Declared current managed configuration; not a scan of the real user private profile',
      semantics: Array.isArray(value) ? key === 'textMateRules' ? 'Managed rules followed by distinct personal rules' : 'See explicit installer semantic contract; no arbitrary concat'
        : value && typeof value === 'object' ? 'Managed overlay with foreign/personal keys retained where declared mergeable' : 'Managed scalar; manual colorTheme selection is preserved',
      action: 'KEEP current managed value; preserve nonowned extras', replacement: null,
      otherExtensionImpact: 'Do not delete unknown namespaces or other plugin members',
      evidence: ['tests/test-personal-config-preservation.mjs', 'tests/test-installer.mjs', 'tests/test-editor-tooling.mjs'] }));
  });
  const retired = [
    ['tsMancho.*', 'Owned retired extension namespace and command migration', 'calmTypeScript.*', 'Retire own namespace; do not extrapolate this ownership to unrelated plugins', 'tests/test-branding-migration.mjs'],
    ['javascript.suggest.importStatements', 'Historical project audit identified unregistered option; present user copy has no recorded value ownership', 'javascript.suggest.includeCompletionsForImportStatements', 'PRESERVE unknown current personal value; do not download/install it as a managed default', 'tests/test-editor-tooling.mjs'],
    ['typescript.suggest.importStatements', 'Historical project audit identified unregistered option; present user copy has no recorded value ownership', 'typescript.suggest.includeCompletionsForImportStatements', 'PRESERVE unknown current personal value', 'tests/test-editor-tooling.mjs'],
    ['editor.renderValidationDecorations and language-local copies', 'Internal Monaco option, not a supported declared Workstation setting; unknown current values are not proven owned', 'problems.visibility (global, not language-local)', 'PRESERVE unknown global/JS/TS/Python values; apply supported managed defaults separately', 'tests/test-editor-tooling.mjs'],
    ['cSpell.language / cSpell.*', 'Absent current managed catalog; installed personal spell plugin or modified values cannot be inferred from name', null, 'PRESERVE; no ownership proof for automatic deletion', 'tests/test-personal-config-preservation.mjs'],
    ['mssql.* / liveServer.*', 'Retired from managed gallery catalog; currently installed external copies are not proven owned', null, 'PRESERVE unknown personal settings/packages; do not reinstall through managed catalog', 'tests/test-clean-extensions.mjs'],
    ['docker-mcp / github-mcp-server', 'Already absent baseline3.0.24 managed catalog; current same-name server may be personal', null, 'PRESERVE exact unknown server metadata/env/options; Doctor warns instead of deleting', 'tests/test-setup-automation.mjs'],
    ['[Light+] / other theme blocks / personal textMateRules', 'Personal theme selection and custom token values; current One Dark Pro defaults do not own other themes', 'One Dark Pro defaults only for a fresh profile', 'PRESERVE, merge declared owned members; personal token rules retain last priority', 'tests/test-personal-config-preservation.mjs'],
    ['Exact old gsd-context-monitor hook', 'Exact owned snapshot config/migrations/retired-context-hook.template.json', 'Supported current hook/runtime catalog', 'REMOVE exact matching owned hook only; preserve mixed/modified foreign hooks and metadata', 'tests/test-personal-config-preservation.mjs'],
    ['Unknown namespace / duplicate-looking personal setting', 'No ownership proof merely from key name or equality with an old default', null, 'PRESERVE; inspect real profile/installed extension registry before any future scoped cleanup', 'tests/test-update.mjs'],
  ].map(([key, origin, replacement, action, test]) => ({ key, origin, ownership: origin,
    currentUsage: 'Inspect current registered extension and exact user value; no private profile was read by this audit',
    replacement, action, otherExtensionImpact: action.startsWith('REMOVE') ? 'Exact-match guard protects modified and mixed foreign entries' : 'Preserved to avoid changing unrelated plugins',
    test }));
  return { schema: 1, scope: 'Source managed global templates plus every identified retired family; not exhaustive inspection of an inaccessible real Windows user profile.',
    privateProfileInspected: false, active, retired, duplicates: 'Object templates parsed normally; no current duplicate-key removal is asserted without raw-token evidence.',
    remaining: 'Actual private Windows profile inventory and any user-specific duplicate/retired entries remain NOT TESTED. No unknown entry is automatically deleted.' };
}
if (require.main === module) {
  fs.writeFileSync(path.join(root, 'docs/SETTINGS-CLEANUP-INVENTORY.json'), JSON.stringify(buildSettingsInventory(), null, 2) + '\n');
  const ledger = buildDetailed();
  fs.writeFileSync(path.join(root, 'docs/CORRECTIVE-ACCEPTANCE.json'), JSON.stringify(ledger, null, 2) + '\n');
  console.log(JSON.stringify({ sourceFiles: ledger.sources.length, requirementLines: ledger.rows.length,
    criteria: ledger.rows.reduce((sum, row) => sum + row.criteria.length, 0), sections: Object.keys(sections).length }));
}
module.exports = { build: buildDetailed, buildSource: build, buildSettingsInventory };
