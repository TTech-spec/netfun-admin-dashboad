import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  announceTournament,
  bannerUrl,
  getTournament,
  saveTournament,
  type TournamentInput,
} from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import { dateTime, fromLocalInput, toLocalInput } from "@/lib/format";
import type { Tournament, TournamentStatus } from "@/lib/types";
import { Button, Card, ErrorNote, Field, ImagePicker, PageHeader, Spinner } from "@/components/ui";

const GAMES = [
  "Call of Duty Mobile",
  "eFootball",
  "EA SPORTS FC Mobile",
  "PUBG Mobile",
  "Free Fire",
  "Mortal Kombat",
  "Chess",
  "Blur",
  "Clash Royale",
  "Scrabble",
];

const CRITERIA_IDEAS = [
  "Must be a current university student",
  "Account level 50 or higher",
  "Available on the tournament date",
  "Must join the Gaming Community on NetFun",
  "No cheats, mods or emulators",
];

type FormState = {
  title: string;
  game: string;
  format: string;
  prize: string;
  description: string;
  criteria: string[];
  entry_question: string;
  max_participants: string;
  starts_at: string;
  registration_closes_at: string;
};

const EMPTY: FormState = {
  title: "",
  game: "",
  format: "",
  prize: "",
  description: "",
  criteria: [""],
  entry_question: "",
  max_participants: "",
  starts_at: "",
  registration_closes_at: "",
};

function fromTournament(t: Tournament): FormState {
  return {
    title: t.title,
    game: t.game,
    format: t.format,
    prize: t.prize,
    description: t.description,
    criteria: t.criteria.length ? t.criteria : [""],
    entry_question: t.entry_question,
    max_participants: t.max_participants ? String(t.max_participants) : "",
    starts_at: toLocalInput(t.starts_at),
    registration_closes_at: toLocalInput(t.registration_closes_at),
  };
}

export function TournamentFormPage() {
  const { id } = useParams();
  const existing = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => getTournament(id!),
    enabled: !!id,
  });

  if (id && existing.isLoading) return <Spinner />;
  if (id && existing.error) return <ErrorNote error={existing.error} />;
  if (id && !existing.data) return <p className="text-nf-muted">Tournament not found.</p>;
  return <TournamentForm key={id ?? "new"} tournament={existing.data ?? null} />;
}

