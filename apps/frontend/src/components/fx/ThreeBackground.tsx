/*
  ThreeBackground — subtle WebGL point field for the landing page.
  Performance contract: one Points draw call, no lights/postprocessing,
  DPR capped at 1.75, rAF paused when the tab hides, geometry/material/
  renderer disposed on unmount. Reduced-motion users get a single static
  frame (no loop, no pointer parallax). Replaces OrbsField on the landing.
*/
import { useEffect, useRef } from "react";
import * as THREE from "three";

const POINT_COUNT = 1400;
const DPR_CAP = 1.75;

export function ThreeBackground() {
  const hostRef = useRef<HTMLDivElement | null>(null);

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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      host.clientWidth / host.clientHeight,
      0.1,
      40,
    );
    camera.position.z = 14;

    // Two-hue field: copper majority, phosphor sparks (brand palette).
    const positions = new Float32Array(POINT_COUNT * 3);
    const colors = new Float32Array(POINT_COUNT * 3);
    const copper = new THREE.Color("#d28b52");
    const phosphor = new THREE.Color("#67e8b4");
    for (let i = 0; i < POINT_COUNT; i++) {
      // Shell distribution keeps the center clear behind the copy column.
      const r = 5 + Math.random() * 11;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 16;
      positions[i * 3] = r * Math.cos(theta);
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = r * Math.sin(theta) - 4;
      const c = Math.random() < 0.18 ? phosphor : copper;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.05,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Pointer parallax: camera eases a fraction of the cursor offset.
    let targetX = 0;
    let targetY = 0;
    const onPointer = (event: PointerEvent) => {
      targetX = (event.clientX / innerWidth - 0.5) * 1.6;
      targetY = (event.clientY / innerHeight - 0.5) * 1.1;
    };
    if (!reduce) window.addEventListener("pointermove", onPointer, {
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
    const frame = () => {
      if (!running) return;
      points.rotation.y += 0.0007;
      camera.position.x += (targetX - camera.position.x) * 0.04;
      camera.position.y += (-targetY - camera.position.y) * 0.04;
      camera.lookAt(0, 0, -4);
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
  }, []);

  return <div className="three-bg" ref={hostRef} aria-hidden="true" />;
}
