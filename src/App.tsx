import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabaseConfigured, friendlyError } from "@/lib/supabase";
import { Layout } from "@/components/Layout";
import { Button, Spinner } from "@/components/ui";
import { AuthScreen, LoginPage, SetPasswordPage } from "@/pages/Login";
import { OverviewPage } from "@/pages/Overview";
import { PostsPage } from "@/pages/Posts";
import { CommunitiesPage } from "@/pages/Communities";
import { TournamentsPage } from "@/pages/Tournaments";
import { TournamentFormPage } from "@/pages/TournamentForm";
import { TournamentDetailPage } from "@/pages/TournamentDetail";
import { UsersPage } from "@/pages/Users";

function Gate() {
  const { ready, session, isAdmin, adminError, recovery, signOut } = useAuth();

  if (!supabaseConfigured) {
    return (
      <AuthScreen>
        <h1 className="font-display text-2xl font-bold">Connect Supabase</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-nf-soft-ink">
          Set <code className="rounded bg-nf-field px-1">VITE_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-nf-field px-1">VITE_SUPABASE_ANON_KEY</code> to the same
          project the NetFun app uses, then redeploy.
        </p>
      </AuthScreen>
    );
  }
  if (!ready) return <Spinner />;
  if (!session) return <LoginPage />;
  if (recovery) return <SetPasswordPage />;
  if (isAdmin === null) return <Spinner label="Checking access" />;
  if (!isAdmin) {
    return (
      <AuthScreen>
        <h1 className="font-display text-2xl font-bold">No admin access</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-nf-soft-ink">
          {adminError
            ? friendlyError(adminError)
            : `${session.user.email} is signed in but isn't a NetFun admin. Add it in Supabase (see the README), then sign in again.`}
        </p>
        <Button variant="secondary" className="mt-5 w-full" onClick={signOut}>
          Sign out
        </Button>
      </AuthScreen>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="communities" element={<CommunitiesPage />} />
        <Route path="tournaments" element={<TournamentsPage />} />
        <Route path="tournaments/new" element={<TournamentFormPage />} />
        <Route path="tournaments/:id" element={<TournamentDetailPage />} />
        <Route path="tournaments/:id/edit" element={<TournamentFormPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Gate />
    </BrowserRouter>
  );
}
