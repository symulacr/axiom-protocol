/*
  ThreeBackground — subtle WebGL point field for the landing page.
  Performance contract: one Points draw call, no lights/postprocessing,
  DPR capped at 1.75, rAF paused when the tab hides, geometry/material/
  renderer disposed on unmount. Reduced-motion users get a single static
  frame (no loop, no pointer parallax). Replaces OrbsField on the landing.
*/
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const POINT_COUNT = 900;
const DPR_CAP = 1.75;

/** Fog + point palette per theme. Light values mirror the body.light tokens
 *  (--bg #f1eee8 / --copper #a96333 / --phosphor #0a684a) so the plane
 *  dissolves into paper instead of hazing dark over it. */
const SCENE_COLORS = {
  dark: { fog: 0x111315, copper: "#d28b52", phosphor: "#67e8b4" },
  light: { fog: 0xf1eee8, copper: "#a96333", phosphor: "#0a684a" },
} as const;

type ThemeName = keyof typeof SCENE_COLORS;

/** The resolved theme lives on documentElement (index.html boot + App theme bridge). */
const readTheme = (): ThemeName =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

export function ThreeBackground() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // The landing ThemeToggle flips data-theme in place — watch the attribute
  // so a switch re-themes the field without waiting for a route change.
  const [theme, setTheme] = useState<ThemeName>(readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // No-WebGL environments (headless audits, blocked GPU, old embedded
    // views) must never take the landing down — the field is optional
    // atmosphere, so bail silently instead of throwing into the boundary.
    if (!window.WebGLRenderingContext) return;
    const reduce =
      document.documentElement.dataset.reduceMotion === "true" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }
    if (!renderer.getContext()) {
      renderer.dispose();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    // Fog in the page surface tone so the plane dissolves into the
    // background instead of reading as a discrete shape.
    const palette = SCENE_COLORS[theme];
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(palette.fog, 8, 45);
    const camera = new THREE.PerspectiveCamera(
      55,
      host.clientWidth / host.clientHeight,
      0.1,
      60,
    );
    camera.position.z = 14;

    // Wide atmosphere plane below the hero: points spread over a large
    // XZ rectangle with slight vertical jitter, no recognizable outline.
    const positions = new Float32Array(POINT_COUNT * 3);
    const colors = new Float32Array(POINT_COUNT * 3);
    const copper = new THREE.Color(palette.copper);
    const phosphor = new THREE.Color(palette.phosphor);
    for (let i = 0; i < POINT_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = -12 + (Math.random() - 0.5) * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
      const c = Math.random() < 0.18 ? phosphor : copper;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.09,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Pointer parallax: camera eases a fraction of the cursor offset,
    // clamped tighter than the old dome so the plane stays calm.
    let targetX = 0;
    let targetY = 0;
    const onPointer = (event: PointerEvent) => {
      targetX = (event.clientX / innerWidth - 0.5) * 0.6;
      targetY = (event.clientY / innerHeight - 0.5) * 0.6;
    };
    if (!reduce)
      window.addEventListener("pointermove", onPointer, {
        passive: true,
      });

    const onResize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    let running = true;
    let time = 0;
    const frame = () => {
      if (!running) return;
      time += 0.008;
      // Slow lateral drift plus a gentle sway — slower than the old dome
      // rotation; the plane should feel like atmosphere, not an object.
      points.position.x = time * 0.01 + Math.sin(time * 0.1) * 0.5;
      camera.position.x += (targetX - camera.position.x) * 0.04;
      camera.position.y += (-targetY - camera.position.y) * 0.04;
      camera.lookAt(0, -8, 0);
      renderer.render(scene, camera);
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    // Hidden tab: stop the loop entirely instead of painting into the void.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    frame();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [theme]);

  return <div className="three-bg" ref={hostRef} aria-hidden="true" />;
}
