# Jelly Cursor

[中文说明](https://github.com/18003404183/vscode-jelly-cursor/blob/HEAD/README.zh-CN.md)

Jelly Cursor adds a jelly-like animated cursor to VS Code. The cursor follows Monaco's native cursor position, deforms while moving, supports movement glow, and mirrors the native cursor shape used by modes such as Vim block and line cursors.

## Features

- Smooth cursor motion
- Jelly deformation based on movement direction
- Optional movement glow
- Custom cursor and glow colors
- Tunable corner speed, deformation, alpha, and glow settings
- Native cursor shape mirroring for line and block cursor modes
- Separate cursor state for multi-cursor and split editor layouts
- Cross-pane animation when switching between split editors
- Off-screen jump animation that starts from the last visible cursor position
- Diagonal twist on horizontal and vertical movement so all four cursor corners can move at distinct speeds

## Vim Compatibility

Jelly Cursor itself does not require another extension. It mirrors VS Code's current native Monaco cursor shape.

For Vim-style block and line cursor behavior, install and configure a Vim extension first, such as:

- [VSCodeVim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim)

After the Vim extension changes VS Code's native cursor shape, Jelly Cursor will mirror that shape and animate it.

## Important

Jelly Cursor uses an experimental DOM patch. VS Code extensions cannot normally access Monaco editor DOM from the stable extension API, so the install command patches VS Code's `workbench.html` and injects a small script.

Because of that:

- VS Code may show an "installation appears to be corrupt" warning.
- VS Code updates may remove the patch.
- Re-run the install command after VS Code updates.
- The first install creates a `workbench.html.jelly-cursor-backup` backup file next to `workbench.html`.
- Use the uninstall command before reinstalling VS Code or if you want to remove the patch cleanly.

## Install The Patch

Open the command palette and run:

```text
Jelly Cursor: Install DOM Patch
```

Then fully restart VS Code.

The installer locates `workbench.html` automatically by checking, in order:

1. The running VS Code app (`vscode.env.appRoot` and `process.execPath`).
2. Common install locations for VS Code, VS Code Insiders, Cursor, VSCodium, and Windsurf on Windows, macOS, and Linux.
3. The `code` / `cursor` commands found on `PATH`.
4. The known `out/vs/...` folder layout, with a bounded recursive fallback search for the file.

### If automatic detection fails

A file picker opens with detailed instructions. Choose the **file** named `workbench.html` — not its folder. Navigate inside your VS Code installation to:

```text
resources → app → out → vs → code → electron-browser → workbench → workbench.html
```

Typical full paths:

| Install type | `workbench.html` path |
|---|---|
| Windows, user install | `%LOCALAPPDATA%\Programs\Microsoft VS Code\resources\app\out\vs\code\electron-browser\workbench\workbench.html` |
| Windows, system install | `C:\Program Files\Microsoft VS Code\resources\app\out\vs\code\electron-browser\workbench\workbench.html` |
| macOS | `/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html` |
| Linux | `/usr/share/code/resources/app/out/vs/code/electron-browser/workbench/workbench.html` |

> Note: newer VS Code builds may insert a version-number folder between `Microsoft VS Code` and `resources`.

To avoid the picker entirely, set `jellyCursor.workbenchHtmlPath` in Settings to the full path of `workbench.html`:

```json
{
  "jellyCursor.workbenchHtmlPath": "C:\\Users\\you\\AppData\\Local\\Programs\\Microsoft VS Code\\resources\\app\\out\\vs\\code\\electron-browser\\workbench\\workbench.html"
}
```

The picker also validates your selection and reopens with instructions if you choose a folder or a different file.

## Uninstall The Patch

Open the command palette and run:

```text
Jelly Cursor: Uninstall DOM Patch
```

Then fully restart VS Code.

## Check Status and Restore Backup

Run `Jelly Cursor: Show Patch Status` to list every discovered `workbench.html`, whether it is patched, and whether an injected script or backup exists. From the detail view you can copy the path, uninstall that specific patch, or restore its backup.

Run `Jelly Cursor: Restore workbench.html Backup` to replace the current `workbench.html` with the backup created at first install and remove the injected script files.

All file writes are atomic (temporary file + rename), and failures show actionable errors instead of leaving `workbench.html` half-written. Successful install/uninstall/restore prompts include a **Restart Now** action.

After a VS Code update removes the patch, Jelly Cursor detects it on startup and offers to reinstall (disable with `jellyCursor.reminders`). A small status bar indicator also shows whether the patch is installed, and diagnostics are written to the Output panel under **Jelly Cursor**.

## Settings

Settings are read when the DOM patch is installed. After changing settings, Jelly Cursor offers to reinstall the patch and restart VS Code automatically.

```json
{
  "jellyCursor.cursorColor": "#ffffff",
  "jellyCursor.glowColor": "#ffffff",
  "jellyCursor.glowEnabled": true,
  "jellyCursor.glowOpacity": 0.9,
  "jellyCursor.glowIntensity": 1.8,
  "jellyCursor.glowSize": 18,
  "jellyCursor.fastSpeed": 0.42,
  "jellyCursor.midSpeed": 0.24,
  "jellyCursor.slowSpeed": 0.1,
  "jellyCursor.axisBias": 0.45,
  "jellyCursor.twistBoost": 0.16,
  "jellyCursor.minAlpha": 0.03,
  "jellyCursor.animationMode": "full",
  "jellyCursor.maxJumpAnimationDistance": 0,
  "jellyCursor.effectPreset": "custom",
  "jellyCursor.shapeStyle": "native",
  "jellyCursor.trailEnabled": false,
  "jellyCursor.trailLength": 0,
  "jellyCursor.trailOpacity": 0.35,
  "jellyCursor.springEnabled": false,
  "jellyCursor.springStiffness": 0.16,
  "jellyCursor.springDamping": 0.78,
  "jellyCursor.rainbowEnabled": false,
  "jellyCursor.gradientEnabled": false,
  "jellyCursor.rippleEnabled": true,
  "jellyCursor.landingPulseEnabled": true,
  "jellyCursor.sparkEnabled": true,
  "jellyCursor.sparkAmount": 0.5,
  "jellyCursor.reminders": true,
  "jellyCursor.statusBar": true,
  "jellyCursor.workbenchHtmlPath": ""
}
```

### Effect Presets

- `jellyCursor.effectPreset`: `custom`, `minimal`, `neon`, `aurora`, `matrix`, or `comet`. Non-custom presets override the matching individual effect settings below.

### Shape and Trail Settings

- `jellyCursor.shapeStyle`: `native`, `rounded`, or `capsule`.
- `jellyCursor.trailEnabled`: Draw fading afterimages behind the moving cursor. Disabled by default; enable it manually or choose a trail preset.
- `jellyCursor.trailLength`: Number of afterimages.
- `jellyCursor.trailOpacity`: Maximum afterimage opacity.

### Motion and Glow Effects

- `jellyCursor.springEnabled`: Use spring physics with a slight overshoot.
- `jellyCursor.springStiffness`: Spring stiffness.
- `jellyCursor.springDamping`: Spring damping; lower values wobble longer.
- `jellyCursor.rainbowEnabled`: Cycle cursor and glow colors through the rainbow.
- `jellyCursor.gradientEnabled`: Use a vertical gradient fill.
- `jellyCursor.rippleEnabled`: Ripple ring on editor clicks.
- `jellyCursor.landingPulseEnabled`: Pulse ring when the cursor lands after a jump.
- `jellyCursor.sparkEnabled`: Emit light particles during fast movement.
- `jellyCursor.sparkAmount`: Particle density.

### Animation Settings

- `jellyCursor.animationMode`: `full` for jelly deformation plus glow, `smooth` for smooth following without deformation, or `off` to disable animation entirely.
- `jellyCursor.maxJumpAnimationDistance`: Caps how far the cursor animates after a jump, in pixels. Set to `0` to animate the full jump distance.

### Reminder and Status Settings

- `jellyCursor.reminders`: Show a reminder when the patch is missing after a VS Code update, or when settings need a reinstall.
- `jellyCursor.statusBar`: Show the Jelly Cursor patch status in the status bar.

### Patch Location

- `jellyCursor.workbenchHtmlPath`: Full path to `workbench.html`. Leave empty for automatic detection; set it only when detection fails.

### Motion Settings

- `jellyCursor.fastSpeed`: Speed for corners leading the movement direction.
- `jellyCursor.midSpeed`: Speed for side corners during jelly deformation.
- `jellyCursor.slowSpeed`: Speed for corners trailing the movement direction.
- `jellyCursor.axisBias`: Controls whether speed selection favors axis movement or diagonal movement.
- `jellyCursor.twistBoost`: Adds diagonal twist during movement while preserving a non-crossing cursor shape.
- `jellyCursor.minAlpha`: Minimum alpha while the native cursor is blinking.

### Glow Settings

- `jellyCursor.glowEnabled`: Enables or disables movement glow.
- `jellyCursor.glowColor`: Glow color. Use an empty string to follow the cursor color.
- `jellyCursor.glowOpacity`: Maximum glow opacity while moving.
- `jellyCursor.glowIntensity`: Brightness multiplier.
- `jellyCursor.glowSize`: Glow radius in pixels.

## FAQ

**Why does VS Code say “Your installation appears to be corrupt”?**
Jelly Cursor patches `workbench.html`, which changes the installation signature. This warning is expected. Run `Jelly Cursor: Restore workbench.html Backup` and restart if you want the original file back.

**The animation disappeared after a VS Code update.**
Updates replace `workbench.html`. Run `Jelly Cursor: Install DOM Patch` and restart. Jelly Cursor also reminds you about this on startup when `jellyCursor.reminders` is enabled.

**I changed settings but nothing happened.**
Settings are baked into the injected script. After changing them, accept the reinstall prompt (or run `Jelly Cursor: Install DOM Patch`) and restart VS Code.

**How do I remove Jelly Cursor completely?**
Run `Jelly Cursor: Uninstall DOM Patch`, restart VS Code, then uninstall the extension. The backup file is kept next to `workbench.html` in case you ever need it.

**Can I reduce battery usage?**
Set `jellyCursor.animationMode` to `off` or `smooth`, or uninstall the patch while keeping the extension installed.

## Known Limitations

- This is not a stable VS Code API implementation.
- The patch is tied to VS Code's current workbench file layout.
- Multi-cursor rendering currently follows the visible Monaco cursor nodes but is optimized for the primary editing cursor.
- Settings are not live-reloaded inside the injected script.

## Development

```powershell
npm install
npm run compile
```

Run the extension in an Extension Development Host, execute the install command, and restart VS Code to test the injected cursor.


