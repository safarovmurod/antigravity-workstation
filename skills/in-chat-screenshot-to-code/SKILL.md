---
name: in-chat-screenshot-to-code
description: >-
  Replicate a screenshot, UI mockup or design image in the current project's real
  stack. Use for screenshot-to-code and screenshot fidelity tasks, not ordinary
  coding questions. Render at the reference viewport and visually verify the result.
metadata:
  source: https://github.com/abi/screenshot-to-code/issues/638
  source-sha256: cdf478612a67fa37116bfd18de0e16f44adbee07953a34cf852a742b04134590
  adaptation: Workstation project-stack and mandatory-verification edition
---

# In-Chat Screenshot to Code

Adapted from the original skill in the user-supplied issue638 ZIP, not a renamed substitute. The untouched archive and file hashes are recorded in the repository's upstream provenance. The archive contains no license file; do not claim its attachment license was verified as MIT merely because the hosting application's repository uses MIT.

The canonical `~/.gemini/GEMINI.md` remains authoritative. Preserve its language, consent, minimal-diff, three-code-proposals/one-implementation and no-new-comments rules. Do not load the whole skill catalog.

## Intake and stack

Inspect the reference image and actual target project before editing. Keep its framework, versions, package manager, routes, components, CSS conventions and asset pipeline. Existing React/Vue/native projects are not standalone HTML demos. Do not replace their stack with Tailwind/CDN, create a second backend, start upstream FastAPI/WebSocket infrastructure or move the project into `output/`.

If the target is genuinely empty, ask only the unresolved stack/output choice. The already-agreed task is not blocked by another questionnaire. [Stack recipes](references/stack_recipes.md) are optional isolated-demo recipes, not defaults or a migration instruction.

## Synthesis

Treat the screenshot's visible typography, content, hierarchy, layout, sizes, spacing, colors and states as the specification. Build real semantic components; never embed the screenshot as the whole rendered page. Use the project's real assets/fonts first. Missing assets or unknown invisible states must be disclosed; arbitrary placeholders and generated substitutes cannot be called exact.

Read [replication instructions](references/replication_instructions.md) for the current screenshot task. Match the requested element with surgical changes; preserve existing event handlers, state, APIs and unrelated files. [Repository orientation](references/repo_orientation.md) is needed only when distinguishing the original screenshot-to-code webapp from the target repository.

## Mandatory visual verification

Run the real target, capture it at the reference viewport, and compare original/render side by side plus overlay or image diff. Inspect the actual images, locate visible differences and correct them; capture again after changes. Check the requested responsive/interactive states, build/types and console errors. Disk files, text assertions, a diff number alone or an unviewed capture do not prove visual fidelity.

No fast-mode opt-out by default. If the browser, font, asset or original image is unavailable, name the exact boundary and mark that portion NOT TESTED/BLOCKED; do not silently claim 1:1. Report the actual viewport, captures, comparison and remaining differences. A live model transcript is separate evidence from an installed skill file.
