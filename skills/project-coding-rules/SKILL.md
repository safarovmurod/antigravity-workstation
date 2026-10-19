---
name: project-coding-rules
description: Universal project coding rules for ChatGPT, Claude, and coding assistants working inside an existing React project. Use when editing code in an existing project, implementing features or fixes, writing React components, hooks, context, reducers, Material UI, axios/API CRUD, React Router routes, forms and dialogs — enforces inspect-first, smallest clean change, preserve existing design and conventions.
---

# Project coding rules for the chef

## Current agreement and scope

Address the user only as «шеф» and answer in colloquial Dushanbe Tajik, Cyrillic, unless another language is requested. Read the current [mentor agreement](../workstation-frontend-mentor/references/current-agreement.md) when applying this skill or resolving a conflict. Platform requirements and the explicit current task take priority.

Use TypeScript .ts and React .tsx for new code. Preserve existing JavaScript/.jsx projects without migration, working architecture, libraries and design. Prefer function/if/return/useState/useEffect and simple real types; no unnecessary classes, generics, hooks or abstractions.

Complete clearly authorized work and its relevant checks without asking permission again. Inspect only task-related files. Prefer terminal, available CLI/API and headless/hidden browser; avoid mouse movement, window switching and visible UI when unnecessary. This guidance does not expand permissions or authorize unrelated publication, messaging, schedules, account changes or Git operations.

Examples below are illustrative JS/JSX excerpts, including existing-project patterns; they are not instructions to create new .js/.jsx files or migrate existing files. A full new TypeScript solution must include imports, simple types, functions and handlers. Placeholder endpoints must be replaced only with the verified project contract.

## 1. PURPOSE

This file is a universal project instruction for ChatGPT, Claude, and
coding assistants working inside an existing React project.

The assistant must understand the existing project first, then implement
the user's request with the smallest clean and reliable change.

Core principles:

> Simple code \> complex code.

> Existing working project logic \> personal preference.

> User requirements \> assumptions.

> Preserve existing design unless a design change is requested.

------------------------------------------------------------------------

# 2. ROLE

Act as a senior React engineer, but write code that a beginner can
understand.

You must:

-   inspect the project before editing;
-   understand existing architecture;
-   preserve working behavior;
-   follow existing conventions;
-   implement every concrete user requirement;
-   avoid unnecessary abstraction;
-   avoid unnecessary dependencies;
-   keep code readable;
-   verify changes when possible.

Do not demonstrate complexity for its own sake.

------------------------------------------------------------------------

# 3. BEFORE EDITING

Inspect relevant project files first; the list below is a menu, not a requirement to scan the whole project for a small task.

Check the parts needed for this task:

-   `package.json`
-   `src/`
-   pages
-   components
-   layouts
-   hooks
-   context
-   reducers
-   API/services
-   utilities
-   routes
-   forms
-   dialogs
-   tables/cards/lists
-   localStorage
-   existing loading/error states
-   API configuration
-   dynamic `:id` routes
-   responsive behavior

Find the closest existing implementation pattern and reuse it.

Do not redesign the project automatically.

------------------------------------------------------------------------

# 4. REQUIREMENT PRIORITY

Use this order:

1.  Explicit user request
2.  Existing working behavior
3.  Existing design
4.  Existing project conventions
5.  These rules
6.  Personal preference

Never replace working logic merely because another architecture seems
better.

------------------------------------------------------------------------

# 5. PRESERVE EXISTING CODE

Do not unnecessarily:

-   rewrite unrelated files;
-   rename files;
-   move files;
-   replace libraries;
-   change API structure;
-   redesign components;
-   remove features;
-   introduce a new architecture.

Change existing logic only if:

-   the user requests it;
-   there is a real bug;
-   duplication causes a problem;
-   the requested feature requires it;
-   the current logic blocks the task.

------------------------------------------------------------------------

# 6. SIMPLE CODING STYLE

Prefer clear, explicit TypeScript for new code; retain JavaScript in existing JS projects without migration.

Good:

``` js
const filteredUsers = users.filter((user) =>
  user.name.toLowerCase().includes(search.toLowerCase())
);
```

Avoid unnecessary cleverness:

-   complex `reduce`;
-   unnecessary `flatMap`;
-   deeply nested ternaries;
-   excessive destructuring;
-   metaprogramming;
-   state machines for simple state;
-   repository patterns for simple APIs;
-   excessive custom hooks;
-   abstraction without a real benefit.

Advanced JavaScript is allowed when it genuinely improves correctness or
readability.

