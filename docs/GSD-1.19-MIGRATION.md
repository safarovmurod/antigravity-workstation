# GSD 1.19.0 / Setup 3.0.27

This follow-up preserves the published repair in main `f7a31811ca34e91ae04b4c29558323cce74ef156` (PR #3, merged). It reuses the existing repair branch; no old branch or new working branch is introduced. Setup 3.0.27 requires publication before its main-only README commands can install it; the freshness guard refuses an older main rather than installing a stale snapshot.

## Source and complete migration

- Official npm package: `@opengsd/gsd-core@1.19.0`, gitHead `9dc57a772195de423ab788e4d0d8734b162db35d`.
- Archive integrity: `sha512-3j2ejyDoS4xo0nv9nUwlL8NhgQAEVy4HXsAGdylnEsp2toHTE5AZsDEzZTHv6mpHMtfOyr/vf9ZbdiREyFzvkQ==`. The fetched bytes were checked before extraction; absolute/traversal/link archive entries were refused.
- Node >=24/npm >=10 match the existing Setup requirements. The exact lock retains the MCP/Chrome packages; GSD's changed optional fallow dependency brings its own 3.x platform packages and optional TypeScript helper. This is not an unrelated wholesale dependency refresh.
- The official installer generated Antigravity/global/full artifacts in a fresh disposable directory. A process-only `os.homedir`/`os.tmpdir` adapter kept its discovery writes in that directory; Node's permission fence allowed writes only there. No actual user home, credentials, native executable or vendor source was patched.
- All 1,004 generated manifest entries were independently SHA-256 checked. The previous 995 source entries also matched their prior manifest before import. Nine added entries had no non-owned path collision; no prior vendor entry was retired. Runtime, 79 total project skill entries (including owned additions), agents, hooks/scripts, state, profile, lock and hash manifest move together. The original Open GSD MIT notice remains in `resources/gsd-core/LICENSE`.
- `scripts/install-gsd-bundle.cjs` made a recoverable import snapshot at `/tmp/workstation-gsd-import-backup-gC7TP4` before replacing source bytes. Prior source also remains in immutable main history and the published recovery tag documented in the repair report. Generated Markdown keeps the existing global discovery locations and pinned upstream documentation links. Temporary staging paths are not shipped.
- Native Antigravity hooks retain their audited supported event format and owned adapter. Upstream's new Claude-specific `gsd-path-export.js` stays in the vendor corpus; it is not falsely wired as a supported native IDE SessionStart event.

## Real regression found, not hidden

The initial migration regression failed: upstream 1.19 still ships `gsd- updated` as an invalid object member in installer migration 011. Archive integrity did not establish JavaScript validity. The same narrow `gsd: updated` correction used for 1.18 is retained, with the exact hash updated in the new manifest and provenance in `GSD-LOCAL-PATCHES.json`. The unchanged regression verifies both owned entry shapes, foreign server preservation, no planning writes, invalid input and idempotence. Two new upstream trailing spaces were removed with corresponding manifest hash updates; no runtime logic was removed.

The focused regression then passed **32/32**, including real archived 1.15 and published 1.18 installer profiles upgrading to 1.19, two repeated updates per cycle and three exact-byte rollback cycles for each baseline. Personal nested settings, Light+ token rules, foreign namespaces and a private skill survive. Provisioning tests intentionally skip external gallery/browser/font installation; this is not a live Gemini session or Windows reboot.

An intermediate full run overlapped the final source/manifest whitespace correction and correctly refused an inconsistent source hash. That run is not PASS evidence; the final stable-tree suite is run again separately. No validation was disabled.

The final stable-tree terminal run with the actual audited native bundle and protobuf runtime passed **450 tests, zero failures, zero skips**. Independent corrective acceptance/manual Git fixture checks passed **3/3**; PowerShell bootstrap network checks passed **72 scenarios**; all **14** PowerShell sources parsed without errors. These are portable/source/configuration results, not yet Windows CI or live Gemini proof for the follow-up.

## Published repair baseline evidence (not transferred to changed source)

For main `f7a3181`, Setup [40371235729](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40371235729), native Windows [40371235819](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40371235819), Aster [40371235747](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40371235747) and actual installed playback [40371235806](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40371235806) passed. Git capture [40371235820](https://github.com/safarovmurod/antigravity-workstation/actions/runs/40371235820) remains blocked by official authentication/onboarding. The main README source/config/cache/full/lite/rules/repeat/rollback fixture also passed for this exact SHA; external gallery/browser/font provisioning was excluded. Changed 3.0.27 bytes require their own CI.

## Still not accepted

Disk inventory is not active model context. Core: 3,994 UTF-8 bytes; metadata: 44,476 bytes; disk Markdown: 1,579,032 bytes; 79 skills, 64 agents, three rules and 93 references. Actual Gemini activation, lazy consumption, latency, G01–G18, inline questionnaire delivery and screenshot reconstruction still need an authenticated session. Six Git recordings, a current Stability recording and Windows OS reboot proof remain separate open items. This migration does not turn them into DONE.