function TournamentForm({ tournament }: { tournament: Tournament | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(tournament ? fromTournament(tournament) : EMPTY);
  const [banner, setBanner] = useState<File | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [announce, setAnnounce] = useState(!tournament);
  const [announcement, setAnnouncement] = useState("");
  const [announcementEdited, setAnnouncementEdited] = useState(false);
  const [busy, setBusy] = useState<TournamentStatus | "save" | null>(null);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  // Suggest announcement text until the admin edits it.
  useEffect(() => {
    if (announcementEdited) return;
    const lines = [
      `🏆 ${f.title || "New tournament"}${f.game ? ` (${f.game})` : ""} is open for registration!`,
      f.starts_at ? `📅 ${dateTime(fromLocalInput(f.starts_at))}` : "",
      f.prize ? `🎁 Prize: ${f.prize}` : "",
      f.max_participants ? `👥 Only ${f.max_participants} spots.` : "",
      "Tap “View tournament” to apply.",
    ];
    setAnnouncement(lines.filter(Boolean).join("\n"));
  }, [f.title, f.game, f.starts_at, f.prize, f.max_participants, announcementEdited]);

  const setCriterion = (i: number, v: string) =>
    set("criteria", f.criteria.map((c, j) => (j === i ? v : c)));
  const addCriterion = (v = "") =>
    set("criteria", [...f.criteria.filter((c, j) => c.trim() || j < f.criteria.length - 1), v]);
  const removeCriterion = (i: number) =>
    set("criteria", f.criteria.length === 1 ? [""] : f.criteria.filter((_, j) => j !== i));

  const validate = (): string => {
    if (f.title.trim().length < 3) return "Give the tournament a title (at least 3 characters).";
    const max = f.max_participants ? Number(f.max_participants) : null;
    if (max !== null && (!Number.isInteger(max) || max < 2 || max > 10000))
      return "Player limit must be a whole number from 2 to 10,000, or empty for no limit.";
    if (f.starts_at && f.registration_closes_at && f.registration_closes_at > f.starts_at)
      return "Registration should close before the tournament starts.";
    return "";
  };

  const submit = async (status: TournamentStatus | null) => {
    const problem = validate();
    setError(problem);
    if (problem) return;
    setBusy(status ?? "save");
    const input: TournamentInput = {
      title: f.title.trim(),
      game: f.game.trim(),
      format: f.format.trim(),
      prize: f.prize.trim(),
      description: f.description.trim(),
      criteria: f.criteria.map((c) => c.trim()).filter(Boolean),
      entry_question: f.entry_question.trim(),
      max_participants: f.max_participants ? Number(f.max_participants) : null,
      starts_at: fromLocalInput(f.starts_at),
      registration_closes_at: fromLocalInput(f.registration_closes_at),
      status: status ?? tournament?.status ?? "draft",
    };
    try {
      const saved = await saveTournament(input, {
        id: tournament?.id,
        banner,
        removeBanner,
        previousBanner: tournament?.banner_path,
      });
      const publishing = saved.status === "open" && tournament?.status !== "open";
      if (announce && publishing && announcement.trim()) {
        try {
          await announceTournament(saved, announcement.trim());
          toast.success("Tournament published and announced on the home feed");
        } catch (err) {
          toast.error(`Tournament saved, but the feed post failed: ${friendlyError(err)}`);
        }
      } else {
        toast.success(publishing ? "Tournament published" : "Tournament saved");
      }
      qc.invalidateQueries({ queryKey: ["tournaments"] });
      qc.invalidateQueries({ queryKey: ["tournament", saved.id] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      navigate(`/tournaments/${saved.id}`);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(tournament ? null : "open");
  };

  const currentBanner =
    !removeBanner && tournament?.banner_path ? bannerUrl(tournament.banner_path) : null;
  const willPublish = !tournament || tournament.status === "draft";

  return (
    <>
      <Link
        to={tournament ? `/tournaments/${tournament.id}` : "/tournaments"}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-nf-soft-ink hover:text-nf-ink"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <PageHeader
        title={tournament ? `Edit ${tournament.title}` : "Host a tournament"}
        subtitle="Players see all of this in the NetFun app before they apply."
      />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="font-display text-lg font-bold">Banner</h2>
            <ImagePicker
              file={banner}
              onFile={(file) => {
                setBanner(file);
                if (file) setRemoveBanner(false);
              }}
              current={currentBanner}
              onRemoveCurrent={() => setRemoveBanner(true)}
              label="Upload tournament banner"
            />
            <p className="text-xs text-nf-muted">Wide images work best (16:9, e.g. 1600×900).</p>
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <h2 className="font-display text-lg font-bold">Details</h2>
            <Field label="Title">
              <input
                className="input"
                value={f.title}
                maxLength={80}
                required
                onChange={(e) => set("title", e.target.value)}
                placeholder="NetFun CODM Campus Cup"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Game">
                <input
                  className="input"
                  list="games"
                  value={f.game}
                  maxLength={60}
                  onChange={(e) => set("game", e.target.value)}
                  placeholder="Call of Duty Mobile"
                />
                <datalist id="games">
                  {GAMES.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </Field>
              <Field label="Format">
                <input
                  className="input"
                  value={f.format}
                  maxLength={100}
                  onChange={(e) => set("format", e.target.value)}
                  placeholder="Solo, knockout, best of 3"
                />
              </Field>
            </div>
            <Field label="Prize">
              <input
                className="input"
                value={f.prize}
                maxLength={200}
                onChange={(e) => set("prize", e.target.value)}
                placeholder="₦50,000 + NetFun champion badge"
              />
            </Field>
            <Field label="Description" hint={`${f.description.length}/2000`}>
              <textarea
                className="input min-h-28 resize-y leading-relaxed"
                value={f.description}
                maxLength={2000}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What it is, how matches run, where they're played, rules of play…"
              />
            </Field>
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="font-display text-lg font-bold">Entry criteria</h2>
              <p className="text-sm text-nf-muted">
                Players see this list before applying. You still pick who gets in.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {f.criteria.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 text-right text-sm font-semibold text-nf-muted">{i + 1}.</span>
                  <input
                    className="input"
                    value={c}
                    maxLength={200}
                    onChange={(e) => setCriterion(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCriterion();
                      }
                    }}
                    placeholder="e.g. Account level 50 or higher"
                    aria-label={`Criterion ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeCriterion(i)}
                    aria-label={`Remove criterion ${i + 1}`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-nf-muted hover:bg-nf-field hover:text-nf-red"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => addCriterion()}>
                <Plus className="size-4" /> Add criterion
              </Button>
              {CRITERIA_IDEAS.filter((idea) => !f.criteria.includes(idea)).map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => addCriterion(idea)}
                  className="rounded-full bg-nf-field px-3 py-1.5 text-xs font-semibold text-nf-soft-ink hover:bg-nf-purple-soft hover:text-nf-purple-deep"
                >
                  + {idea}
                </button>
              ))}
            </div>
            <Field
              label="Question on the application form"
              hint="Players answer this when they apply. Use it to check the criteria."
            >
              <input
                className="input"
                value={f.entry_question}
                maxLength={200}
                onChange={(e) => set("entry_question", e.target.value)}
                placeholder="Your CODM UID, rank and level"
              />
            </Field>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="font-display text-lg font-bold">Schedule & spots</h2>
            <Field label="Starts">
              <input
                className="input"
                type="datetime-local"
                value={f.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
              />
            </Field>
            <Field label="Registration closes" hint="Leave empty to close it yourself.">
              <input
                className="input"
                type="datetime-local"
                value={f.registration_closes_at}
                onChange={(e) => set("registration_closes_at", e.target.value)}
              />
            </Field>
            <Field label="Player limit" hint="Accepting stops at this number. Empty = no limit.">
              <input
                className="input"
                type="number"
                min={2}
                max={10000}
                value={f.max_participants}
                onChange={(e) => set("max_participants", e.target.value)}
                placeholder="32"
              />
            </Field>
          </Card>

          {willPublish && (
            <Card className="flex flex-col gap-3 p-5">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-nf-purple"
                  checked={announce}
                  onChange={(e) => setAnnounce(e.target.checked)}
                />
                <span>
                  <span className="block font-semibold">Announce on the home feed</span>
                  <span className="text-sm text-nf-muted">
                    When you publish, post this with the banner and a “View tournament” button.
                  </span>
                </span>
              </label>
              {announce && (
                <textarea
                  className="input min-h-32 resize-y text-sm leading-relaxed"
                  value={announcement}
                  maxLength={2000}
                  onChange={(e) => {
                    setAnnouncement(e.target.value);
                    setAnnouncementEdited(true);
                  }}
                  aria-label="Announcement text"
                />
              )}
            </Card>
          )}

          {error && <ErrorNote error={{ message: error }} />}

          <div className="flex flex-col gap-2 lg:sticky lg:top-6">
            {tournament ? (
              <>
                <Button type="submit" loading={busy === "save"} disabled={!!busy}>
                  Save changes
                </Button>
                {tournament.status === "draft" && (
                  <Button
                    type="button"
                    variant="success"
                    loading={busy === "open"}
                    disabled={!!busy}
                    onClick={() => submit("open")}
                  >
                    Save & open registration
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button type="submit" loading={busy === "open"} disabled={!!busy}>
                  Publish & open registration
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={busy === "draft"}
                  disabled={!!busy}
                  onClick={() => submit("draft")}
                >
                  Save as draft
                </Button>
              </>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
