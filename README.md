# Security Operations Management

An operations workspace that replaces the Security and Main Gate Security workbooks with searchable, structured registers and automatic operational calculations.

## Quick Start

1. **Environment Setup**
   Copy `.env.example` to `.env` (or configure your database and email):
   ```env
   DATABASE_URL=postgresql://...
   PORT=5000
   GMAIL_USER=...
   GMAIL_APP_PASSWORD=...
   ```

2. **Run the Full Project**
   Start both the backend API and frontend web workspace together with a single command:
   ```bash
   pnpm run dev
   ```
   - **Frontend UI**: [http://localhost:3000](http://localhost:3000)
   - **Backend API**: [http://localhost:5000](http://localhost:5000) (requests from `/api` are automatically proxied to the backend)

   *Or run them in separate terminals if preferred:*
   - Backend API: `pnpm run dev:api`
   - Frontend Web: `pnpm run dev:web`

3. **Build & Typecheck**
   - Run full typecheck across all packages:
     ```bash
     pnpm run typecheck
     ```
   - Build all packages:
     ```bash
     pnpm run build
     ```
   - Push database schema:
     ```bash
     pnpm run db:push
     ```

## Project Structure

```
├── artifacts/
│   ├── api-server/            # Express 5 backend server
│   │   ├── src/routes/        # Auth, Dashboard, Registers CRUD, Admin Data & Backups
│   │   └── src/data/          # Register definitions & calculated fields
│   └── security-operations/   # Vite + React single-page operations application
│       ├── src/pages/         # Code-split views (HR Center, Registers, Dashboard, etc.)
│       └── src/components/    # Shared UI components
├── lib/
│   ├── api-client-react/      # Generated React Query hooks & fetch client
│   ├── api-spec/              # OpenAPI specification & code-generation config
│   ├── api-zod/               # Zod validation schemas
│   └── db/                    # Drizzle ORM schema, migrations & PostgreSQL client
└── scripts/                   # Workspace helper scripts
```

## Features

- **Authentication & RBAC**: Roles for `admin`, `manager`, `hr`, and `security` with fine-grained register access controls.
- **Operational Registers**: Fast searchable tables, inline date filtering, multi-field CRUD, CSV export, and print formatting.
- **HR Center**: Period controls, wage calculations, overtime tracking, attendance ledger, and payment bill generation.
- **Automated Calculations**: Server-side derivation of duration, vehicle km, meter usage, and attendance allowances.
- **Daily Backups**: Multi-tab Excel workbook backups generated daily at 6:00 PM (Asia/Kolkata) with email dispatch.
- **Performance Optimized**: Sub-second queries with database indexes, server-side aggregation, and client-side route code-splitting.