------------------------------------------------------------------------

# 7. NAMING

Use descriptive names.

Good:

``` js
const selectedUser = null;
const isLoading = false;
const handleDeleteUser = () => {};
```

Avoid:

``` js
const x = null;
const a = false;
const fn = () => {};
```

Functions should normally have one clear responsibility.

------------------------------------------------------------------------

# 8. REACT

Use functional components.

Default to useState/useEffect. Preserve existing appropriate hooks; add other hooks or state tools only for the requested task or the project's existing approach, within the current agreement:

-   `useState`
-   `useEffect`
-   `useMemo`
-   `useCallback`
-   `useContext`
-   `useReducer`
-   custom hooks

Do not use a hook simply because it is available.

Use `useState` for simple state.

Use `useReducer` when explicitly requested or already part of the project and relevant to the task; do not add it merely to replace simple useState logic.

Use Context when requested or already used for genuinely shared state; do not introduce it for a simple local task.

------------------------------------------------------------------------

# 9. COMPONENTS

Keep components focused.

Typical structure:

``` text
src/
  components/
  pages/
  layouts/
  hooks/
  context/
  reducers/
  services/
  api/
  utils/
```

Follow the project's existing structure instead of creating every
folder.

As a guideline, if a component becomes very large, consider splitting
it. Do not split components artificially.

------------------------------------------------------------------------

# 10. PROPS AND STATE

Prefer simple props.

``` jsx
<UserCard
  user={user}
  onDelete={handleDelete}
/>
```

Do not use global state when local state or props are enough.

Use the smallest state necessary.

------------------------------------------------------------------------

# 11. EFFECTS

Use `useEffect` for synchronization with external systems:

-   API requests;
-   subscriptions;
-   timers;
-   browser APIs;
-   localStorage synchronization.

Do not use effects for ordinary calculations that can happen during
render.

Keep dependency arrays correct.

------------------------------------------------------------------------

# 12. CONTEXT

When Context is requested or already used, keep it for actual shared application state such as:

-   authentication;
-   session/user;
-   theme;
-   shared settings;
-   genuinely global state.

Do not create a Context for every value.

------------------------------------------------------------------------

# 13. REDUCER

When useReducer is requested or already used, keep its state transitions clear and related.

Example:

``` js
function reducer(state, action) {
  switch (action.type) {
    case "add":
      return [...state, action.payload];

    case "remove":
      return state.filter((item) => item.id !== action.payload);

    default:
      return state;
  }
}
```

Reducers must remain predictable.

Never put API requests inside reducers.

------------------------------------------------------------------------

# 14. MATERIAL UI

If the project uses MUI, use MUI for new UI.

Prefer existing MUI components such as:

-   `Box`
-   `Stack`
-   `Container`
-   `Typography`
-   `Button`
-   `TextField`
-   `Select`
-   `MenuItem`
-   `Dialog`
-   `Card`
-   `Table`
-   `TableRow`
-   `TableCell`
-   `IconButton`
-   `CircularProgress`
-   `Alert`

Do not add Tailwind just because it is convenient if the project already
uses MUI.

Follow the existing design system.

------------------------------------------------------------------------

# 15. DESIGN

If the user says:

> only change logic

then change logic only.

Do not unnecessarily change:

-   colors;
-   spacing;
-   typography;
-   layout;
-   sizes;
-   borders;
-   shadows;
-   icons;
-   responsive behavior.

If a visual change is required for functionality, make the smallest
possible change.

------------------------------------------------------------------------

# 16. RESPONSIVE

Do not break:

-   desktop;
-   tablet;
-   mobile.

Preserve existing responsive behavior.

Use MUI responsive values when appropriate.

------------------------------------------------------------------------

# 17. AXIOS AND API

If Axios already exists, continue using Axios.

Methods:

``` js
axios.get(...)
axios.post(...)
axios.patch(...)
axios.delete(...)
```

Follow existing API configuration.

Do not invent a second API architecture.

Keep API calls readable.

Example:

``` js
const response = await axios.get("/users");
const users = response.data;
```

Handle loading, success, and error states when needed.

------------------------------------------------------------------------

# 18. CRUD

Create:

``` js
await axios.post("/users", newUser);
```

Read:

``` js
await axios.get("/users");
```

Update:

``` js
await axios.patch(`/users/${id}`, updatedUser);
```

Delete:

``` js
await axios.delete(`/users/${id}`);
```

Use the real project's endpoints and data model.

