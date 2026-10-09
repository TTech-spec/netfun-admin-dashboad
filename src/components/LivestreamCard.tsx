import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Radio } from "lucide-react";
import { toast } from "sonner";
import { goLive, listCommunities, postStream, removeStream } from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import { streamInfo } from "@/lib/stream";
import type { Tournament } from "@/lib/types";
import { Badge, Button, Card, Field, Modal } from "./ui";

const PIN_CHOICES = [
  { days: 0, label: "Don't pin" },
  { days: 1, label: "Pin to top of Home for 1 day" },
  { days: 3, label: "Pin for 3 days" },
];

/** Add a livestream link to a tournament and post it to Home / a community. */
export function LivestreamCard({ t }: { t: Tournament }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const live = !!t.stream_url;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tournament", t.id] });
    qc.invalidateQueries({ queryKey: ["tournaments"] });
    qc.invalidateQueries({ queryKey: ["posts"] });
  };

  const remove = async () => {
    setBusy("remove");
    try {
      await removeStream(t.id);
      toast.success("Stream link removed");
      refresh();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.stream_url!);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it.");
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Radio className="size-5 text-nf-red" aria-hidden />
        <h2 className="flex-1 font-display text-base font-bold">Livestream</h2>
        {live && t.status === "live" && <Badge tone="red">Live</Badge>}
      </div>

      {live && !editing ? (
        <>
          <a
            href={t.stream_url!}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 truncate rounded-xl bg-nf-field px-3 py-2.5 text-sm font-medium text-nf-purple"
          >
            <span className="truncate">{t.stream_url}</span>
            <ExternalLink className="size-4 shrink-0" aria-hidden />
          </a>
          <p className="text-xs text-nf-muted">
            Players watch it on the tournament page in the app
            {streamInfo(t.stream_url!).embedUrl ? " (it plays right in the app)." : "."}
          </p>
          <Button onClick={() => setPostOpen(true)}>Post the stream to the feed</Button>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={copy}>
              <Copy className="size-4" /> Copy link
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setUrl(t.stream_url!);
                setEditing(true);
              }}
            >
              Change link
            </Button>
            <Button size="sm" variant="ghost" loading={busy === "remove"} onClick={remove}>
              Remove
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-nf-muted">
            Start your stream (YouTube Live is free), then paste its link here.
          </p>
          <LinkInput value={url} onChange={setUrl} />
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!validLink(url)} onClick={() => setPostOpen(true)}>
              <Radio className="size-4" /> {live ? "Save new link" : "Go live"}
            </Button>
            {editing && (
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </>
      )}

      <GoLiveDialog
        open={postOpen}
        onClose={() => setPostOpen(false)}
        t={t}
        streamUrl={live && !editing ? t.stream_url! : url.trim()}
        alreadyLive={live && !editing}
        onDone={() => {
          setPostOpen(false);
          setEditing(false);
          setUrl("");
          refresh();
        }}
      />
    </Card>
  );
}

function validLink(v: string) {
  return /^https:\/\/\S+\.\S+/.test(v.trim()) && v.trim().length <= 500;
}

function LinkInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const v = value.trim();
  const info = v ? streamInfo(v) : null;
  let hint = "YouTube, Twitch or Facebook links play inside the app. Others open in their own app.";
  if (v && !validLink(v)) hint = "Paste the full link, starting with https://";
  else if (info && info.platform === "YouTube" && !info.embedUrl)
    hint =
      "This looks like a channel link, which can't play inside the app. In YouTube, open the live video, tap Share → Copy link, and paste that.";
  else if (info?.embedUrl) hint = `${info.platform} link: it will play inside the NetFun app.`;
  else if (info) hint = `Players will tap a button to watch on ${info.platform}.`;
  return (
    <Field label="Stream link" hint={hint}>
      <input
        className="input"
        type="url"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://youtube.com/live/…"
      />
    </Field>
  );
}

function GoLiveDialog({
  open,
  onClose,
  t,
  streamUrl,
  alreadyLive,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  t: Tournament;
  streamUrl: string;
  alreadyLive: boolean;
  onDone: () => void;
}) {
  const communities = useQuery({ queryKey: ["communities"], queryFn: listCommunities, enabled: open });
  const [post, setPost] = useState(true);
  const [communityId, setCommunityId] = useState("");
  const [pinDays, setPinDays] = useState(1);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const text =
    body ||
    `${t.title} is LIVE now${t.game ? ` (${t.game})` : ""}! 🎮\nTap “Watch live” to join the stream and cheer the players on.`;

  const run = async () => {
    setBusy(true);
    const postInput = post ? { body: text.trim(), communityId: communityId || null, pinDays } : null;
    try {
      if (alreadyLive) await postStream(t, streamUrl, postInput!);
      else await goLive(t, { streamUrl, post: postInput });
      toast.success(
        alreadyLive
          ? "Stream posted"
          : post
            ? "You're live! Posted to the feed and players notified."
            : "You're live! Players notified.",
      );
      onDone();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={alreadyLive ? "Post the stream" : "Go live"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={run} disabled={alreadyLive && !post}>
            {alreadyLive ? "Post" : "Go live"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!alreadyLive && (
          <p className="text-[15px] leading-relaxed text-nf-soft-ink">
            The tournament switches to <b>Live</b>, the stream shows on its page in the app, and
            every accepted player gets a notification.
          </p>
        )}
        {!alreadyLive && (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-nf-purple"
              checked={post}
              onChange={(e) => setPost(e.target.checked)}
            />
            <span>
              <span className="block font-semibold">Also post it on the Home feed</span>
              <span className="text-sm text-nf-muted">
                An official “🔴 LIVE” post with the banner and a “Watch live” button.
              </span>
            </span>
          </label>
        )}
        {post && (
          <>
            <Field label="Post text">
              <textarea
                className="input min-h-24 resize-y text-sm leading-relaxed"
                value={text}
                maxLength={2000}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
            <Field
              label="Also show in a community (optional)"
              hint="It shows on everyone's Home either way. Picking a community also puts it on that community's page."
            >
              <select
                className="input"
                value={communityId}
                onChange={(e) => setCommunityId(e.target.value)}
              >
                <option value="">Home feed only</option>
                {communities.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pin">
              <select
                className="input"
                value={pinDays}
                onChange={(e) => setPinDays(Number(e.target.value))}
              >
                {PIN_CHOICES.map((p) => (
                  <option key={p.days} value={p.days}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
