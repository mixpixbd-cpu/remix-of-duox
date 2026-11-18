import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { DeviceAgent, MessageNotifier } from "@/components/fp/DeviceAgent";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Only sign out when the server truly rejects the session. A slow or
    // dropped mobile connection must not log the admin out.
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) throw redirect({ to: "/auth" });
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return;
    const rejected = error && "status" in error && (error.status === 401 || error.status === 403);
    if (rejected) throw redirect({ to: "/auth" });
  },
  component: () => (
    <>
      <DeviceAgent />
      <MessageNotifier />
      <Outlet />
    </>
  ),
});
