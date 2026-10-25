# Corrective audit — work in progress

Baseline checked locally and fetched from origin/main: `31ee01f4fe6bcf75ff93cc56e6889a0cd9760009`. No old branch was restored or pushed. Current edits are uncommitted. This file is a progress index, not a verbatim prompt or a claim of completion.

| ID | Requirement | Status | Files | Acceptance / remaining work |
|---|---|---|---|---|
| R01.1 | Preserve complete received corrective prompt verbatim | PARTIAL | Current chat; docs/requests/corrective-tail-verbatim-2026-10-25.txt | User supplied the missing ending; it is preserved verbatim separately. Full primary corrective message still needs its exact archive |
| R01.2 | Preserve original history separately | PARTIAL | docs/requests/source-user-history-export.json | Provider-returned source userMessage exported; image bytes unavailable. Not a replacement for the current prompt |
| R01.3 | Clause-level checklist and acceptance map | PARTIAL | This file | Expand grouped IDs to every clause; no DONE based only on document names |
| R02.1 | Preserve personal Gemini/Antigravity config | PARTIAL | lib/config-merge.js; lib/installer.js; lib/doctor.js | Real disposable fresh/update/repeat/Doctor/rollback regression passed; Windows/restart cycles pending |
| R02.2 | Preserve token settings and personal rules | PARTIAL | extensions/workstation-stability/profile.cjs; lib/doctor.js | Light+ block, global rules and theme-local personal rules retained; managed rules precede personal rules; live restart not tested |
| R02.3 | Arrays with explicit semantics | PARTIAL | lib/config-merge.js | permissions.allow: stable exact-value membership; hook groups match matcher and exact managed command; unknown managed array types fail closed. Historical hook-path migration needs more cases |
| R02.4 | Backup, parse-before-write, rollback, locks, atomic writes | PARTIAL | Existing installer pipeline retained | Exact original active-config bytes restored in new regression; expanded concurrency/failure matrix pending |
| R03.1–8 | Eight real current-version recordings | NOT DONE | docs/feature-guides; scripts/build-feature-guides.cjs | Existing clips are text cards, not recordings. Do not count as accepted |
| R03.9 | Installed Details previews, playback, reload/reopen | NOT TESTED | Extension README/VSIX | Must test actual installed UI and every URL |
| R04.1 | Safe default deletion | PARTIAL | extensions/git-branch-panel/extension.js | Default local -d; unmerged guard; explicit force/remote choice; real disposable refs tested. Remote-only scope, unpublished analysis, dirty/unsaved cases and recordings still incomplete |
| R04.2 | PR head/base and pushed head | PARTIAL | extensions/git-branch-panel/extension.js | Actual ls-remote with local disposable SSH transport; absent base and unpublished HEAD prevent compare. Current strict SHA equality may also require sync for remote-ahead HEAD |
| R04.3 | Preserve existing merge/pull behavior | PARTIAL | tests/test-github-panel-workflows.mjs | 16 workflow scenarios passed after changes; full regression rerun pending |
| R05.1 | Latest stable compatible metadata before VSIX download | PARTIAL | lib/extensions.js; scripts/install-gallery-extension.cjs; tests/test-gallery-compatibility.mjs | Metadata-first and three production trackLatest repeat regressions passed; native full-catalog now also requires metadata-only repeat, pending Windows run |
| R05.2 | Actual per-extension update/pinned state in IDE | PARTIAL | extensions/workstation-stability/gallery-updates.cjs; tests/windows-gallery-update; tests/windows-native-smoke/gallery-update-roundtrip.cjs | Actual VSIX catalog has pinned:true. Own bounded updater implemented, explicitly not native unpinning; old-version/update/restart native test added, not yet run. Foreign pins and uninstalled IDs retained by unit tests |
| R05.3 | Local extension real update source/cache behavior | PARTIAL | Existing README installer | Revalidate on the final release; no new release published yet |
| R06.1 | Theme selection across restart/update/projects | PARTIAL | Merge fixes above; existing theme preservation | Live Light+ roundtrip and explicit reset wording pending |
| R06.2 | Owned retired settings, namespace cleanup, removal ledger | NOT DONE | config/migrations; editor settings | Do not delete unknown namespaces or private extension settings blindly |
| R06.3 | Simplicity without dropping guards | PARTIAL | Current merge changes | No backup/rollback guards removed; no blanket line-count minification |
| R07.1 | Full skill/rule/agent source and trigger inventory | PARTIAL | scripts/audit-context-inventory.cjs; docs/CONTEXT-INVENTORY.json | 78 skills, 64 agents, 3 rules and 89 references inventoried with hashes/metadata/paths/dependencies; unknown upstream revisions explicitly remain content hashes, live discovery not tested |
| R07.2 | GSD coherent compatible migration | PARTIAL | resources/gsd-core; resources/mcp-runtime; manifests; scripts/install-gsd-bundle.cjs | Official 1.18.0 archive integrity verified, native Antigravity installer output imported coherently; lockfile/runtime/skills/agents/scripts/state/hash manifest updated. Local installer/hash/path regressions passed; native update/rollback still required |
| R07.3 | Short core, lazy modules, actual overhead measurement | PARTIAL | rules/GEMINI.template.md; skills; docs/CONTEXT-INVENTORY.json | Core 19506→3899 UTF-8 bytes; mentor 8304→1442 bytes, coding router 20601→704. Current metadata headers 43120 bytes, all markdown disk bodies 1564241 bytes are separate metrics; live read set/tokens/latency unmeasured, no speed claim |
| R07.4 | Global new/existing/multi-root/session discovery | NOT TESTED | Installed host | File installation alone does not prove Gemini follows rules |
| R08.1–10 | Language, brevity, truthfulness, three variants, minimal fix, consent, comments, screenshot fidelity | PARTIAL | Core and references | Conflict audit and live task transcripts still required; instructions are not runtime guarantees |
| R09.1 | Inline current-chat questionnaire, custom answer, Submit/Cancel | PARTIAL | questions.cjs; repair-chat.cjs | Existing implementation is IDE QuickPick + clipboard, not inline autosend; host API proof pending |
| R09.2 | Current-chat scope, no duplicate send after restart | NOT TESTED | Host integration | Must not infer support from command name or mocked boundary |
| R10.1 | Original screenshot skill ZIP, hash and license | BLOCKED | https://github.com/user-attachments/files/31874528/skills.zip | Fresh request resolved the actual cause: GitHub HTTP302 to objects.githubusercontent.com, absent from enforced allowlist; redirect is policy403. No binary browser transport exists here. Expected hash remains user-supplied, not verified |
| R10.2 | Adapt original skill and globally install it | NOT DONE | skills/inventory/installer | Do not substitute the homemade reference as the requested original |
| R10.3 | Inspect four sources, revisions and useful ideas | PARTIAL | docs/SOURCES-CORRECTIVE-2026-10-25.md | Four sources reopened, three repo HEADs recorded; MIT license checked for dzhng/ECC, relevant context/verification concepts adapted, provider commands not copied. CL4R1T4S prompt-extraction instruction rejected; no plugin fabricated. ZIP bytes still blocked |
| R10.4 | Same-viewport visual comparison and fixes | NOT TESTED | Real UI | No 1:1 claim without actual original/render comparison |
| R11.A | Clean disposable install | PARTIAL | tests/test-personal-config-preservation.mjs | Real local installer passed; expand Windows and installed UI acceptance |
| R11.B | Previous profile with personal config/theme/extensions | PARTIAL | New regression above | Active personal configs and exact backup restoration tested locally |
| R11.C | Repeat/restart/projects/rollback, 2–3 cycles | PARTIAL | Existing/new tests | Local repeat and rollback passed; live project/session cycles pending |
| R11.G | Live Gemini task matrix and transcripts | NOT TESTED | Actual account/host | Mock/fixture results must not be reported as live Gemini |
| R11.S | Other public code/terminal tester sites | BLOCKED | https://godbolt.org/api/compilers/javascript | Approved network request failed CONNECT tunnel403 / curl56, HTTP000 before safe code could be submitted. No external execution claimed; GitHub Actions is separate |
| R11.R | Meaningful retries and explicit statuses | PARTIAL | Tool logs / this file | Current ZIP 403 recorded; no policy bypass or identical tenfold retry |
| R12.1 | Broken README link and link check | PARTIAL | README.md | Broken 1.4.3 document target replaced with existing extension README; full link check pending |
| R12.2 | Final package/VSIX/version/checksum/minimum/source alignment | PARTIAL | package/config/VSIX/bootstrap | Candidate Setup3.0.25, Stability1.3.11, Git1.4.4 source/package/bootstrap aligned; deterministic Stability package regression passed. This is not a completed release and main still has baseline |
| R12.3 | Actual README install/update payload, cache/paths/personal data | PARTIAL | Disposable installer tests | Need final-release native paths and update acceptance |
| R13.1 | Compare every original clause before final report | NOT DONE | Final report | Do not call this grouped work-in-progress table the final full audit |
| R13.2 | Final result table, evidence, commands and outstanding blockers | NOT DONE | Final report | User sent a clarification question during ongoing work, not acceptance of incomplete work |

## Current execution evidence (not final acceptance)

- `/tmp/workstation-corrective-current-tests-4.log`: current local suite, 381 tests, 361 PASS, 0 FAIL, 20 SKIP (native platform-specific). Node24.19.0/Linux. Later scheduler tests are a separate focused run until included in the next full run.
- `/tmp/workstation-corrective-focused-3.log`: 26 PASS, 0 FAIL; installer, updater unit/mock engine and hosted-fixture guards, not live Gemini.
- `/tmp/workstation-bootstrap-current.log`: 70 portable PowerShell scenarios PASS, no public network. The newly added gallery-cache retention case needs another run.
- Actual Windows old ErrorLens3.29.0→current gallery→normal restart test is queued for candidate CI, not yet a PASS.
- Exact previous owned Stability1.3.10 VSIX moved recoverably to `/tmp/workstation-pre-corrective-stability-1.3.10.vsix` after generating1.3.11. No user-installed package was deleted by this source-tree change.
