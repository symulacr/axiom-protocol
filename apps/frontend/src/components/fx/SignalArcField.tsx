/*
  SignalArcField — canvas2D data-arc band for the landing #how section.
  Adapted from ThreeUI Community's Predictive Arc renderer (MIT,
  github.com/MengTo/threeui) — reimplemented in Axiom's copper/phosphor
  palette with a transparent canvas (the section background shows through)
  instead of the original opaque dark fill.
  Performance contract: one 2D context, DPR capped at 2, rAF paused when
  off-screen or the tab hides, ~width/5 × height/5 dot grid per frame.
  Reduced motion renders nothing (calm page, OrbsField convention).
*/
import { useEffect, useRef } from "react";

const DPR_CAP = 2;
const SPACING = 5;
const DOT_SIZE = 5;

type ArcPalette = {
  /** Base arc color at low intensity. */
  base: [number, number, number];
  /** Core color near the arc line. */
  core: [number, number, number];
};

// Brand palette (index.css tokens): copper ramp + phosphor sparks.
const DARK: ArcPalette = { base: [86, 48, 22], core: [239, 174, 107] };
const LIGHT: ArcPalette = { base: [150, 92, 46], core: [146, 74, 30] };
const PHOSPHOR: [number, number, number] = [103, 232, 180];

export function SignalArcField() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduce =
      document.documentElement.dataset.reduceMotion === "true" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const canvas = document.createElement("canvas");
    host.appendChild(canvas);
    const context = canvas.getContext("2d");
    if (!context) {
      canvas.remove();
      return;
    }

    let width = 1;
    let height = 1;
    let time = 0;

    const resize = () => {
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      const dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const render = () => {
      context.clearRect(0, 0, width, height);
      time += 0.015;
      const light = document.body.classList.contains("light");
      const palette = light ? LIGHT : DARK;

      const centerX = width / 2;
      const peakY = height * 0.32;
      const archWidth = width * 1.5;
      const archHeight = height * 0.9;
      // Additive dots on a transparent canvas glow against the section bg.
      context.globalCompositeOperation = "lighter";

      for (let x = 0; x < width; x += SPACING) {
        const normX = (x - centerX) / (archWidth / 2);
        const curveY = peakY + normX * normX * archHeight;
        const thickness = 140 + (1 - Math.abs(normX)) * 80;
        // Sparse phosphor columns — the live-data sparks in the copper arc.
        const sparkColumn = Math.floor(x / SPACING) % 11 === 0;
        for (let y = 0; y < height; y += SPACING) {
          const distance = Math.abs(y - curveY);
          if (distance >= thickness) continue;
          let intensity = 1 - distance / thickness;
          const waveX = Math.sin(x * 0.015 + time);
          const waveY = Math.cos(y * 0.02 + time);
          intensity = intensity * 0.7 + waveX * waveY * 0.3 * intensity;
          intensity *= Math.max(0, 1 - Math.pow(Math.abs(normX), 2.5));
          if (intensity <= 0.02) continue;

          const rgb = sparkColumn ? PHOSPHOR : palette.core;
          const mix = Math.min(1, intensity);
          const r = Math.floor(
            palette.base[0] + (rgb[0] - palette.base[0]) * mix,
          );
          const g = Math.floor(
            palette.base[1] + (rgb[1] - palette.base[1]) * mix,
          );
          const b = Math.floor(
            palette.base[2] + (rgb[2] - palette.base[2]) * mix,
          );
          const size = DOT_SIZE * intensity;
          context.fillStyle = `rgb(${r}, ${g}, ${b})`;
          context.fillRect(x, y, size, size);
        }
      }
      context.globalCompositeOperation = "source-over";
    };

    let raf = 0;
    let visible = true;
    const tick = () => {
      render();
      raf = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const onIntersection = (entries: IntersectionObserverEntry[]) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible && !raf && !document.hidden) raf = requestAnimationFrame(tick);
      if (!visible && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const onVisibility = () => {
      if (document.hidden && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!document.hidden && visible && !raf) {
        raf = requestAnimationFrame(tick);
      }
    };

    const observer = new IntersectionObserver(onIntersection);
    observer.observe(host);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);
    resize();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      canvas.remove();
    };
  }, []);

  return <div className="signal-arc-field" ref={hostRef} aria-hidden="true" />;
}
