import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Cake, ShieldOff } from "lucide-react";
import { getBirthdates, listUsers } from "@/lib/api";
import { birthdayText, timeAgo } from "@/lib/format";
import type { AdminUser } from "@/lib/types";
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
import { ModerationDialog, type ModerationTarget } from "@/components/ModerationDialog";

type Filter = "all" | "banned" | "blocked";

export function UsersPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [moderate, setModerate] = useState<ModerationTarget | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const users = useQuery({ queryKey: ["users", debounced], queryFn: () => listUsers(debounced) });
  const ids = (users.data ?? []).map((u) => u.id);
  const births = useQuery({
    queryKey: ["birthdates", ids],
    queryFn: () => getBirthdates(ids),
    enabled: ids.length > 0,
    retry: false,
  });
  const shown = (users.data ?? []).filter((u) =>
    filter === "banned" ? !!u.banned_at : filter === "blocked" ? !!u.tournament_blocked_at : true,
  );

  const open = (u: AdminUser, action: ModerationTarget["action"]) =>
    setModerate({ id: u.id, name: u.full_name || u.username, action });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Ban someone from NetFun, or just block them from tournaments."
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          className="input max-w-sm"
          type="search"
          placeholder="Search name, username or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "Everyone" },
            { value: "banned", label: "Banned" },
            { value: "blocked", label: "Blocked from tournaments" },
          ]}
        />
      </div>
      <ErrorNote error={users.error} />
      {users.isLoading && <Spinner />}
      {users.data && shown.length === 0 && (
        <Card>
          <EmptyState title="No one here" body={search ? "Try a different search." : undefined} />
        </Card>
      )}
      {shown.length > 0 && (
        <Card className="divide-y divide-nf-line">
          {shown.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar profile={u} size={44} />
              <div className="min-w-[200px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{u.full_name || u.username}</p>
                  {u.is_admin && <Badge tone="purple">Admin</Badge>}
                  {u.banned_at && <Badge tone="red">Banned {timeAgo(u.banned_at)}</Badge>}
                  {u.tournament_blocked_at && <Badge tone="gold">No tournaments</Badge>}
                </div>
                <p className="truncate text-xs text-nf-muted">
                  @{u.username} · {u.email}
                  {u.university ? ` · ${u.university}` : ""}
                </p>
                <p className="text-xs text-nf-muted">
                  Joined {timeAgo(u.created_at)} · {u.post_count} post{u.post_count === 1 ? "" : "s"}
                </p>
                <p className="flex items-center gap-1 text-xs text-nf-muted">
                  <Cake className="size-3.5" aria-hidden />
                  {births.data?.[u.id]
                    ? birthdayText(births.data[u.id])
                    : births.isLoading
                      ? "…"
                      : "No date of birth"}
                </p>
                {u.ban_reason && <p className="text-xs text-nf-red">Ban reason: {u.ban_reason}</p>}
              </div>
              {!u.is_admin && (
                <div className="flex flex-wrap gap-2">
                  {u.tournament_blocked_at ? (
                    <Button size="sm" variant="secondary" onClick={() => open(u, "unblock")}>
                      Unblock tournaments
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => open(u, "block")}>
                      <ShieldOff className="size-4" /> Block from tournaments
                    </Button>
                  )}
                  {u.banned_at ? (
                    <Button size="sm" variant="secondary" onClick={() => open(u, "unban")}>
                      Unban
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => open(u, "ban")}>
                      <Ban className="size-4" /> Ban
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      {users.data?.length === 100 && (
        <p className="mt-3 text-center text-xs text-nf-muted">
          Showing the newest 100. Search to find someone specific.
        </p>
      )}
      <ModerationDialog target={moderate} onClose={() => setModerate(null)} />
    </>
  );
}
