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
- **Communities** – verify member-made communities. Verified ones get a purple
  **Verified** tag in the app and their posts show on everyone's Home feed; unverified ones
  only show inside the community.
- Official posts can also have a **title** (big banner in the app), a **button** (opens an
  app page like `/chats` or any https:// link) and a **pin** to the top of Home for 1, 3 or
  7 days.
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
   Then run `supabase/setup/part-11-admin-verified-official.sql` from the **app** repo
   (verified communities, post titles, buttons and pins). The two files work in either order.
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
4. **Sign-in links.** There's no separate admin password: you sign in with your NetFun
   account using Google, an emailed sign-in link, or your NetFun password. For the Google
   and email-link options to come back to the dashboard, add the dashboard's address
   (e.g. `https://your-admin.vercel.app` and `http://localhost:5173`) under Supabase
   **Authentication → URL Configuration → Redirect URLs**.
5. **Run.** `npm install`, then `npm run dev`. Build with `npm run build`.
6. **Deploy.** Import the repo in Vercel (framework: Vite), add the same env variables,
   deploy. `vercel.json` already handles page routing.

## Stack

Vite + React + TypeScript, Tailwind CSS v4 (NetFun colours), TanStack Query,
React Router, Supabase JS.
