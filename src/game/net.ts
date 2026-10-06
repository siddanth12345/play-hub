/**
 * Online layer: live channels for matches, lobbies, parties, invites and the 1v1 queue.
 * The host player's browser runs the bots; everyone sends their own position, shots and deaths.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { G, MAX_HP, resetGame, goHome, lockPointer } from "./state";
import { displayName } from "./account";
import { setTodOverride, type TimeOfDay } from "./settings";

export type SessKind = "1v1" | "lobby" | "coop-game" | "coop-training";
export type Peer = { id: string; name: string; x: number; y: number; z: number; yaw: number; tx: number; ty: number; tz: number; tyaw: number; hp: number; fresh: boolean };
export type Invite = { key: string; kind: "party" | "lobby"; from: string; fromId: string; pid?: string; code?: string };
type Msg = { k: string; f: string; [x: string]: unknown };

const rid = (n = 10) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
export const MY_ID = rid(16);
const TODS: TimeOfDay[] = ["day", "evening", "night"];
export const WIN_ROUNDS = 3;

export const NET = {
  on: false,
  kind: null as SessKind | null,
  host: false,
  hostId: "",
  sid: "",
  code: "",
  pvp: false,
  party1v1: false,
  stage: "idle" as "idle" | "join" | "vote" | "play" | "over",
  voteEnd: 0,
  myVote: null as TimeOfDay | null,
  votes: {} as Record<string, TimeOfDay>,
  colors: {} as Record<string, "red" | "blue">,
  score: {} as Record<string, number>,
  names: {} as Record<string, string>,
  winner: "",
  dead: false,
  spawn: [0, 0, 120] as [number, number, number],
  peers: new Map<string, Peer>(),
  queueing: false,
  rematchIn: null as null | { from: string; name: string },
  rematchSentAt: 0,
  rematchNote: "",
  msg: "",
  msgUntil: 0,
};

export const PARTY = { on: false, id: "", leaderId: "", members: [] as { id: string; name: string }[] };
export const INVITES: Invite[] = [];
export const ONLINE = { names: [] as { id: string; name: string }[] };

export function toast(msg: string) {
  NET.msg = msg;
  NET.msgUntil = Date.now() + 4500;
}

/** Hooks World registers to receive game events (shots, explosions, bot snapshots...). */
export const HOOKS: Partial<Record<string, (m: Msg) => void>> = {};

const opts = (key: string) => ({ config: { broadcast: { self: false, ack: false }, presence: { key } } });
let dropping: Promise<unknown> = Promise.resolve();
const drop = (ch: RealtimeChannel | null) => {
  if (!ch) return;
  void ch.untrack().catch(() => undefined);
  dropping = Promise.all([dropping, supabase.removeChannel(ch).catch(() => undefined)]);
};

// ---------------- session (match / lobby / co-op) ----------------
let sch: RealtimeChannel | null = null;
let seen = new Set<string>();
let joinWait: { resolve: (e: string | null) => void; timer: ReturnType<typeof setTimeout> } | null = null;

export function netSend(k: string, data: Record<string, unknown> = {}) {
  void sch?.send({ type: "broadcast", event: "m", payload: { k, f: MY_ID, ...data } });
}

export async function startSession(kind: SessKind, sid: string, host: boolean, hostId = MY_ID, code = "", party1v1 = false) {
  leaveSession();
  await dropping;
  Object.assign(NET, {
    on: true, kind, host, hostId: host ? MY_ID : hostId, sid, code, party1v1,
    pvp: kind === "1v1" || kind === "lobby",
    stage: kind === "1v1" ? "vote" : host ? "play" : "join",
    voteEnd: Date.now() + 10000, myVote: null, votes: {}, colors: {}, score: {}, winner: "", dead: false,
    rematchIn: null, rematchNote: "", names: { [MY_ID]: displayName() },
  });
  NET.peers.clear();
  seen = new Set([MY_ID]);
  const ch = supabase.channel(`tw-s-${sid}`, opts(MY_ID));
  sch = ch;
  ch.on("broadcast", { event: "m" }, ({ payload }) => onMsg(payload as Msg));
  ch.on("presence", { event: "sync" }, () => onPresence(ch));
  ch.subscribe((s) => { if (s === "SUBSCRIBED") void ch.track({ name: displayName(), host }); });
  if (NET.stage === "play") enterGame();
}

