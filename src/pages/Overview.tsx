import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Megaphone, Plus, Trophy } from "lucide-react";
import { bannerUrl, getStats, listTournaments } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { Card, ErrorNote, PageHeader, StatusBadge } from "@/components/ui";

export function OverviewPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const tournaments = useQuery({ queryKey: ["tournaments"], queryFn: listTournaments });
  const s = stats.data;
  const needsReview = (tournaments.data ?? []).filter((t) => t.pending > 0);
  const active = (tournaments.data ?? []).filter((t) => ["open", "closed", "live"].includes(t.status));

  const tiles = [
    { label: "Users", value: s?.users, sub: s ? `+${s.users_week} this week` : "" },
    { label: "Posts", value: s?.posts, sub: s ? `${s.posts_today} in the last 24h` : "" },
    { label: "Active tournaments", value: s?.tournaments_open, sub: "Open or live" },
    { label: "Applications to review", value: s?.pending_entries, sub: "Pending", highlight: true },
    { label: "Banned users", value: s?.banned, sub: "" },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="What's happening on NetFun right now."
        actions={
          <>
            <Link
              to="/posts"
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-nf-line-strong bg-white px-4 text-sm font-semibold hover:bg-nf-field"
            >
              <Megaphone className="size-4" /> New post
            </Link>
            <Link
              to="/tournaments/new"
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-nf-purple px-4 text-sm font-semibold text-white hover:bg-nf-purple-deep"
            >
              <Plus className="size-4" /> Host a tournament
            </Link>
          </>
        }
      />
      <ErrorNote error={stats.error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <Card
            key={t.label}
            className={`p-4 ${t.highlight && (t.value ?? 0) > 0 ? "border-nf-gold bg-nf-gold-soft" : ""}`}
          >
            <p className="text-[13px] font-semibold text-nf-muted">{t.label}</p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums">
              {t.value ?? "—"}
            </p>
            {t.sub && <p className="mt-0.5 text-xs text-nf-muted">{t.sub}</p>}
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-lg font-bold">Waiting for your review</h2>
          <Card className="divide-y divide-nf-line">
            {needsReview.length === 0 && (
              <p className="p-5 text-sm text-nf-muted">No pending applications. Nice.</p>
            )}
            {needsReview.map((t) => (
              <Link
                key={t.id}
                to={`/tournaments/${t.id}`}
                className="flex items-center gap-3 p-4 hover:bg-nf-field/60"
              >
                <Trophy className="size-5 text-nf-gold-ink" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.title}</span>
                  <span className="text-xs text-nf-muted">{t.game}</span>
                </span>
                <span className="rounded-full bg-nf-gold px-2.5 py-1 text-xs font-bold text-nf-plum">
                  {t.pending} pending
                </span>
                <ChevronRight className="size-4 text-nf-muted" />
              </Link>
            ))}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-bold">Active tournaments</h2>
          <div className="flex flex-col gap-3">
            {active.length === 0 && (
              <Card className="p-5 text-sm text-nf-muted">
                Nothing running.{" "}
                <Link to="/tournaments/new" className="font-semibold text-nf-purple">
                  Host one
                </Link>
                .
              </Card>
            )}
            {active.map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`}>
                <Card className="flex items-center gap-3 overflow-hidden p-2 pr-4 hover:border-nf-purple">
                  <div className="h-16 w-28 shrink-0 overflow-hidden rounded-xl bg-nf-plum">
                    {t.banner_path && (
                      <img src={bannerUrl(t.banner_path)} alt="" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.title}</p>
                    <p className="text-xs text-nf-muted">Starts {dateTime(t.starts_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={t.status} />
                    <span className="text-xs text-nf-muted">
                      {t.accepted}
                      {t.max_participants ? `/${t.max_participants}` : ""} in
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
