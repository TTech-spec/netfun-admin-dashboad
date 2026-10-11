import { useQuery } from "@tanstack/react-query";
import { getProfilesByIds } from "@/lib/api";
import { useOnline } from "@/hooks/useOnline";
import { Avatar, Card } from "./ui";

const SHOW = 24;

/** Live count of people with the NetFun app open, and who they are. */
export function OnlineNowCard() {
  const { ids, connected } = useOnline();
  const list = [...ids].sort();
  const people = useQuery({
    queryKey: ["online-profiles", list.slice(0, SHOW).join(",")],
    queryFn: () => getProfilesByIds(list.slice(0, SHOW)),
    enabled: list.length > 0,
    placeholderData: (prev) => prev,
  });
  const shown = (people.data ?? []).filter((p) => ids.has(p.id));

  return (
    <Card className="mb-3 flex flex-col gap-4 border-[#B7EBD3] bg-[#F1FBF6] p-5 sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-3">
        <span className="relative flex size-3.5">
          {connected && ids.size > 0 && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#34D399] opacity-60" />
          )}
          <span
            className={`relative inline-flex size-3.5 rounded-full ${connected ? "bg-[#10B981]" : "bg-nf-line-strong"}`}
          />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-[#047857]">Online now</p>
          <p className="font-display text-4xl leading-none font-bold tabular-nums" aria-live="polite">
            {connected ? ids.size : "—"}
          </p>
        </div>
      </div>
      <div className="min-w-0 flex-1 sm:border-l sm:border-[#B7EBD3] sm:pl-5">
        {!connected ? (
          <p className="text-sm text-nf-muted">Connecting to live updates…</p>
        ) : ids.size === 0 ? (
          <p className="text-sm text-nf-muted">Nobody has the app open right now.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {shown.map((p) => (
              <span
                key={p.id}
                title={`${p.full_name || p.username} (@${p.username})`}
                className="flex items-center gap-1.5 rounded-full bg-white py-1 pr-3 pl-1 text-[13px] font-semibold shadow-sm"
              >
                <Avatar profile={p} size={24} />
                <span className="max-w-[140px] truncate">{p.full_name || p.username}</span>
              </span>
            ))}
            {ids.size > shown.length && (
              <span className="text-[13px] font-semibold text-nf-muted">
                +{ids.size - shown.length} more
              </span>
            )}
          </div>
        )}
        <p className="mt-2 text-xs text-nf-muted">
          People with the NetFun app open, updated live. Admins on this dashboard aren't counted.
        </p>
      </div>
    </Card>
  );
}
