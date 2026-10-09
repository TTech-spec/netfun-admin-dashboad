import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  getProfileWithCommunities,
  listOfficialThread,
  listOfficialThreads,
  markRepliesRead,
  sendOfficialMessage,
} from "@/lib/api";
import { friendlyError, supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { OfficialMessage } from "@/lib/types";
import { Avatar, Card, EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/ui";

export function MessagesPage() {
  const { userId } = useParams();
  const qc = useQueryClient();
  const threads = useQuery({
    queryKey: ["official-threads"],
    queryFn: listOfficialThreads,
    refetchInterval: 30_000,
  });

  // Owners' replies show up without a refresh.
  useEffect(() => {
    const ch = supabase
      .channel("admin-official-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "official_messages" }, (p) => {
        qc.invalidateQueries({ queryKey: ["official-threads"] });
        qc.invalidateQueries({ queryKey: ["official-thread", (p.new as OfficialMessage).user_id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Message community owners. They see it from NetFun Official, never your own name, and can reply."
      />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className={`overflow-hidden ${userId ? "hidden lg:block" : ""}`}>
          <ErrorNote error={threads.error} />
          {threads.isLoading && <Spinner />}
          {threads.data?.length === 0 && (
            <EmptyState
              title="No conversations yet"
              body="Open Communities and tap “Message owner” on any community to start one."
              action={
                <Link to="/communities" className="font-bold text-nf-purple">
                  Go to Communities
                </Link>
              }
            />
          )}
          <div className="divide-y divide-nf-line">
            {threads.data?.map((t) => (
              <Link
                key={t.user_id}
                to={`/messages/${t.user_id}`}
                className={`flex items-center gap-3 p-3.5 hover:bg-nf-field/60 ${
                  t.user_id === userId ? "bg-nf-purple-soft" : ""
                }`}
              >
                <Avatar profile={t} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{t.full_name || t.username}</span>
                    <span className="shrink-0 text-xs text-nf-muted">{timeAgo(t.last_at)}</span>
                  </span>
                  {t.communities && (
                    <span className="block truncate text-xs text-nf-purple">{t.communities}</span>
                  )}
                  <span
                    className={`block truncate text-sm ${Number(t.unread) ? "font-semibold text-nf-ink" : "text-nf-muted"}`}
                  >
                    {t.last_from_netfun ? "NetFun: " : ""}
                    {t.last_body}
                  </span>
                </span>
                {Number(t.unread) > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-nf-purple px-1.5 text-[11px] font-bold text-white">
                    {t.unread}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </Card>

        {userId ? (
          <Thread key={userId} userId={userId} />
        ) : (
          <Card className="hidden items-center justify-center p-10 text-sm text-nf-muted lg:flex">
            Pick a conversation, or start one from Communities.
          </Card>
        )}
      </div>
    </>
  );
}

function Thread({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const person = useQuery({
    queryKey: ["profile-communities", userId],
    queryFn: () => getProfileWithCommunities(userId),
  });
  const msgs = useQuery({
    queryKey: ["official-thread", userId],
    queryFn: () => listOfficialThread(userId),
  });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const count = msgs.data?.length ?? 0;
  const unreadReplies = msgs.data?.some((m) => !m.from_netfun && !m.read_at);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);
  useEffect(() => {
    if (!unreadReplies) return;
    markRepliesRead(userId)
      .then(() => qc.invalidateQueries({ queryKey: ["official-threads"] }))
      .catch(() => {});
  }, [unreadReplies, userId, qc]);

  const p = person.data;
  const ownsCommunity = (p?.communities?.length ?? 0) > 0;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await sendOfficialMessage(userId, body);
      qc.setQueryData<OfficialMessage[]>(["official-thread", userId], (old = []) =>
        old.some((x) => x.id === m.id) ? old : [...old, m],
      );
      qc.invalidateQueries({ queryKey: ["official-threads"] });
      setText("");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="flex h-[calc(100svh-220px)] min-h-[460px] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-nf-line p-3.5">
        <Link to="/messages" aria-label="Back" className="flex size-9 items-center justify-center rounded-full hover:bg-nf-field lg:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <Avatar profile={p ?? null} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{p ? p.full_name || p.username : "…"}</p>
          <p className="truncate text-xs text-nf-muted">
            {p ? `@${p.username}` : ""}
            {ownsCommunity ? ` · owns ${p!.communities.map((c) => c.name).join(", ")}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-nf-bg p-4">
        <ErrorNote error={msgs.error || person.error} />
        {msgs.isLoading && <Spinner />}
        {msgs.data?.length === 0 && (
          <p className="m-auto max-w-xs text-center text-sm text-nf-muted">
            {ownsCommunity
              ? "Say hello. They'll get a notification and see it in a NetFun Official chat."
              : "This person doesn't own a community, so they can't be messaged."}
          </p>
        )}
        {msgs.data?.map((m) => (
          <div
            key={m.id}
            className={`flex max-w-[75%] flex-col gap-1 ${m.from_netfun ? "items-end self-end" : "self-start"}`}
          >
            {m.from_netfun && (
              <span className="flex items-center gap-1 px-1 text-[11px] font-semibold text-nf-purple">
                NetFun Official <BadgeCheck className="size-3" aria-hidden />
              </span>
            )}
            <p
              className={`px-3.5 py-2.5 text-[15px] leading-snug break-words whitespace-pre-wrap ${
                m.from_netfun
                  ? "rounded-[18px_18px_4px_18px] bg-nf-purple text-white"
                  : "rounded-[18px_18px_18px_4px] border border-nf-line bg-white"
              }`}
            >
              {m.body}
            </p>
            <span className="px-1 text-[11px] text-nf-muted">
              {timeAgo(m.created_at)}
              {m.from_netfun && m.read_at ? " · Seen" : ""}
            </span>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-nf-line p-3">
        <textarea
          className="input max-h-40 min-h-11 flex-1 resize-none"
          rows={1}
          value={text}
          maxLength={2000}
          disabled={!ownsCommunity}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={ownsCommunity ? "Write as NetFun Official…" : "Only community owners can be messaged"}
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending || !ownsCommunity}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-nf-purple text-white disabled:opacity-40"
        >
          <SendHorizontal className="size-5" />
        </button>
      </form>
    </Card>
  );
}
