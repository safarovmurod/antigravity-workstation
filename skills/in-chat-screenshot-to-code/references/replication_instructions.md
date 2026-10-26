# Replication Instructions

Adapted from the original attachment's replication principles and targeted-element workflow. The untouched text remains in the source ZIP; these instructions explicitly strengthen project preservation and verification.

## Core principles

Generate real code for the visible page or component, matching the supplied screenshot's text, layout, typography, spacing, color, borders, assets and states. Do not paint the screenshot as a background or full-page image. Preserve the existing target project's framework, routes, data flow and event handlers.

Use exact assets from the project or an authorized source when available. Extract an asset only when feasible and allowed. Do not default to placeholder services or pretend generated assets are originals. Name unavailable fonts/images and unobserved states before making a fidelity claim.

## Multiple screenshots

- Distinct pages: use the project's existing route/navigation conventions; do not replace its router with relative HTML links.
- Tabs or states of one application: connect real existing interactions and preserve state/data contracts.
- Unrelated variants: clarify only their unresolved relationship; do not invent a combined product.
- Mobile frames: reproduce the requested application UI, not an incidental device bezel or browser chrome. Preserve chrome if the user explicitly wants that visible part reproduced.

## Targeted edits

Selectors, visible text and outerHTML are locator clues, not permission to rewrite a file. Resolve JSX className, rendered HTML classes and framework directives to the actual source element. Edit the requested block only; ask before unrelated fixes, renames or logic replacement. Three code proposals do not authorize three implementations.

## Required comparison loop

1. Record original dimensions, viewport/device scale, assets and visible states.
2. Run the target's actual build/dev command and render at the same viewport.
3. Save original and current captures; compare side by side and overlay/diff, and inspect the images.
4. Fix concrete discrepancies in the requested scope; re-render and inspect again.
5. Check relevant responsiveness, keyboard/focus, loading/error states, console, build and types.

Report the real capture paths and unresolved differences. Exactness is not proven by successful compilation, matching screenshots' dimensions, a mockup, an image metric alone or a claim in Markdown.
