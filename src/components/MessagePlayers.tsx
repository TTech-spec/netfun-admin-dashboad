import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Radio, Search } from "lucide-react";
import { toast } from "sonner";
import {
  listEntries,
  listTournamentMessages,
  messagePlayers,
  type PlayerAudience,
} from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { Tournament } from "@/lib/types";
import { Avatar, Badge, Button, Card, ErrorNote, Field, Modal } from "./ui";

const AUDIENCES: { value: PlayerAudience; label: string }[] = [
  { value: "accepted", label: "Accepted players" },
  { value: "everyone", label: "Everyone who applied" },
  { value: "pending", label: "Waiting for review" },
  { value: "rejected", label: "Not accepted" },
  { value: "chosen", label: "Choose people" },
];

const AUDIENCE_LABEL: Record<string, string> = {
  accepted: "Accepted players",
  everyone: "Everyone who applied",
  pending: "Waiting for review",
  rejected: "Not accepted",
  chosen: "Chosen people",
};

function liveMessage(t: Tournament) {
  return `We're live now! 🔴 Tap to watch ${t.title} and join the chat.`;
}

/** Message box + history on the tournament page. */
export function MessagePlayersCard({ t }: { t: Tournament }) {
  const [open, setOpen] = useState<null | "normal" | "live">(null);
  const history = useQuery({
    queryKey: ["tournament-messages", t.id],
    queryFn: () => listTournamentMessages(t.id),
    retry: false,
  });
  const streaming = !!t.stream_url || !!t.live_in_app;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Megaphone className="size-5 text-nf-purple" aria-hidden />
        <h2 className="flex-1 font-display text-base font-bold">Message players</h2>
      </div>
      <p className="text-sm text-nf-muted">
        Send a NetFun notification to everyone who registered, or only the people you pick. It
        also pops up on their phone if they turned on alerts.
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={() => setOpen("normal")}>
          <Megaphone className="size-4" /> Write a message
        </Button>
        <Button
          variant={streaming ? "primary" : "secondary"}
          disabled={!streaming}
          title={streaming ? undefined : "Start a stream first"}
          onClick={() => setOpen("live")}
        >
          <Radio className="size-4" /> Invite players to the livestream
        </Button>
      </div>

      <ErrorNote error={history.error} />
      {(history.data?.length ?? 0) > 0 && (
        <div className="mt-1 flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-nf-muted uppercase">Sent</p>
          {history.data!.slice(0, 5).map((m) => (
            <div key={m.id} className="rounded-xl bg-nf-field px-3 py-2 text-sm">
              <p className="line-clamp-2">{m.body}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-nf-muted">
                {m.is_live && <Badge tone="red">Live</Badge>}
                {AUDIENCE_LABEL[m.audience] ?? m.audience} · {m.recipients}{" "}
                {m.recipients === 1 ? "person" : "people"} · {timeAgo(m.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}

      <MessagePlayersDialog
        t={t}
        open={!!open}
        live={open === "live"}
        onClose={() => setOpen(null)}
      />
    </Card>
  );
}

export function MessagePlayersDialog({
  t,
  open,
  live,
  onClose,
}: {
  t: Tournament;
  open: boolean;
  live: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const entries = useQuery({
    queryKey: ["entries", t.id],
    queryFn: () => listEntries(t.id),
    enabled: open,
  });
  const [audience, setAudience] = useState<PlayerAudience>("accepted");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage(live ? liveMessage(t) : "");
    setAudience("accepted");
    setPicked(new Set());
    setSearch("");
  }, [open, live, t]);

  const all = entries.data ?? [];
  const count = (a: PlayerAudience) =>
    a === "everyone" ? all.length : a === "chosen" ? picked.size : all.filter((e) => e.status === a).length;
  const recipients = count(audience);
  const term = search.trim().toLowerCase();
  const people = all.filter(
    (e) =>
      !term ||
      [e.user?.full_name, e.user?.username, e.in_game_name].join(" ").toLowerCase().includes(term),
  );

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const send = async () => {
    setBusy(true);
    try {
      const n = await messagePlayers(t.id, {
        message,
        audience,
        userIds: [...picked],
        live,
      });
      toast.success(n === 1 ? "Sent to 1 person" : `Sent to ${n} people`);
      qc.invalidateQueries({ queryKey: ["tournament-messages", t.id] });
      onClose();
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
      title={live ? "Invite players to the livestream" : "Message players"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!message.trim() || recipients === 0} onClick={send}>
            Send to {recipients} {recipients === 1 ? "person" : "people"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold">Who gets it</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who gets it">
            {AUDIENCES.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={audience === a.value}
                onClick={() => setAudience(a.value)}
                className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${
                  audience === a.value
                    ? "border-nf-purple bg-nf-purple-soft text-nf-purple-deep"
                    : "border-nf-line-strong bg-white"
                }`}
              >
                {a.label}
                {a.value !== "chosen" && (
                  <span className="rounded-full bg-white/70 px-1.5 text-xs">{count(a.value)}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {audience === "chosen" && (
          <div className="flex flex-col gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-nf-muted" />
              <input
                className="input pl-10"
                placeholder="Search players"
                aria-label="Search players"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <ErrorNote error={entries.error} />
            <ul className="flex max-h-56 flex-col overflow-y-auto rounded-2xl border border-nf-line">
              {entries.isLoading && <li className="p-3 text-sm text-nf-muted">Loading…</li>}
              {!entries.isLoading && people.length === 0 && (
                <li className="p-3 text-sm text-nf-muted">No players found.</li>
              )}
              {people.map((e) => (
                <li key={e.id} className="border-b border-nf-line last:border-b-0">
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-nf-field/60">
                    <input
                      type="checkbox"
                      className="size-4 accent-nf-purple"
                      checked={picked.has(e.user_id)}
                      onChange={() => toggle(e.user_id)}
                    />
                    <Avatar profile={e.user} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {e.user?.full_name || e.user?.username}
                      </span>
                      <span className="block truncate text-xs text-nf-muted">
                        {e.in_game_name || `@${e.user?.username}`}
                      </span>
                    </span>
                    <Badge
                      tone={e.status === "accepted" ? "green" : e.status === "pending" ? "gold" : "gray"}
                    >
                      {e.status}
                    </Badge>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label="Message" hint={`${message.length}/500 · Comes from NetFun. Tapping it opens the tournament.`}>
          <textarea
            className="input min-h-24 resize-y text-sm leading-relaxed"
            value={message}
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Matches start at 6pm. Be online 15 minutes early!"
          />
        </Field>
      </div>
    </Modal>
  );
}
