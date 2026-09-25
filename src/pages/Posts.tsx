import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Heart, MessageCircle, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  createOfficialPost,
  deletePost,
  listCommunities,
  listPosts,
  listTournaments,
  postImageUrl,
} from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { Post } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  ImagePicker,
  Modal,
  PageHeader,
  Spinner,
  Tabs,
} from "@/components/ui";
import { ModerationDialog, type ModerationTarget } from "@/components/ModerationDialog";

const MAX_BODY = 2000;

export function PostsPage() {
  const [filter, setFilter] = useState<"official" | "all">("official");
  const posts = useQuery({
    queryKey: ["posts", filter],
    queryFn: () => listPosts({ officialOnly: filter === "official", limit: 60 }),
  });
  const [toDelete, setToDelete] = useState<Post | null>(null);
  const [moderate, setModerate] = useState<ModerationTarget | null>(null);

  return (
    <>
      <PageHeader
        title="Feed posts"
        subtitle="Official posts appear on everyone's home feed in the NetFun app with a verified badge."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Composer />

        <section className="flex min-w-0 flex-col gap-4">
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: "official", label: "Official posts" },
              { value: "all", label: "All posts (moderation)" },
            ]}
          />
          <ErrorNote error={posts.error} />
          {posts.isLoading && <Spinner />}
          {posts.data?.length === 0 && (
            <Card>
              <EmptyState
                title={filter === "official" ? "No official posts yet" : "No posts yet"}
                body={filter === "official" ? "Write your first announcement on the left." : undefined}
              />
            </Card>
          )}
          {posts.data?.map((p) => (
            <PostRow
              key={p.id}
              post={p}
              onDelete={() => setToDelete(p)}
              onBan={
                p.author && !p.is_official && !p.author.banned_at
                  ? () =>
                      setModerate({
                        id: p.author!.id,
                        name: p.author!.full_name || p.author!.username,
                        action: "ban",
                      })
                  : undefined
              }
            />
          ))}
        </section>
      </div>

      <DeletePostDialog post={toDelete} onClose={() => setToDelete(null)} />
      <ModerationDialog target={moderate} onClose={() => setModerate(null)} />
    </>
  );
}

function Composer() {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [communityId, setCommunityId] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [busy, setBusy] = useState(false);
  const communities = useQuery({ queryKey: ["communities"], queryFn: listCommunities });
  const tournaments = useQuery({ queryKey: ["tournaments"], queryFn: listTournaments });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await createOfficialPost({
        body: body.trim(),
        image,
        communityId: communityId || null,
        tournamentId: tournamentId || null,
      });
      toast.success("Posted to the home feed");
      setBody("");
      setImage(null);
      setCommunityId("");
      setTournamentId("");
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="h-fit p-5 lg:sticky lg:top-6">
      <h2 className="mb-4 font-display text-lg font-bold">New official post</h2>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Message" hint={`${body.length}/${MAX_BODY}`}>
          <textarea
            className="input min-h-32 resize-y leading-relaxed"
            value={body}
            maxLength={MAX_BODY}
            required
            onChange={(e) => setBody(e.target.value)}
            placeholder="Announce something to everyone on NetFun…"
          />
        </Field>
        <ImagePicker file={image} onFile={setImage} label="Add a photo (optional)" aspect="aspect-[4/3]" />
        <Field
          label="Where it shows"
          hint="Home feed shows it to everyone. Picking a community also lists it on that community's page."
        >
          <select className="input" value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
            <option value="">Home feed only</option>
            {communities.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_official ? "" : " (member-made)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Link a tournament (optional)" hint="Adds a “View tournament” button to the post.">
          <select className="input" value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
            <option value="">None</option>
            {tournaments.data
              ?.filter((t) => t.status !== "draft")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </Field>
        <Button type="submit" loading={busy} disabled={!body.trim()}>
          Publish to feed
        </Button>
      </form>
    </Card>
  );
}

function PostRow({
  post,
  onDelete,
  onBan,
}: {
  post: Post;
  onDelete: () => void;
  onBan?: () => void;
}) {
  const author = post.author;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <Avatar profile={author} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-semibold">
            {author?.full_name || author?.username || "Deleted user"}
            {post.is_official && (
              <BadgeCheck className="size-4 text-nf-purple" aria-label="Official" />
            )}
          </p>
          <p className="truncate text-xs text-nf-muted">
            @{author?.username} · {post.community ? post.community.name : "Home feed"} ·{" "}
            {timeAgo(post.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {post.is_official && <Badge tone="purple">Official</Badge>}
          {post.visibility === "connections" && <Badge>Connections</Badge>}
          {author?.banned_at && <Badge tone="red">Author banned</Badge>}
        </div>
      </div>
      <p className="px-4 pb-3 text-[15px] leading-relaxed whitespace-pre-line">{post.body}</p>
      {post.image_path && (
        <img
          src={postImageUrl(post.image_path)}
          alt=""
          loading="lazy"
          className="block max-h-[360px] w-full object-cover"
        />
      )}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm text-nf-soft-ink">
        <span className="flex items-center gap-1.5">
          <Heart className="size-4" aria-hidden /> {post.like_count}
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="size-4" aria-hidden /> {post.comment_count}
        </span>
        {post.tournament_id && (
          <span className="flex items-center gap-1.5 text-nf-gold-ink">
            <Trophy className="size-4" aria-hidden /> Tournament linked
          </span>
        )}
        <span className="flex-1" />
        {onBan && (
          <Button size="sm" variant="ghost" onClick={onBan}>
            Ban author
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-nf-red" onClick={onDelete}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>
    </Card>
  );
}

function DeletePostDialog({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!post) return;
    setBusy(true);
    try {
      await deletePost(post);
      toast.success("Post deleted");
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!post}
      onClose={onClose}
      title="Delete this post?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={confirm}>
            Delete post
          </Button>
        </>
      }
    >
      <p className="text-[15px] text-nf-soft-ink">
        It disappears from every feed, with its likes and comments. This can't be undone.
      </p>
      {post && (
        <p className="mt-3 line-clamp-3 rounded-2xl bg-nf-field p-3 text-sm">{post.body}</p>
      )}
    </Modal>
  );
}
