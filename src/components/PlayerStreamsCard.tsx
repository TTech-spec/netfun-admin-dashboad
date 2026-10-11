import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Gamepad2, Monitor, Smartphone, Square } from "lucide-react";
import { toast } from "sonner";
import {
  listEntries,
  listLiveStreamers,
  setStreamBlocked,
  stopAllPlayerStreams,
  stopPlayerStream,
} from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { Tournament } from "@/lib/types";
import { Badge, Button, Card, ErrorNote } from "./ui";

/**
 * Who is streaming their game right now (players stream from the app while the
 * tournament is Live). Stop a stream, or block a player from streaming again.
 */
export function PlayerStreamsCard({ t }: { t: Tournament }) {
  const qc = useQueryClient();
  const live = t.status === "live";
  const streamers = useQuery({
    queryKey: ["live-streamers", t.id],
    queryFn: () => listLiveStreamers(t.id),
    enabled: live,
    refetchInterval: 8000,
    retry: false,
  });
  const entries = useQuery({ queryKey: ["entries", t.id], queryFn: () => listEntries(t.id) });
  const [busy, setBusy] = useState<string | null>(null);

  const entryFor = (userId: string | null) => entries.data?.find((e) => e.user_id === userId);
  const players = (streamers.data ?? []).filter((s) => !s.host);
  const blocked = (entries.data ?? []).filter((e) => e.stream_blocked);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      qc.invalidateQueries({ queryKey: ["live-streamers", t.id] });
      qc.invalidateQueries({ queryKey: ["entries", t.id] });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Gamepad2 className="size-5 text-nf-purple" aria-hidden />
        <h2 className="flex-1 font-display text-base font-bold">Player streams</h2>
        {live && players.length > 0 && <Badge tone="red">{players.length} live</Badge>}
      </div>

      {!live ? (
        <p className="text-sm text-nf-muted">
          When the tournament is <b>Live</b>, accepted players get a <b>Stream your game</b> button
          in the app (share their screen on a computer, or stream a phone game through a free
          app). Their streams show up here and on the tournament page.
        </p>
      ) : (
        <>
          <ErrorNote error={streamers.error} />
          {!streamers.error && players.length === 0 && (
            <p className="text-sm text-nf-muted">
              No players are streaming yet. Tip: use <b>Message players</b> to remind them to tap
              <b> Stream your game</b>.
            </p>
          )}
          <ul className="flex flex-col divide-y divide-nf-line">
            {players.map((s) => {
              const entry = entryFor(s.userId);
              return (
                <li key={s.identity} className="flex items-center gap-2.5 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-nf-red-soft text-nf-red">
                    {s.device === "phone" ? <Smartphone className="size-4" /> : <Monitor className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="block truncate text-xs text-nf-muted">
                      {entry?.user ? `@${entry.user.username} · ` : ""}
                      {s.device === "phone" ? "from a phone app" : "from a computer"}
                      {s.joinedAt ? ` · live ${timeAgo(new Date(s.joinedAt).toISOString())}` : ""}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === `stop:${s.identity}`}
                    disabled={!s.userId}
                    onClick={() =>
                      void run(
                        `stop:${s.identity}`,
                        () => stopPlayerStream(t.id, s.userId!),
                        `${s.name}'s stream stopped`,
                      )
                    }
                  >
                    <Square className="size-3.5" /> Stop
                  </Button>
                  {entry && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-nf-red"
                      loading={busy === `block:${entry.id}`}
                      onClick={() =>
                        void run(
                          `block:${entry.id}`,
                          async () => {
                            await setStreamBlocked(entry.id, true);
                            await stopPlayerStream(t.id, entry.user_id);
                          },
                          `${s.name} can't stream in this tournament now`,
                        )
                      }
                    >
                      <Ban className="size-3.5" /> Block
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {players.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              loading={busy === "stop-all"}
              onClick={() =>
                void run("stop-all", () => stopAllPlayerStreams(t.id), "All player streams stopped")
              }
            >
              Stop all player streams
            </Button>
          )}
        </>
      )}

      {blocked.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-nf-field p-3">
          <p className="text-xs font-semibold text-nf-muted">Blocked from streaming</p>
          {blocked.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {e.in_game_name || e.user?.full_name || e.user?.username}
              </span>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === `unblock:${e.id}`}
                onClick={() =>
                  void run(
                    `unblock:${e.id}`,
                    () => setStreamBlocked(e.id, false),
                    "They can stream again",
                  )
                }
              >
                Unblock
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
