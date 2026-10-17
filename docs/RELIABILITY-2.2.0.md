# Setup 2.2.0: installation, recovery and verification

The ordinary README download/update command still runs the complete setup. It disables AI Tab/next-edit and transparent inline suggestions, keeps ordinary IntelliSense, and selects the requested chat automation policies. Managed `settings.json` values are deliberately reapplied from the repository on each full installation, including font, theme, formatter and Auto Save. This behavior is intentional; no preserve-personal-settings mode was added.

## Early compatibility check

Before creating the install lock, cancelling a pending request, backing up or changing a production profile, `preflightNativeSetup` checks the official native bundle, its embedded USS schema, the profile database and the managed preference rows. Invalid metadata, a modified bundle, missing/corrupt SQLite storage or malformed managed preferences stop the installation before these changes.

`config/native-compatibility.json` records audited builds and adapters. The current catalog supports the verified Windows x64 Antigravity IDE 2.5.5 build. A future version needs its own official artifact, verified checksums and schema/key/enum audit before adding it. A version label alone does not make an unknown build supported. Hash verification stays enabled.

Rules-only installation does not change editor/native preferences. Isolated fixture installation skips production native changes; separate native tests exercise the audited bundle and SQLite codec.

## One coordinated restore

A new complete-install backup links a native snapshot taken before profile changes. The snapshot includes only preference rows owned by the operation, not account rows or a whole account database. Full automation owns terminal, artifact, MCP and Tab preferences. Approval-preserving installation owns only Tab. Bare installation owns MCP and Tab without owning terminal/artifact policies.

```powershell
node bin/mansur-setup.js restore --dry-run
node bin/mansur-setup.js restore
# Or choose an exact private backup:
node bin/mansur-setup.js restore "C:\Users\YOUR_USER\.gemini\backups\setup-backup-pre-install-..."
```

Restore validates both snapshots first, cancels pending workers, then requires all Antigravity windows to be closed. It restores scoped native rows and saved files and reports whether the entire operation completed. Unrelated account/model data remain intact. If later file IO fails after native restoration, the result reports `partial: true`; this is not an atomic cross-file/database transaction.

The same command accepts `quiet-completion-...` backups, including native-only changes where editor JSON was already correct. Older file backups without a linked native snapshot restore files with `complete: false` and an unavailable-native warning; missing native history is not reconstructed. Low-level `automation-restore` and `permissions-restore` commands remain available for their original backups.

Only setup-managed installation files are restore targets. Application source files in the user's projects are not installation or restore targets. Lite selection does not remove existing extensions. No repository files were removed for this release.

## Status and recovery

From a checkout:

```powershell
npm.cmd run status
node bin/mansur-setup.js status --json
npm.cmd run resume
```

After using the temporary one-command bootstrap, the persistent runtime works without keeping that checkout:

```powershell
$runtime = Join-Path $env:USERPROFILE '.gemini\config\mansur-setup\automation-v2'
node (Join-Path $runtime 'setup-status.js') --status (Join-Path $runtime 'request.json')
node (Join-Path $runtime 'setup-status.js') --status (Join-Path $runtime 'request.json') --json
node (Join-Path $runtime 'setup-status.js') --resume (Join-Path $runtime 'request.json')
```

Status distinguishes starting/waiting, applied, failed, cancelled, interrupted/expired and stored-preference drift. It checks the worker PID, boot identity, heartbeat and native readback. `applied` means stored preferences match; live UI/chat behavior is separately unverified.

Helper 1.2.1 attempts recovery on IDE startup for interrupted/expired protocol-2 requests. It launches the persistent runtime with the saved Node executable and resumes the original request ID and scope. Completion-only recovery cannot expand into chat permissions. Cancellation, a newer request and an already live worker take precedence. Unsupported old request formats require rerunning ordinary setup. No Windows startup task is registered; user IDE processes are not killed.

## Project conflicts

The helper checks registered languages, languages/selectors found in user/workspace/folder settings, combined selectors and workspace folders. **Mansur: Inspect Project Setting Conflicts (Read Only)** returns key, effective value, language, scope and known source path. Results appear in helper Output and the status bar. Read/parse failures are reported instead of interpreted as success.

The inspector does not edit `.vscode/settings.json` or `.code-workspace` files. A project override can remain effective until explicitly changed. This preserves the requested boundary around project files.

## Optional extension profile

Default `full` retains the existing 21 required extensions and optional Jelly entry. `lite` selects 11 frontend/profile essentials. SQL Server, React snippet tooling and additional formatters/previews/decorations are omitted from new installation requirements. The catalog and existing extension directories remain intact.

```powershell
node bin/mansur-setup.js install --auto-approve --extension-profile lite
.\scripts\bootstrap.ps1 -MinimumVersion '2.2.0' -ExtensionProfile lite
```

For fresh download, use the ordinary README block and add `-ExtensionProfile lite` to its `powershell.exe ... -File $p` line. Omit the flag for the existing full installation. Both profiles use the same managed `settings.json` and AI-completion preferences. The selection is saved in `install-options.json`, used by Doctor and included in backup/restore.

## Windows smoke workflow

`.github/workflows/native-windows-smoke.yml` runs after relevant pushes/PRs and supports manual dispatch. It requires an isolated GitHub-hosted Windows runner and refuses a developer laptop or a machine with an existing Antigravity process.

The workflow verifies the official installer checksum before execution and `main.js` before IDE launch. It runs the production isolated installer, official native codec/compatibility/preflight tests, real IDE extension-host settings and TypeScript completion checks, a real-process waiting/shutdown/application cycle, reopening, and a project-conflict fixture. Success/failure reports and diagnostics are retained as the `native-windows-smoke` Actions artifact.

Results separate native storage/effective editor API checks from authenticated chat or model-generated suggestions. The test does not log in as the user. Linux unit/orchestration tests and offline SQLite results do not establish a passing Windows workflow; use the actual Actions run and artifact for that claim.

The IDE harness loads the production `profile.cjs` module directly. Packaged helper activation and startup recovery have separate unit/build coverage; this smoke does not establish their real IDE lifecycle.

The [actual Windows run for source `31e40b4`](https://github.com/safarovmurod/mansur-setup/actions/runs/38963163258) passed, including the normal-close/apply/reopen lifecycle, actual TypeScript completions and exact single-folder conflict source. The observed checks and exact source commits are recorded in [RELIABILITY-VERIFICATION.json](RELIABILITY-VERIFICATION.json).
