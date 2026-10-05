import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import * as THREE from "three";

const SIZE = 220;

function SpinTable() {
  const g = useRef<THREE.Group>(null);
  useFrame((_, d) => { if (g.current) g.current.rotation.y += d * 1.6; });
  return (
    <group ref={g} position={[0, -1, 0]}>
      <mesh position={[0, 1.7, 0]}><boxGeometry args={[5, 0.55, 3.4]} /><meshStandardMaterial color="#2fa84f" roughness={0.5} /></mesh>
      {([[-2, 0.6, -1.2], [2, 0.6, -1.2], [-2, 0.6, 1.2], [2, 0.6, 1.2]] as const).map((p, i) => (
        <mesh key={i} position={p}><boxGeometry args={[0.45, 2.6, 0.45]} /><meshStandardMaterial color="#197a37" /></mesh>
      ))}
      {[-0.85, 0.85].map((x) => (
        <group key={x} position={[x, 1.8, 1.72]}>
          <mesh><sphereGeometry args={[0.32, 18, 12]} /><meshStandardMaterial color="#f5f2dc" /></mesh>
          <mesh position={[0, 0, 0.29]}><sphereGeometry args={[0.12, 12, 8]} /><meshStandardMaterial color="#172117" /></mesh>
        </group>
      ))}
    </group>
  );
}

/** Full-screen loader. The green table can be grabbed, thrown and bounces off the screen edges. */
export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const { progress, active } = useProgress();
  const [minDone, setMinDone] = useState(false);
  const [shown, setShown] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const phys = useRef({ x: 0, y: 0, vx: 260, vy: -180, drag: false, lx: 0, ly: 0, lt: 0, ox: 0, oy: 0 });

  useEffect(() => { const t = setTimeout(() => setMinDone(true), 1800); return () => clearTimeout(t); }, []);
  // Never get stuck: after 10s let the player continue even if a download stalls.
  useEffect(() => { const t = setTimeout(() => setShown(100), 10000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const id = setInterval(() => setShown((s) => (s >= 100 ? 100 : Math.min(active ? progress : 100, s + 4))), 40);
    return () => clearInterval(id);
  }, [progress, active]);

  useEffect(() => {
    const p = phys.current;
    p.x = window.innerWidth / 2 - SIZE / 2; p.y = window.innerHeight / 2 - SIZE / 2 - 60;
    let raf = 0, last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000); last = t;
      if (!p.drag) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.995; p.vy *= 0.995;
        const W = window.innerWidth - SIZE, H = window.innerHeight - SIZE;
        if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.9; }
        if (p.x > W) { p.x = W; p.vx = -Math.abs(p.vx) * 0.9; }
        if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.9; }
        if (p.y > H) { p.y = H; p.vy = -Math.abs(p.vy) * 0.9; }
      }
      if (box.current) box.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const move = (e: PointerEvent) => {
      if (!p.drag) return;
      const now = performance.now(), dt = Math.max(1, now - p.lt) / 1000;
      p.vx = (e.clientX - p.lx) / dt; p.vy = (e.clientY - p.ly) / dt;
      p.lx = e.clientX; p.ly = e.clientY; p.lt = now;
      p.x = e.clientX - p.ox; p.y = e.clientY - p.oy;
    };
    const up = () => {
      if (!p.drag) return;
      p.drag = false;
      const max = 3000, s = Math.hypot(p.vx, p.vy);
      if (s > max) { p.vx *= max / s; p.vy *= max / s; }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  const ready = minDone && shown >= 100;
  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-hud-ink font-mono text-hud">
      <div className="absolute inset-x-0 bottom-16 flex flex-col items-center gap-4">
        <h1 className="text-5xl font-black uppercase tracking-tight">Table Wars</h1>
        <div className="h-3 w-80 overflow-hidden rounded bg-hud-track"><div className="h-full bg-crosshair transition-[width]" style={{ width: `${shown}%` }} /></div>
        <p className="text-sm uppercase tracking-widest opacity-70">
          {ready ? "Servers ready" : `Loading servers… ${Math.floor(shown)}%`} · grab and throw the table
        </p>
        <button disabled={!ready} onClick={onDone} className="rounded bg-crosshair px-10 py-3 text-lg font-black uppercase text-hud-ink transition-opacity disabled:opacity-30">Continue</button>
      </div>
      <div
        ref={box}
        className="absolute left-0 top-0 cursor-grab active:cursor-grabbing"
        style={{ width: SIZE, height: SIZE, touchAction: "none" }}
        onPointerDown={(e) => {
          const p = phys.current;
          p.drag = true; p.ox = e.clientX - p.x; p.oy = e.clientY - p.y;
          p.lx = e.clientX; p.ly = e.clientY; p.lt = performance.now(); p.vx = 0; p.vy = 0;
        }}
      >
        <Canvas camera={{ position: [6, 4, 7], fov: 45 }} style={{ pointerEvents: "none" }}>
          <ambientLight intensity={1.1} />
          <directionalLight position={[5, 10, 6]} intensity={2.2} />
          <SpinTable />
        </Canvas>
      </div>
    </div>
  );
}
