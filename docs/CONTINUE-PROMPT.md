# Windows verification continuation

Base: `1fca9fb36e875d03023860e55ade869dcf384c97`. Work remains on `main`, with ordinary commits/pushes and version `3.0.39`.

- Marketplace fallback is limited to the existing transient-error classifier after attempt 3. Only an inspected reusable package returns success with `metadataChecked: false`; no download occurs. Existing generic-network and HTTP403 failure assertions remain intact. Focused gallery suite: 14 PASS, 0 FAIL.
- Aster build uses explicit Bash so intermediate command failures stop multiline steps. Screenshot path filters include the three imported library modules; scopes are unchanged.
- Native schema coverage first uses `WORKSTATION_ANTIGRAVITY_MAIN`. Three formerly Windows-skipped automation tests now use actual named Windows processes. Native suites run serially because process discovery is global; JUnit skips are rejected.
- Main-only native smoke reads the literal README commands and executes 2,2,1,3 through Windows PowerShell 5.1 on the disposable runner. It checks source SHA, exit code, Doctor, personal-setting preservation and repeat file hashes. This integration stage must be verified on all three hosted Windows images.
- Installer result no longer shadows the permissions module. Guide timeout waits at most ten further seconds for process close.
- The existing PowerShell migration ledger records the changed smoke-script SHA and functional-change reason; its hash regression passed. No dedicated migration-ledger updater exists in the repository.
- Local bootstrap: 21 PASS; corrective audit: 3 PASS; font staging: all five scenarios PASS. The actual Windows named-process fixture was separately exercised successfully. Final local npm test: 503 tests, 481 PASS, 0 FAIL, 22 existing environment-dependent SKIP. Hosted results must be checked before completion.
- Protected configuration/payload directories remain unchanged. No repository VSIX rebuild or personal-profile installation was performed.

Completion requires all seven workflows on one SHA, Native smoke with zero skips and README success on all three Windows images, and explained Setup-check skips. All-eight recordings are outside the verified scope. If a fix commit misses a workflow, dispatch it with gh; docs-screenshots uses `recording_scope=calm-stability-recording-only`. Stop if gh is not authenticated; do not use Chrome or Computer Use. Do not complete AUTORUN before these checks pass.

Hosted candidate `7e08ff5`: six workflows succeeded. Windows2022 Native smoke executed 85 native tests with zero skips, then failed before README command1/2/3 execution because CloseMainWindow did not terminate every IDE process. Initialization now reuses the existing smoke extension signal and workbench.action.quit mechanism; hosted verification of this correction is pending.
