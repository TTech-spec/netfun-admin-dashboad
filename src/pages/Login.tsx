import { useState, type FormEvent } from "react";
import { supabase, friendlyError } from "@/lib/supabase";
import { Button, Field } from "@/components/ui";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(friendlyError(error));
    setBusy(false);
  };

  return (
    <AuthScreen>
      <h1 className="font-display text-[28px] font-bold tracking-tight">Admin sign in</h1>
      <p className="mt-1 mb-6 text-[15px] text-nf-muted">
        Use your NetFun account. Only accounts listed as admins can get in.
      </p>
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
        {error && (
          <p role="alert" className="text-sm font-medium text-nf-red">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} className="mt-2">
          Sign in
        </Button>
      </form>
    </AuthScreen>
  );
}

export function AuthScreen({ children }: { children: React.ReactNode }) {
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
