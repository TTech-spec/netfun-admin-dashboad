import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { audienceCount } from "@/lib/api";
import type { PostAudience } from "@/lib/types";

export const LIFE_STAGES = [
  { id: "student", label: "Students" },
  { id: "working", label: "Working people" },
  { id: "nysc", label: "NYSC corps members" },
  { id: "admission", label: "Waiting for admission" },
  { id: "vibing", label: "Just vibing" },
];

export const AUDIENCE_GENDERS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "prefer-not", label: "Didn't say" },
];

export const STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT Abuja",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
];

/** "Students, Working people · Female · Lagos, Oyo" — for showing who a post is for. */
export function audienceText(a: PostAudience | null | undefined): string {
  if (!a || !Object.keys(a).length) return "Everyone";
  const name = (list: { id: string; label: string }[], id: string) =>
    list.find((x) => x.id === id)?.label ?? id;
  return [
    a.life_stage?.map((s) => name(LIFE_STAGES, s)).join(", "),
    a.gender?.map((g) => name(AUDIENCE_GENDERS, g)).join(", "),
    a.states?.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function Chips({
  options,
  picked,
  onChange,
}: {
  options: { id: string; label: string }[];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = picked.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                on ? picked.filter((x) => x !== o.id) : [...picked, o.id],
              )
            }
            className={`h-8 rounded-full px-3 text-[12.5px] font-semibold transition ${
              on
                ? "bg-nf-purple text-white"
                : "border border-nf-line-strong bg-white text-nf-soft-ink hover:bg-nf-field"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Who sees this post": everyone, or only some kinds of people (life stage, gender,
 * state). Shows how many people the choice reaches.
 */
export function AudiencePicker({
  value,
  onChange,
  resetKey,
}: {
  /** null = everyone; {} = "only some people" with nothing picked yet. */
  value: PostAudience | null;
  onChange: (a: PostAudience | null) => void;
  /** Change it to clear the picker (after publishing). */
  resetKey?: number;
}) {
  const [some, setSome] = useState(!!value);
  const [stages, setStages] = useState<string[]>(value?.life_stage ?? []);
  const [genders, setGenders] = useState<string[]>(value?.gender ?? []);
  const [states, setStates] = useState<string[]>(value?.states ?? []);
  const [showStates, setShowStates] = useState(false);

  useEffect(() => {
    setSome(false);
    setStages([]);
    setGenders([]);
    setStates([]);
    setShowStates(false);
  }, [resetKey]);

  const build = (
    s: string[],
    g: string[],
    st: string[],
  ): PostAudience | null => {
    const a: PostAudience = {};
    if (s.length) a.life_stage = s;
    if (g.length) a.gender = g;
    if (st.length) a.states = st;
    return a;
  };
  const update = (s: string[], g: string[], st: string[]) => {
    setStages(s);
    setGenders(g);
    setStates(st);
    onChange(build(s, g, st));
  };

  const picked = !!value && Object.keys(value).length > 0;
  const reach = useQuery({
    queryKey: ["audience-count", value],
    queryFn: () => audienceCount(value),
    enabled: value === null || picked,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-nf-line p-3">
      <span className="text-sm font-semibold text-nf-ink">
        Who sees this post
      </span>
      <div className="flex gap-2">
        {[
          { on: false, label: "Everyone" },
          { on: true, label: "Only some people" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={some === o.on}
            onClick={() => {
              setSome(o.on);
              onChange(o.on ? build(stages, genders, states) : null);
            }}
            className={`h-9 flex-1 rounded-full text-[13px] font-semibold transition ${
              some === o.on
                ? "bg-nf-plum text-white"
                : "border border-nf-line-strong bg-white text-nf-soft-ink hover:bg-nf-field"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {some && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-nf-muted">
              What they do
            </span>
            <Chips
              options={LIFE_STAGES}
              picked={stages}
              onChange={(s) => update(s, genders, states)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-nf-muted">Gender</span>
            <Chips
              options={AUDIENCE_GENDERS}
              picked={genders}
              onChange={(g) => update(stages, g, states)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-xs font-semibold text-nf-muted">
              State they live in
              <button
                type="button"
                onClick={() => setShowStates((v) => !v)}
                className="font-semibold text-nf-purple"
              >
                {showStates
                  ? "Hide states"
                  : states.length
                    ? `Change (${states.length})`
                    : "Pick states"}
              </button>
            </span>
            {showStates ? (
              <Chips
                options={STATES.map((s) => ({ id: s, label: s }))}
                picked={states}
                onChange={(st) => update(stages, genders, st)}
              />
            ) : (
              states.length > 0 && (
                <span className="text-[13px]">{states.join(", ")}</span>
              )
            )}
          </div>
          <p className="text-xs text-nf-muted">
            Leave a group empty to include everyone in it. People must match
            every group you pick.
          </p>
        </>
      )}

      <p className="flex items-center gap-1.5 rounded-xl bg-nf-field px-3 py-2 text-[13px]">
        <Users className="size-4 text-nf-purple" aria-hidden />
        {!some
          ? "Everyone on NetFun"
          : picked
            ? `Only: ${audienceText(value)}`
            : "Pick at least one group"}
        {(!some || picked) && reach.data != null && (
          <b className="ml-auto">
            {reach.data.toLocaleString()}{" "}
            {reach.data === 1 ? "person" : "people"}
          </b>
        )}
      </p>
    </div>
  );
}
