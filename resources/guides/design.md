# Design process and preserved domain coverage

This guide covers design tasks when relevant to the chef’s request. Use a domain only when requested or relevant. Core quality applies globally; brand-specific styling and a particular artifact format do not.

## Context and existing design system
Understand purpose, audience, deliverable, intended behavior, viewport and constraints. Read screenshots/Figma, local assets, existing UI kits, components, tokens, typography and actual project files before design. Ask concrete questions only for missing facts that change the result. Reuse an existing brand system; do not replace it with a new aesthetic, arbitrary font, random image, framework or a source's HTML-first convention. For new original design without a reference, obtain or use the user's stated direction instead of inventing requirements.

## Layout and content
Map every visible block, including header, navigation, hero, content, cards, forms and footer. Work in large coherent blocks, preserving routes, state, events and API behavior. Compare width/height, maxWidth, alignment, order, grid/flex behavior, gap, padding/margin, typography, font weights/line height, colors, borders, radii, images and crops. Use confirmed values; label screenshot estimates. Do not add animations, decorative effects, additional sections or marketing copy without a request. Keep missing assets explicit; preserve supplied asset names and local image imports.

## Typography, color and accessibility
Preserve actual fonts and licensed assets; wait for fonts before screenshot capture. Use readable size/line length/hierarchy, coherent spacing and accessible contrast. Use semantic controls, real labels, keyboard navigation, visible focus, sensible tab order and accessible names. Check dialogs, error messages, non-color cues and required loading/empty/error/success states. When existing behavior is out of scope, report the issue instead of silently refactoring. Prefer native project components, including MUI/sx and px/hex conventions for new examples for the chef.

## Responsive and interaction
Use the supplied desktop/mobile reference and real viewport. If mobile requirements are missing, ask; do not pretend an invented mobile layout is the supplied design. Preserve touch usability, content order, text wrapping and image fit. Check overflow and horizontal scrolling. Exercise buttons, navigation, controlled forms, drawer/modal, pagination/slider/accordion and feedback states only as applicable. Do not invent behavior from static screenshots. If state or APIs are uncertain, confirm the contract first.

## Visual verification and handoff
Render through the real application's dev server using an available authorized browser. Wait for styles, images and fonts. Capture actual screenshots at matching viewport/capture area. Compare reference and actual content; a numeric diff alone is insufficient because font rasterization, scaling and dynamic content vary. Do not blur references or raise thresholds to conceal differences. Specify confirmed differences as file -> component -> property -> current -> target -> change. Recheck changed blocks and relevant mobile/interaction paths. Keep source reference intact, communicate evidence and missing checks, and hand off exact implementation files without unresolved placeholders being described as complete.

## Domain-specific deliverables when requested
- Wireframes/options: explore alternative compositions only for a requested exploratory design; preserve stable option IDs and explain concrete tradeoffs. They are drafts, not final screenshot-fidelity claims.
- High-fidelity and design systems: use real context, reusable components, tokens, examples and source assets. Show a concrete draft when iterative review benefits the request; do not require approval for every reversible implementation step.
- Interactive prototypes and adjustable designs: make controls and interactions real and scoped to the requested artifact; separate prototype data from a production API. Keep tweak controls or debug metadata out of end-user product flows unless requested.
- Document/deck/flier: use readable typography, hierarchy, safe print margins, slide/page dimensions and editability suited to the requested medium. Preserve source content and asset rights. Export only requested formats and verify rendering, page count and editable/native versus screenshot-based output honestly.
- PDF/standalone HTML: use the available export mechanism and inspect the resulting artifact. Verify whether assets are embedded and whether offline use works; do not claim standalone behavior from a source file alone.
- HTML email: use email-client constraints only for an email deliverable; do not impose them on a React app. Verify the requested client/format and preserve real links/assets.
- 3D object/animated video: use supported tools and requested motion/scene constraints. Keep static frontend work free of automatic animation/3D dependencies. Verify actual render/output when accessible.
- Maps/geography and web research: use verified geographic data, current primary sources and suitable available tools. Cite factual claims and preserve coordinate/projection/source constraints when applicable. Do not invent locations or research attribution.
- Claude API in prototypes and handoff to a coding agent: real available API, authentication and server boundary are prerequisites. Provider-only tools, source SDKs, canvas editors, artifact APIs, source paths and handoff commands remain reference material unless actually supported and authorized in the target environment.

## Source boundaries
Raw tools, schemas, platform identity, hidden conversation tags and environment paths are not transferable global commands. Preserve their original text in the archive and map the useful goal to a real supported capability; explicitly record unsupported portions. Read contextual helpers on demand, never preload every design skill on every chat turn.
