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
if (require.main === module) {
  const ledger = build();
  fs.writeFileSync(path.join(root, 'docs/CORRECTIVE-ACCEPTANCE.json'), JSON.stringify(ledger, null, 2) + '\n');
  console.log(JSON.stringify({ sourceFiles: ledger.sources.length, requirementLines: ledger.rows.length, sections: Object.keys(sections).length }));
}
module.exports = { build };
