import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ExternalLink, MessageCircle, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { listCommunitiesForReview, setCommunityVerified } from "@/lib/api";
import { appUrl, friendlyError } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { ReviewCommunity } from "@/lib/types";
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, PageHeader, Spinner, Tabs } from "@/components/ui";

type Filter = "waiting" | "verified" | "all";

export function CommunitiesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["review-communities"], queryFn: listCommunitiesForReview });
  const [filter, setFilter] = useState<Filter>("waiting");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const all = list.data ?? [];
  const term = search.trim().toLowerCase();
  const rows = all
    .filter((c) => (filter === "all" ? true : filter === "verified" ? !!c.verified_at : !c.verified_at))
    .filter(
      (c) =>
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.creator?.username.toLowerCase().includes(term) ||
        c.category.toLowerCase().includes(term),
    );

  const toggle = async (c: ReviewCommunity, on: boolean) => {
    setBusy(c.id);
    try {
      await setCommunityVerified(c.id, on);
      await qc.invalidateQueries({ queryKey: ["review-communities"] });
      toast.success(
        on ? `${c.name} is verified. Its posts now show on everyone's Home.` : `Removed verification from ${c.name}.`,
      );
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Communities"
        subtitle="Verified communities get a purple Verified tag in the app, and their posts show on everyone's Home feed. Unverified ones only show inside the community."
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "waiting", label: "Waiting", count: all.filter((c) => !c.verified_at).length },
            { value: "verified", label: "Verified", count: all.filter((c) => !!c.verified_at).length },
            { value: "all", label: "All", count: all.length },
          ]}
        />
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-nf-muted" />
          <input
            className="input pl-10"
            placeholder="Search communities"
            aria-label="Search by name, creator or category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <ErrorNote error={list.error} />
      {list.isLoading && <Spinner />}
      {!list.isLoading && rows.length === 0 && (
        <Card>
          <EmptyState
            title={filter === "waiting" && !term ? "All caught up" : "Nothing here"}
            body={filter === "waiting" && !term ? "No member-made communities are waiting for verification." : undefined}
          />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => (
          <Card key={c.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-[14px] font-display text-lg font-extrabold"
                style={{ background: c.theme_color, color: c.accent_color }}
              >
                {c.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-bold">
                  <span className="truncate">{c.name}</span>
                  {c.verified_at && <BadgeCheck className="size-4 shrink-0 text-nf-purple" aria-label="Verified" />}
                </p>
                <p className="truncate text-xs text-nf-muted">
                  <span className="capitalize">{c.category}</span> · made {timeAgo(c.created_at)}
                </p>
              </div>
              {c.verified_at ? <Badge tone="purple">Verified</Badge> : <Badge>Not verified</Badge>}
            </div>

            {c.description && <p className="line-clamp-3 text-sm leading-relaxed text-nf-soft-ink">{c.description}</p>}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-nf-soft-ink">
              <span className="flex items-center gap-1.5">
                <Users className="size-4" aria-hidden /> {c.member_count}{" "}
                {c.member_count === 1 ? "member" : "members"}
              </span>
              {c.creator && (
                <span className="flex min-w-0 items-center gap-1.5">
                  <Avatar profile={c.creator} size={20} />
                  <span className="truncate">@{c.creator.username}</span>
                </span>
              )}
              {c.verified_at && <span className="text-nf-muted">verified {timeAgo(c.verified_at)}</span>}
            </div>

            {c.creator && (
              <Link
                to={`/messages/${c.creator.id}`}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-nf-line-strong text-[13px] font-semibold hover:bg-nf-field"
              >
                <MessageCircle className="size-4" /> Message owner
              </Link>
            )}

            <div className="mt-auto flex gap-2 pt-1">
              {appUrl && (
                <a
                  href={`${appUrl}/c/${c.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-nf-line-strong text-[13px] font-semibold hover:bg-nf-field"
                >
                  <ExternalLink className="size-4" /> View in app
                </a>
              )}
              {c.verified_at ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 text-nf-red"
                  loading={busy === c.id}
                  onClick={() => void toggle(c, false)}
                >
                  Remove verification
                </Button>
              ) : (
                <Button size="sm" className="flex-1" loading={busy === c.id} onClick={() => void toggle(c, true)}>
                  <BadgeCheck className="size-4" /> Verify
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
