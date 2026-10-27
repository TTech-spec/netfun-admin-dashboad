import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Smartphone, Tablet, X } from "lucide-react";
import { getVisitStats, listPageVisits, listRecentVisitors } from "@/lib/api";
import { useOnline } from "@/hooks/useOnline";
import { timeAgo } from "@/lib/format";
import type { PageVisit, RecentVisitor } from "@/lib/types";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  Tabs,
} from "@/components/ui";

type View = "people" | "visits";
type Who = { userId: string | null; visitorId: string | null; name: string };

const PAGE_NAMES: Record<string, string> = {
  "": "Landing page",
  home: "Home",
  login: "Log in",
  signup: "Sign up",
  waitlist: "Waitlist",
  chats: "Chats",
  communities: "Communities",
  c: "A community",
  discover: "Discover",
  profile: "Their profile",
  u: "Someone's profile",
  post: "A post",
  create: "Create a post",
  notifications: "Notifications",
  tournaments: "Tournaments",
  challenge: "A challenge",
  gigs: "Gigs",
  requests: "Requests",
  vibe: "Vibe match",
  j: "Invite link",
};

/** "Chats · /chats/123" */
function pageName(path: string): string {
  const first = path.replace(/^\//, "").split("/")[0];
  return PAGE_NAMES[first] ?? first.replace(/[-_.]/g, " ");
}

/** Mon 27 Oct, 9:41:05 pm */
function exactTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DeviceIcon({ device }: { device: string | null }) {
  const Icon =
    device === "phone" ? Smartphone : device === "tablet" ? Tablet : Monitor;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-nf-muted">
      <Icon className="size-3.5" aria-hidden /> {device ?? "unknown"}
    </span>
  );
}

function Person({
  username,
  avatarColor,
  visitorId,
}: {
  username: string | null;
  avatarColor: string | null;
  visitorId: string | null;
}) {
  return username ? (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar
        profile={{ username, avatar_color: avatarColor ?? undefined }}
        size={30}
      />
      <b className="truncate text-sm">@{username}</b>
    </span>
  ) : (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-nf-field text-xs font-bold text-nf-muted">
        ?
      </span>
      <span className="min-w-0">
        <b className="block truncate text-sm text-nf-soft-ink">Guest</b>
        <span className="block truncate text-[11px] text-nf-muted">
          not signed in · {visitorId?.slice(0, 6)}
        </span>
      </span>
    </span>
  );
}

