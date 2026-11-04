# Source configuration audit

`node scripts/audit-configuration.cjs` parses the source JSON/JSONC in `config/` and local extensions, detects duplicate keys within the same object including escaped equivalents, and inventories empty objects and arrays. This is a source audit, not access to any user's private profile and not proof that every key is registered by every possible host.

The current source scan found 48 JSON/JSONC files, no parse errors, no duplicate keys and six empty values. Their purpose was checked rather than filled automatically:

| Source value | Why it is empty |
|---|---|
| `jelly-cursor-state.template.json` → `history` | A new maintenance state has no recorded repair history; the helper adds entries when repairs occur. |
| `mcp/active.template.json` → `chrome-devtools-mcp.env` | No environment secrets are invented for a fresh install; the ownership merge preserves personal MCP env/options. |
| `settings.json` → `editor.tokenColorCustomizations` | Neutral managed default; personal theme and TextMate rules are preserved by the ownership merge. |
| `settings.json` → `errorLens.excludeBySource` | No exclusions on a fresh install. The corrected merge preserves an existing personal list. |
| `settings.json` → `errorLens.excludeByMessage` | No exclusions on a fresh install. The corrected merge preserves an existing personal list. |
| `workstationStability.autoUpdateExcludedExtensions` → `default` | No managed extensions are excluded by default; the user may provide an exclusion list. |

In a disposable Linux VS Code 1.107.1 profile, the actual installed extensions registered and matched **59** managed settings. Eighteen provider/UI checks exercised, among other things, TypeScript/React suggestions, Tailwind completion, Oxc, Prettier, path suggestions and the hidden closing-tag annotation. Personal settings, unknown MCP options, Light+ token rules, prior GSD 1.15/1.18 migration, repeat update and backup rollback are covered by `tests/test-personal-config-preservation.mjs`. The metadata-only Error Lens lookup selected stable compatible 3.30.0 for IDE 1.107/win32-x64 on 26.10.2026; that is a point-in-time result.

These checks do not establish every setting's behavior across all versions, personal profiles, authenticated Gemini sessions, Windows OS reboot or native Antigravity. The Windows workflow and independent live acceptance matrix remain necessary. No unknown namespace or personal extension was removed solely because its value was absent from the project catalog.
