import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  Check,
  Gift,
  Megaphone,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ShieldOff,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  announceTournament,
  bannerUrl,
  deleteTournament,
  getTournament,
  listEntries,
  removeEntry,
  reviewEntry,
  setTournamentStatus,
} from "@/lib/api";
import { appUrl, friendlyError, supabase } from "@/lib/supabase";
import { dateTime, timeAgo } from "@/lib/format";
import type { EntryStatus, Tournament, TournamentEntry, TournamentStatus } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Spinner,
  STATUS_META,
  StatusBadge,
  Tabs,
} from "@/components/ui";
import { ModerationDialog, type ModerationTarget } from "@/components/ModerationDialog";
import { LivestreamCard } from "@/components/LivestreamCard";
import { InAppBroadcastCard } from "@/components/InAppBroadcastCard";
import { CommunityInvitesCard } from "@/components/CommunityInvitesCard";
import { MessagePlayersCard } from "@/components/MessagePlayers";

// Which status moves make sense from each status.
const NEXT: Record<TournamentStatus, { to: TournamentStatus; label: string }[]> = {
  draft: [{ to: "open", label: "Open registration" }],
  open: [
    { to: "closed", label: "Close registration" },
    { to: "live", label: "Start tournament" },
  ],
  closed: [
    { to: "open", label: "Reopen registration" },
    { to: "live", label: "Start tournament" },
  ],
  live: [{ to: "completed", label: "Mark completed" }],
  completed: [{ to: "live", label: "Back to live" }],
  cancelled: [{ to: "draft", label: "Restore as draft" }],
};

