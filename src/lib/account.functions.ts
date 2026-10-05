import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Signs in by username: resolves the private auth email server-side so it is never exposed to the browser. */
export const loginWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().min(3).max(20), password: z.string().min(3).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("id").ilike("username", data.username.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (!prof) return { error: "Wrong username or password" };
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(prof.id);
    const email = u?.user?.email;
    if (!email) return { error: "Wrong username or password" };
    const anon = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: s, error } = await anon.auth.signInWithPassword({ email, password: data.password });
    if (error || !s.session) return { error: "Wrong username or password" };
    return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
  });
