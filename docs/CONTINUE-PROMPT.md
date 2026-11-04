# Windows installer continuation — 2026-11-04

The code work described in the previous continuation prompt has been completed from baseline `0733ca62df48ed7cc27ae7faee4386001dec820d`.

## Completed work

- Section 3.1 moved repeated profile-settings and appearance imports to module scope in `lib/installer.js`, with the local appearance result renamed to avoid shadowing the module.
- Sections 3.2 and 3.3 consolidated extension CLI dispatch and retry sleep in `lib/extensions.js`. The caller-specific command strings, injected executors, timeouts, error handling and registration checks are preserved.
- Section 3.4 removed the six unused exports after checking repository callers. Internal functions and constants remain available within their modules.
- Section 3.5 reviewed the backup, ownership, rollback, profile, permissions and worker helpers. Their write permissions, link guards and transaction boundaries differ, so no shared abstraction was introduced.

## Verified failures repaired

- Windows `tar.exe` failed to open bundled VSIX files when the source path contained Tajik characters. The isolated Aster/Jelly and Calm installers now pass an open archive descriptor through stdin and set the extraction working directory. A regression covers Unicode source and destination paths, fresh install and repeat.
- Hosted CI exposed that PATH refresh could select an older system Node ahead of the runtime already selected by the caller. Initial refresh now preserves the current PATH order; installed prerequisite paths take precedence only after a winget installation. Both orders have regression checks.
- Bootstrap failed when `Get-FileHash` could not be loaded in Windows PowerShell 5.1. Source comparison now uses .NET SHA-256 directly. Every bootstrap fixture also runs with an unavailable hash cmdlet, including stale-launcher hand-off.
- The corrective audit required a historical commit absent from the consolidated repository. Its report now explicitly records an unavailable historical diff, with a null patch and reason, while retaining the original baseline and current file-hash checks.
- The repair-plan test incorrectly rejected non-English characters in the actual source path. It now checks the instruction text while preserving the exact diagnostic and command paths.
- README now describes the actual outcomes of all three commands and the newest-main download behavior.

## Local verification

Windows x64, Node.js 24.20.0 and npm 11.19.0.

- `npm test` — 502 total, 480 passed, 0 failed, 22 explicitly skipped host-dependent checks.
- Prior-version personal configuration migration — 20 passed, 0 skipped, with both immutable historical commits fetched.
- `npm run test:bootstrap` — 21 passed in Windows PowerShell 5.1.
- `npm run test:corrective-audit` — 3 passed.
- `npm run test:powershell` — font staging, repeat, conflicting personal font, corrupt and missing bundle checks passed.
- Tracked-file audit — 1,622 files, 648 JSON/JavaScript checks, 0 issues.
- PowerShell syntax audit — 14 scripts, 0 failures.
- Aster, Calm and Stability deterministic builds match the existing VSIX bytes.
- Git Panel PowerShell packaging and read-only active IDE diagnostic fixtures passed.
- README and extension README relative links — 11 checked, 0 broken.
- npm packaging preview includes 1,501 files and the required installer, configuration and bundled assets.

All tracked bytes under `config/`, `rules/`, `skills/`, `agents/`, `resources/` and `extensions/` match the baseline. The setup version remains `3.0.39` for existing launcher compatibility.

## Publication and verification boundary

The owner explicitly authorized keeping only `main` and one parentless commit. Publication uses an explicit expected-head lease. A recoverable Git bundle of the preceding main was retained locally before publication.

The figures above describe local verification. Check GitHub Actions for the exact published commit to inspect hosted Windows x64/ARM64 execution. Tests skipped because they need an official IDE host or an authenticated session are not counted as passes. The personal IDE profile was not used for a live reinstall during this continuation.