function spawnFor(): [number, number, number] {
  if (NET.kind === "1v1") return NET.colors[MY_ID] === "blue" ? [0, 0, -120] : [0, 0, 120];
  const a = Math.random() * Math.PI * 2;
  if (NET.kind === "lobby") return [Math.cos(a) * 110, 0, Math.sin(a) * 110];
  return [Math.cos(a) * 25, 0, 120 + Math.sin(a) * 10];
}

function enterGame() {
  NET.stage = "play";
  NET.dead = false;
  NET.spawn = spawnFor();
  resetGame(NET.kind === "coop-training" || NET.kind === "lobby" ? "training" : "game");
  G.countdown = 3.6;
  lockPointer();
}

export function leaveSession() {
  if (joinWait) { clearTimeout(joinWait.timer); joinWait.resolve("Invalid code"); joinWait = null; }
  drop(sch);
  sch = null;
  Object.assign(NET, { on: false, kind: null, host: false, stage: "idle", code: "", pvp: false, party1v1: false, dead: false, rematchIn: null });
  NET.peers.clear();
  setTodOverride(null);
}

/** Leave the online match and return to the home menu. */
export function leaveToHome(msg?: string) {
  leaveSession();
  goHome();
  if (msg) toast(msg);
}

function onPresence(ch: RealtimeChannel) {
  const st = ch.presenceState() as Record<string, { name?: string; host?: boolean }[]>;
  const ids = Object.keys(st);
  for (const id of ids) if (st[id]?.[0]?.name) NET.names[id] = st[id]![0]!.name!;
  for (const id of [...NET.peers.keys()]) if (!ids.includes(id)) NET.peers.delete(id);
  // joining a lobby by code: wait for the host to show up
  if (NET.stage === "join") {
    const hostId = ids.find((id) => st[id]?.[0]?.host);
    if (!hostId) return;
    if (ids.filter((id) => id !== MY_ID).length >= 8) { failJoin("Lobby is full"); return; }
    NET.hostId = hostId;
    if (joinWait) { clearTimeout(joinWait.timer); joinWait.resolve(null); joinWait = null; }
    enterGame();
  }
  for (const id of ids) seen.add(id);
  if (!NET.host && seen.has(NET.hostId) && !ids.includes(NET.hostId)) {
    leaveToHome(NET.kind === "lobby" ? "The host left — lobby closed" : NET.kind === "1v1" ? "Your opponent left" : "The host left the game");
    return;
  }
  if (NET.kind === "1v1" && NET.host && seen.size >= 2 && ids.length < 2 && NET.stage !== "over") leaveToHome("Your opponent left");
}

function onMsg(m: Msg) {
  if (!m || m.f === MY_ID) return;
  switch (m.k) {
    case "p": {
      let p = NET.peers.get(m.f);
      const x = m.x as number, y = m.y as number, z = m.z as number, yaw = m.yaw as number;
      if (!p) { p = { id: m.f, name: "", x, y, z, yaw, tx: x, ty: y, tz: z, tyaw: yaw, hp: 0, fresh: true }; NET.peers.set(m.f, p); }
      Object.assign(p, { name: m.n as string, tx: x, ty: y, tz: z, tyaw: yaw, hp: m.hp as number });
      NET.names[m.f] = m.n as string;
      break;
    }
    case "vote": NET.votes[m.f] = m.tod as TimeOfDay; break;
    case "start": applyStart(m as never); break;
    case "died": if (NET.host) onDied(m.f); break;
    case "round": applyRound(m as never); break;
    case "over": applyOver(m as never); break;
    case "end":
      G.phase = "won";
      document.exitPointerLock?.();
      break;
    case "rm?": NET.rematchIn = { from: m.f, name: (m.n as string) || "Opponent" }; break;
    case "rmno": NET.rematchNote = "Rematch declined"; break;
    case "rmgo": void startSession("1v1", m.sid as string, false, m.f); break;
    default: HOOKS[m.k]?.(m);
  }
}