export function TournamentDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ["tournament", id], queryFn: () => getTournament(id!) });
  const entries = useQuery({ queryKey: ["entries", id], queryFn: () => listEntries(id!) });

  // New applications show up without a refresh.
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`admin-entries:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournament_entries", filter: `tournament_id=eq.${id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["entries", id] });
          qc.invalidateQueries({ queryKey: ["stats"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  if (t.isLoading) return <Spinner />;
  if (t.error) return <ErrorNote error={t.error} />;
  if (!t.data) return <p className="text-nf-muted">Tournament not found.</p>;

  return (
    <>
      <Link
        to="/tournaments"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-nf-soft-ink hover:text-nf-ink"
      >
        <ArrowLeft className="size-4" /> All tournaments
      </Link>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Header t={t.data} />
          <Applicants tournament={t.data} entries={entries.data} loading={entries.isLoading} error={entries.error} />
        </div>
        <Sidebar t={t.data} accepted={(entries.data ?? []).filter((e) => e.status === "accepted").length} />
      </div>
    </>
  );
}

function Header({ t }: { t: Tournament }) {
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[16/7] bg-nf-plum">
        {t.banner_path ? (
          <img src={bannerUrl(t.banner_path)} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-nf-gold">
            <Trophy className="size-12" aria-hidden />
            <Link to={`/tournaments/${t.id}/edit`} className="text-sm font-semibold text-white underline">
              Add a banner
            </Link>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-16 text-white">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} />
            {t.game && (
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase">
                {t.game}
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl leading-tight font-bold sm:text-3xl">{t.title}</h1>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
        <Info icon={CalendarDays} label="Starts" value={dateTime(t.starts_at)} />
        <Info icon={CalendarDays} label="Registration closes" value={dateTime(t.registration_closes_at)} />
        <Info icon={Users} label="Player limit" value={t.max_participants ? String(t.max_participants) : "No limit"} />
        <Info icon={Gift} label="Prize" value={t.prize || "—"} />
        {t.format && <Info icon={Trophy} label="Format" value={t.format} />}
      </div>
    </Card>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-nf-purple" aria-hidden />
      <div>
        <p className="text-xs font-semibold text-nf-muted">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

function Sidebar({ t, accepted }: { t: Tournament; accepted: number }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | "announce" | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tournament", t.id] });
    qc.invalidateQueries({ queryKey: ["tournaments"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const move = async (to: TournamentStatus) => {
    setBusy(to);
    try {
      await setTournamentStatus(t.id, to);
      toast.success(`Now: ${STATUS_META[to].label}`);
      refresh();
      setConfirm(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await deleteTournament(t);
      toast.success("Tournament deleted");
      refresh();
      navigate("/tournaments");
    } catch (err) {
      toast.error(friendlyError(err));
      setBusy(null);
    }
  };

  const announce = async () => {
    setBusy("announce");
    try {
      await announceTournament(t, announcement.trim());
      toast.success("Posted to the home feed");
      qc.invalidateQueries({ queryKey: ["posts"] });
      setConfirm(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const openAnnounce = () => {
    setAnnouncement(
      [
        `🏆 ${t.title}${t.game ? ` (${t.game})` : ""}`,
        t.status === "open" ? "Registration is open. Tap “View tournament” to apply." : STATUS_META[t.status].help,
        t.starts_at ? `📅 ${dateTime(t.starts_at)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    setConfirm("announce");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm text-nf-muted">{STATUS_META[t.status].help}</p>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-bold tabular-nums">{accepted}</span>
          <span className="text-sm text-nf-muted">
            {t.max_participants ? `of ${t.max_participants} spots filled` : "players accepted"}
          </span>
        </div>
        {t.max_participants && (
          <div className="h-2 overflow-hidden rounded-full bg-nf-field">
            <div
              className="h-full rounded-full bg-nf-purple"
              style={{ width: `${Math.min(100, (accepted / t.max_participants) * 100)}%` }}
            />
          </div>
        )}
        <div className="mt-1 flex flex-col gap-2">
          {NEXT[t.status].map((n, i) => (
            <Button
              key={n.to}
              variant={i === 0 ? "primary" : "secondary"}
              loading={busy === n.to}
              disabled={!!busy}
              onClick={() => move(n.to)}
            >
              {n.label}
            </Button>
          ))}
          <Link
            to={`/tournaments/${t.id}/edit`}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-nf-line-strong bg-white px-4 text-sm font-semibold hover:bg-nf-field"
          >
            <Pencil className="size-4" /> Edit details, criteria & banner
          </Link>
          {t.status !== "draft" && (
            <Button variant="secondary" onClick={openAnnounce}>
              <Megaphone className="size-4" /> Announce on home feed
            </Button>
          )}
          {appUrl && t.status !== "draft" && (
            <a
              href={`${appUrl}/tournaments/${t.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-center text-sm font-semibold text-nf-purple"
            >
              View in the NetFun app ↗
            </a>
          )}
        </div>
      </Card>

      {!["draft", "completed", "cancelled"].includes(t.status) && <InAppBroadcastCard t={t} />}

      {t.status !== "draft" && t.status !== "cancelled" && <LivestreamCard t={t} />}

      <MessagePlayersCard t={t} />

      <CommunityInvitesCard t={t} />

      {t.description && (
        <Card className="p-5">
          <h2 className="mb-2 font-display text-base font-bold">Description</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line text-nf-soft-ink">{t.description}</p>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-2 font-display text-base font-bold">Entry criteria</h2>
        {t.criteria.length ? (
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-nf-soft-ink">
            {t.criteria.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-nf-muted">No criteria set. Anyone can apply.</p>
        )}
        {t.entry_question && (
          <p className="mt-3 rounded-2xl bg-nf-field p-3 text-sm">
            <span className="font-semibold">Application question:</span> {t.entry_question}
          </p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {!["cancelled", "completed"].includes(t.status) && (
          <Button variant="ghost" size="sm" onClick={() => setConfirm("cancel")}>
            <X className="size-4" /> Cancel tournament
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-nf-red" onClick={() => setConfirm("delete")}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>

      <Modal
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        title="Cancel this tournament?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy === "cancelled"} onClick={() => move("cancelled")}>
              Cancel tournament
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-nf-soft-ink">
          It stays visible in the app marked as cancelled, and no one can apply. You can restore it
          as a draft later.
        </p>
      </Modal>
      <Modal
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title="Delete this tournament?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy === "delete"} onClick={remove}>
              Delete forever
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-nf-soft-ink">
          This removes the tournament, its banner and every application. Feed posts about it stay,
          without the link. To keep a record, cancel it instead.
        </p>
      </Modal>
      <Modal
        open={confirm === "announce"}
        onClose={() => setConfirm(null)}
        title="Announce on the home feed"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button loading={busy === "announce"} disabled={!announcement.trim()} onClick={announce}>
              Post
            </Button>
          </>
        }
      >
        <Field label="Post text" hint="Posted as an official post with the banner and a “View tournament” button.">
          <textarea
            className="input min-h-32 resize-y text-sm leading-relaxed"
            value={announcement}
            maxLength={2000}
            onChange={(e) => setAnnouncement(e.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
}

function Applicants({
  tournament,
  entries,
  loading,
  error,
}: {
  tournament: Tournament;
  entries: TournamentEntry[] | undefined;
  loading: boolean;
  error: unknown;
}) {
  const [tab, setTab] = useState<EntryStatus>("pending");
  const [search, setSearch] = useState("");
  const [moderate, setModerate] = useState<ModerationTarget | null>(null);
  const [rejecting, setRejecting] = useState<TournamentEntry | null>(null);
  const all = entries ?? [];
  const count = (s: EntryStatus) => all.filter((e) => e.status === s).length;
  const needle = search.trim().toLowerCase();
  const shown = all.filter(
    (e) =>
      e.status === tab &&
      (!needle ||
        [e.user?.full_name, e.user?.username, e.in_game_name, e.answer, e.user?.university]
          .join(" ")
          .toLowerCase()
          .includes(needle)),
  );
  const full =
    tournament.max_participants !== null && count("accepted") >= tournament.max_participants;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Applicants</h2>
        <input
          className="input max-w-xs"
          type="search"
          placeholder="Search name, IGN, answer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search applicants"
        />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "pending", label: "Pending", count: count("pending") },
          { value: "accepted", label: "Accepted", count: count("accepted") },
          { value: "rejected", label: "Rejected", count: count("rejected") },
        ]}
      />
      {full && tab === "pending" && count("pending") > 0 && (
        <p className="rounded-2xl bg-nf-gold-soft px-4 py-3 text-sm font-medium text-nf-gold-ink">
          All {tournament.max_participants} spots are filled. Raise the player limit or remove
          someone to accept more.
        </p>
      )}
      <ErrorNote error={error} />
      {loading && <Spinner />}
      {!loading && shown.length === 0 && (
        <Card>
          <EmptyState
            title={
              needle
                ? "No matches"
                : tab === "pending"
                  ? "No one waiting"
                  : tab === "accepted"
                    ? "No players accepted yet"
                    : "No rejections"
            }
            body={
              tab === "pending" && !needle
                ? tournament.status === "open"
                  ? "Applications from the app will show up here as they come in."
                  : "Open registration so players can apply from the app."
                : undefined
            }
          />
        </Card>
      )}
      <div className="flex flex-col gap-3">
        {shown.map((e) => (
          <EntryCard
            key={e.id}
            entry={e}
            tournament={tournament}
            full={full}
            onReject={() => setRejecting(e)}
            onModerate={(action) =>
              setModerate({ id: e.user_id, name: e.user?.full_name || e.user?.username || "User", action })
            }
          />
        ))}
      </div>
      <RejectDialog entry={rejecting} onClose={() => setRejecting(null)} />
      <ModerationDialog target={moderate} onClose={() => setModerate(null)} />
    </section>
  );
}

function EntryCard({
  entry: e,
  tournament,
  full,
  onReject,
  onModerate,
}: {
  entry: TournamentEntry;
  tournament: Tournament;
  full: boolean;
  onReject: () => void;
  onModerate: (action: ModerationTarget["action"]) => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const u = e.user;

  const act = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    setMenu(false);
    try {
      await fn();
      toast.success(done);
      qc.invalidateQueries({ queryKey: ["entries", tournament.id] });
      qc.invalidateQueries({ queryKey: ["tournaments"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const name = u?.full_name || u?.username || "User";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar profile={u} size={44} />
        <div className="min-w-[180px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{name}</p>
            {u?.banned_at && <Badge tone="red">Banned</Badge>}
            {u?.tournament_blocked_at && <Badge tone="gold">Blocked from tournaments</Badge>}
          </div>
          <p className="text-xs text-nf-muted">
            @{u?.username}
            {u?.university ? ` · ${u.university}` : ""} · applied {timeAgo(e.created_at)}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {e.status !== "accepted" && (
            <Button
              size="sm"
              variant="success"
              loading={busy === "accept"}
              disabled={!!busy || full || !!u?.banned_at}
              title={full ? "Tournament is full" : undefined}
              onClick={() => act("accept", () => reviewEntry(e.id, "accepted"), `${name} accepted`)}
            >
              <Check className="size-4" /> Accept
            </Button>
          )}
          {e.status !== "rejected" && (
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={onReject}>
              <X className="size-4" /> {e.status === "accepted" ? "Remove" : "Reject"}
            </Button>
          )}
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              aria-label={`More actions for ${name}`}
              aria-expanded={menu}
              className="flex size-9 items-center justify-center rounded-full border border-nf-line-strong bg-white hover:bg-nf-field"
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-20 mt-2 flex w-60 flex-col overflow-hidden rounded-2xl border border-nf-line bg-white py-1 text-sm shadow-lg">
                  {e.status !== "pending" && (
                    <MenuItem
                      icon={RotateCcw}
                      onClick={() => act("pending", () => reviewEntry(e.id, "pending"), "Moved back to pending")}
                    >
                      Move back to pending
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={Trash2}
                    onClick={() => act("delete", () => removeEntry(e.id), "Application deleted")}
                  >
                    Delete application (can re-apply)
                  </MenuItem>
                  {u?.tournament_blocked_at ? (
                    <MenuItem icon={ShieldOff} onClick={() => (setMenu(false), onModerate("unblock"))}>
                      Unblock from tournaments
                    </MenuItem>
                  ) : (
                    <MenuItem icon={ShieldOff} danger onClick={() => (setMenu(false), onModerate("block"))}>
                      Block from all tournaments
                    </MenuItem>
                  )}
                  {u?.banned_at ? (
                    <MenuItem icon={Ban} onClick={() => (setMenu(false), onModerate("unban"))}>
                      Unban from NetFun
                    </MenuItem>
                  ) : (
                    <MenuItem icon={Ban} danger onClick={() => (setMenu(false), onModerate("ban"))}>
                      Ban from NetFun
                    </MenuItem>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 rounded-2xl bg-nf-field p-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="font-semibold text-nf-muted">In-game name</dt>
        <dd className="font-medium break-words">{e.in_game_name || "—"}</dd>
        {tournament.entry_question && (
          <>
            <dt className="font-semibold text-nf-muted">{tournament.entry_question}</dt>
            <dd className="break-words whitespace-pre-line">{e.answer || "—"}</dd>
          </>
        )}
        {e.admin_note && (
          <>
            <dt className="font-semibold text-nf-muted">Note to player</dt>
            <dd className="break-words">{e.admin_note}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}

function MenuItem({
  icon: Icon,
  danger,
  onClick,
  children,
}: {
  icon: typeof Trash2;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-nf-field ${danger ? "text-nf-red" : ""}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </button>
  );
}

function RejectDialog({ entry, onClose }: { entry: TournamentEntry | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const name = entry?.user?.full_name || entry?.user?.username || "this player";
  const removing = entry?.status === "accepted";

  const confirm = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      await reviewEntry(entry.id, "rejected", note.trim());
      toast.success(removing ? `${name} removed` : `${name} rejected`);
      qc.invalidateQueries({ queryKey: ["entries", entry.tournament_id] });
      qc.invalidateQueries({ queryKey: ["tournaments"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setNote("");
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={removing ? `Remove ${name}?` : `Reject ${name}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={confirm}>
            {removing ? "Remove player" : "Reject"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[15px] text-nf-soft-ink">
        They get a notification in the app. They can't apply to this tournament again unless you
        delete the application or move it back to pending.
      </p>
      <Field label="Note to the player (optional)" hint="Shown to them in the app.">
        <input
          className="input"
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Your level is below 50. Try the next one!"
        />
      </Field>
    </Modal>
  );
}
