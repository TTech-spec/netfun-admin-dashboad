import { appUrl, supabase } from "./supabase";
import type {
  AdminStats,
  TournamentInvite,
  ChatMessage,
  OfficialMessage,
  OfficialThread,
  Profile,
  AdminUser,
  Community,
  EntryStatus,
  Post,
  ReviewCommunity,
  Tournament,
  TournamentEntry,
  TournamentStatus,
  TournamentWithCounts,
} from "./types";

// Every helper throws on error so react-query can surface it.
function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

function fileExt(file: File | Blob, fallback = "jpg") {
  const name = file instanceof File ? file.name : "";
  return name.split(".").pop()?.toLowerCase() || file.type.split("/")[1] || fallback;
}

// ─── Admin check & stats ──────────────────────────────────────────────────

export async function amIAdmin(): Promise<boolean> {
  const res = await supabase.rpc("is_admin");
  if (res.error) throw res.error;
  return res.data === true;
}

export async function getStats(): Promise<AdminStats> {
  return check(await supabase.rpc("admin_stats")) as AdminStats;
}

// ─── Posts (home feed) ────────────────────────────────────────────────────

const POST_SELECT =
  "*, author:profiles!posts_author_id_fkey(id,username,full_name,university,avatar_color,banned_at), community:communities(slug,name), post_likes(count), post_comments(count)";

type RawPost = Omit<Post, "like_count" | "comment_count"> & {
  post_likes: { count: number }[];
  post_comments: { count: number }[];
};

export async function listPosts(opts: { officialOnly?: boolean; limit?: number } = {}) {
  let q = supabase
    .from("posts")
    .select(POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.officialOnly) q = q.eq("is_official", true);
  const rows = check(await q) as unknown as RawPost[];
  return rows.map(({ post_likes, post_comments, ...r }) => ({
    ...r,
    like_count: post_likes?.[0]?.count ?? 0,
    comment_count: post_comments?.[0]?.count ?? 0,
  })) as Post[];
}

export function postImageUrl(path: string): string {
  // Photos posted from the app go to Cloudinary and are stored as full URLs.
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
}

async function uploadPostImage(me: string, image: File | Blob): Promise<string> {
  const path = `${me}/${crypto.randomUUID()}.${fileExt(image)}`;
  check(
    await supabase.storage
      .from("post-images")
      .upload(path, image, { contentType: image.type || "image/jpeg" }),
  );
  return path;
}

/** Publishes an official NetFun post; it shows on everyone's home feed. */
export async function createOfficialPost(input: {
  body: string;
  image?: File | Blob | null;
  communityId?: string | null;
  tournamentId?: string | null;
  /** Big title on the post's banner. */
  headline?: string;
  /** A button under the post: label + an app page ("/chats") or https:// link. */
  cta?: { label: string; url: string } | null;
  /** Pin to the top of everyone's Home for this many days. */
  pinDays?: number;
}) {
  const me = await requireUserId();
  const image_path = input.image ? await uploadPostImage(me, input.image) : null;
  check(
    await supabase.from("posts").insert({
      author_id: me,
      body: input.body,
      kind: image_path ? "photo" : "text",
      community_id: input.communityId ?? null,
      visibility: "everyone",
      is_official: true,
      tournament_id: input.tournamentId ?? null,
      image_path,
      // Only sent when used, so plain posts still work before part-11 is run.
      ...(input.headline?.trim() ? { headline: input.headline.trim() } : {}),
      ...(input.cta ? { cta_label: input.cta.label.trim(), cta_url: input.cta.url.trim() } : {}),
      ...(input.pinDays ? { pinned_until: pinUntil(input.pinDays) } : {}),
    }),
  );
}

