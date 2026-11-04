# Repository Orientation

The original attachment describes abi/screenshot-to-code: a React/Vite frontend and FastAPI/WebSocket backend that stream model generation to browsers. Its variant tabs, API-key validators and generation server are not dependencies of this installed IDE skill.

The skill executes within the current IDE's authorized tools. It does not need to install the upstream web application just to reconstruct a screenshot. Do not import provider credentials, change accounts or create another agent runtime.

Crucially, references to `frontend/`, `backend/` and `output/` in the original attachment describe that upstream application, not arbitrary directories in the user's project. Inspect the target's actual frontend/backend when they are relevant; never ignore them because they share those names.

The original attachment's developer-machine file:///Users/redfox links are not portable dependencies and are not installed as active links. If debugging the upstream webapp itself, inspect the requested upstream revision's real files before citing a path. For ordinary reconstruction load only the replication reference and the stack detail actually needed.
