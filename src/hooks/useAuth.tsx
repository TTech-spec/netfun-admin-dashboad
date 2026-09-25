import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { amIAdmin } from "@/lib/api";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type AuthState = {
  ready: boolean;
  session: Session | null;
  /** null while checking; false for a signed-in non-admin. */
  isAdmin: boolean | null;
  adminError: unknown;
  /** Arrived from a "reset password" email: ask for a new password first. */
  recovery: boolean;
  finishRecovery: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [adminError, setAdminError] = useState<unknown>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    setIsAdmin(null);
    setAdminError(null);
    if (!userId) return;
    amIAdmin()
      .then(setIsAdmin)
      .catch((err) => {
        setAdminError(err);
        setIsAdmin(false);
      });
  }, [userId]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
        ready,
        session,
        isAdmin,
        adminError,
        recovery,
        finishRecovery: () => setRecovery(false),
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