function pinUntil(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** Pins an official post to the top of Home (days = 0 unpins it). */
export async function setPostPin(postId: string, days: number) {
  check(
    await supabase
      .from("posts")
      .update({ pinned_until: days ? pinUntil(days) : null })
      .eq("id", postId),
  );
}

export async function deletePost(post: Pick<Post, "id" | "image_path">) {
  check(await supabase.from("posts").delete().eq("id", post.id));
  // Best effort: the post is gone either way. (Cloudinary photos are cleaned up by the app.)
  if (post.image_path && !/^https?:\/\//.test(post.image_path)) await supabase.storage.from("post-images").remove([post.image_path]);
}

export async function listCommunities(): Promise<Community[]> {
  return check(
    await supabase
      .from("communities")
      .select("id,slug,name,is_official")
      .order("is_official", { ascending: false })
      .order("name"),
  ) as Community[];
}

// ─── Communities (verification) ───────────────────────────────────────────

type RawReviewCommunity = Omit<ReviewCommunity, "member_count"> & {
  community_members: { count: number }[];
};

export async function listCommunitiesForReview(): Promise<ReviewCommunity[]> {
  const rows = check(
    await supabase
      .from("communities")
      .select(
        "id,slug,name,description,category,is_official,theme_color,accent_color,verified_at,created_at,creator:profiles!communities_created_by_fkey(id,username,full_name,university,avatar_color), community_members(count)",
      )
      .eq("is_official", false)
      .order("created_at", { ascending: false }),
  ) as unknown as RawReviewCommunity[];
  return rows.map(({ community_members, ...c }) => ({
    ...c,
    member_count: community_members?.[0]?.count ?? 0,
  }));
}

/** Verified communities get a purple Verified tag and their posts show on everyone's Home. */
export async function setCommunityVerified(communityId: string, verified: boolean) {
  check(
    await supabase.rpc("admin_set_verified", { p_community: communityId, p_verified: verified }),
  );
}

// ─── Tournaments ──────────────────────────────────────────────────────────

export function bannerUrl(path: string): string {
  return supabase.storage.from("tournament-banners").getPublicUrl(path).data.publicUrl;
}

async function uploadBanner(tournamentId: string, file: File): Promise<string> {
  const path = `${tournamentId}/${crypto.randomUUID()}.${fileExt(file)}`;
  check(
    await supabase.storage
      .from("tournament-banners")
      .upload(path, file, { contentType: file.type || "image/jpeg" }),
  );
  return path;
}

export async function listTournaments(): Promise<TournamentWithCounts[]> {
  const rows = check(
    await supabase
      .from("tournaments")
      .select("*, tournament_entries(status)")
      .order("created_at", { ascending: false }),
  ) as (Tournament & { tournament_entries: { status: EntryStatus }[] })[];
  return rows.map(({ tournament_entries, ...t }) => {
    const n = (s: EntryStatus) => tournament_entries.filter((e) => e.status === s).length;
    return { ...t, pending: n("pending"), accepted: n("accepted"), rejected: n("rejected") };
  });
}

export async function getTournament(id: string): Promise<Tournament | null> {
  return check(
    await supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
  ) as Tournament | null;
}

export type TournamentInput = Pick<
  Tournament,
  | "title"
  | "game"
  | "description"
  | "criteria"
  | "entry_question"
  | "format"
  | "prize"
  | "max_participants"
  | "starts_at"
  | "registration_closes_at"
  | "status"
>;

/** Creates or updates a tournament. A new banner file replaces the old one. */
export async function saveTournament(
  input: TournamentInput,
  opts: { id?: string; banner?: File | null; removeBanner?: boolean; previousBanner?: string | null },
): Promise<Tournament> {
  const me = await requireUserId();
  const id = opts.id ?? crypto.randomUUID();
  let banner_path: string | null | undefined = undefined;
  if (opts.banner) banner_path = await uploadBanner(id, opts.banner);
  else if (opts.removeBanner) banner_path = null;

  const row = { ...input, ...(banner_path !== undefined ? { banner_path } : {}) };
  const saved = opts.id
    ? (check(
        await supabase.from("tournaments").update(row).eq("id", id).select("*").single(),
      ) as Tournament)
    : (check(
        await supabase
          .from("tournaments")
          .insert({ ...row, id, created_by: me })
          .select("*")
          .single(),
      ) as Tournament);

  if (banner_path !== undefined && opts.previousBanner && opts.previousBanner !== banner_path) {
    await supabase.storage.from("tournament-banners").remove([opts.previousBanner]);
  }
  return saved;
}

export async function setTournamentStatus(id: string, status: TournamentStatus) {
  check(await supabase.from("tournaments").update({ status }).eq("id", id));
}

export async function deleteTournament(t: Pick<Tournament, "id" | "banner_path">) {
  check(await supabase.from("tournaments").delete().eq("id", t.id));
  if (t.banner_path) await supabase.storage.from("tournament-banners").remove([t.banner_path]);
}

/** Posts a tournament announcement (with its banner) to the home feed. */
export async function announceTournament(t: Tournament, body: string) {
  let image: Blob | null = null;
  if (t.banner_path) {
    const res = await supabase.storage.from("tournament-banners").download(t.banner_path);
    if (!res.error) image = res.data;
  }
  await createOfficialPost({ body, image, tournamentId: t.id });
}

/**
 * Starts the livestream: saves the link, marks the tournament Live (accepted
 * players get a notification) and, if asked, posts it with a "Watch live" button.
 */
export async function goLive(
  t: Tournament,
  input: {
    streamUrl: string;
    post?: { body: string; communityId: string | null; pinDays: number } | null;
  },
) {
  check(
    await supabase
      .from("tournaments")
      .update({
        stream_url: input.streamUrl,
        stream_started_at: t.stream_started_at ?? new Date().toISOString(),
        status: "live",
      })
      .eq("id", t.id),
  );
  if (input.post) await postStream(t, input.streamUrl, input.post);
}

/** Posts the stream link to Home (and a community) as an official post. */
export async function postStream(
  t: Tournament,
  streamUrl: string,
  post: { body: string; communityId: string | null; pinDays: number },
) {
  let image: Blob | null = null;
  if (t.banner_path) {
    const res = await supabase.storage.from("tournament-banners").download(t.banner_path);
    if (!res.error) image = res.data;
  }
  await createOfficialPost({
    body: post.body,
    image,
    tournamentId: t.id,
    communityId: post.communityId,
    headline: `🔴 LIVE: ${t.title}`.slice(0, 80),
    cta: { label: "Watch live", url: streamUrl },
    pinDays: post.pinDays,
  });
}

export async function listChat(tournamentId: string): Promise<ChatMessage[]> {
  return check(
    await supabase
      .from("tournament_chat")
      .select(
        "*, user:profiles!tournament_chat_user_id_fkey(id,username,full_name,university,avatar_color,banned_at)",
      )
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(300),
  ) as ChatMessage[];
}

export async function deleteChatMessage(id: string) {
  check(await supabase.from("tournament_chat").delete().eq("id", id));
}

export async function removeStream(tournamentId: string) {
  check(await supabase.from("tournaments").update({ stream_url: null }).eq("id", tournamentId));
}

export async function listEntries(tournamentId: string): Promise<TournamentEntry[]> {
  return check(
    await supabase
      .from("tournament_entries")
      .select(
        "*, user:profiles!tournament_entries_user_id_fkey(id,username,full_name,university,avatar_color,banned_at,tournament_blocked_at)",
      )
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true }),
  ) as TournamentEntry[];
}

