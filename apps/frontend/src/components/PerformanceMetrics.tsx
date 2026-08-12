import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type {
  PerformanceMetrics as Metrics,
  TradeHistoryEntry,
} from "../hooks/usePerformance.js";
import {
  COLORS,
  Card,
  SectionTitle,
  MonoLabel,
  KeyValueGrid,
  type KeyValueGridItem,
} from "./ui.js";

interface PerformanceMetricsProps {
  metrics: Metrics;
  history?: TradeHistoryEntry[];
}

const EASE = "var(--ease-out)";
const SPARK_H = 64;

const metricValueStyle: CSSProperties = {
  // inherit: the value-cell wrapper carries the resting color and the
  // flash-up/flash-down animation color; at rest this resolves to --c-text.
  color: "inherit",
  fontSize: "var(--text-base)",
  fontWeight: "var(--fw-semibold)",
};

const valueCellStyle: CSSProperties = {
  display: "inline-block", // transformable, so the flash scale lift renders
};

// Value-flash direction: compare leading numeric content ("10 / 5 / 3" -> 10,
// "66.7%" -> 66.7; ticks/actions pass through as numbers). Equal -> "down".
const flashDir = (a: string | number, b: string | number): "up" | "down" =>
  parseFloat(String(a)) > parseFloat(String(b)) ? "up" : "down";

export function PerformanceMetrics({
  metrics,
  history = [],
}: PerformanceMetricsProps): ReactElement {
  const buyRate = metrics.buyRate ?? metrics.winRate;

  const stats = useMemo(
    () => ({
      ticks: metrics.totalTicks,
      bsh: `${metrics.buyCount} / ${metrics.sellCount} / ${metrics.holdCount}`,
      rate: `${(buyRate * 100).toFixed(1)}%`,
      actions: metrics.buyCount + metrics.sellCount,
    }),
    [metrics],
  );

  const valRefs = useRef<(HTMLSpanElement | null)[]>([null, null, null, null]);
  const animRefs = useRef<(Animation | null)[]>([null, null, null, null]);
  const prevStats = useRef(stats);
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});

  useEffect(() => {
    if (reduceMotion) {
      prevStats.current = stats;
      return;
    }
    const prev = prevStats.current;
    const next = stats;
    const values = [next.ticks, next.bsh, next.rate, next.actions];
    const prevVals = [prev.ticks, prev.bsh, prev.rate, prev.actions];
    const keys = ["ticks", "bsh", "rate", "actions"] as const;
    const changed: Record<string, "up" | "down"> = {};
    valRefs.current.forEach((el, i) => {
      if (!el || prevVals[i] === values[i]) return;
      animRefs.current[i]?.cancel();
      animRefs.current[i] = el.animate(
        [
          { transform: "translateY(4px)", opacity: 0.5 },
          { transform: "translateY(0)", opacity: 1 },
        ],
        { duration: 180, easing: EASE },
      );
      const key = keys[i];
      const value = values[i];
      const prevValue = prevVals[i];
      if (key !== undefined && value !== undefined && prevValue !== undefined) {
        changed[key] = flashDir(value, prevValue);
      }
    });
    prevStats.current = stats;
    if (Object.keys(changed).length === 0) return;
    setFlash(changed);
    const timer = setTimeout(() => setFlash({}), 900);
    return () => clearTimeout(timer);
  }, [stats, reduceMotion]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(true);

  const series = useMemo(() => {
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    let b = 0;
    let s = 0;
    let h = 0;
    const buys: number[] = [];
    const sells: number[] = [];
    const holds: number[] = [];
    for (const e of sorted) {
      if (e.action === "buy") b++;
      else if (e.action === "sell") s++;
      else h++;
      buys.push(b);
      sells.push(s);
      holds.push(h);
    }
    return { buys, sells, holds };
  }, [history]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 300;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(SPARK_H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, SPARK_H);
      const drawLine = (data: number[], color: string, width: number): void => {
        if (data.length === 0) return;
        const max = Math.max(1, ...data);
        ctx.beginPath();
        data.forEach((v, i) => {
          const x = data.length === 1 ? w : (i / (data.length - 1)) * w;
          const y = SPARK_H - (v / max) * (SPARK_H - 10) - 5;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      drawLine(series.buys, COLORS.bronze, 2);
      drawLine(series.sells, COLORS.danger, 2);
      drawLine(series.holds, COLORS.teal, 1);
    };

    const io = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries[0]?.isIntersecting ?? true;
        if (visibleRef.current) draw();
      },
      { threshold: 0 },
    );
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      if (visibleRef.current) draw();
    });
    ro.observe(canvas);
    if (visibleRef.current) draw();
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, [series]);

  const items: KeyValueGridItem[] = [
    {
      label: "Total Ticks",
      value: (
        <span ref={(el) => (valRefs.current[0] = el)}>
          <span
            style={valueCellStyle}
            className={flash.ticks ? `flash-${flash.ticks}` : undefined}
          >
            <MonoLabel style={metricValueStyle}>
              {metrics.totalTicks.toString()}
            </MonoLabel>
          </span>
        </span>
      ),
    },
    {
      label: "Buy / Sell / Hold",
      value: (
        <span ref={(el) => (valRefs.current[1] = el)}>
          <span
            style={valueCellStyle}
            className={flash.bsh ? `flash-${flash.bsh}` : undefined}
          >
            <MonoLabel style={metricValueStyle}>
              {`${metrics.buyCount} / ${metrics.sellCount} / ${metrics.holdCount}`}
            </MonoLabel>
          </span>
        </span>
      ),
    },
    {
      label: "Buy Rate",
      value: (
        <span ref={(el) => (valRefs.current[2] = el)}>
          <span
            style={{
              display: "inline-block",
              // resting color lives here so the flash class can animate it
              // (the label inherits it via metricValueStyle color: inherit)
              color: buyRate > 0 ? COLORS.success : COLORS.textMuted,
            }}
            className={flash.rate ? `flash-${flash.rate}` : undefined}
          >
            <MonoLabel style={metricValueStyle}>
              {`${(buyRate * 100).toFixed(1)}%`}
            </MonoLabel>
          </span>
        </span>
      ),
    },
    {
      label: "Actions",
      value: (
        <span ref={(el) => (valRefs.current[3] = el)}>
          <span
            style={valueCellStyle}
            className={flash.actions ? `flash-${flash.actions}` : undefined}
          >
            <MonoLabel style={metricValueStyle}>
              {(metrics.buyCount + metrics.sellCount).toString()}
            </MonoLabel>
          </span>
        </span>
      ),
    },
  ];

  return (
    <Card style={{ marginBottom: "var(--space-xl)" }}>
      <SectionTitle>Performance Summary</SectionTitle>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          width: "100%",
          height: SPARK_H,
          display: "block",
          marginBottom: "var(--space-lg)",
        }}
      />
      <KeyValueGrid items={items} />
    </Card>
  );
}
