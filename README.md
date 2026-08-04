# Holistic Rhythm — Studio App

A class scheduling, membership, and member-portal app for Holistic Rhythm — your own lightweight Momence.

**Stack:** Next.js 14 (App Router) · Postgres + Drizzle ORM · Stripe Checkout · cookie sessions (JWT + bcrypt) · Tailwind CSS.

## What's included

- **Calendar scheduling** — admin creates classes at any studio, with weekly repeat.
- **Packages + Stripe payments** — class packs or unlimited plans; customers pay by card via Stripe Checkout; a webhook activates their membership.
- **Customer database** — every member's contact info, memberships, waiver status, and booking history.
- **Built-in liability waiver** — signed inline during signup; version-tracked; editable by admin.
- **Member portal** — customers create a profile, buy a package, and see *only the classes their package unlocks* (scoped by studio), then book/cancel.
- **Multiple locations** — Frisco, McKinney, Coppell seeded; add more anytime. Packages can be scoped to specific studios or all.

## Two sides of the app

- **Admin console** (`/admin`) — you (Pre). Dashboard, calendar, customers, packages, studios & classes, waiver editor.
- **Member portal** (`/portal`) — your students. Home, schedule, packages, my classes.

Roles are enforced by middleware: admins land in `/admin`, customers in `/portal`.

## Local setup

1. **Install**
   ```bash
   npm install
   ```

2. **Create a Postgres database.** Easiest free option is [Neon](https://neon.tech) or [Supabase](https://supabase.com). Copy the connection string.

3. **Environment.** Copy `.env.example` to `.env` and fill it in:
   ```bash
   cp .env.example .env
   ```
   - `DATABASE_URL` — your Postgres string
   - `AUTH_SECRET` — run `openssl rand -base64 32`
   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — from Stripe (see below)
   - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — your first admin login

4. **Create tables and seed data**
   ```bash
   npm run db:push     # creates the schema
   npm run db:seed     # admin user, studios, a class, waiver, sample packages & classes
   ```

5. **Run**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000. Sign in at `/login` with your seeded admin credentials, or create a customer profile at `/signup`.

## Stripe setup

Payments use dynamic Checkout — you do **not** need to pre-create products in Stripe. The package price is sent at checkout time.

1. Get your **test** secret key from Stripe → Developers → API keys → `STRIPE_SECRET_KEY`.
2. For local webhooks, install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   It prints a `whsec_...` secret → put it in `STRIPE_WEBHOOK_SECRET`.
3. Buy a package in the portal using test card `4242 4242 4242 4242`, any future expiry/CVC. The webhook activates the membership.

In production, add a webhook endpoint in the Stripe dashboard pointing to `https://yourdomain.com/api/webhooks/stripe` and use its signing secret.

## Deploy (Vercel)

1. Push this folder to a GitHub repo.
2. Import it in Vercel.
3. Add a Postgres database (Neon/Supabase/Vercel Postgres) and set all env vars from `.env.example` in Vercel's project settings. Set `NEXT_PUBLIC_BASE_URL` to your production URL.
4. Run `npm run db:push` and `npm run db:seed` against the production database once (locally with the prod `DATABASE_URL`, or via a one-off script).
5. Add the production Stripe webhook endpoint and secret.

## How package → class visibility works

A customer sees a class on their schedule only if:
1. they have an **active** membership (not expired), **and**
2. the class's studio is included in their package (a package with no studios attached = all studios).

Booking consumes one credit unless the package is unlimited; canceling refunds the credit.

## Notes & next steps

- Sessions use a signed httpOnly cookie — solid for a single-studio business. If you later want social login or password resets, swap in Auth.js or Clerk.
- Memberships don't auto-expire in the background; they're treated as expired once `endsAt` passes. Add a scheduled job later if you want status flipped to `expired` on a timer.
- This is a real, deployable v1 foundation, not a full Momence replacement — extend it as you go (recurring rules, waitlists, instructor logins, email reminders — which you already have via your Apps Script setup).
