# Deep safety review — 26 October 2026

Executable source: `34cf90952d88d23d6cbe2491b73952aae8f9c4a6`, branch `codex/aster-appearance-20261025`, Setup 3.0.25. Main has not been merged or relabelled as this release. This report supplements, rather than replaces, the original [118 parent / 247 child acceptance ledger](CORRECTIVE-ACCEPTANCE.json). Its historical source hashes and unpassed live requirements are not silently marked current or DONE.

## Confirmed faults and repairs

| Area | Before | Repair / source | Verification | Status |
| --- | --- | --- | --- | --- |
| Full install concurrent edits | Planning could read personal configuration before capturing the rollback/concurrency baseline, losing an edit made during planning | `lib/installer.js`, snapshot before planning; revalidate before backup and each write; `4f07ca6`, `d94d739` | Six deterministic races: settings, keybindings, argv, Gemini config, native settings, MCP; preserve the concurrent edit, stop safely, then retry successfully | DONE for reproduced cases |
| Rules-only concurrent edits | A personal GEMINI.md edit during backup could be replaced | Same shared snapshot/guard verification in rules-only installer, `d94d739` | Reproduced failure before repair; after repair personal instructions and unrelated files remain byte-identical | DONE for reproduced case |
| Appearance async edits | Earlier awaited setting writes could erase a later personal token-object edit | `extensions/aster-appearance/appearance.cjs`, early object snapshots and compare-and-swap rollback, `d9503f3`, `ea08eee` | Real asynchronous API-contract regression; unrelated personal token edits retained; equal concurrent desired writes are idempotent; legitimate all-profiles scalar migration still works | DONE for API-contract regression; native host verification separate |
| Restore corruption | Corrupt backup bytes could still be copied with a success-shaped result; malformed/unlisted inventory could mutate active files | `lib/backup.js`, validate schema, exact modern inventory, guarded paths and hashes before mutations, `bf7fb07` | Tampering, null/array/unknown schema, traversal, unlisted file, legacy compatibility, coordinated rollback and original-version migration tests | DONE for automated fixtures |
| Managed object collisions | Existing scalar/null/array could be replaced by an owned object | `lib/config-merge.js`, reject incompatible existing object namespace before write, `bf7fb07` | Rejection preserves original active configuration and nested personal values | DONE for automated fixtures |
| Local extension registration | Malformed inventory detected too late; repair could lose all-profiles registration metadata | `lib/appearance-extension.js`, validate read-only preflight, guarded index, verified corrupt-package repair preserving foreign/UUID/scope fields, `bf7fb07`, `c3efd8c` | Damaged JSON and index fixtures, linked-path rejection, complete preflight byte snapshots, repair/archive/repeat tests | DONE for automated fixtures |
| Global payload pollution | Seven repository maintainer scripts were installed globally although dependencies were not deployed | `lib/owned-files.js`, exact source-only exclusions, `bf7fb07` | Previously owned unchanged scripts retired; edited and unknown scripts preserved; backup restores ownership/files; repeat stable. Downloaded global `scripts` payload now contains only `practice-engine.mjs` | DONE for automated fixtures |
| Windows ARM repeat guard | Successful bounded metadata retry made request count 20 instead of 19 and failed the test | `tests/windows-native-smoke/full-catalog.cjs`, `34cf909` | Require successful compatible metadata for every expected ID, maximum three attempts per ID; still reject every VSIX download/install. Six helper tests include missing/failed/unexpected/excessive request rejection. Native rerun listed below | DONE for targeted regression; native result separate |
| README stale source | Launcher fetched old main rather than updated candidate; copy still named One Dark Pro as fresh default | `README.md`, `scripts/bootstrap.ps1`, `34cf909` | All three launchers use the same explicit candidate branch. Resolver accepts exactly its current full SHA/ref; fails rather than falling back to main; snapshot/cache and minimum-version checks retained. 72 portable scenarios and actual published-source download below | DONE for selected-source/download behavior; full Windows provisioning separate |
| Obsolete live test | Font-size test expected the old destructive update behavior | `tests/test-bootstrap-live.ps1`, `34cf909` | Actual downloaded installer retains personal size 37 through two passes; tooling defaults are independently checked | DONE for downloaded fixture |

Historical comment-cleanup hashes remain unchanged. Functional PowerShell migrations have separate before/after hashes and reasons in [ASTER-SOURCE-MIGRATIONS.json](ASTER-SOURCE-MIGRATIONS.json); the strict source-hash test was rerun, not disabled.

## Real terminal verification

Linux environment: Node 24.19.0, portable PowerShell, official cached Antigravity 2.5.5 bundle. The bundle is verified against its audited hash; no VS Code bundle is substituted for native codec checks.

