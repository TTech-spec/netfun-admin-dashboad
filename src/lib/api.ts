import { supabase } from "./supabase";
import type {
  AdminStats,
  AdminUser,
  Community,
  EntryStatus,
  Post,
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
    }),
  );
}

export async function deletePost(post: Pick<Post, "id" | "image_path">) {
  check(await supabase.from("posts").delete().eq("id", post.id));
  // Best effort: the post is gone either way.
  if (post.image_path) await supabase.storage.from("post-images").remove([post.image_path]);
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

export async function setBan(userId: string, banned: boolean, reason = "") {
  check(await supabase.rpc("admin_set_ban", { target: userId, banned, reason }));
}

export async function setTournamentBlock(userId: string, blocked: boolean) {
  check(await supabase.rpc("admin_set_tournament_block", { target: userId, blocked }));
}