export function VisitorsPage() {
  const [view, setView] = useState<View>("people");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [who, setWho] = useState<Who | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const online = useOnline();
  const stats = useQuery({
    queryKey: ["visit-stats"],
    queryFn: getVisitStats,
    refetchInterval: 30_000,
    retry: false,
  });
  const people = useQuery({
    queryKey: ["recent-visitors", debounced],
    queryFn: () => listRecentVisitors(debounced),
    refetchInterval: 30_000,
    enabled: view === "people",
    retry: false,
  });
  const visits = useQuery({
    queryKey: ["page-visits", debounced, who?.userId, who?.visitorId],
    queryFn: () =>
      listPageVisits({
        userId: who?.userId,
        visitorId: who?.visitorId,
        search: debounced,
      }),
    refetchInterval: 30_000,
    enabled: view === "visits",
    retry: false,
  });

  const open = (r: RecentVisitor) => {
    setWho({
      userId: r.user_id,
      visitorId: r.user_id ? null : r.visitor_id,
      name: r.username ? `@${r.username}` : "this guest",
    });
    setSearch("");
    setView("visits");
  };

  const s = stats.data;
  const tiles = [
    {
      label: "Visits",
      value: s?.visits_today,
      sub: "Pages opened, last 24 hours",
    },
    { label: "Signed-in people", value: s?.people_today, sub: "Last 24 hours" },
    {
      label: "Guests",
      value: s?.guests_today,
      sub: "Not signed in, last 24 hours",
    },
    {
      label: "Online now",
      value: online.connected ? online.ids.size : undefined,
      sub: "Have the app open",
    },
  ];

  return (
    <>
      <PageHeader
        title="Visitors"
        subtitle="Who opened NetFun, which page they were on and at what time. Updates every 30 seconds."
      />

      <ErrorNote error={stats.error} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs font-semibold text-nf-muted">{t.label}</p>
            <p className="font-display text-2xl font-bold">
              {t.value?.toLocaleString() ?? "–"}
            </p>
            <p className="text-xs text-nf-muted">{t.sub}</p>
          </Card>
        ))}
      </div>

      {!!s?.top_pages?.length && (
        <Card className="mb-5 flex flex-wrap items-center gap-2 p-4">
          <span className="text-sm font-semibold">Most visited today:</span>
          {s.top_pages.map((p) => (
            <Badge key={p.path} tone="purple">
              {pageName(p.path)} · {p.visits}
            </Badge>
          ))}
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={view}
          onChange={(v) => {
            setView(v);
            if (v === "people") setWho(null);
          }}
          tabs={[
            { value: "people", label: "Last visit per person" },
            { value: "visits", label: "Every visit" },
          ]}
        />
        <input
          className="input max-w-xs"
          type="search"
          placeholder="Search @username or page…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search visits"
        />
        {who && view === "visits" && (
          <button
            type="button"
            onClick={() => setWho(null)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-nf-purple-soft px-3 text-sm font-semibold text-nf-purple-deep"
          >
            Only {who.name} <X className="size-4" aria-label="Show everyone" />
          </button>
        )}
      </div>

      {view === "people" ? (
        <VisitorTable q={people} onOpen={open} />
      ) : (
        <VisitTable q={visits} />
      )}
    </>
  );
}

function VisitorTable({
  q,
  onOpen,
}: {
  q: { data?: RecentVisitor[]; error: unknown; isLoading: boolean };
  onOpen: (r: RecentVisitor) => void;
}) {
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data?.length)
    return (
      <Card>
        <EmptyState
          title="No visits yet"
          body="Visits show up here as people open the app."
        />
      </Card>
    );
  return (
    <Card className="divide-y divide-nf-line">
      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_90px] gap-3 px-4 py-2.5 text-xs font-semibold text-nf-muted md:grid">
        <span>Who</span>
        <span>Last page</span>
        <span>When</span>
        <span className="text-right">Today</span>
      </div>
      {q.data.map((r) => (
        <button
          key={r.user_id ?? `v:${r.visitor_id}`}
          type="button"
          onClick={() => onOpen(r)}
          className="grid w-full grid-cols-1 gap-1.5 px-4 py-3 text-left transition hover:bg-nf-field md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_90px] md:items-center md:gap-3"
        >
          <Person
            username={r.username}
            avatarColor={r.avatar_color}
            visitorId={r.visitor_id}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {pageName(r.last_path)}
            </span>
            <span className="block truncate text-xs text-nf-muted">
              {r.last_path}
            </span>
          </span>
          <span className="min-w-0">
            <span className="block text-sm">{exactTime(r.last_at)}</span>
            <span className="flex items-center gap-2 text-xs text-nf-muted">
              {timeAgo(r.last_at)} · <DeviceIcon device={r.device} />
            </span>
          </span>
          <span className="text-sm md:text-right">
            <b>{r.visits_today}</b>{" "}
            <span className="text-xs text-nf-muted">
              {r.visits_today === 1 ? "visit" : "visits"} · {r.pages_today}{" "}
              {r.pages_today === 1 ? "page" : "pages"}
            </span>
          </span>
        </button>
      ))}
    </Card>
  );
}

function VisitTable({
  q,
}: {
  q: { data?: PageVisit[]; error: unknown; isLoading: boolean };
}) {
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data?.length)
    return (
      <Card>
        <EmptyState title="No visits found" body="Try a different search." />
      </Card>
    );
  return (
    <Card className="divide-y divide-nf-line">
      {q.data.map((v) => (
        <div
          key={v.id}
          className="grid grid-cols-1 gap-1.5 px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.3fr)] md:items-center md:gap-3"
        >
          <Person
            username={v.username}
            avatarColor={v.avatar_color}
            visitorId={v.visitor_id}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {pageName(v.path)}
            </span>
            <span className="block truncate text-xs text-nf-muted">
              {v.path}
            </span>
          </span>
          <span className="min-w-0">
            <span className="block text-sm">{exactTime(v.created_at)}</span>
            <span className="flex items-center gap-2 text-xs text-nf-muted">
              {timeAgo(v.created_at)} · <DeviceIcon device={v.device} />
            </span>
          </span>
        </div>
      ))}
    </Card>
  );
}
