/*
  ReceiptSeal — tiny guarded Three.js emblem for the hero receipt card's head:
  a slowly rotating copper particle ring with a phosphor core, read as a
  minted seal next to the receipt kind label. Same performance/guard contract
  as ThreeBackground (no-WebGL silent bail, DPR cap, tab-hide pause, static
  frame under reduced motion, dispose on unmount) on a 40px canvas.
*/
import { useEffect, useRef } from "react";
import * as THREE from "three";

const POINTS = 140;
const DPR_CAP = 2;

export function ReceiptSeal() {
  const hostRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!window.WebGLRenderingContext) return;
    const reduce =
      document.documentElement.dataset.reduceMotion === "true" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
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
    const size = 40;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(size, size);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20);
    camera.position.z = 4.4;

    // Ring of copper points (outer) + phosphor core (inner), additive.
    const positions = new Float32Array(POINTS * 3);
    const colors = new Float32Array(POINTS * 3);
    const copper = new THREE.Color("#efae6b");
    const phosphor = new THREE.Color("#67e8b4");
    for (let i = 0; i < POINTS; i++) {
      const core = i < 24;
      const r = core ? 0.5 : 1.5 + (i % 3) * 0.06;
      const theta = (i / POINTS) * Math.PI * 2;
      positions[i * 3] = r * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(theta);
      positions[i * 3 + 2] = core ? (i % 5) * 0.05 : Math.sin(i * 1.7) * 0.15;
      const c = core ? phosphor : copper;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.07,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.rotation.x = 0.5;
    scene.add(points);

    let raf = 0;
    let visible = true;
    const frame = () => {
      points.rotation.z += 0.004;
      renderer.render(scene, camera);
      if (!reduce && visible && !document.hidden) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
      }
    };
    const onIntersection = (entries: IntersectionObserverEntry[]) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible && !raf && !reduce && !document.hidden) {
        raf = requestAnimationFrame(frame);
      }
    };
    const onVisibility = () => {
      if (!document.hidden && visible && !raf && !reduce) {
        raf = requestAnimationFrame(frame);
      }
    };
    const observer = new IntersectionObserver(onIntersection);
    observer.observe(host);
    document.addEventListener("visibilitychange", onVisibility);
    frame();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <span className="receipt-seal" ref={hostRef} aria-hidden="true" />
  );
}
