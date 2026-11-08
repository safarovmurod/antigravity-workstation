# Change Log

All notable changes to Jelly Cursor are documented here.

## [0.0.8] - 2026-08-23

- Replaced direct file writes with atomic writes (temporary file + rename) for `workbench.html`, the injected script, and backups.
- Added rollback on install failure and actionable error messages for permission, missing file, and locked file errors.
- Added `Jelly Cursor: Show Patch Status` to list discovered `workbench.html` files, patch markers, injected scripts, and backups, with per-file uninstall, restore, and copy-path actions.
- Added `Jelly Cursor: Restore workbench.html Backup` to restore the first-install backup and remove injected scripts.
- Grouped all commands under the `Jelly Cursor` category in the command palette.
- Added Restart Now actions to install, uninstall, and restore prompts.
- Added startup detection that offers to reinstall the patch after VS Code updates, controlled by `jellyCursor.reminders`.
- Added a settings-change prompt for one-click patch reinstall, and Chinese (zh-cn) prompts based on the VS Code display language.
- Added an OutputChannel diagnostic log and a patch-status indicator in the status bar, controlled by `jellyCursor.statusBar`.
- Added `jellyCursor.animationMode` (`full` / `smooth` / `off`) and `jellyCursor.maxJumpAnimationDistance`.
- Rendered cursor now mirrors native border radius and border width with an SVG path.
- Added FAQ section to the documentation.
- Added visual effect presets: `minimal`, `neon`, `aurora`, `matrix`, and `comet`.
- Added fading cursor trails (opt-in, disabled by default), spring physics with overshoot, rainbow and gradient fills, and native/rounded/capsule shape styles.
- Added click ripples, jump landing pulses, and fast-movement spark particles.
- Fixed an OutputChannel shutdown race that could roll back a successful patch install.

## [0.0.7] - 2026-08-23

- Smarter `workbench.html` detection using `vscode.env.appRoot`, the running executable, common VS Code/Cursor/VSCodium/Windsurf install locations, and `PATH` lookup.
- Added a bounded recursive fallback search so versioned install folders and older workbench layouts are found automatically.
- The manual file picker now opens directly in the workbench folder, explains exactly which file to choose, and validates the selection.
- Added `jellyCursor.workbenchHtmlPath` setting so users can pin an explicit path and skip detection.
- Install/uninstall messages now show the exact patched `workbench.html` path.
- Ignore cursor targets outside the visible viewport and animate from the last visible position when a jump target returns on screen.
- Track cursor states by cursor identity instead of array index to avoid state mixing when cursors disappear, reorder, or scroll off screen.
- Bound jelly deformation during large jumps and preserve smooth recovery for trailing corners.
- Compute corner lead/trail speeds from the current cursor shape and fade twist near the target.
- Added settle snapping, minimum-area convexity checks, and gentler fallback interpolation for edge cases.

## [0.0.6] - 2026-06-24

- Preserve the last visible cursor shape as the animation origin when jumping to lines outside the rendered viewport.
- Improved horizontal and vertical jelly motion with stronger diagonal twist so all four corners can move at distinct speeds.
- Kept convex shape protection while tuning the full-direction corner speed model to avoid self-crossing cursor polygons.

## [0.0.5] - 2026-06-08

- Reworked jelly deformation to behave consistently in every movement direction.
- Replaced the one-sided `topEdgeBoost` tuning with directional `twistBoost`.
- Added convex shape protection to prevent the cursor polygon from crossing into a funnel-like shape.
- Kept compatibility with the legacy `topEdgeBoost` setting when reading configuration.

## [0.0.4] - 2026-06-07

- Moved cursor rendering to a global overlay so the primary cursor can animate across split editor panes.
- Improved active-editor cursor ordering for smoother transitions between editor groups.
- Kept multi-cursor rendering while allowing cross-pane primary cursor movement.

## [0.0.3] - 2026-06-07

- Improved multi-cursor rendering by maintaining separate jelly cursor shapes per Monaco cursor.
- Improved split editor behavior by isolating cursor state per editor instance.
- Hide stale cursor shapes when editors are hidden, switched, or cursor nodes disappear.

## [0.0.2] - 2026-06-07

- Renamed settings from `newNeovideCursor.*` to `jellyCursor.*`.
- Renamed command IDs to `jellyCursor.installDomPatch` and `jellyCursor.uninstallDomPatch`.
- Added compatibility reads for legacy `newNeovideCursor.*` settings.
- Added first-install backup for `workbench.html`.
- Updated the injected script name and DOM patch markers to Jelly Cursor branding.
- Added Chinese documentation.

## [0.0.1] - 2026-06-07

- Initial experimental release.
- Added DOM patch installer and uninstaller commands.
- Added jelly-like cursor deformation based on movement direction.
- Added movement glow with configurable color, size, opacity, and intensity.
- Added cursor color configuration.
- Added native cursor shape mirroring for line and block cursor modes.
