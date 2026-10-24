# Workspace Booking

A full-stack app for booking meeting rooms and desks. Employees search for free rooms and desks in a time window, book one, and manage their bookings. Admins manage the resources and see every booking. Double bookings are prevented on the server, even when two people book at the same moment.

**Live demo:** https://salmon-plant-05427e20f.3.azurestaticapps.net

> The API sleeps when idle (Azure Container Apps scales to zero), so the first request after a quiet period can take 10 to 30 seconds.

**Demo accounts** (the data is disposable, so these are public on purpose):

| Role | Email | Password |
|---|---|---|
| Employee | `employee@example.com` | `Employee123!` |
| Admin | `admin@example.com` | `Admin123!` |

New accounts you register are always employees.

## Features

**Everyone (logged in)**
- Register and log in (email and password, JWT)
- Search for rooms and desks free in a time window, filtered by type
- Book from the results, with a pop-up dialog asking for the title
- Day timeline: one row per resource, bars for booked time (blue for yours, grey for others)
- My bookings, split into upcoming and past, with cancel
- Toast messages, loading states, and a layout that works on phones

**Admins**
- Add resources, edit capacity, deactivate and reactivate (deactivating cancels the resource's future bookings in one transaction)
- See every booking with who made it, and cancel any of them

**Booking rules** (enforced by the API)
- Monday to Friday, 9:00 to 18:00, office timezone (America/New_York)
- Starts and ends on the same day, at most 4 hours, and starts in the future
- No overlap with another confirmed booking for the same resource

**Password rules** (new accounts): at least 8 characters, one capital letter, one special character.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React, TypeScript, Vite (no UI library) |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16, Prisma ORM (v6) |
| Auth | JWT in the `Authorization` header, bcrypt password hashing |
| Tests | Vitest and Supertest (12 backend tests, including a concurrent-booking test) |
| CI | GitHub Actions: typecheck, tests against a real Postgres container, lint, build |
| Hosting | Azure Static Web Apps (site), Azure Container Apps (API), Azure Database for PostgreSQL Flexible Server |
| Images | Docker, published to GitHub Container Registry |

## Architecture

```mermaid
flowchart LR
    U[Browser] -->|loads site| SWA[Azure Static Web Apps<br/>React app]
    U -->|HTTPS + JWT| API[Azure Container Apps<br/>Express API]
    API --> DB[(Azure PostgreSQL)]
    GH[GitHub Actions] -->|build + deploy| SWA
    GH -->|build image| GHCR[GitHub Container Registry]
    GHCR -->|pulled by| API
```

The API follows one pattern throughout: **route** (HTTP, input checks) then **service** (business rules) then **Prisma** (database). A single error handler turns known errors into JSON responses and hides internals for unexpected ones.

### How double booking is prevented

Creating a booking runs in one database transaction:

1. Lock the resource's row (`SELECT ... FOR UPDATE`), so simultaneous requests for the same resource queue up.
2. Check for a confirmed booking that overlaps the requested time.
3. If there is one, return `409 Conflict`. Otherwise insert the booking and commit.

A test fires two bookings for the same slot at the same time and expects exactly one `201` and one `409`.

### Data model

| Table | Purpose |
|---|---|
| `users` | Accounts: name, unique email, bcrypt hash, role (`employee` or `admin`), active flag |
| `resources` | Rooms and desks: unique name, type, floor, capacity, active flag |
| `bookings` | Reservations: resource, user, title, start and end (UTC), status (`confirmed` or `cancelled`) |

All times are stored in UTC (`timestamptz`) and shown in the office timezone.

## API

All endpoints except `/health` and `/auth/register|login` need `Authorization: Bearer <token>`.

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /health` | Public | Liveness check |
| `POST /auth/register` | Public | Create an employee account, returns user and token |
| `POST /auth/login` | Public | Returns user and token |
| `GET /auth/me` | Logged in | Current user |
| `GET /resources` | Logged in | Active resources (admins can add `?includeInactive=true`) |
| `POST /resources` | Admin | Create a resource |
| `PATCH /resources/:id` | Admin | Edit name, type, floor, capacity, description |
| `POST /resources/:id/active` | Admin | Activate or deactivate (deactivating cancels future bookings) |
| `GET /availability/search` | Logged in | Free resources for `start` and `end`, optional `type` and `minCapacity` |
| `GET /availability/timeline` | Logged in | Every active resource with its confirmed bookings in a window |
| `POST /bookings` | Logged in | Create a booking (`201`, `409` conflict, `422` rule broken) |
| `GET /bookings/mine` | Logged in | Your bookings |
| `POST /bookings/:id/cancel` | Owner or admin | Cancel a booking |
| `GET /bookings` | Admin | All bookings |

Errors share one shape: `{ "error": { "code": "...", "message": "..." } }`. An employee asking for someone else's booking gets `404`, not `403`, so ids can't be probed.

## Run it locally

You need Node.js 20 or newer, Docker Desktop, and Git.

```bash
# 1. Database
docker compose up -d

# 2. API
cd apps/api
npm install
cp .env.example .env        # then set JWT_SECRET to a long random string
npx prisma migrate deploy
npx prisma db seed          # creates the two demo users and five resources
npm run dev                 # http://localhost:3000

# 3. Web app (in a second terminal)
cd apps/web
npm install
npm run dev                 # http://localhost:5173
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

**Tests** (need the database running and seeded):

```bash
cd apps/api
npm test
```

### Environment variables (`apps/api/.env`)

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/bookings` | Postgres connection |
| `PORT` | `3000` | API port |
| `JWT_SECRET` | long random string | Signs login tokens |
| `JWT_EXPIRES_IN` | `8h` | Token lifetime |
| `CORS_ORIGIN` | `http://localhost:5173` | The one site allowed to call the API from a browser |
| `OFFICE_TIMEZONE` | `America/New_York` | Timezone for opening hours |
| `OPEN_HOUR` / `CLOSE_HOUR` | `9` / `18` | Opening hours |
| `MAX_BOOKING_MINUTES` | `240` | Longest booking |

The web app reads `VITE_API_URL` (set in `apps/web/.env.production` for production builds) and falls back to `http://localhost:3000`.

## Project layout

```
apps/
  api/        Express API, Prisma schema, migrations, seed, tests, Dockerfile
  web/        React app
docker-compose.yml     Local Postgres
.github/workflows/     CI, image publishing, Static Web Apps deploy
```

## CI/CD and deployment

- **CI** (`ci.yml`, every pull request and push to `main`): the API job starts a throwaway Postgres, installs, generates the Prisma client, typechecks, migrates, seeds, and runs the tests. The web job installs, lints, and builds.
- **Image** (`docker.yml`, on push to `main`): builds the API image and pushes it to GitHub Container Registry, tagged `latest` and with the commit id.
- **Website**: Azure Static Web Apps rebuilds and redeploys `apps/web` on every push to `main`.
- **API**: the Container App is updated by pointing it at the new image tag. This is a manual step; automatic API deployment is a listed upgrade.
- **Database**: migrations are applied with `prisma migrate deploy`, run from a developer machine against the Azure database.
- **Secrets**: the database URL and JWT secret are stored as Container Apps secrets, not in the repo.

## Design decisions and trade-offs

- **Locking instead of a database constraint.** The first design used a Postgres exclusion constraint (needs the `btree_gist` extension). I switched to a transaction with a row lock, to avoid extensions and keep the rule easy to explain. The cost is that the rule lives in application code, so a manual SQL insert could bypass it. The concurrency test covers the application path. The early constraint migration is still in the history, followed by the one that removes it, because applied migrations are never rewritten.
- **Single JWT, no refresh tokens.** Simpler, but a stolen token works until it expires (8 hours).
- **Token in `localStorage`.** Simple, but exposed to cross-site scripting. HttpOnly cookies would be safer, at the price of more setup across two domains.
- **User loaded from the database on every request.** One extra query, but deactivating a user or changing a role takes effect immediately.
- **Hand-written validation, no Zod.** Fewer concepts for a first project.
- **Employees can't self-register as admins.** Admins are created by seed or by a database update.
- **Prisma pinned to v6**, because v7 changed how configuration works.
- **Past bookings are kept.** They stay as history and never block new bookings.

## Known limitations

- Times are entered in the browser's timezone and shown in New York time, which assumes the user is in the office timezone.
- The booking rules text in the UI is typed in, so it must be updated by hand if the server settings change.
- No password reset, email notifications, or admin screen for managing users.
- A malformed (non-UUID) id in a URL returns a generic `500` instead of a `400`.
- No automated frontend tests.
- The API's first request after idle is slow (scale to zero).

## Ideas for next steps

- Automatic API deployment from GitHub Actions
- Forgot password with an email provider
- HttpOnly cookie sessions or refresh tokens
- Zod validation shared between API and web
- Recurring bookings, email reminders, and a utilization report
- Frontend tests (Playwright)
