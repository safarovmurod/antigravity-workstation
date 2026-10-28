# Native agent automation and quiet AI completion — Setup 2.2.4

The three terminal options in Antigravity IDE 2.5.5 are **Request Review**, **Proceed in Sandbox**, and **Always Proceed**. They are native agent preferences, separate from VS Code's `chat.tools.terminal.autoApprove` command list. Artifact/plan review is another preference: **Always Ask** or **Always Proceed** in the audited build.

The old `safarov` snapshot and its embedded prompt contain seven allowed terminal commands; the current profile retains them and adds `npx tsc --noEmit`. Neither old installer implements these native global terminal/artifact policies. The exported old layout contains 36 UI keys, not the source account's native agent preferences. Consequently the old files alone cannot prove why a particular previous chat had no prompts.

## What installation does

Ordinary README install/update preserves existing settings and does not select `--auto-approve` or quiet AI. `--apply-profile` explicitly replaces managed editor defaults; `--quiet-completion` or the separate `quiet-completion` command explicitly selects quiet AI. Only the separately requested `install --auto-approve` / `automation` mode selects the broad policies below, including native AI Tab OFF. Full and lite extension selection does not imply security consent.

| Native preference | Stored value | Behavior selected in the official UI |
|---|---|---|
| `terminalAutoExecutionPolicySentinelKey` | `Primitive.int32_value = 3` (`EAGER`) | Terminal: Always Proceed |
| `artifactReviewPolicySentinelKey` | `Primitive.int32_value = 2` (`TURBO`) | Artifact review: Always Proceed |
| `permission_grants_global` | Allow `command(*)`, `read_file(*)`, `write_file(*)`, `read_url(*)`, `unsandboxed(*)`, `mcp(*)` | Replaces global Ask/Deny entries for these six resource types |
| `allowAgentAccessNonWorkspaceFilesSentinelKey`, `allowCascadeAccessGitignoreFilesSentinelKey` | `Primitive.bool_value = true` | File access without ordinary review |
| `enableTerminalSandboxSentinelKey`, legacy `secureModeSentinelKey` | `Primitive.bool_value = false` | Personal Turbo mode |
| Browser `browser_js_execution_config_sentinel_key` | `BrowserJavascriptExecutionConfig.browser_js_execution_policy = 4` (`TURBO`) | Browser JavaScript: Always Proceed |
| Override `secureModeEnabledSentinelKey` | `Primitive.bool_value = false` | Current native Secure Mode off |
| `tabEnabled` | `Primitive.int32_value = 1` (`OFF`) | Native AI Tab completion off |
| `tabToJump` | `Primitive.int32_value = 2` (`DISABLED`) | Native Tab-to-jump off |

