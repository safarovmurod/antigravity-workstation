# Windows verification continuation

Current published base: `462e91497fb5e30912ba4bc7cd5332b0c663ea80`. Continue on `main` with ordinary commits and pushes; version remains `3.0.39`.

- Native run `41995982894` failed on all three Windows images at the second README command 2 snapshot. First command 2 passed source-SHA, exit-code, Doctor and personal-setting checks. Commands 1 and 3 were not reached.
- Repeat snapshots now map each file path to SHA256 and report changed, added or removed paths. Only `workstation-setup/editor-profile.json` is normalized by removing its intentional per-install `requestId`, matching the install-mode regression. Every other file and field remains checked.
- The native matrix covers IDE `2.5.5` and `2.6.0` on Windows2022, Windows2025 and Windows11 ARM. Existing codec/hook fixtures remain on 2.5.5 because they assert that bundle's symbols. Both versions execute the main-only literal README sequence 2,2,1,3 through Windows PowerShell 5.1 against the disposable runner profile.
- Local snapshot probes passed: requestId-only changes are accepted; other content changes, additions, removals and profile-setting changes are rejected with the path. PowerShell syntax and focused controller/catalog/hash-ledger checks passed (23 PASS, 0 FAIL, one Windows-inapplicable hashbang SKIP).
- Local bootstrap: 21 PASS; font staging: five scenarios PASS; corrective audit: 3 PASS. Full npm: 503 tests, 481 PASS, 0 FAIL, 22 environment-dependent SKIP. Hosted verification must be checked before completion.
- Protected configuration/payload folders are unchanged. No personal-profile installation, repository VSIX rebuild, new branch or history rewrite.

Completion requires Native success for all six OS/version combinations and verified README commands 2,2,1,3, Doctor zero failures, preserved personal setting and unchanged repeat snapshot. Do not install gh; report workflows not automatically triggered. All-eight screenshot scenarios remain unverified. Do not complete AUTORUN until the requested checks actually pass.
