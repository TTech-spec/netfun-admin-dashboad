import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, LogOut, Megaphone, Menu, Trophy, Users, X } from "lucide-react";
import { getStats } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/posts", label: "Feed posts", icon: Megaphone },
  { to: "/tournaments", label: "Tournaments", icon: Trophy },
  { to: "/users", label: "Users", icon: Users },
];

export function Layout() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const stats = useQuery({ queryKey: ["stats"], queryFn: getStats, refetchInterval: 60_000 });
  const pending = stats.data?.pending_entries ?? 0;

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex h-11 items-center gap-3 rounded-full px-4 text-[15px] font-semibold transition ${
              isActive ? "bg-white/12 text-white" : "text-[#CFC5D9] hover:bg-white/6 hover:text-white"
            }`
          }
        >
          <Icon className="size-5" aria-hidden />
          <span className="flex-1">{label}</span>
          {to === "/tournaments" && pending > 0 && (
            <span className="rounded-full bg-nf-gold px-2 py-0.5 text-xs font-bold text-nf-plum">
              {pending}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2 px-2">
      <img src="/logo.png" alt="" className="h-8 w-12 object-cover" />
      <span className="font-display text-xl font-extrabold tracking-tight text-white">NetFun</span>
      <span className="rounded-full bg-nf-gold px-2 py-0.5 text-[10px] font-bold tracking-wider text-nf-plum uppercase">
        Admin
      </span>
    </div>
  );

  const footer = (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
      <span className="truncate px-2 text-xs text-[#CFC5D9]">{session?.user.email}</span>
      <button
        onClick={signOut}
        className="flex h-10 items-center gap-3 rounded-full px-4 text-sm font-semibold text-[#CFC5D9] hover:bg-white/6 hover:text-white"
      >
        <LogOut className="size-4" aria-hidden /> Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-svh lg:flex">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-8 bg-nf-plum p-4 lg:flex">
        {brand}
        <div className="flex-1">{nav}</div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-nf-plum px-4 lg:hidden">
        {brand}
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex size-10 items-center justify-center rounded-full text-white"
        >
          <Menu className="size-6" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute inset-y-0 left-0 flex w-72 flex-col gap-8 bg-nf-plum p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              {brand}
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-white">
                <X className="size-6" />
              </button>
            </div>
            <div className="flex-1">{nav}</div>
            {footer}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
