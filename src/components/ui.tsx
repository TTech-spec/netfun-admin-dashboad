import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { friendlyError } from "@/lib/supabase";
import type { TournamentStatus } from "@/lib/types";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-nf-purple text-white hover:bg-nf-purple-deep",
  secondary: "border border-nf-line-strong bg-white text-nf-ink hover:bg-nf-field",
  danger: "bg-nf-red text-white hover:brightness-95",
  success: "bg-nf-green text-white hover:brightness-110",
  ghost: "text-nf-soft-ink hover:bg-nf-field",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
  loading?: boolean;
}) {
  const sizing = size === "sm" ? "h-9 px-3 text-[13px]" : "h-11 px-4 text-sm";
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] border border-nf-line bg-white ${className}`}>{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-nf-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-nf-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-nf-muted">{hint}</span>}
    </label>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-nf-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label}…
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-2xl bg-nf-red-soft px-4 py-3 text-sm font-medium text-nf-red">
      {friendlyError(error)}
    </p>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {body && <p className="max-w-sm text-sm text-nf-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Avatar({
  profile,
  size = 36,
}: {
  profile: { full_name?: string; username?: string; avatar_color?: string } | null;
  size?: number;
}) {
  const name = profile?.full_name || profile?.username || "?";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: profile?.avatar_color || "#7A22C6",
      }}
    >
      {initials}
    </span>
  );
}

const BADGE_TONES = {
  purple: "bg-nf-purple-soft text-nf-purple-deep",
  gold: "bg-nf-gold-soft text-nf-gold-ink",
  green: "bg-nf-green-soft text-nf-green",
  red: "bg-nf-red-soft text-nf-red",
  gray: "bg-nf-field text-nf-soft-ink",
  dark: "bg-nf-plum text-white",
};

export function Badge({
  tone = "gray",
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export const STATUS_META: Record<
  TournamentStatus,
  { label: string; tone: keyof typeof BADGE_TONES; help: string }
> = {
  draft: { label: "Draft", tone: "gray", help: "Only admins can see it." },
  open: { label: "Open", tone: "green", help: "Visible in the app and taking applications." },
  closed: { label: "Registration closed", tone: "gold", help: "Visible, but no new applications." },
  live: { label: "Live", tone: "purple", help: "The tournament is being played." },
  completed: { label: "Completed", tone: "dark", help: "Finished. Kept for the record." },
  cancelled: { label: "Cancelled", tone: "red", help: "Called off. Still visible so players know." },
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  const m = STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** Centered dialog. Closes on Escape or backdrop click. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-nf-plum/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-xl sm:rounded-[24px]"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full hover:bg-nf-field"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

const MAX_IMAGE_MB = 8;

/** Image picker with preview. `current` shows an existing image until replaced. */
export function ImagePicker({
  file,
  onFile,
  current,
  onRemoveCurrent,
  label = "Add image",
  aspect = "aspect-[16/9]",
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  current?: string | null;
  onRemoveCurrent?: () => void;
  label?: string;
  aspect?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | undefined) => {
    setError("");
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Pick an image file (JPG, PNG, WebP or GIF).");
    if (f.size > MAX_IMAGE_MB * 1024 * 1024) return setError(`Images must be under ${MAX_IMAGE_MB} MB.`);
    onFile(f);
  };

  const shown = preview ?? current ?? null;

  return (
    <div className="flex flex-col gap-2">
      {shown ? (
        <div className={`relative overflow-hidden rounded-2xl border border-nf-line bg-nf-field ${aspect}`}>
          <img src={shown} alt="" className="size-full object-cover" />
          <div className="absolute top-2 right-2 flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => input.current?.click()}>
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => (file ? onFile(null) : onRemoveCurrent?.())}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-nf-line-strong bg-nf-field text-sm font-semibold text-nf-soft-ink transition hover:border-nf-purple hover:text-nf-purple ${aspect}`}
        >
          <ImagePlus className="size-7" aria-hidden />
          {label}
          <span className="text-xs font-normal text-nf-muted">Click or drop an image · up to {MAX_IMAGE_MB} MB</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="text-xs font-medium text-nf-red">{error}</p>}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
              active ? "bg-nf-plum text-white" : "border border-nf-line-strong bg-white text-nf-soft-ink hover:bg-nf-field"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/15" : "bg-nf-field"}`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
