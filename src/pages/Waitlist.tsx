import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  admitEveryone,
  admitFromWaitlist,
  listWaitlist,
  sendBackToWaitlist,
  waitlistCounts,
} from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { WaitlistPerson } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Modal,
  PageHeader,
  Spinner,
  Tabs,
} from "@/components/ui";

type Filter = "waiting" | "admitted";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function WaitlistPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<Filter>("waiting");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPicked(new Set()), [filter, debounced]);

  const counts = useQuery({ queryKey: ["waitlist-counts"], queryFn: waitlistCounts, retry: false });
  const list = useQuery({
    queryKey: ["waitlist", filter, debounced],
    queryFn: () => listWaitlist(debounced, filter),
    retry: false,
  });
  const rows = list.data ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.user_id));

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async (key: string, fn: () => Promise<number>, done: (n: number) => string) => {
    setBusy(key);
    try {
      const n = await fn();
      toast.success(done(n));
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      qc.invalidateQueries({ queryKey: ["waitlist-counts"] });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const letIn = (ids: string[], key: string) =>
    run(key, () => admitFromWaitlist(ids), (n) =>
      n ? `${people(n)} let in. They'll get the full app within a minute.` : "They were already in.",
    );
  const sendBack = (ids: string[], key: string) =>
    run(key, () => sendBackToWaitlist(ids), (n) => `${people(n)} back on the waitlist.`);

  return (
    <>
      <PageHeader
        title="Waitlist"
        subtitle="Let chosen people into the full app before launch. They get a “You're in!” notification."
        actions={
          (counts.data?.waiting ?? 0) > 0 ? (
            <Button variant="secondary" onClick={() => setConfirmAll(true)}>
              <Users className="size-4" /> Let everyone in
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          className="input max-w-sm"
          type="search"
          placeholder="Search name, username or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search the waitlist"
        />
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "waiting", label: "Still waiting", count: counts.data?.waiting },
            { value: "admitted", label: "Let in", count: counts.data?.admitted },
          ]}
        />
      </div>

      <ErrorNote error={list.error} />
      {list.isLoading && <Spinner />}
      {list.data && rows.length === 0 && (
        <Card>
          <EmptyState
            title={filter === "waiting" ? "Nobody is waiting" : "Nobody let in yet"}
            body={search ? "Try a different search." : undefined}
          />
        </Card>
      )}

      {rows.length > 0 && (
        <>
          <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-nf-line bg-white/95 px-4 py-3 backdrop-blur">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-4 accent-nf-purple"
                checked={allPicked}
                onChange={() =>
                  setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.user_id)))
                }
              />
              Select all {rows.length}
            </label>
            <span className="flex-1 text-sm text-nf-muted">
              {picked.size ? `${picked.size} selected` : "Tick people, or use the button on a row."}
            </span>
            {picked.size > 0 &&
              (filter === "waiting" ? (
                <Button loading={busy === "picked"} onClick={() => void letIn([...picked], "picked")}>
                  <DoorOpen className="size-4" /> Let {people(picked.size)} in
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  loading={busy === "picked"}
                  onClick={() => void sendBack([...picked], "picked")}
                >
                  <Undo2 className="size-4" /> Send {people(picked.size)} back
                </Button>
              ))}
          </div>

          <Card className="divide-y divide-nf-line">
            {rows.map((p) => (
              <Row
                key={p.user_id}
                p={p}
                picked={picked.has(p.user_id)}
                onPick={() => toggle(p.user_id)}
                busy={busy === p.user_id}
                onLetIn={() => void letIn([p.user_id], p.user_id)}
                onSendBack={() => void sendBack([p.user_id], p.user_id)}
              />
            ))}
          </Card>
        </>
      )}

      <Modal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Let everyone in?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAll(false)}>
              Cancel
            </Button>
            <Button
              loading={busy === "all"}
              onClick={async () => {
                await run("all", admitEveryone, (n) => `${people(n)} let in. NetFun is open to them.`);
                setConfirmAll(false);
              }}
            >
              Let {people(counts.data?.waiting ?? 0)} in
            </Button>
          </>
        }
      >
        <p className="text-sm text-nf-soft-ink">
          Everyone still on the waitlist gets the full app and a “You're in!” notification. Do this
          on launch day, or when you're ready to open up.
        </p>
      </Modal>
    </>
  );
}

function Row({
  p,
  picked,
  onPick,
  busy,
  onLetIn,
  onSendBack,
}: {
  p: WaitlistPerson;
  picked: boolean;
  onPick: () => void;
  busy: boolean;
  onLetIn: () => void;
  onSendBack: () => void;
}) {
  const waiting = !p.admitted_at;
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <input
        type="checkbox"
        className="size-4 accent-nf-purple"
        checked={picked}
        onChange={onPick}
        aria-label={`Select ${p.full_name || p.username}`}
      />
      <Avatar profile={p} size={44} />
      <div className="min-w-[200px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{p.full_name || p.username}</p>
          {p.line_number != null && waiting && <Badge tone="gray">#{p.line_number} in line</Badge>}
          {p.goal === "earn" && <Badge tone="gold">Wants to earn</Badge>}
          {p.referrals > 0 && (
            <Badge tone="purple">
              Invited {p.referrals}
            </Badge>
          )}
          {!waiting && <Badge tone="green">In {timeAgo(p.admitted_at!)}</Badge>}
        </div>
        <p className="truncate text-xs text-nf-muted">
          @{p.username} · {p.email}
          {p.university ? ` · ${p.university}` : ""}
        </p>
        <p className="text-xs text-nf-muted">
          Joined the waitlist {timeAgo(p.joined_at)}
          {p.expectations?.length ? ` · Wants: ${p.expectations.join(", ")}` : ""}
        </p>
      </div>
      {waiting ? (
        <Button size="sm" loading={busy} onClick={onLetIn}>
          <DoorOpen className="size-4" /> Let in
        </Button>
      ) : (
        <Button size="sm" variant="secondary" loading={busy} onClick={onSendBack}>
          <Undo2 className="size-4" /> Send back
        </Button>
      )}
    </div>
  );
}