// ---------------- 1v1 ----------------
export function opponentId() {
  return Object.keys(NET.names).find((id) => id !== MY_ID && seen.has(id)) ?? [...NET.peers.keys()][0] ?? "";
}
export function vote(tod: TimeOfDay) {
  NET.myVote = tod;
  netSend("vote", { tod });
}
type Start = { tod: TimeOfDay; colors: Record<string, "red" | "blue"> };
function applyStart(m: Start) {
  NET.colors = m.colors;
  NET.score = Object.fromEntries(Object.keys(m.colors).map((id) => [id, 0]));
  setTodOverride(m.tod);
  enterGame();
}
function onDied(victim: string) {
  if (NET.kind !== "1v1" || NET.stage !== "play") return;
  const winner = Object.keys(NET.colors).find((id) => id !== victim);
  if (!winner) return;
  const score = { ...NET.score, [winner]: (NET.score[winner] ?? 0) + 1 };
  if (score[winner]! >= WIN_ROUNDS) { const o = { score, winner }; netSend("over", o); applyOver(o); }
  else { const r = { score }; netSend("round", r); applyRound(r); }
}
function applyRound(m: { score: Record<string, number> }) {
  NET.score = m.score;
  NET.dead = false;
  resetGame("game");
  G.playerHp = MAX_HP;
  G.countdown = 3.6;
}
function applyOver(m: { score: Record<string, number>; winner: string }) {
  NET.score = m.score;
  NET.winner = m.winner;
  NET.stage = "over";
  G.phase = m.winner === MY_ID ? "won" : "lost";
  document.exitPointerLock?.();
  if (NET.party1v1) setTimeout(() => { if (NET.stage === "over") leaveToHome(); }, 2000);
}
/** Called by World when the local player runs out of health online. */
export function netDied() {
  if (NET.dead) return;
  NET.dead = true;
  if (NET.host) onDied(MY_ID);
  else netSend("died");
}

// 20 position updates per second
let lastSend = 0;
export function netPlayerTick(x: number, y: number, z: number, yaw: number, hp: number) {
  const now = performance.now();
  if (now - lastSend < 50) return;
  lastSend = now;
  netSend("p", { n: displayName(), x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(3), hp: Math.round(hp) });
}

// host resolves the vote after 10s
if (typeof window !== "undefined") {
  setInterval(() => {
    if (!NET.on || NET.kind !== "1v1" || !NET.host || NET.stage !== "vote" || Date.now() < NET.voteEnd) return;
    const opp = opponentId();
    if (!opp) return;
    const a = NET.myVote, b = NET.votes[opp];
    const tod = a && b ? (a === b ? a : Math.random() < 0.5 ? a : b) : a ?? b ?? TODS[Math.floor(Math.random() * 3)]!;
    const red = Math.random() < 0.5 ? MY_ID : opp;
    const m: Start = { tod, colors: { [red]: "red", [red === MY_ID ? opp : MY_ID]: "blue" } };
    netSend("start", m);
    applyStart(m);
  }, 200);
}

export function sendRematch() {
  if (Date.now() - NET.rematchSentAt < 3000) return false;
  NET.rematchSentAt = Date.now();
  NET.rematchNote = "Rematch invite sent";
  netSend("rm?", { n: displayName() });
  return true;
}
export function answerRematch(yes: boolean) {
  NET.rematchIn = null;
  if (!yes) { netSend("rmno"); return; }
  const sid = rid();
  netSend("rmgo", { sid });
  setTimeout(() => void startSession("1v1", sid, true), 250);
}

