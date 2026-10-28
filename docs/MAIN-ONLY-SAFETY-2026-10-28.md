# Main-only publication and preference preservation

This revision removes old-branch workflow publication and makes ordinary Windows/macOS installation preserve existing editor preferences. AI completion and agent security changes require an explicit corresponding CLI mode. The active IDE diagnostic remains read-only; About 2.6.0 versus ZIP product 2.5.5 cannot be resolved without its report from the user's running installation. Matching audited native bytes attest only the native adapter, not all runtime behavior.

## Preservation and explicit actions

- Ordinary install/update retains existing settings, unknown namespaces, personal shortcut bindings and argv values. New defaults are supplied only where absent.
- The active-profile request marks `preserveExisting`; the helper retains edits made after installer planning. It discovers vendor completion switches only for an explicitly quiet request.
- `install --apply-profile` explicitly reapplies managed editor defaults. It does not itself grant agent permissions or disable AI completion.
- `quiet-completion` and `install --quiet-completion` explicitly disable AI completion while retaining chat permissions.
- `install --auto-approve` / `automation` remains an explicit broad opt-in including the documented security/sandbox/tool-grant and Tab changes. The README bootstrap no longer selects it.
- Existing settings left by previous installations cannot be reconstructed from guesses. Restore requires an actual backup and an explicit restore operation.
- macOS does not supply AI-disable, terminal-auto-approve or trust-weakening defaults. Native agent preferences are not written by its installer.

## Branch preservation before cleanup

Remote refs were inspected directly. The two repair heads are ancestors of main. The macOS head `d363f251744de29cb51e012ef522f35ef7d512f0` has three unique commits: `973bc5f`, `d0e7c62`, `d363f25`. Its bootstrap is byte-identical to main. Main already contains the standalone installer and tests with safer replacements: preservation of existing settings/keybindings/extensions, ownership-aware rule updates, exact-version VSIX/hash checks, and Intel/ARM CI using canonical temporary paths instead of weakening symlink guards. Blindly replaying the old tree would undo these fixes.

All four original heads were preserved in verified complete-history bundle `workstation-before-main-only-20261028.bundle` and pushed tags:

- `archive/main-only-20261028-main` → `79916d0c7c95260c02751a35a4c555f78d158bad`
- `archive/main-only-20261028-codex` → `d18a2850240b66c18444ee0cece899aab9c9fe91`
- `archive/main-only-20261028-repair` → `377599070df27d4bc8fe1a026111a096c2dba753`
- `archive/main-only-20261028-macos` → `d363f251744de29cb51e012ef522f35ef7d512f0`

Tags preserve history without additional working branches. Branch/PR cleanup must occur only after publication and successful applicable CI. The final GitHub branch and PR counts must be read from GitHub, not inferred from this document.

## Windows discovery regression

The Windows 2025 job for `79916d0` reported a timed-out read-only registry probe (`ETIMEDOUT`, five seconds), so the registered arbitrary-path installation was not discovered. Discovery now retries only a PowerShell timeout once, with a thirty-second second budget. It still requires the executable/CLI and product metadata to exist; a permanent timeout does not count as successful registration. The regression covers transient recovery and exhausted retry budgets. The previous failed job remains historical failure, not PASS.

The macOS installer fixture also exposed an incompatible generic merge for native hook arrays. Hooks now use the same native-schema merger as Windows; ordinary settings use preference-preserving merging. The POSIX fixture performs install/repeat, verifies the managed hook groups and retains personal plugins and an explicit disabled GSD hook. It also runs on Linux without claiming a macOS runtime result.

## Acceptance boundaries

| ID | Requirement | Evidence / limit |
| --- | --- | --- |
| 1 | Personal settings and rollback | Installer/repeat/backup regressions; active-profile preservation test |
| 2 | Aster 1.0.4 | Existing native CI on audited 2.5.5; no full 2.6.0 runtime claim |
| 3 | Color comfort | Automated contrast and renderer evidence; subjective comfort remains partial |
| 4 | Error Lens | Quiet diagnostic colors retain enabled validation; personal exclusions retained |
| 5 | Gray lines | Shared line-highlight default disabled; personal overrides retained |
| 6 | Dark/Light and overrides | Theme/font/token/profile-sharing preservation regressions |
| 7 | Native Light/Dark first | Existing native panel assertions |
| 8 | Apply/Cancel | Existing actual renderer checks |
| 9 | Font controls | Ten licensed fonts, size/weight and preview checks; italic preview-only |
| 10 | Twenty distinct palettes | Palette uniqueness/contrast and native application tests |
| 11 | Files and activation | Package, installation and native registration suites |
| 12 | Chat image paste | NOT TESTED in authenticated chat; no static-test substitute |
| 13 | Downloads and integrity | Main snapshot freshness, packaged VSIX and bootstrap checks |
| 14 | macOS installer | Intel/ARM CI and preservation fixtures |
| 15 | MacBook launcher | `.command` shell/path tests and macOS preflight |
| 16 | Final CI | Applicable CI must be associated with the final published SHA |

One remaining user-session procedure: with the IDE open, run `scripts/inspect-running-antigravity.ps1` and compare its executable path/versions/product commit/main hash with Help > About and the ZIP source path. In that same authenticated session, compare screenshot/PNG/JPEG/WebP paste, attachment-button and drag/drop delivery to the current chat with the four Workstation extensions enabled and then disabled after Reload Window; re-enable them afterwards. Record the triggering action and unexpected panel name. This procedure has not been executed on the user's computer from the cloud environment.
