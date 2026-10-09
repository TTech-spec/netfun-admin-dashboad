import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// A placeholder client keeps imports working when env vars are missing;
// the app shows a setup screen instead of calling it.
export const supabase = createClient(
  url || "http://localhost:54321",
  anonKey || "missing-anon-key",
  { auth: { storageKey: "netfun-admin-auth" } },
);

/** The NetFun app's address, for "View in app" links (optional). */
export const appUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "");

/** Turns Supabase/Postgres errors into short messages an admin can act on. */
export function friendlyError(err: unknown): string {
  const msg = (err as { message?: string } | null)?.message ?? String(err ?? "");
  if (msg.includes("not_admin")) return "This account isn't a NetFun admin.";
  if (msg.includes("tournament_full"))
    return "The tournament is full. Raise the player limit or reject someone first.";
  if (msg.includes("cannot_moderate_self")) return "You can't ban or block yourself.";
  if (msg.includes("cannot_moderate_admin")) return "Admins can't be banned. Remove them as admin first.";
  if (msg.includes("only_admins_post_official")) return "Only admins can publish official posts.";
  if (msg.includes("tournament_chat"))
    return "Live chat isn't set up yet. Run part-26-tournament-live-chat.sql in Supabase.";
  if (msg.includes("not_community_owner"))
    return "You can only message people who own a community.";
  if (msg.includes("official_messages") || msg.includes("admin_official_threads") || msg.includes("admin_user_birthdates"))
    return "This needs part-28-official-messages-birthdates.sql run in Supabase.";
  if (msg.includes("Invalid login credentials"))
    return "That email and password don't match. No password yet? Use Google or an email link.";
  if (/signups not allowed for otp|user not found/i.test(msg))
    return "No NetFun account uses that email. Sign up in the app first.";
  if (/provider is not enabled/i.test(msg))
    return "Google sign-in isn't turned on in Supabase (Authentication → Providers → Google).";
  if (msg.includes("admin_set_verified") || msg.includes("verified_at") || msg.includes("pinned_until") || msg.includes("headline") || msg.includes("cta_label"))
    return "Run part-11-admin-verified-official.sql from the app repo on Supabase first.";
  if (msg.includes("posts_official_fields_ok"))
    return "Check the title (max 80), button text (max 30) and link (an app page like /chats or https://…).";
  if (msg.includes("Could not find the function") || msg.includes("does not exist"))
    return "The admin SQL hasn't been run on Supabase yet (supabase/admin_tournaments.sql).";
  if (msg.includes("Bucket not found"))
    return "The tournament-banners bucket is missing. Run supabase/admin_tournaments.sql.";
  if (msg.includes("row-level security")) return "You don't have permission to do that.";
  if (msg.includes("Failed to fetch")) return "No connection. Check your internet and try again.";
  return msg || "Something went wrong. Please try again.";
}
