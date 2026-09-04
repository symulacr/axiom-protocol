/*
  Axiom FX kit — dependency-free cinematic primitives for the Awwwards
  rebuild. Every animated primitive honors the dual reduced-motion channel:
  the OS `prefers-reduced-motion: reduce` query AND the app-level
  `[data-reduce-motion="true"]` attribute uiStore sets on <html>. All motion
  is translateY-only (RTL-safe) and gated to paint cheaply (transform/opacity).
*/
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** True when either reduced-motion channel is active. */
export function useReducedMotion(): boolean {
  const read = () => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-reduce-motion") === "true"
    );
  };
  const [reduced, setReduced] = useState(read);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const sync = () =>
      setReduced(
        mq.matches || root.getAttribute("data-reduce-motion") === "true",
      );
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-reduce-motion"],
    });
    mq.addEventListener("change", sync);
    sync();
    return () => {
      mq.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);

  return reduced;
}

/** Scroll-reveal wrapper: translates/opacity via the `aw-reveal` CSS lane,
 *  flipped to visible by an IntersectionObserver. Reduced motion renders
 *  the content statically (no transform, no transition). */
export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  /** Stagger delay in ms — keep under ~400 so sections feel immediate. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      className={`aw-reveal ${shown ? "is-in" : ""} ${reduced ? "is-static" : ""} ${className}`.trim()}
      style={delay && !reduced ? { transitionDelay: `${delay}ms`, ...style } : style}
    >
      {children}
    </div>
  );
}

/** Parallax wrapper: translateY proportional to the element's distance from
 *  the viewport center. translateY-only by design so RTL layouts are safe. */
export function Parallax({
  children,
  strength = 40,
  className = "",
  style,
}: {
  children: ReactNode;
  /** Max px of travel; negative value inverts direction. */
  strength?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const viewport = window.innerHeight;
      // -1 (below center) … 0 (centered) … 1 (above center)
      const progress =
        (viewport / 2 - (rect.top + rect.height / 2)) / (viewport / 2);
      el.style.transform = `translate3d(0, ${(progress * strength).toFixed(2)}px, 0)`;
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      el.style.transform = "";
    };
  }, [reduced, strength]);

  return (
    <div
      ref={ref}
      className={`aw-parallax ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}

/** Fixed scroll-progress hairline (copper). Hidden entirely under reduced motion. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? window.scrollY / max : 0;
      el.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio)).toFixed(4)})`;
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reduced]);

  if (reduced) return null;
  return <div ref={ref} className="aw-scroll-progress" aria-hidden="true" />;
}

/** Animated count-up that starts when scrolled into view; static under
 *  reduced motion or while the value is loading (null renders the fallback). */
export function CountUp({
  value,
  fallback = "—",
  durationMs = 1400,
  className = "",
}: {
  value: number | null;
  fallback?: string;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (value === null) return;
    if (reduced) {
      setDisplay(value.toLocaleString());
      return;
    }
    const el = ref.current;
    const format = (n: number) => Math.round(n).toLocaleString();
    if (!el || !("IntersectionObserver" in window)) {
      setDisplay(format(value));
      return;
    }
    let raf = 0;
    let start = 0;
    const run = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(format(value * eased));
      if (t < 1) raf = requestAnimationFrame(run);
    };
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          io.disconnect();
          raf = requestAnimationFrame(run);
        }
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [value, reduced, durationMs]);

  return (
    <span ref={ref} className={className}>
      {value === null ? fallback : (display ?? "0")}
    </span>
  );
}

/** Mouse-tracked spotlight surface — sets `--aw-spot-x/--aw-spot-y` so the
 *  CSS layer can paint a soft copper radial highlight. Purely decorative. */
export function SpotlightCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={ref}
      className={`aw-spotlight ${className}`.trim()}
      style={style}
      onPointerMove={(event) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--aw-spot-x", `${event.clientX - rect.left}px`);
        el.style.setProperty("--aw-spot-y", `${event.clientY - rect.top}px`);
      }}
    >
      {children}
    </div>
  );
}

/** Film-grain overlay. One per page, fixed, pointer-events: none; the CSS
 *  layer gates its drift animation on both reduced-motion channels. */
export function GrainOverlay() {
  return <div className="aw-grain" aria-hidden="true" />;
}

const ORB_PALETTE = ["#d28b52", "#efae6b", "#67e8b4", "#3fbfae", "#8a5a3a"];

/**
 * Canvas orb field — slow-drifting additive-blended orbs (orbs.jakubantalik
 * inspiration, original implementation). Pauses when offscreen or hidden;
 * renders nothing under reduced motion so the page stays calm.
 */
export function OrbsField({
  count = 7,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;

    interface Orb {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      hue: string;
      phase: number;
      wobble: number;
    }
    let orbs: Orb[] = [];

    const seed = () => {
      orbs = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 60 + Math.random() * 160,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.1,
        hue: ORB_PALETTE[i % ORB_PALETTE.length] ?? "#d28b52",
        phase: Math.random() * Math.PI * 2,
        wobble: 0.4 + Math.random() * 0.6,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = (now: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;
        if (orb.x < -orb.r) orb.x = width + orb.r;
        if (orb.x > width + orb.r) orb.x = -orb.r;
        if (orb.y < -orb.r) orb.y = height + orb.r;
        if (orb.y > height + orb.r) orb.y = -orb.r;
        const breathe =
          1 + Math.sin(now / 4200 + orb.phase) * 0.16 * orb.wobble;
        const radius = orb.r * breathe;
        const gradient = ctx.createRadialGradient(
          orb.x,
          orb.y,
          0,
          orb.x,
          orb.y,
          radius,
        );
        gradient.addColorStop(0, `${orb.hue}30`);
        gradient.addColorStop(0.55, `${orb.hue}14`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);

    const onResize = () => resize();
    window.addEventListener("resize", onResize, { passive: true });

    // Pause the loop whenever the field is offscreen or the tab is hidden.
    const io = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible && !running && !document.hidden) {
        running = true;
        raf = requestAnimationFrame(draw);
      } else if (!visible && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(canvas);
    const onVisibility = () => {
      if (document.hidden && running) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!document.hidden && !running) {
        running = true;
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [count, reduced]);

  if (reduced) return null;
  return (
    <canvas
      ref={canvasRef}
      className={`aw-orbs ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

/** Discrete "thinking" dots for agent working states (aicss/orbs-inspired,
 *  original implementation): three tokens pulsing in a staggered sequence —
 *  a quiet activity signal that never blocks the thread. Static (fully
 *  visible, no animation) under either reduced-motion channel. */
export function ThinkingOrbs({
  className,
  label,
}: {
  className?: string;
  /** Accessible name for the indicator (aria-label on the row). */
  label: string;
}) {
  const reduced = useReducedMotion();
  return (
    <span
      className={`aw-thinking-orbs${className ? ` ${className}` : ""}${reduced ? " is-static" : ""}`}
      role="status"
      aria-label={label}
    >
      <span className="aw-thinking-orb" />
      <span className="aw-thinking-orb" />
      <span className="aw-thinking-orb" />
    </span>
  );
}