The chat records live in `antigravityUnifiedStateSync.agentPreferences`; the two Tab records live in `antigravityUnifiedStateSync.tabPreferences`. Both topics are in `%APPDATA%\Antigravity IDE\User\globalStorage\state.vscdb` (the product's discovered user-data name is used). Topic entries contain a Row whose `value` is another Base64 protobuf. These Tab modes are enum values encoded as `int32`, not Boolean editor settings. Writing ordinary JSON numbers to `settings.json` would not implement these native preferences.

`editor.inlineSuggest.enabled: false` is also applied globally, to all existing language override selectors and to the managed JS/TS selectors. It suppresses transparent inline/ghost text but does not control the separate native Tab preference. This is why checking only that JSON setting was insufficient. The `quiet-completion` command applies both layers without touching the agent-preferences topic: existing terminal, artifact and MCP approvals stay byte-for-byte unchanged. It replaces the active helper's desired plan with only the quiet-completion keys, preventing an old plan from reapplying chat settings. Variable names, JS/TS auto-imports and file/path IntelliSense remain enabled by the managed profile.

Helper 1.2.2 checks registered languages, user/workspace/folder selectors, combined selectors, open document languages and every workspace folder. **Workstation: Inspect Project Setting Conflicts (Read Only)** reports the setting, effective value, language, scope and known source path. A source path can be unavailable for user/policy settings exposed only through the editor API. Read/parse failures produce `needs-attention` rather than a successful check. The report appears in helper Output and its status-bar indicator. The inspector does not edit `.vscode/settings.json`, `.code-workspace` or application source files. Native Tab OFF remains independent of the editor setting.

Red struck-out lines can belong to an automatic next-edit preview or to a diff produced by an explicit chat request. A screenshot alone does not establish which subsystem produced them. Quiet completion disables automatic AI suggestions; it does not hide review diffs or stop the chat agent from making requested changes.

Before a production full install creates its install lock, cancels a worker, makes a backup or changes the profile, a read-only native preflight checks the installed bundle, embedded USS schema, SQLite database and managed preference rows. Quiet-completion also runs this preflight before changes. [The compatibility catalog](../config/native-compatibility.json) accepts the audited Windows x64 and ARM64 2.5.5 builds and their exact checksums. The IDE architecture is read from its executable PE header, even when the setup Node process runs under emulation. Both official installers contain identical native `main.js` bytes. Future IDE builds still require an audited adapter. Rules-only and isolated fixture installs do not change the production native profile.

The explicit full `--auto-approve` mode changes personal Secure Mode, sandbox and global tool/file grants as listed above. Unrelated preferences, model/account data, unknown grant types and organization settings remain unchanged. Project rules, organization controls, login/account consent and Windows UAC can still require review. Selecting Always Proceed allows ordinary agent actions to execute without another confirmation. Completion-only and MCP-only commands keep their narrow original scope.

Full mode updates all four topics in one transaction: `agentPreferences`, `tabPreferences`, `browserPreferences` and `overrideStore`, each prefixed with `antigravityUnifiedStateSync.`. Browser JavaScript uses field 1 of its own config protobuf; writing the UI enum number 2 or a Primitive int32 here would select the wrong mode. Validation tests decode these bytes using the actual embedded official schemas.

The IDE must be closed before writing native preferences. If it is open, installation copies a small runtime outside its temporary checkout and launches a hidden detached Node worker. It waits for a normal shutdown, refuses active WAL/SHM files, then backs up and applies the change. No IDE process is closed or killed. A worker waits for at most 24 hours and is not a Windows startup task. After interruption, reboot or timeout, `resume` or helper 1.2.2 at IDE startup can restart the original protocol-2 request with its original ID and scope. A completion-only request cannot turn into chat automation during recovery. A cancelled, superseded or already live request is not restarted. Unsupported old protocols require rerunning the current setup. Recovered work still waits for all IDE windows to close normally. Restart the IDE after the worker records `applied`; use a new chat to pick up changed chat policies.

Queued does **not** mean applied. Each request has its own protocol-2 JSON status at `%USERPROFILE%\.gemini\config\workstation-setup\automation-v2\status-<requestId>.json`. Use `npm.cmd run status` or `node bin/workstation-setup.js status --json` for the interpreted result: starting/waiting, applied, failed, cancelled, interrupted/expired or stored-preference drift. Status checks worker PID, boot identity, heartbeat and native readback. Its checks cover the recorded request's scope; a bare installation's separately applied MCP grant is not part of its completion-only worker request.

Use the exact `statusFile` printed by the command; there is no shared `status.json` for new requests. Separate files prevent an older worker from overwriting a newer request's result. The separate `automation-v2` directory also prevents a previously loaded 2.1.12 worker from consuming the new format. A successful result includes `runtimeVerified: false`: SQLite readback is verified, the user's live UI and chat are not. `doctor` reports the stored native modes separately.

## Commands and rollback

```powershell
# Disable native AI Tab/next-edit and transparent ghost text only:
node bin/workstation-setup.js quiet-completion

# Equivalent npm command:
npm.cmd run quiet-completion

# Preview completion-only changes without writing or launching a worker:
node bin/workstation-setup.js quiet-completion --dry-run

# Apply chat automation and quiet native completion, or queue until IDE closes:
node bin/workstation-setup.js automation

# Preview without writing or launching a worker:
node bin/workstation-setup.js automation --dry-run

# Inspect the current native request, or resume an interrupted request:
npm.cmd run status
node bin/workstation-setup.js status --json
npm.cmd run resume

# Install files while preserving all native approval preferences:
node bin/workstation-setup.js install --skip-permissions

# Restore files and the linked native baseline together, with IDE closed:
node bin/workstation-setup.js restore --dry-run
node bin/workstation-setup.js restore "C:\Users\YOUR_USER\.gemini\backups\setup-backup-pre-install-..."

# Low-level native-only rollback for an automation backup:
node bin/workstation-setup.js automation-restore "C:\Users\YOUR_USER\.gemini\backups\agent-automation-UUID"
```

`--auto-approve` and `--skip-permissions` are mutually exclusive. Bare `install` retains its earlier MCP-only behavior for chat approvals and now also disables native AI Tab; it does not select the global terminal/artifact policies. The README bootstrap opts into those chat policies explicitly with `--auto-approve`. `permissions` / `permissions-restore` remain MCP-only commands.

The README also contains a one-command fresh download with the bootstrap switch `-QuietCompletion`. It resolves and downloads the current commit, enforces `-MinimumVersion 2.2.0`, then runs the completion-only command instead of a full install. It does not reapply chat approvals, extensions, rules or the full editor profile. The normal README bootstrap without this switch still runs the full setup with `--auto-approve`.

New full-install and quiet-completion backups link a native baseline captured before their profile changes. Full automation uses a format-3 manifest for all four topics and the owned grants/approval rows. Completion-only and bare MCP/Tab installs retain format 2. Legacy format-1/2 restores never take ownership of the newly added approval settings. Linked snapshots omit account rows and complete databases. Native snapshot capture reads committed data while the IDE is open; applying or restoring native preferences requires a normal IDE shutdown.

The ordinary `restore` command validates the file backup and linked native snapshot, cancels pending workers from both published worker directories, and restores both parts. It also accepts `quiet-completion-*` backups where only native preferences changed. Restore preserves later unrelated preferences, including the distinction between an absent topic and an originally empty one. It does not edit or delete application source files in the user's projects. File and database restoration are separate operations: a later file IO failure reports `partial: true`, and this is not an atomic transaction across both storage types. See [recovery details](RELIABILITY-2.2.0.md#one-coordinated-restore).

Older file-only backups still restore their files with `complete: false` and a warning that native history is unavailable. Native-only `automation-restore` remains supported; old format-1 native backups restore the old agent-preferences scope and leave Tab untouched. Low-level native updates can still create a private database backup, which may contain account data. Keep all private backups local; none are included in the repository or package.

After temporary bootstrap cleanup, status and recovery work through the saved runtime without keeping the checkout:

```powershell
$runtime = Join-Path $env:USERPROFILE '.gemini\config\workstation-setup\automation-v2'
node (Join-Path $runtime 'setup-status.js') --status (Join-Path $runtime 'request.json')
node (Join-Path $runtime 'setup-status.js') --resume (Join-Path $runtime 'request.json')
```

## Compatible features retained from the old setup

- Managed editor settings override the same managed keys while unrelated personal keys remain.
- Personal watcher/search exclusions and explicit terminal command denials remain. The active-profile helper receives the preserved command list too.
- Managed keybindings replace conflicting managed slots while unrelated shortcuts remain. Doctor checks that managed bindings are present.
- The status bar is explicitly visible, supporting Calm TypeScript's Format button.

The old inline suggestion extension, 5/15-second timers, Jelly effects, Runtime Monitor and AI Structure Reviewer are not reintroduced. They either contradict the current quiet completion profile or need a separate complete runtime audit. This change does not silently enable missing extensions or replace the current frontend stack.

## Source evidence

ARM64 2.5.5 official installer (extracted without installation on the user's computer):
`https://dl.google.com/edgedl/release2/j0qc3/antigravity/stable/2.5.5-4923483625488384/windows-arm64/Antigravity%20IDE.exe`

Installer SHA-256: `3d353863064a7e4cfc235137fef27968c18ff8762e83405e0579027890bda808`. Extracted native main SHA-256: `6f1a12099ac635d462bd7092357119ec1ec7516988cacb874b7e97691272b104`; embedded USS schema is identical to x64. The catalog pins both official packages separately.

The pinned `agent-browser@0.38.1` [published installer](https://unpkg.com/agent-browser@0.38.1/scripts/postinstall.js) maps Windows ARM64 to its Windows x64 executable. [Microsoft documents x64 emulation on Windows 11 ARM, whereas Windows 10 ARM supports only x86 emulation](https://learn.microsoft.com/en-us/windows/arm/add-arm-support). Full bootstrap therefore accepts Windows 10 x64 build 19041+ or Windows 11 x64/ARM64, rejecting Windows 10 ARM before installing prerequisites or changing configuration.

The official installer was retrieved via HTTPS from Google's download host:

`https://dl.google.com/edgedl/release2/j0qc3/antigravity/stable/2.5.5-4923483625488384/windows-x64/Antigravity%20IDE.exe`

- Installer SHA-256: `a8c25631fd5e43bf217a6cf510ca796441817f4ad9c50b1d892282c7366edc4a`, matching `safarov`'s pinned source manifest.
- Extracted native `out/main.js` SHA-256: `6f1a12099ac635d462bd7092357119ec1ec7516988cacb874b7e97691272b104`.
- Audited native modules include `agentPreferences/terminalAutoExecutionPolicy.js`, `agentPreferences/artifactReviewPolicy.js`, `agentPreferencesDefaults.js`, `tabPreferencesDefaults.js`, `topicUtils.js`, `UssSettingsProvider.js`, and the preference-topic lifecycles.
- Native enums: `CascadeCommandsAutoExecution.EAGER = 3`, `ArtifactReviewMode.TURBO = 2`; Tab disabled values are `tabEnabled = OFF (1)` and `tabToJump = DISABLED (2)`.
- Native embedded file descriptor: `exa/unified_state_sync_pb/unified_state_sync.proto`. `Topic.data` → `Row.value` → `Primitive.int32_value` (field 2).

The installer was extracted for static inspection; it was not executed on this Linux host. No vendor bundle or extraction utility is added to the setup package. The unofficial [jkfujinami schemas](https://github.com/jkfujinami/antigravity-grpc-schemas) helped locate the protocol; final keys, enum numbers and encoding were checked against the official bundle itself.

Official Antigravity IDE 2.6.0 (commit `9e3a5da5d6731effd57d47d88bbe5df14ac6ccdd`, VS Code engine 1.107.0):
- Official installer: `https://dl.google.com/edgedl/release2/j0qc3/antigravity/stable/2.6.0-9e3a5da5d6731eff/windows-x64/Antigravity%20IDE.exe`
- Installer SHA-256: `df765a8ae84a673ae9e8c8e60eca8e7e839351029c58803a107b8f010ce7b736`
- Extracted native `out/main.js` SHA-256: `2a0e8928e47f354324a1622ae114a77839bbc2c1e22c77ca2917df5a6c19e5c5`
- Native embedded file descriptor: `exa/unified_state_sync_pb/unified_state_sync.proto`, SHA-256: `b70f135c55d53617098087edd2da6ae2cbf306b923c8a699b0ee36b4a76c5149` (identical schema and wire encoding to 2.5.5, registered through minified descriptor builder `Ra`).
- The catalog pins Windows x64 and ARM64 builds for 2.6.0 alongside 2.5.5.

## Executed validation and reproduction

Current 2.2.0 release evidence belongs in [RELIABILITY-VERIFICATION.json](RELIABILITY-VERIFICATION.json). The [Windows smoke workflow](../.github/workflows/native-windows-smoke.yml) retains its own Actions report and diagnostics. An added workflow is not evidence of a passing Windows run. Offline Linux/SQLite tests and published-download verification do not establish authenticated chat behavior or model-generated suggestions in the user's IDE. [The reliability guide](RELIABILITY-2.2.0.md#windows-smoke-workflow) describes the scope.

Historical Setup 2.1.13 checks completed on 16 October 2026 in the cloud Linux workspace:

| Check | Result |
|---|---|
| Complete `npm test` | 147 passed, 0 failed, 0 skipped |
| Official-schema / SQLite / detached-worker suite | 11 passed, 0 failed, 0 skipped |
| Portable bootstrap networking and stale-version rejection | 22 scenarios passed |

The native suite is separate from the 147-test count. These tests use disposable profiles and fixtures on Linux, including the actual audited native protobuf descriptors. They are not a test of the user's live Windows UI or authenticated Antigravity chat. The final run includes the per-request status-file changes. [Published-download verification](QUIET-COMPLETION-VERIFICATION.json) also passed for source commit `ed5a4360dd3be7c006233e3663b9c875b33f21e3`: the raw bootstrap matched its commit ZIP, all 1068 installed payload hashes matched, and the downloaded quiet-completion module disabled both native Tab and ghost text in a disposable profile while preserving exact chat/account data. Repeat application made no changes. This does not verify the user’s live UI.

The older [2.1.12 published-verification report](PUBLISHED-VERIFICATION.json) remains a historical baseline for its recorded commit, not evidence for 2.1.13.

The 2.1.13 README launcher passes `-MinimumVersion 2.1.13`. A stale package is rejected before its installer runs. The bootstrap resolves current `main` once and downloads/extracts that immutable commit; install and Doctor use the same source. The opt-in `test:bootstrap:live` additionally checks the expected version/commit, compares the raw bootstrap with its commit ZIP, installs a disposable full profile twice, and verifies every installed payload hash, including MD, skills, agents and hooks. The linked [2.1.13 published-verification report](QUIET-COMPLETION-VERIFICATION.json) records the release and commit it actually tested; it is not evidence for a later untested commit.

`npm test` covers native policy merging, malformed/duplicate row rejection, scoped restore, waiting/timeout behavior, preservation of settings/denials/shortcuts, and the existing installer/profile/extension suites.

The additional native integration suite requires the official audited `out/main.js` and an isolated protobuf decoder installation, not a mocked marker file:

```sh
npm install --prefix /tmp/antigravity-protobuf-qa --ignore-scripts --package-lock=false \
  --cache /workspace/.npm-cache @bufbuild/protobuf@2.9.0
WORKSTATION_ANTIGRAVITY_MAIN='/path/to/official/resources/app/out/main.js' \
WORKSTATION_PROTOBUF_RUNTIME=/tmp/antigravity-protobuf-qa/node_modules/@bufbuild/protobuf \
  npm run test:automation:native
```

This suite decodes generated preferences with the actual official embedded Topic/Primitive descriptors, writes/reads/restores disposable SQLite profiles, checks repeatability and private-row preservation, rejects a changed native bundle, and rolls back if the IDE restarts. On Linux it also starts a real detached worker with a simulated `tasklist.exe` and verifies the database remains unchanged while the simulated IDE is open, then changes after shutdown. This is not a native Windows process test or an authenticated Antigravity chat test.

The actual user's account, live chat prompts, enterprise/project overrides and Windows worker lifecycle remain unverified here. An updated checkout or saved code is not proof that the user's installed IDE has applied the change.

## Application version and native adapter evidence

To distinguish different installations from conflicting metadata, keep the IDE open and run `powershell.exe -NoProfile -File .\scripts\inspect-running-antigravity.ps1` from this repository on Windows. The diagnostic queries only running `Antigravity IDE.exe` processes, groups them by their executable path, reads FileVersion/ProductVersion, product version/commit and VS Code engine metadata, and hashes main.js from each matching installation. It reports inaccessible paths or files and process changes instead of guessing another installation. It does not read settings, credentials, clipboard or command-line arguments, launch the IDE or write files. Multiple active installation paths are reported separately; no default path or automatic selection is used.

Compare the reported path with the installation used by Help > About. A path different from the ZIP's source indicates different installations; matching paths with conflicting About/executable/product values require further vendor evidence and are not automatically classified as stale metadata. `filesStableDuringRead` and `processStillMatches` must both be true before using a report. This evidence is read-only; it does not authorize migration or attest an About version by itself.

`product.json.ideVersion` can be stale after an application update. It is reported as `reportedProductVersion`, with its exact `versionSource`; it does not attest the version displayed in About. `installedVersion` stays null and `applicationVersionVerified` stays false until independent application-version evidence is available. The VS Code engine in `package.json.version` is not the Antigravity application version.

`supported: true` in native compatibility results means only `supportedScope: native-settings-adapter`: catalog identity, the exact main.js SHA-256 and its embedded schema were verified. It does not certify chat, commands, built-in extensions or a new application release. A mismatch still stops native writes.

The user reports About 2.6.0/commit `9e3a5da5d6731effd57d47d88bbe5df14ac6ccdd` alongside product metadata 2.5.5 and the existing audited bundle/schema hashes. This combination is covered by a synthetic metadata regression using the already available official bundle. The supplied ZIP was not mounted in the current execution workspace, so this is not an independent examination of that ZIP or a native 2.6.0 runtime test. Previous claims that 2.6.0 must be rejected by version alone were incorrect: with the reported stale metadata and matching audited bytes, the existing native preflight accepts the adapter.
