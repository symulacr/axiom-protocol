/*
  ForgeField — the Dark Forge landing's full-bleed 2D-canvas fog + ember
  field behind live HTML (plan-003 R1 port of variant-a's inline IIFE;
  replaces ThreeBackground on the landing). Copper is the metal/action role,
  phosphor the signal role; the palette matches the dark brand tokens.
  Performance contract (same as ThreeBackground's): DPR capped at 1.5, rAF
  canceled on hidden tab, a single static frame under reduced motion (both
  channels via useReducedMotion), silent bail when no 2D context exists.
*/
import { useEffect, useRef } from "react";
import { useReducedMotion } from "./fx.js";

const DPR_CAP = 1.5;
const POINT_COUNT = 130;

interface Blob {
  c: [number, number, number];
  a: number;
  r: number;
  sx: number;
  sy: number;
  vx: number;
  vy: number;
  p: number;
}

const BLOBS: Blob[] = [
  {
    c: [210, 139, 82],
    a: 0.13,
    r: 0.55,
    sx: 0.22,
    sy: 0.3,
    vx: 0.013,
    vy: 0.009,
    p: 0.0,
  },
  {
    c: [210, 139, 82],
    a: 0.09,
    r: 0.48,
    sx: 0.78,
    sy: 0.18,
    vx: 0.01,
    vy: 0.012,
    p: 2.1,
  },
  {
    c: [103, 232, 180],
    a: 0.08,
    r: 0.5,
    sx: 0.62,
    sy: 0.72,
    vx: 0.011,
    vy: 0.008,
    p: 4.0,
  },
  {
    c: [103, 232, 180],
    a: 0.06,
    r: 0.42,
    sx: 0.15,
    sy: 0.8,
    vx: 0.009,
    vy: 0.011,
    p: 1.3,
  },
  {
    c: [210, 139, 82],
    a: 0.07,
    r: 0.38,
    sx: 0.45,
    sy: 0.52,
    vx: 0.012,
    vy: 0.01,
    p: 5.2,
  },
];

export function ForgeField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Atmosphere only — a missing 2D context must never take the page down.
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    let w = 0;
    let h = 0;
    let raf = 0;
    let t = Math.random() * 1000;
    // Pointer parallax targets (tx/ty) ease into the painted values (px/py).
    let px = 0.5;
    let py = 0.5;
    let tx = 0.5;
    let ty = 0.5;

    const pts = Array.from({ length: POINT_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.3 + Math.random() * 0.7,
      drift: (Math.random() - 0.5) * 0.00004,
      copper: Math.random() < 0.4,
    }));

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = () => {
      t += 0.016;
      px += (tx - px) * 0.03;
      py += (ty - py) * 0.03;
      ctx.clearRect(0, 0, w, h);
      for (const b of BLOBS) {
        const bx =
          (b.sx + Math.sin(t * b.vx * 6 + b.p) * 0.08 + (px - 0.5) * 0.05) * w;
        const by =
          (b.sy + Math.cos(t * b.vy * 6 + b.p) * 0.07 + (py - 0.5) * 0.04) * h;
        const br = b.r * Math.max(w, h) * (1 + Math.sin(t * 0.07 + b.p) * 0.06);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      for (const p of pts) {
        p.y -= p.drift * p.z * h * 0.016 * 60;
        if (p.y < -0.02) p.y = 1.02;
        if (p.y > 1.04) p.y = -0.02;
        const x = (p.x + (px - 0.5) * 0.03 * p.z) * w;
        const y = (p.y + (py - 0.5) * 0.02 * p.z) * h;
        const tw = 0.5 + Math.sin(t * (0.6 + p.z) + p.x * 40) * 0.5;
        const alpha = (0.14 + 0.34 * tw) * p.z;
        ctx.fillStyle = p.copper
          ? `rgba(210,139,82,${alpha})`
          : `rgba(233,237,234,${alpha * 0.8})`;
        const s = p.z * 1.6;
        ctx.fillRect(x, y, s, s);
      }
    };

    const loop = () => {
      frame();
      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    let onPointer: ((e: PointerEvent) => void) | null = null;
    let onVisibility: (() => void) | null = null;
    if (reduced) {
      // Reduced motion: one static frame, no loop, no pointer tracking.
      frame();
    } else {
      loop();
      onPointer = (e: PointerEvent) => {
        tx = e.clientX / window.innerWidth;
        ty = e.clientY / window.innerHeight;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });
      onVisibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(raf);
        } else {
          loop();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (onPointer) window.removeEventListener("pointermove", onPointer);
      if (onVisibility)
        document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  return <canvas ref={canvasRef} className="forge-field" aria-hidden="true" />;
}
