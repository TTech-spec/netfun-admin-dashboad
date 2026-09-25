import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Plus, Trophy, Users } from "lucide-react";
import { bannerUrl, listTournaments } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { TournamentStatus } from "@/lib/types";
import { Card, EmptyState, ErrorNote, PageHeader, Spinner, StatusBadge, Tabs } from "@/components/ui";

type Filter = "active" | "draft" | "past" | "all";

const IN_FILTER: Record<Filter, (s: TournamentStatus) => boolean> = {
  active: (s) => s === "open" || s === "closed" || s === "live",
  draft: (s) => s === "draft",
  past: (s) => s === "completed" || s === "cancelled",
  all: () => true,
};

export function TournamentsPage() {
  const [filter, setFilter] = useState<Filter>("active");
  const q = useQuery({ queryKey: ["tournaments"], queryFn: listTournaments });
  const all = q.data ?? [];
  const shown = all.filter((t) => IN_FILTER[filter](t.status));
  const count = (f: Filter) => all.filter((t) => IN_FILTER[f](t.status)).length;

  return (
    <>
      <PageHeader
        title="Tournaments"
        subtitle="Host game tournaments, set who can enter, and pick your players."
        actions={
          <Link
            to="/tournaments/new"
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-nf-purple px-4 text-sm font-semibold text-white hover:bg-nf-purple-deep"
          >
            <Plus className="size-4" /> Host a tournament
          </Link>
        }
      />
      <div className="mb-5">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "active", label: "Active", count: count("active") },
            { value: "draft", label: "Drafts", count: count("draft") },
            { value: "past", label: "Past", count: count("past") },
            { value: "all", label: "All", count: all.length },
          ]}
        />
      </div>
      <ErrorNote error={q.error} />
      {q.isLoading && <Spinner />}
      {q.data && shown.length === 0 && (
        <Card>
          <EmptyState
            title="No tournaments here"
            body="Create one with a banner, entry criteria and a player limit. You approve every player."
            action={
              <Link to="/tournaments/new" className="font-bold text-nf-purple">
                Host a tournament
              </Link>
            }
          />
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((t) => (
          <Link key={t.id} to={`/tournaments/${t.id}`} className="group">
            <Card className="h-full overflow-hidden transition group-hover:border-nf-purple group-hover:shadow-md">
              <div className="relative aspect-[16/9] bg-nf-plum">
                {t.banner_path ? (
                  <img src={bannerUrl(t.banner_path)} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-nf-gold">
                    <Trophy className="size-10" aria-hidden />
                  </div>
                )}
                <div className="absolute top-3 left-3">
                  <StatusBadge status={t.status} />
                </div>
                {t.pending > 0 && (
                  <span className="absolute top-3 right-3 rounded-full bg-nf-gold px-2.5 py-1 text-xs font-bold text-nf-plum">
                    {t.pending} to review
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 p-4">
                <p className="text-xs font-bold tracking-wider text-nf-purple uppercase">{t.game || "Game"}</p>
                <p className="font-display text-lg leading-snug font-bold">{t.title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-nf-muted">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="size-4" aria-hidden /> {dateTime(t.starts_at)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" aria-hidden /> {t.accepted}
                    {t.max_participants ? ` / ${t.max_participants}` : ""} accepted
                  </span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
