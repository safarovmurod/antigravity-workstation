# Repository Guidelines

## Project Structure

This repository packages the Antigravity Workstation setup. `bin/` contains the CLI entry point, and `lib/` contains installer and configuration logic. `config/`, `rules/`, `skills/`, and `agents/` hold the managed profile. `extensions/` contains local IDE extensions; `resources/` contains bundled runtime assets. Platform setup scripts live in `scripts/` and `macos/`. Tests are in `tests/`, documentation in `docs/`, and existing feature specifications in `specs/`.

## Development and Verification

Use Node.js 24 or newer and npm 10 or newer.

- `npm start` runs the setup CLI; `npm run doctor` runs diagnostics.
- `npm test` runs the main Node test suite.
- `npm run test:coverage` runs the coverage workflow.
- `npm run test:bootstrap` runs the Windows bootstrap tests; `npm run test:powershell` runs the font staging tests with PowerShell.
- `npm run build:stability`, `npm run build:appearance`, and `npm run build:calm-typescript` package the corresponding extensions.

Check a command's effects before running installers or live integration tests against a personal IDE profile.

## Style and Naming

Follow `.editorconfig`: UTF-8, LF line endings, three-space indentation, and a final newline. Match the surrounding file when modifying existing code; much of `lib/` uses CommonJS and two-space indentation. Use descriptive camelCase identifiers and existing kebab-case file names. Preserve platform-specific behavior and established configuration formats.

## Testing

Node tests use `node:test` and `node:assert/strict`; name new suites `tests/test-<feature>.mjs`. Run a focused suite with `node --test tests/test-jsonc.mjs`, then run `npm test` when relevant. Add regression coverage for changed behavior and run platform-specific checks when the environment supports them. Report skipped or unavailable live checks explicitly; no fixed coverage threshold is specified.

## Commits and Pull Requests

Recent commits use short, imperative subjects, such as `Preserve personal preferences by default`. Keep each commit focused. In a pull request, describe the behavior changed, relevant issues, commands and platforms tested, and any remaining limitations. Include screenshots for visible IDE changes.

## Configuration Safety

Preserve personal settings and extensions during ordinary updates. Never commit credentials, tokens, session data, or private configuration. Changes affecting permissions, cleanup, or backups should retain explicit user choice and have focused tests.
