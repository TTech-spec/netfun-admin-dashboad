import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  inviteCommunities,
  listCommunitiesForReview,
  listTournamentInvites,
  removeInvite,
} from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import type { Tournament, TournamentInvite } from "@/lib/types";
import { Badge, Button, Card, ErrorNote, Field, Modal } from "./ui";

const TONE = { pending: "gold", accepted: "green", declined: "gray" } as const;
const LABEL = { pending: "Waiting", accepted: "Accepted", declined: "Declined" } as const;

/** Invite communities to a tournament and see who said yes. */
export function CommunityInvitesCard({ t }: { t: Tournament }) {
  const qc = useQueryClient();
  const key = ["tournament-invites", t.id];
  const invites = useQuery({ queryKey: key, queryFn: () => listTournamentInvites(t.id), retry: false });
  const [open, setOpen] = useState(false);
  const list = invites.data ?? [];
  const accepted = list.filter((i) => i.status === "accepted").length;
  const canInvite = !["draft", "completed", "cancelled"].includes(t.status);

  const remove = async (inv: TournamentInvite) => {
    try {
      await removeInvite(inv.id);
      qc.setQueryData<TournamentInvite[]>(key, (old = []) => old.filter((i) => i.id !== inv.id));
      toast.success(inv.status === "accepted" ? "Community removed" : "Invite withdrawn");
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-nf-purple" aria-hidden />
        <h2 className="flex-1 font-display text-base font-bold">Invited communities</h2>
        {list.length > 0 && (
          <span className="text-xs font-semibold text-nf-muted">
            {accepted} of {list.length} accepted
          </span>
        )}
      </div>
      <ErrorNote error={invites.error} />
      {list.length === 0 && !invites.error && (
        <p className="text-sm text-nf-muted">
          Invite communities to take part. Each owner gets a notification and answers in the app.
        </p>
      )}
      {list.length > 0 && (
        <ul className="flex flex-col divide-y divide-nf-line">
          {list.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2.5 py-2">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ background: inv.community?.theme_color ?? "#7A22C6" }}
              >
                {inv.community?.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {inv.community?.name ?? "Deleted community"}
              </span>
              <Badge tone={TONE[inv.status]}>{LABEL[inv.status]}</Badge>
              <button
                onClick={() => void remove(inv)}
                aria-label={`Remove ${inv.community?.name ?? "invite"}`}
                className="flex size-8 items-center justify-center rounded-full text-nf-muted hover:bg-nf-field hover:text-nf-red"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="secondary"
        disabled={!canInvite}
        title={canInvite ? undefined : "Publish the tournament first"}
        onClick={() => setOpen(true)}
      >
        <Mail className="size-4" /> Invite communities
      </Button>
      <InviteDialog
        open={open}
        onClose={() => setOpen(false)}
        t={t}
        already={new Map(list.map((i) => [i.community_id, i.status]))}
        onDone={() => qc.invalidateQueries({ queryKey: key })}
      />
    </Card>
  );
}

function InviteDialog({
  open,
  onClose,
  t,
  already,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  t: Tournament;
  already: Map<string, TournamentInvite["status"]>;
  onDone: () => void;
}) {
  const communities = useQuery({
    queryKey: ["review-communities"],
    queryFn: listCommunitiesForReview,
    enabled: open,
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const term = search.trim().toLowerCase();
  const rows = (communities.data ?? []).filter(
    (c) =>
      c.creator &&
      (!term ||
        c.name.toLowerCase().includes(term) ||
        c.creator.username.toLowerCase().includes(term)),
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
      const n = await inviteCommunities(t.id, [...picked], message);
      toast.success(n === 1 ? "1 community invited" : `${n} communities invited`);
      setPicked(new Set());
      setMessage("");
      onDone();
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
      title={`Invite communities to ${t.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={picked.size === 0} onClick={send}>
            Send {picked.size > 0 ? picked.size : ""} invite{picked.size === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-nf-muted" />
          <input
            className="input pl-10"
            placeholder="Search communities"
            aria-label="Search communities"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <ErrorNote error={communities.error} />
        <ul className="flex max-h-72 flex-col overflow-y-auto rounded-2xl border border-nf-line">
          {communities.isLoading && <li className="p-4 text-sm text-nf-muted">Loading…</li>}
          {!communities.isLoading && rows.length === 0 && (
            <li className="p-4 text-sm text-nf-muted">No communities found.</li>
          )}
          {rows.map((c) => {
            const status = already.get(c.id);
            const done = status === "accepted";
            return (
              <li key={c.id} className="border-b border-nf-line last:border-b-0">
                <label
                  className={`flex items-center gap-3 px-3.5 py-2.5 ${done ? "opacity-60" : "cursor-pointer hover:bg-nf-field/60"}`}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-nf-purple"
                    disabled={done}
                    checked={picked.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-nf-muted">
                      @{c.creator!.username} · {c.member_count} members
                    </span>
                  </span>
                  {status && <Badge tone={TONE[status]}>{LABEL[status]}</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
        <Field label="Message (optional)" hint="Shown to the owner with the invite.">
          <textarea
            className="input min-h-20 resize-y text-sm"
            value={message}
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="We'd love your community to join the NetFun CODM Cup!"
          />
        </Field>
      </div>
    </Modal>
  );
}