// ---------------- queue ----------------
let qch: RealtimeChannel | null = null;
export async function queue1v1() {
  if (qch) return;
  NET.queueing = true;
  await dropping;
  const joinedAt = Date.now();
  let matched = false;
  const ch = supabase.channel("tw-queue", opts(MY_ID));
  qch = ch;
  ch.on("broadcast", { event: "match" }, ({ payload }) => {
    const p = payload as { a: string; b: string; sid: string };
    if (p.b !== MY_ID || matched) return;
    matched = true;
    leaveQueue();
    void startSession("1v1", p.sid, false, p.a);
  });
  ch.on("presence", { event: "sync" }, () => {
    if (matched) return;
    const st = ch.presenceState() as Record<string, { t?: number }[]>;
    const list = Object.entries(st).map(([id, v]) => ({ id, t: v[0]?.t ?? 0 })).sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    if (list.length < 2 || list[0]!.id !== MY_ID) return;
    matched = true;
    const sid = rid();
    void ch.send({ type: "broadcast", event: "match", payload: { a: MY_ID, b: list[1]!.id, sid } });
    setTimeout(() => { leaveQueue(); void startSession("1v1", sid, true); }, 300);
  });
  ch.subscribe((s) => { if (s === "SUBSCRIBED") void ch.track({ t: joinedAt, name: displayName() }); });
}
export function leaveQueue() {
  drop(qch);
  qch = null;
  NET.queueing = false;
}
export function requeue() {
  leaveToHome();
  void queue1v1();
}

// ---------------- lobby ----------------
const letters = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
export function createLobby() {
  const code = letters();
  void startSession("lobby", "L" + code, true, MY_ID, code);
  if (PARTY.on && PARTY.leaderId === MY_ID) partySend("go", { kind: "lobby", code });
  return code;
}
function failJoin(err: string) {
  const w = joinWait;
  joinWait = null;
  if (w) clearTimeout(w.timer);
  leaveSession();
  w?.resolve(err);
  if (!w) toast(err);
}
export function joinLobby(raw: string): Promise<string | null> {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{6}$/.test(code)) return Promise.resolve("Invalid code");
  return new Promise((resolve) => {
    void startSession("lobby", "L" + code, false, "", code).then(() => {
      joinWait = { resolve, timer: setTimeout(() => failJoin("Invalid code"), 4000) };
    });
  });
}

// ---------------- global presence + invites ----------------
let gch: RealtimeChannel | null = null;
let gName = "";
export async function initGlobal(name: string | null) {
  if (name === gName && gch) return;
  drop(gch);
  gch = null;
  gName = name ?? "";
  if (!name) { leaveParty(); return; }
  await dropping;
  const ch = supabase.channel("tw-global", opts(MY_ID));
  gch = ch;
  ch.on("presence", { event: "sync" }, () => {
    const st = ch.presenceState() as Record<string, { name?: string }[]>;
    ONLINE.names = Object.entries(st).map(([id, v]) => ({ id, name: v[0]?.name ?? "" })).filter((x) => x.name);
  });
  ch.on("broadcast", { event: "inv" }, ({ payload }) => {
    const p = payload as Omit<Invite, "key"> & { to: string };
    if (p.to !== displayName().toLowerCase() || p.fromId === MY_ID) return;
    const key = `${p.kind}-${p.fromId}-${p.pid ?? p.code}`;
    if (!INVITES.some((i) => i.key === key)) INVITES.push({ key, kind: p.kind, from: p.from, fromId: p.fromId, pid: p.pid, code: p.code });
  });
  ch.subscribe((s) => { if (s === "SUBSCRIBED") void ch.track({ name }); });
}

/** Sends a party or lobby invite to an online player by exact username. */
export async function inviteByName(raw: string, kind: "party" | "lobby"): Promise<string | null> {
  const name = raw.trim();
  if (!name) return "Type a username";
  if (name.toLowerCase() === displayName().toLowerCase()) return "That's you!";
  const target = ONLINE.names.find((n) => n.name.toLowerCase() === name.toLowerCase());
  if (!target) return "No online player with that username";
  if (kind === "party") {
    if (!PARTY.on) await createParty();
    if (PARTY.leaderId !== MY_ID) return "Only the party leader can invite";
    if (PARTY.members.length >= 4) return "Party is full (4 max)";
  }
  if (kind === "lobby" && !NET.code) return "You're not in a lobby";
  void gch?.send({ type: "broadcast", event: "inv", payload: { to: target.name.toLowerCase(), from: displayName(), fromId: MY_ID, kind, pid: PARTY.id, code: NET.code } });
  return null;
}

