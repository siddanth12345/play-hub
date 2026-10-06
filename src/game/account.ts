import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loginWithUsername } from "@/lib/account.functions";
import { SETTINGS, applySettings, onSettingsApplied, DEFAULT_SETTINGS, type Settings } from "./settings";
import { TRAIN, TRAIN_DEFAULTS, type TrainCfg } from "./state";

export type Account = { kind: "none" } | { kind: "guest"; name: string } | { kind: "user"; id: string; username: string };

let ACC: Account = { kind: "none" };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (a: Account) => { ACC = a; emit(); };

export const useAccount = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ACC, () => ACC);
export const getAccount = () => ACC;
/** Name shown in online modes. */
export const displayName = () => (ACC.kind === "user" ? ACC.username : ACC.kind === "guest" ? ACC.name : "Guest");

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export function passwordProblem(p: string): string | null {
  if (p.length < 3 || p.length > 20) return "Password must be 3-20 characters";
  if (!/[A-Z]/.test(p)) return "Password needs an uppercase letter";
  if (!/[a-z]/.test(p)) return "Password needs a lowercase letter";
  if (!/[0-9]/.test(p)) return "Password needs a number";
  return null;
}
/** The sign-in service requires 6+ characters, so short game passwords get a fixed prefix. */
export const authPassword = (p: string) => `tw!${p}`;
const syntheticEmail = (u: string) => `${u.toLowerCase()}@players.tablewars.app`;

let applyingRemote = false;
async function loadProfile(id: string) {
  const { data } = await supabase.from("profiles").select("username, settings, training").eq("id", id).maybeSingle();
  if (!data) return;
  set({ kind: "user", id, username: data.username });
  applyingRemote = true;
  if (data.settings) {
    const p = data.settings as Partial<Settings>;
    applySettings({ ...DEFAULT_SETTINGS, ...p, keys: { ...DEFAULT_SETTINGS.keys, ...(p.keys ?? {}) } });
  }
  if (data.training) Object.assign(TRAIN, { ...TRAIN_DEFAULTS, ...(data.training as Partial<TrainCfg>) });
  applyingRemote = false;
}

let started = false;
export function initAccount() {
  if (started || typeof window === "undefined") return;
  started = true;
  supabase.auth.onAuthStateChange((_e, session) => {
    if (session?.user) setTimeout(() => void loadProfile(session.user.id), 0);
    else if (ACC.kind === "user") set({ kind: "none" });
  });
  void supabase.auth.getUser().then(({ data }) => { if (data.user) void loadProfile(data.user.id); });
  onSettingsApplied(() => {
    if (applyingRemote || ACC.kind !== "user") return;
    void supabase.from("profiles").update({ settings: SETTINGS as never }).eq("id", ACC.id);
  });
}

export function saveTraining() {
  if (ACC.kind !== "user") return;
  void supabase.from("profiles").update({ training: { ...TRAIN } as never }).eq("id", ACC.id);
}

export async function signUp(username: string, password: string, email: string): Promise<string | null> {
  if (!USERNAME_RE.test(username)) return "Username must be 3-20 letters, numbers or _";
  const pp = passwordProblem(password);
  if (pp) return pp;
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return "That email doesn't look right";
  const { data: free } = await supabase.rpc("username_available", { _u: username });
  if (free === false) return "That username is taken";
  const { data, error } = await supabase.auth.signUp({
    email: email || syntheticEmail(username),
    password: authPassword(password),
    options: { data: { username }, emailRedirectTo: window.location.origin },
  });
  if (error) return error.message.includes("registered") ? "That email is already used" : error.message;
  if (data.user) {
    // Save the current settings into the new account right away.
    setTimeout(() => void supabase.from("profiles").update({ settings: SETTINGS as never, training: { ...TRAIN } as never }).eq("id", data.user!.id), 300);
  }
  return null;
}

export async function signIn(username: string, password: string): Promise<string | null> {
  if (!username || !password) return "Enter your username and password";
  const r = await loginWithUsername({ data: { username, password: authPassword(password) } });
  if ("error" in r) return r.error ?? "Could not sign in";
  const { error } = await supabase.auth.setSession(r);
  return error ? error.message : null;
}

export async function resetByEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
  return error?.message ?? null;
}

/** Guests get a fresh random name each time, e.g. Guest482913, so they can party up. */
export function playAsGuest() { set({ kind: "guest", name: `Guest${Math.floor(100000 + Math.random() * 900000)}` }); }
export async function signOut() {
  if (ACC.kind === "user") await supabase.auth.signOut();
  set({ kind: "none" });
}
