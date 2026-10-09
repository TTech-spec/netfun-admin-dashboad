import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Mic, MicOff, MonitorUp, Radio, Square } from "lucide-react";
import { toast } from "sonner";
import type { Room } from "livekit-client";
import { getBroadcastPass, postStream, setLiveInApp } from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import { Badge, Button, Card } from "./ui";
import { LiveChatModeration } from "./LiveChatModeration";

type Source = "camera" | "screen";

/**
 * Broadcast your camera or screen straight into the NetFun app (LiveKit).
 * Viewers watch on the tournament page with the live chat.
 */
export function InAppBroadcastCard({ t }: { t: Tournament }) {
  const qc = useQueryClient();
  const preview = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [source, setSource] = useState<Source>("screen");
  const [mic, setMic] = useState(true);
  const [state, setState] = useState<"idle" | "starting" | "live" | "stopping">("idle");
  const [postToFeed, setPostToFeed] = useState(true);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tournament", t.id] });
    qc.invalidateQueries({ queryKey: ["tournaments"] });
    qc.invalidateQueries({ queryKey: ["posts"] });
  };

  // Leaving the page would cut the stream for everyone; warn first.
  useEffect(() => {
    if (state !== "live") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  // Disconnect if the admin navigates away inside the dashboard.
  useEffect(
    () => () => {
      const room = roomRef.current;
      if (room) {
        void room.disconnect();
        void setLiveInApp(t, false).catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const showPreview = (room: Room) => {
    const box = preview.current;
    if (!box) return;
    for (const pub of room.localParticipant.videoTrackPublications.values()) {
      if (pub.track) {
        const el = pub.track.attach() as HTMLVideoElement;
        el.muted = true;
        el.className = "size-full object-contain";
        box.replaceChildren(el);
        return;
      }
    }
  };

  const stop = async (quiet = false) => {
    setState("stopping");
    const room = roomRef.current;
    roomRef.current = null;
    preview.current?.replaceChildren();
    try {
      await room?.disconnect();
      await setLiveInApp(t, false);
      if (!quiet) toast.success("Broadcast ended");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setState("idle");
      refresh();
    }
  };

  const start = async () => {
    setState("starting");
    let room: Room | null = null;
    try {
      const lk = await import("livekit-client");
      const pass = await getBroadcastPass(t.id);
      room = new lk.Room({ adaptiveStream: false, dynacast: true });
      await room.connect(pass.url, pass.token);
      roomRef.current = room;

      if (source === "screen") {
        await room.localParticipant.setScreenShareEnabled(true, { audio: true });
      } else {
        await room.localParticipant.setCameraEnabled(true);
      }
      if (mic) await room.localParticipant.setMicrophoneEnabled(true);

      // If the browser's "Stop sharing" button is used, end the broadcast.
      room.on(lk.RoomEvent.LocalTrackUnpublished, () => {
        const r = roomRef.current;
        if (r && r.localParticipant.videoTrackPublications.size === 0) void stop();
      });
      room.on(lk.RoomEvent.Disconnected, () => {
        if (roomRef.current) {
          toast.error("The broadcast disconnected.");
          void stop(true);
        }
      });

      showPreview(room);
      await setLiveInApp(t, true);
      setState("live");
      refresh();
      toast.success("You're live in the app! Accepted players were notified.");

      if (postToFeed) {
        try {
          await postStream(t, `/tournaments/${t.id}`, {
            body: `${t.title} is LIVE now on NetFun${t.game ? ` (${t.game})` : ""}! 🎮\nTap “Watch live” to watch in the app and join the chat.`,
            communityId: null,
            pinDays: 1,
          });
        } catch (err) {
          toast.error(`Broadcast is on, but the feed post failed: ${friendlyError(err)}`);
        }
      }
    } catch (err) {
      await room?.disconnect().catch(() => {});
      roomRef.current = null;
      setState("idle");
      toast.error(friendlyError(err));
    }
  };

  const toggleMic = async () => {
    const next = !mic;
    setMic(next);
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next).catch(() => {});
  };

  const live = state === "live" || state === "stopping";

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Radio className="size-5 text-nf-red" aria-hidden />
        <h2 className="flex-1 font-display text-base font-bold">Stream in the app</h2>
        {(live || t.live_in_app) && <Badge tone="red">Live</Badge>}
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-nf-plum">
        <div ref={preview} className="size-full" />
        {!live && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
            {t.live_in_app && state === "idle"
              ? "A broadcast is marked live but this page isn't sending it. Start again or end it."
              : "Your preview shows here once you start."}
          </p>
        )}
      </div>

      {!live ? (
        <>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What to stream">
            {(
              [
                ["screen", MonitorUp, "Share screen"],
                ["camera", Camera, "Camera"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={source === value}
                onClick={() => setSource(value)}
                className={`flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-semibold ${
                  source === value
                    ? "border-nf-purple bg-nf-purple-soft text-nf-purple-deep"
                    : "border-nf-line-strong bg-white"
                }`}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-nf-purple"
              checked={mic}
              onChange={(e) => setMic(e.target.checked)}
            />
            Include my microphone
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-nf-purple"
              checked={postToFeed}
              onChange={(e) => setPostToFeed(e.target.checked)}
            />
            Post “🔴 LIVE” on the Home feed (pinned for a day)
          </label>
          <Button loading={state === "starting"} onClick={start}>
            <Radio className="size-4" /> Start broadcast
          </Button>
          {t.live_in_app && state === "idle" && (
            <Button variant="ghost" size="sm" onClick={() => void stop()}>
              End the broadcast for viewers
            </Button>
          )}
          <p className="text-xs text-nf-muted">
            Works from Chrome or Edge on a computer. To show a game, share the window or screen
            it's on (a PC game, emulator or a phone mirrored to the computer).
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void toggleMic()}>
              {mic ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              {mic ? "Mute mic" : "Unmute mic"}
            </Button>
            <LiveChatModeration tournamentId={t.id} />
          </div>
          <Button variant="danger" loading={state === "stopping"} onClick={() => void stop()}>
            <Square className="size-4" /> End broadcast
          </Button>
          <p className="text-xs text-nf-muted">Keep this tab open while you're live.</p>
        </>
      )}
    </Card>
  );
}