export function answerInvite(inv: Invite, yes: boolean): Promise<string | null> {
  INVITES.splice(INVITES.indexOf(inv), 1);
  if (!yes) return Promise.resolve(null);
  if (inv.kind === "party" && inv.pid) { void joinParty(inv.pid, false); return Promise.resolve(null); }
  if (inv.kind === "lobby" && inv.code) {
    if (NET.on) leaveSession();
    return joinLobby(inv.code);
  }
  return Promise.resolve(null);
}

// ---------------- party ----------------
let pch: RealtimeChannel | null = null;
let partySeenLeader = false;
const partySend = (k: string, data: Record<string, unknown> = {}) => void pch?.send({ type: "broadcast", event: "pm", payload: { k, f: MY_ID, ...data } });

async function createParty() { await joinParty(rid(), true); }

async function joinParty(pid: string, leader: boolean) {
  leaveParty();
  await dropping;
  Object.assign(PARTY, { on: true, id: pid, leaderId: leader ? MY_ID : "", members: [{ id: MY_ID, name: displayName() }] });
  partySeenLeader = leader;
  const joinedAt = Date.now();
  const ch = supabase.channel(`tw-p-${pid}`, opts(MY_ID));
  pch = ch;
  ch.on("presence", { event: "sync" }, () => {
    const st = ch.presenceState() as Record<string, { name?: string; leader?: boolean; t?: number }[]>;
    const list = Object.entries(st).map(([id, v]) => ({ id, name: v[0]?.name ?? "", leader: !!v[0]?.leader, t: v[0]?.t ?? 0 })).sort((a, b) => a.t - b.t);
    const lead = list.find((m) => m.leader);
    if (lead) { PARTY.leaderId = lead.id; partySeenLeader = true; }
    else if (partySeenLeader && !leader) { leaveParty("The party was disbanded"); return; }
    PARTY.members = list.map(({ id, name }) => ({ id, name }));
    if (!leader && list.length > 4 && list.findIndex((m) => m.id === MY_ID) >= 4) leaveParty("That party is full");
  });
  ch.on("broadcast", { event: "pm" }, ({ payload }) => {
    const m = payload as Msg;
    if (m.f === MY_ID) return;
    if (m.k === "kick" && m.id === MY_ID) leaveParty("You were removed from the party");
    else if (m.k === "disband") leaveParty("The party was disbanded");
    else if (m.k === "go" && m.f === PARTY.leaderId) {
      leaveQueue();
      if (m.kind === "lobby") void joinLobby(m.code as string).then((e) => e && toast(e));
      else void startSession(m.kind as SessKind, m.sid as string, false, m.f, "", m.kind === "1v1");
    }
  });
  ch.subscribe((s) => { if (s === "SUBSCRIBED") void ch.track({ name: displayName(), leader, t: joinedAt }); });
}

export function leaveParty(msg?: string) {
  if (!PARTY.on) return;
  drop(pch);
  pch = null;
  Object.assign(PARTY, { on: false, id: "", leaderId: "", members: [] });
  if (msg) toast(msg);
}
export const isPartyLeader = () => PARTY.on && PARTY.leaderId === MY_ID && PARTY.members.length > 1;
export function kickMember(id: string) { partySend("kick", { id }); }
export function disbandParty() {
  partySend("disband");
  setTimeout(() => leaveParty(), 200);
}

/** Party leader starts something for the whole party. */
export function partyPlay(kind: SessKind) {
  if (kind === "lobby") { createLobby(); return null; }
  if (kind === "1v1" && PARTY.members.length !== 2) return "A party 1v1 needs exactly 2 players";
  const sid = rid();
  partySend("go", { kind, sid });
  void startSession(kind, sid, true, MY_ID, "", kind === "1v1");
  return null;
}
