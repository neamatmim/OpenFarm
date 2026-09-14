# OpenFarm

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Self, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Vite+** - Unified Vite toolchain, workspace task runner, linting, and formatting

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/web/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
pnpm run db:push
```

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the fullstack application.

### A farm full of data

To look around the app with three months of a real farm's work in it, seed a database of its own:

```bash
pnpm run db:seed          # builds openfarm_seed next to your database; refuses if it already exists
pnpm run db:seed --reset  # drops it and builds it again (about three minutes)
```

The seed never touches the database in `apps/web/.env`. It creates `openfarm_seed` on the same server (or
`SEED_DATABASE_URL`), migrates it, and runs the farm through the API itself with a clock it walks forward day by day:
a dairy and fattening farm in Savar with 60-odd dairy animals and three lorries of bulls, a written Playbook, milking
and feeding twice a day, heats, services, pregnancy checks and calvings, treatments and withdrawals, vaccination
campaigns, a notifiable disease reported, a death, weigh-ins, sales, milk dispatches, wages and bills, and the
Owner's approvals — with today's work still to do. Run the app against it with the same connection URL and the
database renamed:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/openfarm_seed pnpm run dev
```

Every account shares the password `OpenFarm@2026`:

| Role    | Email                   |
| ------- | ----------------------- |
| Owner   | `owner@openfarm.test`   |
| Manager | `manager@openfarm.test` |
| Vet     | `vet@openfarm.test`     |
| Staff   | `staff@openfarm.test`, `staff2@openfarm.test`, `staff3@openfarm.test` |
| Visiting vet | `visitingvet@openfarm.test` — sees only the lame cow the Manager opened a case on, for a fortnight |

The Shed Phone PINs are `1357`, `2468` and `3690` for the three Staff members.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@OpenFarm/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: pnpm run docker:build
- Start: pnpm run docker:up
- Logs: pnpm run docker:logs
- Stop: pnpm run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

For more details, see the guide on [Deploying with Docker Compose](https://www.better-t-stack.dev/docs/guides/docker).

## Git Hooks and Formatting

- Optional native Vite+ hooks: `pnpm run hooks:setup`
- Docs: [Vite+ commit hooks](https://viteplus.dev/guide/commit-hooks)
- Run checks: `pnpm run check`

## Project Structure

```
OpenFarm/
├── apps/
│   └── web/         # Fullstack application (React + TanStack Start)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:generate`: Generate database client/types
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:seed`: Build `openfarm_seed`, a farm with three months of data (`--reset` to rebuild it)
- `pnpm run db:studio`: Open database studio UI
- `pnpm run check`: Run Vite+ format/lint checks and workspace TypeScript checks
- `pnpm run lint`: Run Vite+ lint checks
- `pnpm run format`: Run Vite+ formatting
- `pnpm run staged`: Run Vite+ checks against staged files
- `pnpm run hooks:setup`: Install Vite+ native Git hooks with `vp config`
- `pnpm run docker:build`: Build the Docker Compose images
- `pnpm run docker:up`: Build and start the Docker Compose stack
- `pnpm run docker:logs`: Tail logs from the Docker Compose stack
- `pnpm run docker:down`: Stop the Docker Compose stack