export async function reviewEntry(entryId: string, status: EntryStatus, note = "") {
  check(
    await supabase.rpc("review_tournament_entry", {
      entry_id: entryId,
      new_status: status,
      note,
    }),
  );
}

export async function removeEntry(entryId: string) {
  check(await supabase.from("tournament_entries").delete().eq("id", entryId));
}

// ─── People ───────────────────────────────────────────────────────────────

export async function listUsers(search = ""): Promise<AdminUser[]> {
  return check(
    await supabase.rpc("admin_list_users", { search: search.trim(), lim: 100 }),
  ) as AdminUser[];
}

export type UserDetails = { birth_date: string | null; gender: string | null };

/**
 * Date of birth and gender from sign-up (admins only), by user id.
 * Falls back to dates of birth only if part-31 hasn't been run yet.
 */
export async function getUserDetails(ids: string[]): Promise<Record<string, UserDetails>> {
  if (!ids.length) return {};
  type Row = { id: string; birth_date: string | null; gender?: string | null };
  let res = await supabase.rpc("admin_user_details", { ids });
  if (res.error && /admin_user_details|does not exist|Could not find/.test(res.error.message)) {
    res = await supabase.rpc("admin_user_birthdates", { ids });
  }
  if (res.error) throw res.error;
  const out: Record<string, UserDetails> = {};
  for (const r of (res.data ?? []) as Row[])
    out[r.id] = { birth_date: r.birth_date ?? null, gender: r.gender ?? null };
  return out;
}