| Check | Actual result / evidence | Scope |
| --- | --- | --- |
| Full suite after repair | 437 passed, 0 failed, 0 skipped; `/tmp/final-review-full-retry.log` | All default Node tests, now including native full-catalog guard tests |
| Full suite repeated with LCOV | Exit 0, real trace `/tmp/final-review-34cf909.lcov` | [Production coverage summary](evidence/deep-review-34cf909-coverage.json): 36 observed modules; 720/780 functions hit, 7,631/8,285 lines hit, 3,750/4,537 branches hit |
| Native bundle codec / worker | 20 passed, 0 failed, 0 skipped; `/tmp/final-review-native-codec.log` | Actual audited bundle plus isolated protobuf runtime; not live Gemini output |
| Independent corrective fixture | 3 passed; `/tmp/final-review-corrective.log` | Acceptance accounting and disposable manual Git fixture, not all live acceptance |
| Tracked-file audit | 1,548 files inventoried/hashed, 615 applicable JSON/JS checks, no empty/parse issues; `/tmp/final-review-audit.log` | Inventory and syntax are not semantic proof of every file/function; excludes this later report and its generated coverage summary |
| PowerShell AST | All 14 tracked scripts, zero syntax failures | Linux parser; Windows PowerShell 5.1 is separately covered in CI |
| Other languages and actual font binaries | All eight tracked shell files pass `bash -n`; the tracked Python file parses; actual FontTools inspection of all 32 bundled TTFs matches each manifest family, local name, weight range and italic flag | Read-only inspection of actual files, not a check that names merely appear in JSON |
| PowerShell launcher scenarios | 72 passed; `/tmp/final-readme-bootstrap.log` | Retry, truncation, selected branch, failure summaries, no fallback, mode isolation, cache integrity |
| Actual HTTP tests | All eight curl/IWR ordinary/retry/empty/truncated scenarios passed; `/tmp/final-readme-http.log` | Real local HTTP and PowerShell transfers in paths with spaces/long paths; negative cases intentionally emit errors then assert rejection |
| Font staging | Bundled hashes, repeat/no-download, personal collision, corrupt/missing bundle cases passed | Does not prove Windows OS reboot or normal authenticated modal |
| Published source | `/tmp/final-readme-live.log`: actual raw bootstrap and commit-resolved archive, fresh rules/full config, repeat, offline cache reuse in three modes, coordinated quiet rollback passed at `34cf909` | Disposable profile with spaces; external font/gallery/browser provisioning and live native chat explicitly not performed here |
| Published VSIX bytes | Downloaded immutable `34cf909` URL and local package both SHA-256 `243130f4e4466ef3d65d0cf024bff21dec2afc706dc7bf14ad76eea60d39effa` | Actual downloaded bytes, not only a manifest assertion |
| Final inventory including this evidence | 1,550 tracked/staged files, 616 applicable checks, no empty/parse issues; `/tmp/final-review-audit-with-evidence.json` | Final staged patch whitespace check clean; 28 local Markdown targets in the four changed documents exist. Remote media playback is not inferred from link existence |

Node coverage does not observe five production entry/data/UI modules: Aster `extension.cjs`, `palettes.cjs`, `panel.js`; Calm `extension.cjs`; Stability `extension.js`. These need their separate IDE checks. A hit is execution, not a guarantee of correctness; unhit functions are listed explicitly. No statement that every repository function passed is made.

Reproduction commands from this candidate checkout:

```sh
WORKSTATION_ANTIGRAVITY_MAIN='/absolute/path/to/official/2.5.5/out/main.js' npm run test:coverage -- --test-reporter=spec
node --test tests/windows-native-smoke/test-full-catalog.mjs
pwsh -NoProfile -File tests/test-bootstrap-network.ps1
WORKSTATION_PWSH=/absolute/path/to/pwsh node tests/test-bootstrap-http.cjs
pwsh -NoProfile -File scripts/audit-powershell-syntax.ps1
pwsh -NoProfile -File tests/test-font-staging.ps1
pwsh -NoProfile -File tests/test-bootstrap-live.ps1 -Ref codex/aster-appearance-20261025 -ExpectedCommit 34cf90952d88d23d6cbe2491b73952aae8f9c4a6
```

The immutable ExpectedCommit above reproduces this evidence and intentionally fails if the branch moves. Ordinary README update commands resolve its current SHA on every invocation instead. On Windows use the matching real PowerShell/IDE suites, not a Linux result relabelled Windows.

## Current-code CI

Runs below all completed successfully for executable `34cf909`, not earlier green runs:

- [Setup checks, run 40279588049](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40279588049): PASS; Linux plus Windows 2022/2025/ARM and Node 24/26. Includes Windows PowerShell 5.1 launcher/bootstrap/font checks and real HTTP tests.
- [Native Windows IDE, run 40279588108](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40279588108): PASS on Windows 2022, Windows 2025 and Windows ARM, including the previously failing metadata-first repeat check with production `trackLatest:true`. The strict no-VSIX-download/reinstall guard remains active.
- [Actual Antigravity Aster UI, run 40279588088](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40279588088): PASS; current package, actual official IDE picker, rendered font controls, restart/project/profile phases. This is not authenticated Gemini verification or exhaustive visual review.
- [Windows browser/MCP, run 40279689984](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40279689984): PASS.

