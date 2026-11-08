# Stack Recipes — isolated demo only

The attachment originally defaulted to standalone HTML/Tailwind/CDN and supplied React18+Babel, Vue3, Bootstrap5 and Ionic recipes. Those are alternatives for an explicitly selected isolated demo, not instructions to migrate an existing project. The untouched original recipes remain in the archived ZIP for provenance.

For an existing target, use its package.json/lockfile, framework entry points, components, CSS system and local assets. Do not downgrade React, add in-browser Babel to a bundled project, inject Tailwind or fetch fonts/icons merely because they occur in the old recipe. Use the actual project's commands and dependencies.

For an empty target, clarify the unresolved choice before creating files. Prefer the user's selected stack; do not assume Tailwind. If a standalone demo is explicitly chosen, create only the agreed subfolder. A plain HTML/CSS shell needs no external runtime:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Screenshot reproduction</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <main id="app"></main>
</body>
</html>
```

This empty shell is a setup recipe, not a completed design. Fill it from the actual screenshot, real content and assets; then perform mandatory same-viewport visual comparison.

If React/Vue/Bootstrap/Ionic is explicitly selected for a new isolated demo, check its current official compatible release and loading method rather than copying stale CDN pins. Keep local verified assets where practical; document necessary remote dependencies and failures. CDN availability and matching dimensions do not prove visual fidelity.