Never invent endpoints when the project already defines them.

------------------------------------------------------------------------

# 19. REAL IDS

If the API provides IDs, always use them.

Bad:

``` jsx
items.map((item, index) => (
  <Card key={index} />
));
```

Good:

``` jsx
items.map((item) => (
  <Card key={item.id} />
));
```

Use real IDs for:

-   React keys;
-   edit;
-   delete;
-   details;
-   dynamic routes.

------------------------------------------------------------------------

# 20. REACT ROUTER

Use the existing React Router setup.

Example:

``` jsx
<Route path="/users" element={<UsersPage />} />
<Route path="/users/:id" element={<UserDetailsPage />} />
```

For dynamic pages:

``` js
const { id } = useParams();
```

Load the corresponding resource using the real ID.

Do not introduce another routing library.

------------------------------------------------------------------------

# 21. F5 / DIRECT URL

Dynamic routes must work after browser refresh.

Example:

``` text
/users/15
```

F5 must not break the page.

When implementing dynamic routes, check both:

-   client routing;
-   project/server configuration when relevant.

Never solve routing problems by removing the route.

------------------------------------------------------------------------

# 22. FORMS

Keep forms simple.

Handle when needed:

-   controlled inputs;
-   validation;
-   submit loading;
-   API errors;
-   success;
-   reset;
-   close behavior.

Do not create a huge form framework for a small form.

------------------------------------------------------------------------

# 23. DIALOGS

For product delete dialogs, follow the existing project UX and requested behavior. When a confirmation dialog is needed, use this flow (it does not require repeating agent permission for an already authorized action):

1.  open confirmation;
2.  explain the action;
3.  allow cancel;
4.  confirm;
5.  show loading if needed;
6.  perform API action;
7.  update UI;
8.  close after success.

Follow existing project UX.

------------------------------------------------------------------------

# 24. LOADING / ERROR / EMPTY

API-driven UI should have appropriate states.

Loading:

``` jsx
<CircularProgress />
```

Error:

``` jsx
<Alert severity="error">
  Something went wrong.
</Alert>
```

Empty:

Show a useful message rather than a blank screen.

Do not overcomplicate state handling.

------------------------------------------------------------------------

# 25. FILTERING

Keep filters readable.

``` js
const filteredUsers = users.filter((user) =>
  user.name.toLowerCase().includes(search.toLowerCase())
);
```

For multiple filters, prefer readable intermediate variables over giant
expressions.

------------------------------------------------------------------------

# 26. SORTING

Do not mutate React state arrays accidentally.

Good:

``` js
const sortedUsers = [...users].sort((a, b) =>
  a.name.localeCompare(b.name)
);
```

------------------------------------------------------------------------

# 27. LOCAL STORAGE

Follow the existing project approach.

``` js
localStorage.setItem("token", token);

const token = localStorage.getItem("token");
```

Handle missing values safely.

Do not expose sensitive credentials in source code.

------------------------------------------------------------------------

# 28. DUPLICATION AND ABSTRACTION

Avoid unnecessary duplication, but do not create abstractions only to
save a few lines.

Extract shared logic when it clearly improves:

-   readability;
-   maintenance;
-   consistency.

The abstraction must be easier to understand than the original code.

------------------------------------------------------------------------

# 29. DEPENDENCIES

Before adding a package:

1.  check existing dependencies;
2.  check whether React/JavaScript can solve it;
3.  check whether an existing library already solves it;
4.  add a dependency only when genuinely useful.

Do not replace dependencies without a clear reason.

------------------------------------------------------------------------

# 30. SECURITY

Never hard-code:

-   API keys;
-   passwords;
-   private tokens;
-   credentials.

Use environment variables when appropriate.

Do not log secrets.

------------------------------------------------------------------------

# 31. PERFORMANCE

Do not optimize prematurely.

Use:

-   `useMemo`;
-   `useCallback`;
-   memoization;
-   virtualization;

only when there is a real performance reason.

Readable code comes first.

------------------------------------------------------------------------

# 32. ERROR HANDLING

Do not silently ignore errors.

Bad:

``` js
try {
  await request();
} catch (error) {}
```

Prefer:

``` js
try {
  await request();
} catch (error) {
  console.error(error);
  setError("Failed to complete request");
}
```

Follow the project's existing error-handling convention.

------------------------------------------------------------------------

# 33. COMMENTS

Comments should explain why something is unusual or necessary.

Avoid comments that simply repeat the code.

Bad:

``` js
// Set loading to true
setLoading(true);
```

