# Security & Operations Management System

A production-grade operations management platform designed to replace physical paper logbooks and fragmented spreadsheets across Security, Main Gate, Human Resources, and Facility Management. It features live multi-user register entry, dynamic schema validation, automated operational calculations, real-time vehicle & driver trip tracking, employee grace-period management, and automated daily email backups.

---

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [Core Concepts & Business Logic](#2-core-concepts--business-logic)
   - [Dynamic Register Schema Engine](#dynamic-register-schema-engine)
   - [Role-Based Access Control (RBAC) & Entry Windows](#role-based-access-control-rbac--entry-windows)
   - [Automated Calculation Engine](#automated-calculation-engine)
   - [Driver Attendance & Vehicle Dispatch Integration](#driver-attendance--vehicle-dispatch-integration)
   - [Labour Master & 3-Day Soft-Close Grace Period](#labour-master--3-day-soft-close-grace-period)
   - [Key Movement & On-the-Fly Location Master](#key-movement--on-the-fly-location-master)
   - [Camera Breakdown Register](#camera-breakdown-register)
   - [Automated Multi-Tab Excel Backups & Email Dispatch](#automated-multi-tab-excel-backups--email-dispatch)
3. [Folder & File Directory Breakdown](#3-folder--file-directory-breakdown)
   - [Root Directory](#root-directory)
   - [artifacts/api-server (Backend)](#artifactsapi-server-backend)
   - [artifacts/security-operations (Frontend)](#artifactssecurity-operations-frontend)
   - [lib/db (Database & Drizzle ORM)](#libdb-database--drizzle-orm)
   - [lib/api-spec, api-client-react, api-zod (API Toolchain)](#libapi-spec-api-client-react-api-zod-api-toolchain)
   - [scripts/ (Local Server & Utilities)](#scripts-local-server--utilities)
4. [Libraries & Technologies Dictionary](#4-libraries--technologies-dictionary)
5. [Environment Configuration & Variables](#5-environment-configuration--variables)
6. [Commands & Quick Start Guide](#6-commands--quick-start-guide)

---

## 1. System Architecture

The project is structured as a **pnpm monorepo** with strict type safety across full-stack TypeScript:

```mermaid
flowchart TD
    Client["Browser / Tablet / Mobile UI\n(artifacts/security-operations)\nReact 19 + Vite + Tailwind CSS"]
    DevServer["Dev Runner & Network Proxy\n(scripts/dev-local.mjs)\nPort 3000 + Wi-Fi LAN IP"]
    APIServer["Backend REST API\n(artifacts/api-server)\nExpress 5 + Pino Logger\nPort 5000"]
    Database[("PostgreSQL Database\n(lib/db)\nDrizzle ORM")]
    EmailService["Gmail SMTP Server\nNodemailer 6:00 PM Scheduler"]

    Client -->|HTTP / REST API| DevServer
    DevServer -->|Proxy /api| APIServer
    APIServer -->|SQL Queries| Database
    APIServer -->|Nightly Excel Backup| EmailService
```

### Communication Flow
1. **Frontend**: Vite serves the Single Page Application (SPA). During development, `scripts/dev-local.mjs` binds Vite and Express to all network interfaces (`0.0.0.0`) so guards with tablets at the factory gates access the system via local IP (e.g. `http://192.168.1.50:3000`).
2. **API Proxy**: Frontend API calls to `/api/*` are reverse-proxied to Express on port `5000`.
3. **Database Layer**: Built on PostgreSQL using Drizzle ORM. Dynamic operational data is stored in a structured JSONB schema table (`register_records`) alongside indexed metadata (`register_slug`, `record_date`, timestamps).
4. **API Code Generation**: The OpenAPI 3.1 specification generates React Query hooks (`@tanstack/react-query`) and Zod schemas, keeping frontend and backend perfectly synchronized.

---

## 2. Core Concepts & Business Logic

### Dynamic Register Schema Engine
Rather than creating dozens of separate database tables for every register, the platform uses a hybrid relational + JSONB document pattern:
- **`register_records` table**: Contains `id`, `registerSlug`, `recordDate`, `createdAt`, `updatedAt`, `data` (JSONB), and `paymentStatus`.
- **`src/data/registers.ts`**: The single source of truth for register configurations. Defines field types (`text`, `number`, `select`, `date`, `time`, `textarea`), labels, validation rules, required states, and derived formulas.
- **Benefits**: Adding a new register or updating fields requires zero destructive SQL migrations.

### Role-Based Access Control (RBAC) & Entry Windows
Users belong to one of four roles:
1. **`security`**: Gate guards and watchroom personnel. Can enter and view daily operational registers (vehicles, attendance, key movement, gate passes, camera breakdowns). Can only edit records created within the last **3 days**. Future dates are strictly blocked.
2. **`manager`**: Operational supervisors. Can review and edit records created within the last **7 days**.
3. **`hr`**: Human resources. Unrestricted edit windows on attendance, wages, overtime, and payment ledgers.
4. **`admin`**: Full system permissions, user administration, password resets, database backups, and permission overrides.

### Automated Calculation Engine
The backend (`artifacts/api-server/src/routes/operations.ts`) automatically calculates and writes derived values when records are saved:
- **Vehicle Travel Time**: Compares `out_time` and `in_time` to derive total elapsed duration in `Xh Ym`.
- **Transit Duration**: Computes transit times between factory gates (e.g., `out_time_from_unit_1` to `in_time_in_unit_2`).
- **Vehicle Kilometers**: Subtracts `initial_reading` from `final_reading` to populate `total_km_run`.
- **Tubewell & Fork Lifter Meters**: Subtracts initial meter readings from final readings.
- **Overtime Hours**: Compares working shifts against standard hours to calculate positive or negative overtime.

### Driver Attendance & Vehicle Dispatch Integration
The system integrates driver shifts with vehicle movements:
- When dispatching an outgoing vehicle, the driver selection dropdown filters exclusively to **drivers currently logged in** as "Present" in the **Driver Attendance Record** for that date.
- Drivers currently out on another active trip are flagged so double-booking vehicles is prevented.
- When an incoming vehicle logs its return (`in_time`), an option enables **"Also punch out driver from duty upon return"**, automatically updating their driver attendance record.

### Labour Master & 3-Day Soft-Close Grace Period
In the **Training Register (`daily-attendance`)**:
1. **Add New Employee Modal**: In the `labour_name` field, guards can click `+ Add employee` or select `➕ + Add new employee…` from the dropdown. A popup modal gathers:
   - Labour Name (`name`)
   - Father's Name (`father_name`)
   - Working Area (`work_location`)
   - Supervisor Name (`supervisor`)
   The employee is saved directly to `labour-master` and selected immediately.
2. **Close Employee Functionality**: If an employee leaves or stops training, security can click `Close this employee`.
3. **3-Day Retention Policy**:
   - The employee is **never deleted from the database** (all past attendance and payment records remain permanently intact).
   - For **3 days** after closure, the employee appears in a special dropdown group: `Closed Employees (Can unclose within 3 days)` with a `(Closed)` badge.
   - Selecting a closed employee shows an alert strip with an **`Unclose Employee`** button, allowing accidental closures to be reverted with a single click.
   - After 3 days, the employee is automatically hidden from new selection dropdowns.

### Key Movement & On-the-Fly Location Master
In the **Key Movement Register (`key-movement`)**:
- Guards track who takes facility keys, out-time, and return-time.
- The `LOCATION` field provides an inline **`+ Add location`** button and a **`➕ + Add new location…`** dropdown option.
- Guards can enter a new room or area (e.g. *"DG Yard"*, *"Server Room"*, *"Substation 2"*). It checks for duplicates case-insensitively and saves directly into `key-master`.

### Camera Breakdown Register
Located in the Security module (`camera-breakdown`):
- Tracks surveillance camera outages across the premises.
- Standard fields: `date`, `time`, `camera_location` (e.g. *Gate 1 North Pole*, *Foundry Bay 3*), and `issue` (e.g. *No video feed / IR sensor failure*).

### Automated Multi-Tab Excel Backups & Email Dispatch
Configured in `artifacts/api-server/src/routes/admin-data.ts`:
- **Daily Cron Schedule**: Automatically triggers every day at **6:00 PM IST** (`Asia/Kolkata`).
- **Multi-Tab Excel Generation**: Using `exceljs`, the server extracts all registers from the database and compiles them into a single `.xlsx` workbook where **each register gets its own styled spreadsheet tab**.
- **Email Delivery**: Uses `nodemailer` to dispatch the workbook via Gmail SMTP to the designated administrator recipient.
- **Manual Backups**: Admins can also download the workbook on demand from the admin dashboard.

---

## 3. Folder & File Directory Breakdown

```
sec/
├── artifacts/
│   ├── api-server/                     # Backend Express API Server
│   └── security-operations/            # Frontend React Single Page App
├── lib/
│   ├── api-client-react/               # Generated React Query hooks & fetchers
│   ├── api-spec/                       # OpenAPI 3.1 specification & Orval config
│   ├── api-zod/                        # Zod schemas generated from OpenAPI spec
│   └── db/                             # Drizzle ORM schema, migrations & client
├── scripts/                            # Local network launcher & seeder scripts
├── .env                                # Local secrets & environment configuration
├── .env.example                        # Template for environment variables
├── package.json                        # Root monorepo scripts & dependencies
├── pnpm-workspace.yaml                 # Monorepo workspace package definitions
├── tsconfig.json                       # Base TypeScript configuration
└── README.md                           # Documentation
```

### Root Directory

| File | Purpose |
| :--- | :--- |
| **[`package.json`](file:///c:/Users/digital/Desktop/today%201311/sec/package.json)** | Root manifest. Defines workspace-wide scripts (`pnpm run dev`, `build`, `typecheck`, `db:push`) and package manager constraints. |
| **[`pnpm-workspace.yaml`](file:///c:/Users/digital/Desktop/today%201311/sec/pnpm-workspace.yaml)** | Declares workspace packages (`artifacts/*`, `lib/*`, `scripts`) and catalogs unified dependency versions. |
| **[`tsconfig.json`](file:///c:/Users/digital/Desktop/today%201311/sec/tsconfig.json)** | Root TypeScript configuration extended by all packages for uniform compile targets (`ES2022`). |
| **[`.env`](file:///c:/Users/digital/Desktop/today%201311/sec/.env)** | Contains database credentials (`DATABASE_URL`), server port (`PORT=5000`), JWT secret, and Gmail credentials. |
| **[`.env.example`](file:///c:/Users/digital/Desktop/today%201311/sec/.env.example)** | Clean template showing required environment variables for deployment. |

---

### `artifacts/api-server` (Backend)

The Node.js + Express backend service running on port 5000.

| File / Folder | Purpose |
| :--- | :--- |
| **[`src/index.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/src/index.ts)** | HTTP listener entry point. Reads `PORT` from `.env` and binds the server. |
| **[`src/app.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/src/app.ts)** | Express application setup: CORS, cookie parser, Pino request logger, JSON parsers, route mounting, and daily backup initialization. |
| **[`src/build.mjs`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/build.mjs)** | Fast production bundling script using Esbuild. Compiles TypeScript into `dist/index.mjs`. |
| **[`src/data/registers.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/src/data/registers.ts)** | **Central Register Registry**: Defines all 28+ registers, field specifications, data types, required rules, and calculated fields. |
| **[`src/middlewares/authMiddleware.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/src/middlewares/authMiddleware.ts)** | Role-based authentication middleware. Validates session tokens, extracts user roles, and verifies access permissions for security, manager, hr, and admin. |
| **[`src/routes/operations.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/src/routes/operations.ts)** | **Core Engine**: Handles register CRUD operations, field calculations, labour employee creation & 3-day toggle-close, and key location creation. |
| **[`src/routes/auth.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/src/routes/auth.ts)** | Authentication routes: login, session inspection (`/api/auth/me`), password hashing with `scrypt`, and logout. |
| **[`src/routes/admin-data.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/src/routes/admin-data.ts)** | Backup management: ExcelJS workbook generator, email delivery engine via Nodemailer, and daily 6:00 PM cron scheduler. |
| **[`src/routes/breakdowns.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/src/routes/breakdowns.ts)** | Endpoints for maintenance and vehicle breakdown tracking. |
| **[`src/routes/reports-*.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/api-server/src/routes/)** | Specialized reporting endpoints for vehicles, solar panel cleaning, and car breakdowns. |

---

### `artifacts/security-operations` (Frontend)

A React 19 Single Page Application bundled with Vite and styled with Tailwind CSS 4.

| File / Folder | Purpose |
| :--- | :--- |
| **[`vite.config.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/vite.config.ts)** | Vite build configuration with Tailwind CSS plugin and `/api` reverse proxy targeting port 5000. |
| **[`src/pages/registers.tsx`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/src/pages/registers.tsx)** | **Primary Operations Interface**: Renders register data tables, search filters, date selectors, CSV exports, RecordDialog forms, and all action popups (Add Employee, Close Employee, Unclose Employee, Add Key Location). |
| **[`src/pages/dashboard.tsx`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/src/pages/dashboard.tsx)** | Main operational dashboard: Displays real-time counters, active registers, vehicle logs, and quick navigation cards. |
| **[`src/pages/driver-board.tsx`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/src/pages/driver-board.tsx)** | Real-time driver board showing present drivers, active trips on the road, vehicle statuses, and shift logout states. |
| **[`src/pages/hr-center.tsx`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/src/pages/hr-center.tsx)** | HR payment calculations, attendance ledger, wage summaries, overtime rates, and bill generation. |
| **[`src/pages/reports.tsx`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/src/pages/reports.tsx)** | Comprehensive reporting suite for generating printable records and filtered Excel/CSV exports. |
| **[`src/pages/admin-users.tsx`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/src/pages/admin-users.tsx)** | User management portal: Admin creation of users, role assignment, password updates, and register permission matrix. |
| **[`src/components/ops-ui.tsx`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/src/components/ops-ui.tsx)** | Shared operational UI primitives: Page intro headers, status badges, empty states, and standard layout containers. |
| **[`src/lib/date-utils.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/src/lib/date-utils.ts)** | High-precision time and date calculations formatted in Indian Standard Time (IST / `Asia/Kolkata`), date ranges, and time-difference formatters. |
| **[`src/lib/auth.tsx`](file:///c:/Users/digital/Desktop/today%201311/sec/artifacts/security-operations/src/lib/auth.tsx)** | React context and hooks (`useAuth`) providing user session state and role verification throughout the UI. |

---

### `lib/db` (Database & Drizzle ORM)

PostgreSQL schema models, connection pool, and migrations managed with Drizzle ORM.

| File / Folder | Purpose |
| :--- | :--- |
| **[`src/index.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/lib/db/src/index.ts)** | Drizzle database connection instance using `node-postgres` (`pg.Pool`). |
| **[`src/schema/register-records.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/lib/db/src/schema/register-records.ts)** | Main operational data table: stores `registerSlug`, `recordDate`, and the flexible `data` JSONB payload. |
| **[`src/schema/auth.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/lib/db/src/schema/auth.ts)** | User accounts table: `username`, hashed password, role (`admin`, `manager`, `hr`, `security`), and timestamps. |
| **[`src/schema/breakdowns.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/lib/db/src/schema/breakdowns.ts)** | Dedicated schema for equipment and vehicle breakdown events. |
| **[`src/schema/payment-*.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/lib/db/src/schema/)** | HR payment schemas: `payment-bills.ts`, `payment-transactions.ts`, and attendance exclusions. |

---

### `lib/api-spec`, `api-client-react`, `api-zod` (API Toolchain)

- **`lib/api-spec/`**: Houses the formal OpenAPI specification (`openapi.yaml`) describing every endpoint and model, along with **`orval.config.ts`**.
- **`lib/api-client-react/`**: Auto-generated by Orval. Exports TanStack React Query hooks (e.g. `useListRegisterRecords`, `useCreateRegisterRecord`) so frontend components make fully typed API requests without writing manual `fetch` boilerplate.
- **`lib/api-zod/`**: Auto-generated runtime validation schemas using Zod for payload verification.

---

### `scripts/` (Local Server & Utilities)

| File | Purpose |
| :--- | :--- |
| **[`scripts/dev-local.mjs`](file:///c:/Users/digital/Desktop/today%201311/sec/scripts/dev-local.mjs)** | **Essential Dev Launcher**: Detects local network interfaces (Wi-Fi/LAN IP), starts the Express API on port `5000`, launches Vite on port `3000` with network exposure, and outputs connection URLs for mobile and gate tablets. |
| **[`scripts/src/import-payload.ts`](file:///c:/Users/digital/Desktop/today%201311/sec/scripts/src/import-payload.ts)** | Data migration and initial seed utility to import existing register records into the PostgreSQL database. |

---

## 4. Libraries & Technologies Dictionary

| Library / Tool | Category | Why It Is Used in This Project |
| :--- | :--- | :--- |
| **React 19** | Frontend Framework | Powers the reactive Single Page Application with component state, fast rendering, and smooth modal transitions. |
| **Vite 7** | Frontend Bundler | Instant HMR (Hot Module Replacement) and optimized production builds. |
| **Tailwind CSS 4** | Styling | Modern utility-first CSS framework for clean, responsive interfaces (dark mode, grids, flex layouts). |
| **Express 5** | Backend Web Framework | Robust, minimalist HTTP server handling REST routing, middleware pipelines, and API endpoints. |
| **PostgreSQL & `pg`** | Database & Driver | Reliable relational database with JSONB support for fast operational register indexing and storage. |
| **Drizzle ORM** | Data Access Layer | Type-safe SQL query builder and schema management with minimal overhead. |
| **@tanstack/react-query** | State Management | Caches server data on the client, handles background refetching, and manages cache invalidation. |
| **Lucide React** | Icons | Consistent iconography for operational buttons, warnings, status indicators, and modals. |
| **Wouter** | Routing | Ultra-lightweight router for React (under 1.5 KB), replacing bulky React Router packages. |
| **ExcelJS** | File Generation | Creates styled, multi-tab `.xlsx` workbooks for automated daily backups and data exports. |
| **Nodemailer** | Email Delivery | Connects via SMTP (Gmail) to deliver the nightly Excel register backup workbooks. |
| **Pino & Pino-HTTP** | Logging | High-performance JSON logger for recording server events, errors, and request durations. |
| **Zod** | Validation | TypeScript-first schema declaration and data validation for API requests. |
| **Orval** | Code Generator | Automatically compiles the OpenAPI specification into typed React Query hooks and models. |
| **pnpm** | Package Manager | Fast, disk-space-efficient package management with strict workspace isolation. |

---

## 5. Environment Configuration & Variables

All local configuration is stored in the root **`.env`** file:

```env
# Database connection string (PostgreSQL)
DATABASE_URL=postgresql://postgres:password@localhost:5432/security_ops

# Port where Express API listens (Default: 5000)
PORT=5000

# Secret key used for signing JWT session tokens
JWT_SECRET=your_super_secret_jwt_key_here

# Automated Daily Backup Email Settings (Gmail SMTP)
# Requires an App Password generated from your Google Account settings
GMAIL_USER=operations.backup@example.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
BACKUP_NOTIFICATION_EMAIL=admin.security@example.com
```

---

## 6. Commands & Quick Start Guide

### 1. Install Dependencies
Run from the root directory:
```bash
pnpm install
```

### 2. Push Database Schema
Ensure PostgreSQL is running, then push the Drizzle schema:
```bash
pnpm run db:push
```

### 3. Start Development Server
Starts both backend and frontend simultaneously with local network access:
```bash
pnpm run dev
```
- **Local Access**: Open [http://localhost:3000](http://localhost:3000) in your browser.
- **LAN / Tablet Access**: Open `http://<YOUR_IP>:3000` (printed in the terminal) from any phone or tablet on the same Wi-Fi.

### 4. Build for Production
```bash
# Build frontend web assets (outputs to artifacts/security-operations/dist)
pnpm run build:web

# Build backend API server (outputs to artifacts/api-server/dist)
pnpm run build:api

# Run automated test cases
pnpm test

# Run full TypeScript typecheck across all projects
pnpm run typecheck
```

### 5. Start Production Server
```bash
pnpm run start
```
Runs the bundled API server, which serves both the API endpoints and static frontend assets directly.
