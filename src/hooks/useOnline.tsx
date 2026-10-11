import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

type Online = { ids: Set<string>; connected: boolean };

const OnlineContext = createContext<Online>({ ids: new Set(), connected: false });

/**
 * Who has the NetFun app open right now. The app announces each signed-in person
 * on the "online" realtime channel (keyed by user id); the dashboard only listens,
 * so admins looking at the dashboard aren't counted.
 */
export function OnlineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Online>({ ids: new Set(), connected: false });

  useEffect(() => {
    const ch = supabase.channel("online");
    const sync = () =>
      setState({ ids: new Set(Object.keys(ch.presenceState())), connected: true });
    ch.on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") sync();
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
          setState((s) => ({ ...s, connected: false }));
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  return <OnlineContext.Provider value={state}>{children}</OnlineContext.Provider>;
}

export function useOnline() {
  return useContext(OnlineContext);
}