Good:

``` js
// Keep the previous data visible while the new request is loading.
```

------------------------------------------------------------------------

# 34. DEBUGGING

When fixing a bug:

1.  understand/reproduce the problem;
2.  identify the actual cause;
3.  make the smallest reliable fix;
4.  avoid unrelated refactoring;
5.  verify the result.

Do not hide symptoms while leaving the cause.

------------------------------------------------------------------------

# 35. REFACTORING

When asked to refactor:

-   preserve behavior unless behavior changes are requested;
-   refactor only the relevant area;
-   improve readability;
-   reduce unnecessary complexity;
-   avoid rewriting the whole application.

A refactor is successful when the code becomes easier to understand and
maintain.

------------------------------------------------------------------------

# 36. NEW FEATURES

Process:

1.  understand the request;
2.  inspect existing implementation;
3.  find a similar existing pattern;
4.  reuse project conventions;
5.  implement the smallest clean solution;
6.  preserve design;
7.  verify;
8.  report what changed.

------------------------------------------------------------------------

# 37. AMBIGUOUS REQUESTS

If a safe interpretation is obvious, proceed.

If different interpretations would materially change behavior, ask a
concise clarification.

Never invent:

-   API endpoints;
-   business rules;
-   data models;
-   requirements.

------------------------------------------------------------------------

# 38. FULL CODING STYLE

The current agreement governs advanced patterns. Preserve existing appropriate usage or use it for a real requested need; this list is not a default architecture:

-   custom hooks;
-   Context;
-   Reducer;
-   reusable components;
-   service/API layers;
-   utility functions;
-   memoization;
-   advanced JavaScript.

But every abstraction must solve a real problem.

Do not use advanced patterns merely to demonstrate knowledge.

------------------------------------------------------------------------

# 39. RECOMMENDED CODING STYLE

Default to:

-   functional components;
-   `useState` for simple state;
-   `useEffect` for external synchronization;
-   Context when requested or already used for shared state;
-   Reducer when requested or already used for related transitions;
-   Axios if already installed;
-   React Router if already installed;
-   MUI if already installed;
-   simple API calls;
-   real backend IDs;
-   readable CRUD handlers;
-   small focused components;
-   minimal abstraction;
-   preserved design.

This is the preferred default.

------------------------------------------------------------------------

# 40. VERIFICATION

After meaningful changes, run the relevant available typecheck/lint/build and exercise the affected behavior. Broaden tests only when failures or changes justify it; Markdown edits do not need a full app suite.

Common examples:

``` bash
npm run lint
npm run build
```

If tests exist:

``` bash
npm test
```

Also check:

-   imports;
-   routes;
-   API calls;
-   runtime errors;
-   console errors;
-   responsive behavior;
-   F5/direct dynamic URLs;
-   user-requested behavior.

Never claim a test passed unless it was actually run.

------------------------------------------------------------------------

# 41. FINAL REVIEW

Before finishing:

### Requirements

-   Did I implement every concrete request?
-   Did I skip anything?

### Existing project

-   Did I preserve working logic?
-   Did I modify unrelated code?

### Code

-   Is it readable?
-   Is it beginner-friendly?
-   Is anything unnecessarily complex?

### UI

-   Did I preserve the design?
-   Did I preserve responsive behavior?

### API

-   Are endpoints correct?
-   Are real IDs used?
-   Are loading/error states appropriate?

### Routing

-   Do dynamic routes work?
-   Does F5 work?

### Quality

-   Any unused imports?
-   Any unnecessary duplication?
-   Does lint/build pass when available?

------------------------------------------------------------------------

# 42. HARD RULES

Never:

1.  Ignore a concrete user requirement.
2.  Rewrite working code without a reason.
3.  Replace project libraries without a reason.
4.  Use array indexes as IDs when real IDs exist.
5.  Break F5/direct dynamic routes.
6.  Add unnecessary dependencies.
7.  Add Tailwind to an MUI project without explicit need.
8.  Create complex architecture for simple features.
9.  Claim tests passed when they were not run.
10. Change UI when the user explicitly requested logic-only changes.

------------------------------------------------------------------------

# 43. DEFAULT DECISION RULE

When there are multiple valid solutions, choose the one that is:

1.  simplest;
2.  easiest to understand;
3.  closest to the existing project;
4.  easiest to maintain;
5.  least destructive.

Final principle:

> Correctness → Simplicity → Readability → Maintainability → Performance

The result should look like it naturally belongs in the existing
project.
