# Workspace Booking

A full-stack app for booking meeting rooms and desks. Employees search for free rooms and desks in a time window, book one, and manage their bookings. Admins manage resources, bookings and users. Double bookings are prevented on the server, even when two people book at the same moment.

**Live demo:** [Desk Booking Application](https://salmon-plant-05427e20f.3.azurestaticapps.net)

> The API runs on Azure Container Apps. If the first request is slow, the app is waking up.

**Demo account** (the data is disposable, so this is public on purpose):

| Role | Email | Password |
|---|---|---|
| Employee | `employee@example.com` | `Employee123!` |

New accounts you register are always employees. Admin access is granted by an existing admin (Admin, then Users, then Make admin). Reviewers who want to see the admin screens can ask for it.

## Features

**Everyone (logged in)**
- Register and log in (email and password, JWT), with a live password checklist on the register form
- **Forgot password:** a single-use reset link, valid for 15 minutes, sent by email. Resending is limited to once every 2 minutes per address, with a countdown on the button, and a new link invalidates the old one
- **Session handling:** logout after 30 minutes of inactivity, automatic logout when the token expires, and logging out in one tab logs out the others
- Search for rooms and desks that are free in a time window, filtered by type. Past dates and times are greyed out
- Book from the results, using a pop-up dialog for the booking title
- **Timeline:** one row per resource across 24 hours, a dotted "now" line, your own bookings in blue and others in grey. Booking titles are visible only for your own bookings (admins see all)
- My bookings, split into upcoming and past. Completed bookings cannot be cancelled
- **One office timezone everywhere** (Eastern Time, labelled in the UI), so the form, the timeline, the lists and the stored bookings always agree, whatever the browser's timezone is
- Toast messages, loading states, and a layout that works on phones

**Admins**
- **Resources:** add, edit capacity, deactivate and reactivate (deactivating cancels the resource's future bookings in one transaction), with sorting and filters
- **Bookings:** every booking with who made it, filter by type, upcoming or past, and user, sort, page, and cancel any of them
- **Users:** list users, promote or demote, deactivate and reactivate (deactivating cancels the user's future bookings)
- **Safeguards:** admins cannot change their own account, the last active admin cannot be removed, protected demo accounts cannot be modified, and user changes are serialised with a database advisory lock

**Booking rules** (enforced by the API)
- Any day and any time
- The start must be in the future
- At most 4 hours per booking
- No overlap with another confirmed booking for the same resource

**Password rules** (new passwords and resets): at least 8 characters, one capital letter, one special character. Login never checks these, so older accounts keep working.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Luxon (no UI library, plain CSS) |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16, Prisma ORM (v6) |
| Auth | JWT in the `Authorization` header, bcrypt password hashing |
| Email | Azure Communication Services Email (password reset) |
| Tests | Vitest and Supertest (38 backend tests, including concurrent-booking tests) |
| CI | GitHub Actions: typecheck, tests against a real Postgres container, lint, build |
| Hosting | Azure Static Web Apps (site), Azure Container Apps (API), Azure Database for PostgreSQL Flexible Server |
| Images | Docker, published to GitHub Container Registry |

## Architecture

```mermaid
flowchart LR
    U[Browser] -->|loads site| SWA[Azure Static Web Apps<br/>React app]
    U -->|HTTPS + JWT| API[Azure Container Apps<br/>Express API]
    API --> DB[(Azure PostgreSQL)]
    API -->|reset emails| ACS[Azure Communication Services Email]
    GH[GitHub Actions] -->|build + deploy| SWA
    GH -->|build image| GHCR[GitHub Container Registry]
    GHCR -->|pulled by| API
```

The API follows one pattern throughout: **route** (HTTP, input checks), then **service** (business rules), then **Prisma** (database). A single error handler turns known errors into JSON responses and hides internals for unexpected ones.

### How double booking is prevented

Creating a booking runs in one database transaction:

1. Lock the resource's row (`SELECT ... FOR UPDATE`), so simultaneous requests for the same resource queue up.
2. Check for a confirmed booking that overlaps the requested time.
3. If there is one, return `409 Conflict`. Otherwise insert the booking and commit.

A test fires two bookings for the same slot at the same time and expects exactly one `201` and one `409`. A load script repeats this at larger scale (see Performance).

### How time is handled

- All times are stored in UTC (`timestamptz`).
- The API has one `OFFICE_TIMEZONE` (default `America/New_York`) and exposes it at `GET /config`. The web app loads it once and uses it for every date picker, label, timeline and list.
- The browser's own timezone is never used for booking times. Luxon converts between office time and UTC at the edges.

### How password reset works

1. `POST /auth/forgot` always answers the same way, whether or not the email exists, so accounts can't be discovered. If the account exists, a random token is created and emailed as a link.
2. Only the **SHA-256 hash** of the token is stored. The token is single-use, expires after 15 minutes, and requesting a new one invalidates older ones.
3. A 2-minute cooldown per email stops repeat requests. The API returns `retryAfterSeconds`, which drives the countdown in the form.
4. The link opens a reset form. The token is checked first (`/auth/reset/check`), then the new password is saved (`/auth/reset`).
5. Without Azure settings (local development), the email is printed to the API console instead.

### Data model

| Table | Purpose |
|---|---|
| `users` | Accounts: name, unique email, bcrypt hash, role (`employee` or `admin`), active flag |
| `resources` | Rooms and desks: unique name, type, capacity, description, active flag |
| `bookings` | Reservations: resource, user, title, start and end (UTC), status (`confirmed` or `cancelled`), cancelled time |
| `password_reset_tokens` | Reset requests: user, token hash, expiry, used time |

## API

All endpoints except `/health`, `/config` and the public `/auth/*` ones need `Authorization: Bearer <token>`.

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /health` | Public | Liveness check |
| `GET /config` | Public | Office timezone |
| `POST /auth/register` | Public | Create an employee account (`400` weak password, `409` email taken) |
| `POST /auth/login` | Public | Returns user and token |
| `GET /auth/me` | Logged in | Current user |
| `POST /auth/forgot` | Public | Send a reset link (same answer for unknown emails, `429` during cooldown) |
| `POST /auth/reset/check` | Public | Is this reset token still valid |
| `POST /auth/reset` | Public | Set a new password with a valid token |
| `GET /resources` | Logged in | Active resources (admins can add `?includeInactive=true`) |
| `POST /resources` | Admin | Create a resource |
| `PATCH /resources/:id` | Admin | Edit name, type, capacity, description |
| `POST /resources/:id/active` | Admin | Activate or deactivate (deactivating cancels future bookings) |
| `GET /availability/search` | Logged in | Free resources for `start` and `end`, optional `type` and `minCapacity` |
| `GET /availability/timeline` | Logged in | Every active resource with its confirmed bookings in a window (titles only for your own bookings, or all for admins) |
| `POST /bookings` | Logged in | Create a booking (`201`, `409` conflict, `422` rule broken) |
| `GET /bookings/mine` | Logged in | Your bookings |
| `POST /bookings/:id/cancel` | Owner or admin | Cancel a booking (`422` if it already ended) |
| `GET /bookings` | Admin | All bookings; query `type`, `when`, `userId`, `sort`, `limit`, `offset`; returns `{ items, total }` |
| `GET /users` | Admin | List users |
| `PATCH /users/:id` | Admin | Change role |
| `POST /users/:id/active` | Admin | Activate or deactivate a user |

Errors share one shape: `{ "error": { "code": "...", "message": "..." } }`. An employee asking for someone else's booking gets `404`, not `403`, so ids can't be probed.

## Performance

Measured locally (API and Postgres on one laptop, so treat these as relative numbers, not production claims):

- **Concurrency:** 800 simultaneous booking requests across 15 rounds, all aimed at the same slot. Every round created exactly one booking and returned `409` for the rest, with no unexpected statuses. The script is `loadtest/concurrency-test.mjs`.
- **Read speed:** with 12,000 bookings in the table, the availability search handled about 920 requests per second at 50 connections, with a 52 ms median and 70 ms p99 latency.

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
npx prisma db seed          # creates the demo users and resources
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
| `APP_URL` | `http://localhost:5173` | Base URL used in reset links (falls back to `CORS_ORIGIN`) |
| `OFFICE_TIMEZONE` | `America/New_York` | The timezone used for all booking times |
| `MAX_BOOKING_MINUTES` | `240` | Longest booking |
| `ACS_CONNECTION_STRING` | from Azure | Sends real email. Leave empty locally to print emails to the console |
| `EMAIL_FROM` | `DoNotReply@<your-domain>` | Sender address for reset emails |
| `PROTECTED_EMAILS` | `admin@example.com,employee@example.com` | Accounts admins can't modify |

The web app reads `VITE_API_URL` (set in `apps/web/.env.production` for production builds) and falls back to `http://localhost:3000`.

## Project layout

```
apps/
  api/        Express API, Prisma schema, migrations, seed, tests, Dockerfile
  web/        React app
loadtest/              Concurrency test script
docker-compose.yml     Local Postgres
.github/workflows/     CI, image publishing, Static Web Apps deploy
```

## CI/CD and deployment

- **CI** (`ci.yml`, every pull request and push to `main`): the API job starts a throwaway Postgres, installs, generates the Prisma client, typechecks, migrates, seeds, and runs the tests. The web job installs, lints, and builds.
- **Image** (`docker.yml`, on push to `main`): builds the API image and pushes it to GitHub Container Registry, tagged `latest` and with the commit id.
- **Website**: Azure Static Web Apps rebuilds and redeploys `apps/web` on every push to `main`.
- **API**: the Container App is updated by pointing it at the new image tag. This is a manual step; automatic API deployment is a listed upgrade.
- **Database**: migrations are applied with `prisma migrate deploy`, run from a developer machine against the Azure database. Migrations are append-only.
- **Secrets**: the database URL, JWT secret and email connection string are stored as Container Apps secrets, not in the repo.

## Design decisions and trade-offs

- **One office timezone instead of per-user timezones.** Everyone sees the same times as the office, which removes a whole class of confusion. The cost is that remote users do their own conversion.
- **Single JWT, no refresh tokens.** Simpler, but a stolen token works until it expires (8 hours). The 30-minute idle logout limits exposure on shared machines.
- **Token in `localStorage`.** Simple, but exposed to cross-site scripting. HttpOnly cookies would be safer, at the price of more setup across two domains.
- **User loaded from the database on every request.** One extra query, but deactivating a user or changing a role takes effect immediately.
- **Reset tokens stored as hashes.** A database leak doesn't hand out working reset links.
- **Password rules checked on the server and shown in the form.** The form only helps the user. The API is what enforces them.
- **Employees can't self-register as admins.** Admins are promoted by other admins.
- **Prisma pinned to v6.**
- **Past bookings are kept.** They stay as history and never block new bookings.

## Known limitations

- Azure Communication Services Email with a managed domain has low sending limits (about 5 per minute and 10 per hour) and such mail can land in spam. The managed domain is also scheduled to retire in September 2028, after which a custom domain is needed.
- No per-IP rate limiting (only the per-email reset cooldown).
- No audit log of admin actions.
- The users list is capped at 50 rows.
- Some malformed ids return `500` instead of `400`.

## Ideas for next steps

- Automatic API deployment from GitHub Actions
- A custom email domain and per-IP rate limiting
- An audit log for admin actions
- HttpOnly cookie sessions or refresh tokens
- Zod validation shared between API and web
- Recurring bookings, email reminders, and a utilization report
- Editing a booking