GitHub status/step metadata was read successfully. A subsequent bulk log ZIP fetch returned HTTP 403 from the signed Actions log endpoint; no access-policy bypass was attempted. Public run links above remain the inspectable CI evidence, rather than invented local copies of those logs.

The previous `ea08eee` ARM run genuinely failed on the retry-count assertion; it is not hidden or called PASS. Its Windows x64 jobs and independent Aster/Setup/browser runs passed, but do not stand in for this rerun.

## All thirteen original groups — remaining boundaries

| ID | Requirement group | Current evidence / remaining work | Status |
| --- | --- | --- | --- |
| R01 | Exact source and acceptance accounting | Original text files and 118 parents/247 criteria retained. This scoped review does not replace per-criterion live evidence or assert universal completion | PARTIAL |
| R02 | Preserve personal settings | Merge, concurrency, corruption, migration, restart/rollback fixtures plus native suites; actual private user profile unavailable and not requested | PARTIAL for complete original scope; reproduced bugs fixed |
| R03 | Eight actual recordings | Manifest still has only real Calm and historical-version Stability recordings; six Git captures require authenticated normal IDE; updated Stability capture and all-eight installed Details playback remain | BLOCKED/PARTIAL |
| R04 | Safe Git Panel | Disposable workflows cover branch/switch/merge/PR/deletion/dirty/remote protection. All native normal-host UI/dialog/video flows remain authentication-dependent | PARTIAL |
| R05 | Latest compatible gallery updates | Metadata-first and independent verified updater tests retained; current native installed/latest/repeat checks passed on all three Windows runners. No claim pinned:true enables native auto-update or guarantees every future network/registry response | PARTIAL for full future/live scope; current regression passed |
| R06 | Theme/personal cleanup | Aster defaults replace only owned theme dependency/settings; chosen themes/fonts/rules and unknown namespaces retained. No private extension settings blindly deleted | PARTIAL for all real-user scenarios |
| R07 | Skills/GSD light global loading | GSD 1.18.0 and original adapted screenshot skill retained, downloaded global payload hashes verified. Live model consumption and latency not measured | PARTIAL/NOT TESTED |
| R08 | Gemini language/variants/consent behavior | Consistent instructions are not actual input/output/code-diff transcripts from authenticated Gemini | NOT TESTED |
| R09 | Native chat checkbox / Submit / Cancel | QuickPick/clipboard remains a disclosed fallback. No supported inline host form or verified same-chat autosend/resume demonstrated; no DOM/permission bypass | BLOCKED |
| R10 | Requested screenshot source and visual reconstruction | Original requested skill remains installed, not re-downloaded/duplicated. End-to-end actual Gemini reconstruction against an original screenshot remains untested | PARTIAL/NOT TESTED |
| R11 | Full meaningful verification | Real fresh/update/repeat/rollback fixtures, published-source download, full terminal repeat and current Windows CI. Authenticated Gemini, OS reboot and external tester access remain separate gaps | PARTIAL |
| R12 | Source/package/README freshness | Explicit current candidate source, exact snapshot/hash/cache checks, real download and preserved main history. Main release and post-main installation still not done | PARTIAL |
| R13 | Honest final accounting | Current report names exact revision, real failures/fixes, test scopes and blockers; earlier 247-child ledger remains linked, not silently promoted | PARTIAL until all mandatory acceptance passes |

## Blockers and limits that were not bypassed

- Authenticated Antigravity/Gemini is unavailable here: normal host onboarding intercepts Git clicks, while test host refuses some native dialogs. No login/onboarding protection bypass or fake DOM/video.
- Live Gemini language, variants, narrow patch/consent, skill consumption/latency, questionnaire and screenshot reconstruction need authenticated session input/output/diffs. Markdown installation is not proof that every future chat follows it.
- Real native screenshot artifact transfer previously failed HTTP 403; no fabricated screenshot embedded in Details. The existing user-upload request and [recording runbook](LOCAL-RECORDING-RUNBOOK.md) remain applicable. No new public Pages site or persistent CI write permission was enabled.
- IDE restart is not a Windows OS reboot. Exhaustive visual inspection of every language/UI surface and normal authenticated font-install confirmation remain incomplete.
- External testing sites previously rejected network access. No credentials/private settings were sent and GitHub Actions is not reported as those sites.
- Main `31ee01f` remains Setup 3.0.24; this candidate is Setup 3.0.25 with Aster 1.0.0, Git Panel 1.4.4, Stability 1.3.13, Calm 3.3.3 and GSD 1.18.0. Mandatory acceptance is incomplete, so main was not merged merely to make download links look released.

For the latest candidate installation/update, use **command 2 in this branch's [README](../README.md)**. It explicitly preserves unrelated extensions and resolves current candidate source. Command 1 is destructive cleanup only by explicit selection; command 3 is completion-only, not a full upgrade. No universal 100% or completed-release claim is made.
