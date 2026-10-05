import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { authPassword, passwordProblem } from "@/game/account";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Table Wars" },
      { name: "description", content: "Choose a new password for your Table Wars account." },
      { property: "og:title", content: "Reset password — Table Wars" },
      { property: "og:description", content: "Choose a new password for your Table Wars account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const nav = useNavigate();
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-hud-panel p-6 font-mono text-hud">
      <form
        className="w-full max-w-sm rounded-lg border-2 border-hud/30 p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          const pp = passwordProblem(p);
          if (pp) return setErr(pp);
          const { error } = await supabase.auth.updateUser({ password: authPassword(p) });
          if (error) return setErr(error.message);
          setDone(true);
          setTimeout(() => nav({ to: "/" }), 1200);
        }}
      >
        <h1 className="text-3xl font-black uppercase">New password</h1>
        <input className="mt-6 w-full rounded border-2 border-hud/40 bg-hud-track px-3 py-2 font-bold" type="password" maxLength={20} placeholder="New password" value={p} onChange={(e) => setP(e.target.value)} />
        {err && <p className="mt-2 text-sm font-bold text-destructive">{err}</p>}
        {done && <p className="mt-2 text-sm font-bold text-crosshair">Password updated!</p>}
        <button className="mt-4 w-full rounded bg-crosshair px-6 py-3 font-black uppercase text-hud-ink">Save password</button>
      </form>
    </div>
  );
}
