# Windows verification continuation

Current published base: `b577ba3b841f29ae14815884e978c14ff8148094`. Continue on `main` with ordinary commits and pushes; version remains `3.0.39`.

- Native run `41995982894` failed on all three Windows images at the second README command 2 snapshot. First command 2 passed source-SHA, exit-code, Doctor and personal-setting checks. Commands 1 and 3 were not reached.
- Repeat snapshots now map each file path to SHA256 and report changed, added or removed paths. Only `workstation-setup/editor-profile.json` is normalized by removing its intentional per-install `requestId`, matching the install-mode regression. Every other file and field remains checked.
- The native matrix covers IDE `2.5.5` and `2.6.0` on Windows2022, Windows2025 and Windows11 ARM. Existing codec/hook fixtures remain on 2.5.5 because they assert that bundle's symbols. Both versions execute the main-only literal README sequence 2,2,1,3 through Windows PowerShell 5.1 against the disposable runner profile.
- Local snapshot probes passed: requestId-only changes are accepted; other content changes, additions, removals and profile-setting changes are rejected with the path. PowerShell syntax and focused controller/catalog/hash-ledger checks passed (23 PASS, 0 FAIL, one Windows-inapplicable hashbang SKIP).
- Local bootstrap: 21 PASS; font staging: five scenarios PASS; corrective audit: 3 PASS. Full npm after error propagation: 505 tests, 483 PASS, 0 FAIL, 22 environment-dependent SKIP. Hosted verification must be checked before completion.
- Protected configuration/payload folders are unchanged. No personal-profile installation, repository VSIX rebuild, new branch or history rewrite.

Completion requires Native success for all six OS/version combinations and verified README commands 2,2,1,3, Doctor zero failures, preserved personal setting and unchanged repeat snapshot. Do not install gh; report workflows not automatically triggered. All-eight screenshot scenarios remain unverified. Do not complete AUTORUN until the requested checks actually pass.

- On candidate 957d055, IDE2.6.0 README passed on Windows2025 and Windows11 ARM. Windows2022 passed both command2 runs, then command1 hit the pinned agent-browser Windows port collision: an unrelated TCP listener is mistaken for a stale daemon. A disposable TCP-only local reproduction emitted the same version-mismatch warning without opening a browser. The verifier now selects a session whose derived TCP port can be bound before invoking the CLI, with a focused occupied-port regression. Recovery suite: 37 PASS, 0 FAIL. Hosted verification of this fix remains pending.

- Candidate b577ba3: Setup checks passed all six jobs; Native passed five of six OS/version combinations. Windows2025/IDE2.6.0 stopped during the second README command2 browser launch, before snapshot comparison. Its original CLI JSON error was lost because execSync excludes stdout from error.message. Error propagation now retains the CLI failure text without changing checks or retry policy; focused recovery suite: 38 PASS. The browser failure itself remains unclassified until hosted diagnostics are available.
