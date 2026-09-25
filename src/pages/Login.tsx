import { useState, type FormEvent, type ReactNode } from "react";
import { MailCheck } from "lucide-react";
import { supabase, friendlyError } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button, Field } from "@/components/ui";

type Mode = "link" | "password";

// Links in sign-in emails bring people back to this dashboard.
const here = () => window.location.origin;

export function LoginPage() {
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<"link" | "reset" | null>(null);

  const run = async (key: string, fn: () => Promise<{ error: unknown }>) => {
    setBusy(key);
    setError("");
    const { error } = await fn();
    setBusy(null);
    if (error) setError(friendlyError(error));
    return !error;
  };

  const google = () =>
    run("google", () =>
      supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: here() } }),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (mode === "link") {
      const ok = await run("email", () =>
        supabase.auth.signInWithOtp({
          email: addr,
          // Only existing NetFun accounts; never create new ones from here.
          options: { shouldCreateUser: false, emailRedirectTo: here() },
        }),
      );
      if (ok) setSent("link");
    } else {
      await run("email", () => supabase.auth.signInWithPassword({ email: addr, password }));
    }
  };

  const forgot = async () => {
    if (!email.trim()) return setError("Type your email first, then tap “Forgot password?”.");
    const ok = await run("reset", () =>
      supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: here() }),
    );
    if (ok) setSent("reset");
  };

  if (sent) {
    return (
      <AuthScreen>
        <MailCheck className="size-10 text-nf-purple" aria-hidden />
        <h1 className="mt-3 font-display text-2xl font-bold">Check your email</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-nf-soft-ink">
          We sent a {sent === "link" ? "sign-in link" : "link to set a new password"} to{" "}
          <b>{email.trim()}</b>. Open it on this device to get into the dashboard.
        </p>
        <Button variant="secondary" className="mt-5 w-full" onClick={() => setSent(null)}>
          Back
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <h1 className="font-display text-[28px] font-bold tracking-tight">Admin sign in</h1>
      <p className="mt-1 mb-6 text-[15px] text-nf-muted">
        Use the same account you use on NetFun. No separate admin password.
      </p>

      <Button variant="secondary" className="w-full" loading={busy === "google"} onClick={google}>
        <GoogleIcon /> Continue with Google
      </Button>

      <div className="my-5 flex items-center gap-3 text-xs font-semibold text-nf-muted">
        <span className="h-px flex-1 bg-nf-line" /> or with email <span className="h-px flex-1 bg-nf-line" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email">
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {mode === "password" && (
          <Field label="Password">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-nf-red">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy === "email"}>
          {mode === "link" ? "Email me a sign-in link" : "Sign in"}
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm font-semibold">
        <button
          className="text-nf-purple"
          onClick={() => {
            setMode(mode === "link" ? "password" : "link");
            setError("");
          }}
        >
          {mode === "link" ? "Use a password instead" : "Email me a link instead"}
        </button>
        {mode === "password" && (
          <button className="text-nf-soft-ink" onClick={forgot} disabled={busy === "reset"}>
            Forgot password?
          </button>
        )}
      </div>
    </AuthScreen>
  );
}

/** Shown after opening a "reset password" email link. */
export function SetPasswordPage() {
  const { finishRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError("Use at least 6 characters.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    finishRecovery();
  };

  return (
    <AuthScreen>
      <h1 className="font-display text-2xl font-bold">Set a new password</h1>
      <p className="mt-1 mb-5 text-[15px] text-nf-muted">
        This also becomes your password for the NetFun app.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="New password">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm font-medium text-nf-red">{error}</p>}
        <Button type="submit" loading={busy}>
          Save password
        </Button>
        <button type="button" className="text-sm font-semibold text-nf-soft-ink" onClick={finishRecovery}>
          Skip for now
        </button>
      </form>
    </AuthScreen>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.55 10.55 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-nf-plum px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/logo.png" alt="" className="h-10 w-14 object-cover" />
          <span className="font-display text-2xl font-extrabold text-white">NetFun</span>
          <span className="rounded-full bg-nf-gold px-2 py-0.5 text-[10px] font-bold tracking-wider text-nf-plum uppercase">
            Admin
          </span>
        </div>
        <div className="rounded-[24px] bg-white p-6">{children}</div>
      </div>
    </div>
  );
}
