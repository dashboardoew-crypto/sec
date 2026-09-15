---
name: API Zod generation
description: Non-obvious Orval export behavior for parameterized endpoints in this workspace.
---

Parameterized endpoints can cause Orval to emit the same `*Params` type through both `generated/api` and `generated/types`. If the generated barrel re-exports both, the shared library typecheck fails with a duplicate export. Keep the public `lib/api-zod/src/index.ts` barrel focused on `generated/api` when this happens.

**Why:** The generated client still has the request and response types it needs, while the duplicate type export prevents the entire workspace from compiling.

**How to apply:** After changing the OpenAPI contract, run Orval, inspect the generated barrel, and preserve the narrow barrel export if the collision returns.