# NetFun Admin Dashboard

The admin dashboard for [NetFun](https://github.com/TTech-spec/netfunwaitlist-web-app).
It signs in to the **same Supabase project** as the app, so anything you do here shows up
in the app right away.

What you can do:

- **Feed posts** – publish official posts (text + photo) that appear on everyone's home
  feed with a verified badge. Optionally link a tournament (adds a "View tournament"
  button). Moderate: delete any post, ban its author.
- **Tournaments** – host a game tournament with a **banner image**, game, format, prize,
  start time, registration deadline, player limit and a list of **entry criteria**, plus a
  question players answer when they apply. Publish it (optionally announcing it on the home
  feed), then **accept or reject** each applicant. Players get a notification either way.
  Move the tournament through Open → Registration closed → Live → Completed, or cancel it.
- **Users** – search everyone (name, username or email) and
  - **Block from tournaments**: they keep using NetFun but can't apply to any tournament;
    their open applications are rejected.
  - **Ban from NetFun**: signed out everywhere, can't sign in, post, comment, message or apply.
  Both can be undone.

## Setup

1. **Database.** In the Supabase SQL editor of the NetFun project, run
   [`supabase/admin_tournaments.sql`](supabase/admin_tournaments.sql) as a new query
   (the same file is `supabase/migrations/20260927120000_admin_tournaments.sql` in the app
   repo). It's safe to run again.
2. **Make yourself an admin.** Sign up in the NetFun app if you haven't, then run
   (with your login email):

   ```sql
   insert into public.app_admins (user_id)
   select id from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```

   Only people in `app_admins` can use the dashboard; the database checks this on every
   action, not just the UI.
3. **Env.** Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Project Settings → API — the **anon** key, never the
   service_role key). Optionally `VITE_APP_URL` for "View in app" links.
4. **Run.** `npm install`, then `npm run dev`. Build with `npm run build`.
5. **Deploy.** Import the repo in Vercel (framework: Vite), add the same env variables,
   deploy. `vercel.json` already handles page routing.

## Stack

Vite + React + TypeScript, Tailwind CSS v4 (NetFun colours), TanStack Query,
React Router, Supabase JS.
