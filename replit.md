# Security Operations Management

An operations workspace that replaces the Security and Main Gate Security workbooks with searchable, structured registers and automatic operational calculations.

## Run & Operate

- After importing the zip, run `pnpm install --frozen-lockfile` once from the project root. This restores every workspace package from `pnpm-lock.yaml`; without it, the workflows fail with `vite: not found` or `Cannot find package 'esbuild'`.
- The Replit preview should use the managed workflows: `artifacts/api-server: API Server` and `artifacts/security-operations: web`. Restart those workflows after code changes.
- Manual API command: `PORT=5000 pnpm --filter @workspace/api-server run dev` (requires the workspace `DATABASE_URL` environment variable).
- Manual frontend build command: `PORT=20169 BASE_PATH=/ pnpm --filter @workspace/security-operations run build`.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required Replit Secrets for email backups: `GMAIL_USER` and `GMAIL_APP_PASSWORD`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/security-operations/` — the deployable React/Vite operations workspace.
- `artifacts/api-server/src/routes/operations.ts` — dashboard, activity, register metadata, and register CRUD routes.
- `artifacts/api-server/src/data/registers.ts` — the two modules, 22 submodules, field definitions, and starter records.
- `lib/api-spec/openapi.yaml` — the source of truth for generated API hooks and validation schemas.
- `lib/db/src/schema/register-records.ts` — the shared JSON-backed register record table.
- `artifacts/security-operations/src/pages/` — dashboard, register library/detail, and settings surfaces.
- `artifacts/security-operations/src/pages/hr-center.tsx` — People & Pay command center for payroll health, control checks, and next actions.

## Architecture decisions

- The two workbook concepts are modeled as `security` and `main-gate` modules, with each worksheet represented as a register definition.
- Register records use a shared PostgreSQL table with JSON data because the workbook tabs have different fields but identical operational CRUD needs.
- Register field definitions are the source for forms and tables; derived values such as water usage, durations, and vehicle kilometres are calculated on the server.
- The first build uses a small set of representative starter records so the dashboard and register flows are useful immediately without silently importing every historical row.

## Product

- The entry experience intentionally shows only the two top-level module choices; users choose a module before seeing its register library.
- Module libraries open as full-screen restricted workspaces, and register detail pages keep navigation limited to the selected module.
- Dashboard for both modules with totals, recent activity, attention items, and register counts.
- People & Pay command center with period controls, payroll health, audit checks, exception visibility, and direct links into the payment queue and ledgers.
- Searchable module libraries for all Security Operations and Main Gate Security registers.
- Register-level add, edit, delete, date filtering, free-text search, CSV export, and print support.
- Admin data tools support one-CSV imports across all registers and daily multi-tab workbook backups at 6:00 PM Asia/Kolkata to an admin-configured email.
- Server-side automatic calculations for meter usage, travel time, attendance duration, and vehicle kilometres.

## User preferences

The user wants the two uploaded workbooks treated as the primary modules and their worksheets treated as submodules.

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run Orval code generation before consuming new hooks.
- The generated Zod barrel can produce a duplicate export for endpoint parameter schemas; keep the barrel exporting `generated/api` only when that collision occurs.
- Driver schedule backups may leave `FETCHED PHONE` and `Print Batch` blank; those fields are intentionally optional during workbook import.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
