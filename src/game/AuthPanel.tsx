import { useState } from "react";
import { playAsGuest, resetByEmail, signIn, signOut, signUp, useAccount } from "./account";

const input = "w-full rounded border-2 border-hud/40 bg-hud-track px-3 py-2 font-bold text-hud outline-none focus:border-crosshair";
const main = "rounded bg-crosshair px-6 py-3 font-black uppercase text-hud-ink disabled:opacity-50";
const alt = "rounded border-2 border-hud/40 px-6 py-3 font-black uppercase";

/** Small account line shown under the title once a choice is made. */
export function AccountBadge() {
  const acc = useAccount();
  if (acc.kind === "none") return null;
  return (
    <div className="mt-4 flex items-center gap-3 text-sm">
      <span className="opacity-70">Playing as</span>
      <b className="text-crosshair">{acc.kind === "user" ? acc.username : "Guest"}</b>
      <button className="underline opacity-70 hover:opacity-100" onClick={() => void signOut()}>{acc.kind === "user" ? "Sign out" : "Log in"}</button>
    </div>
  );
}

/** Login / create account / guest. Shown over the home menu until the player picks one. */
export function AuthPanel() {
  const acc = useAccount();
  const [tab, setTab] = useState<"login" | "create" | "forgot">("login");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (acc.kind !== "none") return null;

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true); setErr(null); setNote(null);
    try { setErr(await fn()); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-hud-scrim/70 p-6 font-mono text-hud">
      <form
        className="w-full max-w-sm rounded-lg border-2 border-hud/30 bg-hud-panel p-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (tab === "login") void run(() => signIn(u.trim(), p));
          else if (tab === "create") void run(() => signUp(u.trim(), p, email.trim()));
          else void run(async () => { const r = await resetByEmail(email.trim()); if (!r) setNote("If that email has an account, a reset link is on its way."); return r; });
        }}
      >
        <h2 className="text-3xl font-black uppercase">{tab === "login" ? "Log in" : tab === "create" ? "Create account" : "Reset password"}</h2>
        <div className="mt-6 flex flex-col gap-3">
          {tab !== "forgot" && <input className={input} placeholder="Username" maxLength={20} value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />}
          {tab !== "forgot" && <input className={input} placeholder="Password" type="password" maxLength={20} value={p} onChange={(e) => setP(e.target.value)} autoComplete={tab === "create" ? "new-password" : "current-password"} />}
          {tab !== "login" && <input className={input} placeholder={tab === "create" ? "Email (optional, for password reset)" : "Email"} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          {tab === "create" && <p className="text-xs opacity-60">Username 3-20 characters. Password 3-20 characters with an uppercase letter, a lowercase letter and a number.</p>}
          {err && <p className="text-sm font-bold text-destructive">{err}</p>}
          {note && <p className="text-sm font-bold text-crosshair">{note}</p>}
          <button className={main} disabled={busy}>{tab === "login" ? "Log in" : tab === "create" ? "Create account" : "Send reset link"}</button>
          <button type="button" className={alt} onClick={() => { setErr(null); setTab(tab === "login" ? "create" : "login"); }}>
            {tab === "login" ? "No account? Create one" : "Have an account? Log in"}
          </button>
          <button type="button" className={alt} onClick={playAsGuest}>Play as guest</button>
          {tab === "login" && <button type="button" className="text-xs underline opacity-60" onClick={() => setTab("forgot")}>Forgot password?</button>}
        </div>
      </form>
    </div>
  );
}
