import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteFeedback,
  getProfilesByIds,
  listFeedback,
  setFeedbackDone,
} from "@/lib/api";
import { friendlyError, supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { Feedback, Profile } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  Tabs,
} from "@/components/ui";

type Filter = "new" | "done" | "all";

const FACES: Record<number, { emoji: string; label: string }> = {
  1: { emoji: "😞", label: "Very bad" },
  2: { emoji: "🙁", label: "Bad" },
  3: { emoji: "😐", label: "Okay" },
  4: { emoji: "🙂", label: "Good" },
  5: { emoji: "😍", label: "Great" },
};

export function FeedbackPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("new");
  const [busy, setBusy] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["feedback"],
    queryFn: listFeedback,
    retry: false,
  });
  const all = list.data ?? [];
  const userIds = [
    ...new Set(all.map((f) => f.user_id).filter((x): x is string => !!x)),
  ];
  const people = useQuery({
    queryKey: ["feedback-people", userIds],
    queryFn: () => getProfilesByIds(userIds),
    enabled: userIds.length > 0,
  });
  const byId = new Map((people.data ?? []).map((p) => [p.id, p]));

  // New feedback appears straight away.
  useEffect(() => {
    const ch = supabase
      .channel("admin-feedback")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feedback" },
        () => qc.invalidateQueries({ queryKey: ["feedback"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const fresh = all.filter((f) => !f.done_at);
  const done = all.filter((f) => f.done_at);
  const shown = filter === "new" ? fresh : filter === "done" ? done : all;
  const rated = all.filter((f) => f.rating);
  const average = rated.length
    ? rated.reduce((n, f) => n + (f.rating ?? 0), 0) / rated.length
    : 0;

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["feedback"] });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Feedback"
        subtitle="What people send with the Feedback button in the app. New ones appear here live."
      />

      {all.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-[220px_1fr]">
          <Card className="flex flex-col items-center justify-center gap-1 p-5 text-center">
            <span className="text-4xl" aria-hidden>
              {rated.length ? FACES[Math.round(average)].emoji : "💬"}
            </span>
            <b className="font-display text-2xl">
              {rated.length ? `${average.toFixed(1)} / 5` : "No ratings"}
            </b>
            <span className="text-xs text-nf-muted">
              {all.length} {all.length === 1 ? "message" : "messages"} ·{" "}
              {rated.length} rated
            </span>
          </Card>
          <Card className="flex flex-col justify-center gap-2 p-5">
            {[5, 4, 3, 2, 1].map((r) => {
              const n = rated.filter((f) => f.rating === r).length;
              const pct = rated.length
                ? Math.round((n / rated.length) * 100)
                : 0;
              return (
                <div key={r} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">
                    {FACES[r].emoji} {FACES[r].label}
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-nf-field">
                    <span
                      className="block h-full rounded-full bg-nf-purple"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-8 text-right text-nf-muted">{n}</span>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      <div className="mb-4">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "new", label: "New", count: fresh.length },
            { value: "done", label: "Done", count: done.length },
            { value: "all", label: "All", count: all.length },
          ]}
        />
      </div>

      <ErrorNote error={list.error} />
      {list.isLoading && <Spinner />}
      {list.data && shown.length === 0 && (
        <Card>
          <EmptyState
            title={filter === "new" ? "All caught up" : "Nothing here yet"}
            body={
              filter === "new"
                ? "New feedback from the app shows up here."
                : "Feedback you mark as done shows up here."
            }
          />
        </Card>
      )}

      {shown.length > 0 && (
        <Card className="divide-y divide-nf-line">
          {shown.map((f) => (
            <Row
              key={f.id}
              f={f}
              person={f.user_id ? byId.get(f.user_id) : undefined}
              busy={busy}
              onDone={() =>
                void run(
                  `done:${f.id}`,
                  () => setFeedbackDone(f.id, !f.done_at),
                  f.done_at ? "Moved back to New" : "Marked as done",
                )
              }
              onDelete={() => {
                if (!window.confirm("Delete this feedback for good?")) return;
                void run(
                  `delete:${f.id}`,
                  () => deleteFeedback(f.id),
                  "Feedback deleted",
                );
              }}
            />
          ))}
        </Card>
      )}
    </>
  );
}

function Row({
  f,
  person,
  busy,
  onDone,
  onDelete,
}: {
  f: Feedback;
  person?: Profile;
  busy: string | null;
  onDone: () => void;
  onDelete: () => void;
}) {
  const face = f.rating ? FACES[f.rating] : null;
  return (
    <div
      className={`flex flex-wrap items-start gap-3 p-4 ${f.done_at ? "opacity-70" : ""}`}
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-nf-field text-2xl"
        title={face?.label ?? "No rating"}
        aria-label={face ? `Rated ${face.label}` : "No rating"}
      >
        {face?.emoji ?? "💬"}
      </span>
      <div className="min-w-[220px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {person ? (
            <span className="flex items-center gap-1.5">
              <Avatar profile={person} size={22} />
              <b className="text-sm">@{person.username}</b>
            </span>
          ) : (
            <b className="text-sm text-nf-muted">
              {f.user_id ? "A NetFun user" : "Someone not signed in"}
            </b>
          )}
          {face && (
            <Badge
              tone={f.rating! >= 4 ? "green" : f.rating! <= 2 ? "red" : "gold"}
            >
              {face.label}
            </Badge>
          )}
          {f.done_at && <Badge tone="gray">Done</Badge>}
          <span className="text-xs text-nf-muted">{timeAgo(f.created_at)}</span>
        </div>
        {f.message ? (
          <p className="mt-1.5 text-[15px] whitespace-pre-line">{f.message}</p>
        ) : (
          <p className="mt-1.5 text-sm text-nf-muted italic">
            Just a rating, no message.
          </p>
        )}
        {f.page && (
          <p className="mt-1 text-xs text-nf-muted">Sent from {f.page}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={busy === `done:${f.id}`}
          onClick={onDone}
        >
          {f.done_at ? (
            <>
              <RotateCcw className="size-4" /> Reopen
            </>
          ) : (
            <>
              <Check className="size-4" /> Done
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-nf-red"
          loading={busy === `delete:${f.id}`}
          onClick={onDelete}
          aria-label="Delete feedback"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