export async function setBan(userId: string, banned: boolean, reason = "") {
  check(await supabase.rpc("admin_set_ban", { target: userId, banned, reason }));
}

export async function setTournamentBlock(userId: string, blocked: boolean) {
  check(await supabase.rpc("admin_set_tournament_block", { target: userId, blocked }));
}

// ─── NetFun Official messages to community owners ─────────────────────────

export async function listOfficialThreads(): Promise<OfficialThread[]> {
  return check(await supabase.rpc("admin_official_threads")) as OfficialThread[];
}

export async function listOfficialThread(userId: string): Promise<OfficialMessage[]> {
  return check(
    await supabase
      .from("official_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(500),
  ) as OfficialMessage[];
}

export async function sendOfficialMessage(userId: string, body: string): Promise<OfficialMessage> {
  return check(
    await supabase.rpc("admin_send_official_message", { target: userId, msg: body.trim() }),
  ) as OfficialMessage;
}

export async function markRepliesRead(userId: string) {
  check(await supabase.rpc("admin_mark_official_read", { target: userId }));
}

export async function getProfileWithCommunities(
  userId: string,
): Promise<(Profile & { communities: { id: string; name: string }[] }) | null> {
  return check(
    await supabase
      .from("profiles")
      .select("id,username,full_name,university,avatar_color,banned_at, communities!communities_created_by_fkey(id,name)")
      .eq("id", userId)
      .maybeSingle(),
  ) as (Profile & { communities: { id: string; name: string }[] }) | null;
}

// ─── Communities invited to a tournament ──────────────────────────────────

export async function listTournamentInvites(tournamentId: string): Promise<TournamentInvite[]> {
  return check(
    await supabase
      .from("tournament_community_invites")
      .select("*, community:communities(id,name,slug,theme_color)")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false }),
  ) as TournamentInvite[];
}

/** Invites the communities' owners; returns how many invites went out. */
export async function inviteCommunities(tournamentId: string, communityIds: string[], message: string) {
  return check(
    await supabase.rpc("admin_invite_communities", {
      p_tournament: tournamentId,
      p_communities: communityIds,
      p_message: message.trim(),
    }),
  ) as number;
}

export async function removeInvite(inviteId: string) {
  check(await supabase.rpc("admin_remove_community_invite", { p_invite: inviteId }));
}

// ─── In-app broadcast (LiveKit) ───────────────────────────────────────────

/** A LiveKit pass to broadcast into the tournament's room (from the NetFun app's server). */
export async function getBroadcastPass(tournamentId: string): Promise<{ url: string; token: string }> {
  if (!appUrl) throw new Error("app_url_missing");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  let res: Response;
  try {
    res = await fetch(`${appUrl}/api/live-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, publish: true }),
    });
  } catch {
    throw new Error("live_token_unreachable");
  }
  const out = (await res.json().catch(() => ({}))) as { url?: string; token?: string; error?: string };
  if (!res.ok || !out.url || !out.token) throw new Error(out.error || `live_token_${res.status}`);
  return { url: out.url, token: out.token };
}

/** Marks the in-app broadcast on/off (viewers' player follows this; on → players notified). */
export async function setLiveInApp(t: Tournament, on: boolean) {
  check(
    await supabase
      .from("tournaments")
      .update(
        on
          ? {
              live_in_app: true,
              status: "live",
              stream_started_at: t.stream_started_at ?? new Date().toISOString(),
            }
          : { live_in_app: false },
      )
      .eq("id", t.id),
  );
}
