import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Heart, MessageCircle, Pin, PinOff, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  createOfficialPost,
  deletePost,
  listCommunities,
  listPosts,
  listTournaments,
  postImageUrl,
  setPostPin,
} from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import { dateTime, timeAgo } from "@/lib/format";
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

const PIN_OPTIONS = [
  { days: 0, label: "Don't pin" },
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
];

// App pages a button can open. "custom" lets you type any https:// link.
const BUTTON_TARGETS = [
  { url: "/chats", label: "Chats" },
  { url: "/communities", label: "Communities" },
  { url: "/discover", label: "Discover people" },
  { url: "/create", label: "Create a post" },
  { url: "/profile", label: "My profile" },
  { url: "custom", label: "Other link (https://…)" },
];

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
  const [headline, setHeadline] = useState("");
  const [withButton, setWithButton] = useState(false);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaTarget, setCtaTarget] = useState("/chats");
  const [ctaCustom, setCtaCustom] = useState("");
  const [pinDays, setPinDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const ctaUrl = ctaTarget === "custom" ? ctaCustom.trim() : ctaTarget;
  const ctaOk = !withButton || (ctaLabel.trim().length > 0 && /^(\/|https:\/\/)\S*$/.test(ctaUrl));
  const communities = useQuery({ queryKey: ["communities"], queryFn: listCommunities });
  const tournaments = useQuery({ queryKey: ["tournaments"], queryFn: listTournaments });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim() || !ctaOk) return;
    setBusy(true);
    try {
      await createOfficialPost({
        body: body.trim(),
        image,
        communityId: communityId || null,
        tournamentId: tournamentId || null,
        headline,
        cta: withButton ? { label: ctaLabel, url: ctaUrl } : null,
        pinDays,
      });
      toast.success(pinDays ? "Posted and pinned to the top of Home" : "Posted to the home feed");
      setBody("");
      setHeadline("");
      setWithButton(false);
      setCtaLabel("");
      setCtaTarget("/chats");
      setCtaCustom("");
      setPinDays(0);
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
        <Field label="Title (optional)" hint="Shown big on the purple-and-gold banner in the app.">
          <input
            className="input"
            value={headline}
            maxLength={80}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="e.g. Voice notes are here"
          />
        </Field>
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
        <div className="flex flex-col gap-3 rounded-2xl border border-nf-line p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={withButton} onChange={(e) => setWithButton(e.target.checked)} />
            Add a button under the post
          </label>
          {withButton && (
            <>
              <Field label="Button text">
                <input
                  className="input"
                  value={ctaLabel}
                  maxLength={30}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  placeholder="Try it in Chats"
                />
              </Field>
              <Field label="Opens">
                <select className="input" value={ctaTarget} onChange={(e) => setCtaTarget(e.target.value)}>
                  {BUTTON_TARGETS.map((t) => (
                    <option key={t.url} value={t.url}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              {ctaTarget === "custom" && (
                <Field label="Link" hint={ctaOk ? undefined : "Must start with https://"}>
                  <input
                    className="input"
                    value={ctaCustom}
                    maxLength={300}
                    onChange={(e) => setCtaCustom(e.target.value)}
                    placeholder="https://…"
                  />
                </Field>
              )}
            </>
          )}
        </div>
        <div role="group" aria-labelledby="pin-label" className="flex flex-col gap-1.5">
          <span id="pin-label" className="text-sm font-semibold text-nf-ink">
            Pin to the top of Home
          </span>
          <div className="flex flex-wrap gap-2">
            {PIN_OPTIONS.map((o) => (
              <button
                key={o.days}
                type="button"
                aria-pressed={pinDays === o.days}
                onClick={() => setPinDays(o.days)}
                className={`h-9 rounded-full px-3.5 text-[13px] font-semibold transition ${
                  pinDays === o.days
                    ? "bg-nf-purple text-white"
                    : "border border-nf-line-strong bg-white text-nf-soft-ink hover:bg-nf-field"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-nf-muted">A pinned post sits above everything with a “Pinned” label.</span>
        </div>
        <Button type="submit" loading={busy} disabled={!body.trim() || !ctaOk}>
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
  const qc = useQueryClient();
  const [pinBusy, setPinBusy] = useState(false);
  const pinned = !!post.pinned_until && new Date(post.pinned_until) > new Date();
  const togglePin = async () => {
    setPinBusy(true);
    try {
      await setPostPin(post.id, pinned ? 0 : 3);
      toast.success(pinned ? "Unpinned. It stays in the feed." : "Pinned to the top of Home for 3 days");
      qc.invalidateQueries({ queryKey: ["posts"] });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setPinBusy(false);
    }
  };
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
          {pinned && (
            <Badge tone="gold">
              <Pin className="size-3" /> Pinned
            </Badge>
          )}
          {post.visibility === "connections" && <Badge>Connections</Badge>}
          {author?.banned_at && <Badge tone="red">Author banned</Badge>}
        </div>
      </div>
      {post.headline && <p className="px-4 pb-1 font-display text-lg font-bold">{post.headline}</p>}
      <p className="px-4 pb-3 text-[15px] leading-relaxed whitespace-pre-line">{post.body}</p>
      {post.cta_label && (
        <p className="px-4 pb-3 text-sm text-nf-soft-ink">
          Button: <b className="text-nf-ink">{post.cta_label}</b> → {post.cta_url}
        </p>
      )}
      {pinned && (
        <p className="px-4 pb-3 text-xs text-nf-gold-ink">Pinned until {dateTime(post.pinned_until)}</p>
      )}
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
        {post.is_official && (
          <Button size="sm" variant="ghost" loading={pinBusy} onClick={() => void togglePin()}>
            {pinned ? (
              <>
                <PinOff className="size-4" /> Unpin
              </>
            ) : (
              <>
                <Pin className="size-4" /> Pin 3 days
              </>
            )}
          </Button>
        )}
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
