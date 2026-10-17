# Full-stack implementation and verification

Apply only the sections relevant to the request. The user's simple-code and stack agreement stays in force. The purpose is one consistent workflow spanning a real frontend and real backend, not automatically expanding every frontend question into a full-stack project.

## Inspect and define the contract
Inspect package manifests, lockfiles, startup scripts, environment-variable names without secret values, frontend pages/router/store, backend routes/controllers/middleware, schema/migrations and relevant tests. Read real Swagger/OpenAPI or authoritative docs when contracts or versions are uncertain. List each user requirement, its implementation location and its verification status. Ask for missing endpoint/method/body/response, authentication or post-action behavior that materially changes the result. Do not silently fill gaps with invented data.

## Client and server behavior
Trace event -> validation -> request -> authentication/authorization -> business logic -> database -> response -> state -> UI. Keep API field names and ID types real. Treat JSON, FormData, multipart uploads and PATCH/PUT distinctions as contract-specific. Keep failures visible at the appropriate UI boundary; do not invent unconditional fallback values, optimistic changes or retries. Prevent duplicate submissions when needed by the requested workflow. Keep detail routes and permissions functional after direct navigation and F5. Preserve Header/Outlet/Footer, NavLink behavior and 404/error handling of the actual router version.

## Data and transactions
Read the schema and query paths first. Enforce authorization on server reads and writes, use parameterized queries and validate external data at the trust boundary. Use a transaction when the required operation must succeed atomically. Inspect constraints, indexes and query evidence before optimization. Do not introduce a database, an ORM, a service layer, a global store or a migration just to match a source prompt. Plan authorized schema changes with a real backup, rollback and compatible application behavior. Avoid destructive live migrations and production data in tests. Never weaken constraints or types simply to hide an error.

## Authentication and secrets
Follow the existing supported authentication mechanism and deployment environment. Check server-side authorization, session/cookie/token lifecycle, role checks and access boundaries when affected. Do not hardcode API keys, passwords or tokens, expose them in the browser, print them in logs, copy account state into source references or commit private backups. Inspect actual platform defaults for CORS, CSRF, cookies and upload limits rather than imposing one universal solution. Do not disable sandbox, approval, authentication or privacy protections to make the agent automatic.

## Uploads, async work and integration
Verify field names, accepted types, size limits, filenames, storage permissions and returned URLs. Keep request cancellation, race handling, background jobs, idempotency, rate limits and retries scoped to demonstrated requirements; do not add advanced hooks or infrastructure speculatively. Verify integration failure paths with harmless synthetic cases. External writes, messages, deployments, purchases and destructive operations require their relevant user authorization. A mock response proves only the isolated flow, not a real provider connection.

## Testing and delivery
Use available scripts in the actual package manifest for relevant lint, typecheck, build and tests. Keep tests purposeful: authorized API behavior, error boundaries, access checks, database integrity, F5/detail routes and important user flows. For UI changes run an actual dev server, observe the affected page, forms, console, network and responsive viewports where tools are available. Report build, runtime, API, persistence and visual verification separately. Full-stack persistence requires writing and reading back the test record, preferably across reload/restart when that behavior is requested. Never call a frontend-only mock a verified backend.

## Performance and operational behavior
Measure a real issue before adding memoization, indexes, caches, batching, concurrency, virtualization or background agents. Preserve simple code for beginner tasks. Avoid infinite retry/tool loops and all-skill initialization. Keep normal work free of watchers and repeated polling. Stop processes started for checks when no longer needed. Respect current hosting, environment and release procedures; prepare a reviewable change before a required deployment approval. A passing check does not guarantee zero defects or vulnerabilities.

## Debug and report
Reproduce -> evidence -> confirmed cause -> minimal fix -> relevant recheck. Mark uncertain causes. Inspect the diff and verify each edit belongs to the authorized request. End with outcome, exact files, evidence, untested parts and next necessary action; do not transfer assistant errors to the chef.
