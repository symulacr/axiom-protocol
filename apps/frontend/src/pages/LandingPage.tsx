/*
  Landing (plan-003 R1): ONE switchable landing page hosting the two validated
  .design-audit/landing-redesign variants. Dark Forge is the default; the nav
  design switch flips the whole page to Light Editorial by driving the same
  persisted theme slot the console uses (settings.theme: forge = dark,
  editorial = light) — the console's own ThemeToggle keeps working off that
  slot, and App.tsx mirrors it onto html[data-theme] + body.light as before.
  All copy routes through copy.ts via getCopy(locale) (the variants hardcoded
  English). Effect islands are the real npm packages (metal-fx, border-beam,
  thinking-orbs, liquid-gooey), each behind IslandGuard with a static
  fallback; metal-fx's plain-children path is kept for no-WebGL2 clients.
*/
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { BorderBeam } from "border-beam";
import { MetalFx, isMetalFxSupported } from "metal-fx";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { Liquid } from "liquid-gooey";
import {
  CircleHelp,
  Globe2,
  Menu,
  Wallet,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  CreditCard,
  Sun,
  Moon,
} from "../components/axiom/icons.js";
import { Logo } from "../components/axiom/AppShell.js";
import { useModalDismiss } from "../hooks/useModalDismiss.js";
import { useUiStore } from "../lib/uiStore.js";
import { routePath, PUBLIC_HUB_PATHS } from "../lib/routeRegistry.js";
import {
  getCopy,
  interpolate,
  type Copy,
  type Locale,
  type LandingFooterLinkId,
} from "../lib/copy.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../config/wagmi.js";
import {
  GrainOverlay,
  Reveal,
  ScrollProgress,
  IslandGuard,
  useReducedMotion,
} from "../components/fx/fx.js";
import { ForgeField } from "../components/fx/ForgeField.js";

type LandingCopy = Copy["landing"];
type PrincipleItem = LandingCopy["principles"]["items"][number];
type HowStep = LandingCopy["how"]["steps"][number];

/** Footer links carry a stable id in copy.ts; destinations key off that id,
 *  so a copy reorder can never point a label at the wrong hub path (F2b). */
const FOOTER_HREFS: Record<LandingFooterLinkId, string> = {
  agents: PUBLIC_HUB_PATHS.agents,
  receipts: PUBLIC_HUB_PATHS.proofs,
  storage: PUBLIC_HUB_PATHS.storage,
  developers: PUBLIC_HUB_PATHS.developers,
};

/** Principle cards keyed by their copy.ts icon id (the old index wiring
 *  drifted on reorder). */
const PRINCIPLE_HREFS: Record<"shield" | "receipt" | "wallet", string> = {
  shield: PUBLIC_HUB_PATHS.developers,
  receipt: PUBLIC_HUB_PATHS.proofs,
  wallet: PUBLIC_HUB_PATHS.payments,
};

/** Scroll-spy sections, in page order; the nav anchors share this list. */
const SPY_IDS = ["hero", "principles", "how", "start"] as const;

/** Nav anchor set shared by both designs (labels from copy.landing.nav). */
function navAnchors(copy: Copy) {
  return [
    { id: "hero", label: copy.landing.nav.overview },
    { id: "principles", label: copy.landing.nav.principles },
    { id: "how", label: copy.landing.nav.howItWorks },
    { id: "start", label: copy.landing.nav.start },
  ] as const;
}

/** Interpolation to real <em> tags for the copy.ts {emphasis} markers. */
function emphasisHtml(template: string): string {
  return interpolate(template, {
    emphasis: "<em>",
    endEmphasis: "</em>",
  });
}

/** Principle-card icon dispatch. 1.5 stroke set once for consistent weight. */
function PrincipleIcon({ name }: { name: "shield" | "receipt" | "wallet" }) {
  const common = { size: 18, strokeWidth: 1.5, "aria-hidden": true } as const;
  if (name === "shield") return <ShieldCheck {...common} />;
  if (name === "receipt") return <FileCheck2 {...common} />;
  return <CreditCard {...common} />;
}

/** Live media query (AppShell's twin stays local there; this one is the
 *  landing's own — two 10-line copies beat exporting shell internals). */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Scroll-spy: the inline nav highlights the section crossing the viewport
 *  band (same inline-observer contract the landing has shipped). */
function useScrollSpy(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const el of sections) io.observe(el);
    return () => io.disconnect();
  }, [ids]);
  return active;
}

/** A/B design switch: replaces the landing's dark/light ThemeToggle and
 *  drives the same settings.theme slot (A = dark, B = light). Renders the
 *  icon of the design it switches TO (ThemeToggle convention). */
function DesignSwitch({
  editorial,
  onToggle,
  copy,
}: {
  editorial: boolean;
  onToggle: () => void;
  copy: Copy;
}) {
  const label = editorial
    ? copy.landing.switchToForge
    : copy.landing.switchToEditorial;
  return (
    <button
      type="button"
      className="icon-button landing-design-switch"
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-pressed={editorial}
    >
      {editorial ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 *  Mobile menus. The panel menu (both designs' fallback) keeps the
 *  audit-fixed dismiss contract: Esc + Tab trap + initial focus + focus
 *  restore via useModalDismiss, transparent popover-backdrop carries the
 *  outside-click leg. The editorial goo menu mounts MenuDismiss only
 *  while open so the same hook owns the open lifecycle.
 * ------------------------------------------------------------------ */

function MenuDismiss({
  onClose,
  shellRef,
}: {
  onClose: () => void;
  shellRef: RefObject<HTMLElement | null>;
}) {
  useModalDismiss(onClose, shellRef);
  return null;
}

function LandingMobileMenu({
  copy,
  onClose,
  onGuide,
  go,
}: {
  copy: Copy;
  onClose: () => void;
  onGuide: () => void;
  go: (path: string) => void;
}) {
  const menuRef = useRef<HTMLElement>(null);
  useModalDismiss(onClose, menuRef);
  const navigate = (path: string) => {
    onClose();
    go(path);
  };
  return (
    <>
      <div className="popover-backdrop" onMouseDown={onClose} />
      <nav
        ref={menuRef}
        id="landing-mobile-menu"
        className="landing-mobile-menu"
        role="dialog"
        aria-label={copy.a11y.explorePublicPaths}
      >
        {navAnchors(copy).map((a) => (
          <a
            key={a.id}
            className="landing-mobile-item"
            href={`#${a.id}`}
            onClick={onClose}
          >
            <span>
              <strong>{a.label}</strong>
            </span>
          </a>
        ))}
        <button
          type="button"
          className="landing-mobile-item"
          onClick={() => {
            onClose();
            onGuide();
          }}
        >
          <CircleHelp size={16} strokeWidth={1.5} />
          <span>
            <strong>{copy.nav.howItWorks}</strong>
            <small>{copy.landing.menuGuideHint}</small>
          </span>
        </button>
        <button
          type="button"
          className="landing-mobile-item"
          onClick={() => navigate(routePath("developers"))}
        >
          <Globe2 size={16} strokeWidth={1.5} />
          <span>
            <strong>{copy.landing.menuDevelopers}</strong>
            <small>{copy.landing.menuDevelopersHint}</small>
          </span>
        </button>
      </nav>
    </>
  );
}

/** liquid-gooey menu — the editorial variant's signature island: pills
 *  detach from the trigger as droplets. Rendered only <980px with motion
 *  allowed; any library failure (IslandGuard onFail) swaps back to the
 *  panel menu without losing the open state. */
function GooMenu({
  open,
  onToggle,
  onClose,
  copy,
  onGuide,
  go,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  copy: Copy;
  onGuide: () => void;
  go: (path: string) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const items: ReadonlyArray<{
    key: string;
    label: string;
    href?: string;
    action?: () => void;
  }> = [
    ...navAnchors(copy).map((a) => ({
      key: a.id,
      label: a.label,
      href: `#${a.id}`,
    })),
    { key: "guide", label: copy.nav.howItWorks, action: onGuide },
    {
      key: "developers",
      label: copy.landing.menuDevelopers,
      action: () => go(routePath("developers")),
    },
  ];
  return (
    <div className="goo-host" ref={shellRef}>
      {open && <div className="popover-backdrop" onMouseDown={onClose} />}
      {open && <MenuDismiss onClose={onClose} shellRef={shellRef} />}
      <div
        className={`goo-shell${open ? " open" : ""}`}
        id="landing-mobile-menu"
        role="group"
        aria-label={copy.a11y.explorePublicPaths}
      >
        <Liquid
          blur={10}
          contrast={18}
          fill="var(--panel)"
          shadow="0 12px 32px rgba(38,32,25,.16)"
        >
          <Liquid.Item
            x={0}
            y={0}
            transition="bouncy"
            className="goo-item goo-trigger"
          >
            <button
              type="button"
              className={`le-menu-trigger${open ? " open" : ""}`}
              aria-label={copy.a11y.explorePublicPaths}
              aria-expanded={open}
              aria-controls="landing-mobile-menu"
              onClick={onToggle}
            >
              <span />
              <span />
            </button>
          </Liquid.Item>
          {items.map((item, i) => (
            <Liquid.Item
              key={item.key}
              x={0}
              y={open ? 62 + i * 56 : 0}
              transition="bouncy"
              delay={i * 45}
              className="goo-item goo-pill"
            >
              {item.href ? (
                <a
                  className="le-menu-pill"
                  href={item.href}
                  tabIndex={open ? 0 : -1}
                  aria-hidden={!open}
                  style={{
                    opacity: open ? 1 : 0,
                    transform: open ? "none" : "scale(.55)",
                    transformOrigin: "top right",
                    pointerEvents: open ? "auto" : "none",
                  }}
                  onClick={onClose}
                >
                  {item.label}
                </a>
              ) : (
                <button
                  type="button"
                  className="le-menu-pill"
                  tabIndex={open ? 0 : -1}
                  aria-hidden={!open}
                  style={{
                    opacity: open ? 1 : 0,
                    transform: open ? "none" : "scale(.55)",
                    transformOrigin: "top right",
                    pointerEvents: open ? "auto" : "none",
                  }}
                  onClick={() => {
                    onClose();
                    item.action?.();
                  }}
                >
                  {item.label}
                </button>
              )}
            </Liquid.Item>
          ))}
        </Liquid>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Effect islands (real npm packages behind IslandGuard).
 * ------------------------------------------------------------------ */

/** Static CSS conic metal ring — the no-WebGL2 fallback and the closing
 *  CTA's ring (metal-fx hides offscreen instances until first intersection,
 *  so the deep-page CTA keeps the CSS version per NOTES-A). */
function MetalRing({ children }: { children: ReactNode }) {
  return (
    <span className="metal-host">
      <span className="metal-fallback" aria-hidden="true" />
      {children}
    </span>
  );
}

/** metal-fx liquid ring on the forge primary CTAs. Without WebGL2 the honest
 *  fallback is the CSS ring; a mid-render library throw lands on the same
 *  ring via IslandGuard. */
function MetalCta({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [supported] = useState(() => {
    try {
      return isMetalFxSupported();
    } catch {
      return false;
    }
  });
  if (!supported) return <MetalRing>{children}</MetalRing>;
  return (
    <IslandGuard fallback={<MetalRing>{children}</MetalRing>}>
      <MetalFx
        variant="button"
        preset="gold"
        theme="dark"
        strength={0.9}
        borderRadius={999}
        paused={reduced}
        className="metal-slot"
      >
        {children}
      </MetalFx>
    </IslandGuard>
  );
}

const ORB_SEQUENCE: readonly OrbState[] = ["working", "searching", "solving"];

/** thinking-orbs island with the layered-radial CSS orb as fallback. The
 *  state label cycle pauses entirely under reduced motion. */
function ConsoleOrb({
  size,
  theme,
  copy,
  cycleMs,
  showLabel = false,
  fallbackClass,
}: {
  size: 64 | 20;
  theme: "dark" | "light";
  copy: Copy;
  cycleMs: number;
  showLabel?: boolean;
  fallbackClass: string;
}) {
  const reduced = useReducedMotion();
  const labels = copy.landing.console.orbStates;
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setIdx((v) => (v + 1) % ORB_SEQUENCE.length),
      cycleMs,
    );
    return () => window.clearInterval(id);
  }, [reduced, cycleMs]);
  const orbState = ORB_SEQUENCE[idx % ORB_SEQUENCE.length] ?? "working";
  const label = labels[idx % Math.max(labels.length, 1)] ?? "";
  const a11y = interpolate(copy.landing.console.orbA11y, { state: label });
  return (
    <>
      <IslandGuard
        fallback={
          <span className={fallbackClass} role="img" aria-label={a11y} />
        }
      >
        <ThinkingOrb
          state={orbState}
          size={size}
          theme={theme}
          paused={reduced}
          aria-label={a11y}
        />
      </IslandGuard>
      {showLabel && <span className="le-orb-label">{label}</span>}
    </>
  );
}

/* ------------------------------------------------------------------ *
 *  Simulated console stream. Static lines carry the canonical frame
 *  (tick 4821 / block 4812336); with motion allowed a typewriter loop
 *  cycles the same copy.ts templates with incrementing tick/block and a
 *  fresh receipt hash per cycle. aria-hidden while live; the sr-only
 *  summary always carries the full feed.
 * ------------------------------------------------------------------ */

const STREAM_FRAME = { tick: 4821, block: 4812336, receiptHash: "0x8f3a…c21e" };

function streamLines(
  copy: Copy,
  nativeSymbol: string,
  frame: { tick: number; block: number; receiptHash: string },
): string[] {
  return copy.landing.console.lines.map((template) =>
    interpolate(template, { ...frame, nativeSymbol }),
  );
}

function StreamLine({
  text,
  hash,
  fresh,
  typing,
}: {
  text: string;
  hash: string;
  fresh: boolean;
  typing?: boolean;
}) {
  const parts = hash !== "" && text.includes(hash) ? text.split(hash) : null;
  return (
    <span className={`forge-stream-line${fresh ? " is-fresh" : ""}`}>
      <span className="forge-prompt" aria-hidden="true">
        &gt;
      </span>
      {parts ? (
        <>
          {parts[0]}
          <span className="forge-hash">{hash}</span>
          {parts[1]}
        </>
      ) : (
        text
      )}
      {typing && <span className="forge-caret" aria-hidden="true" />}
    </span>
  );
}

function ForgeStream({
  copy,
  nativeSymbol,
}: {
  copy: Copy;
  nativeSymbol: string;
}) {
  const reduced = useReducedMotion();
  const templates = copy.landing.console.lines;
  // null = static frame (reduced motion or pre-start); otherwise the live
  // window of up to 4 lines, the last one mid-typing.
  const [live, setLive] = useState<{ lines: string[]; typing: boolean } | null>(
    null,
  );
  const [liveHash, setLiveHash] = useState(STREAM_FRAME.receiptHash);

  useEffect(() => {
    if (reduced) {
      setLive(null);
      return;
    }
    let cancelled = false;
    let timer = 0;
    let tickN = STREAM_FRAME.tick;
    let blockN = STREAM_FRAME.block;
    const hex = (n: number) =>
      [...crypto.getRandomValues(new Uint8Array(n))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const nextFrame = () => {
      tickN += 1;
      blockN += 7;
      return {
        tick: tickN,
        block: blockN,
        receiptHash: `0x${hex(2)}…${hex(2)}`,
      };
    };
    let queue = streamLines(copy, nativeSymbol, {
      tick: tickN,
      block: blockN,
      receiptHash: STREAM_FRAME.receiptHash,
    });
    let frameHash = STREAM_FRAME.receiptHash;
    let li = 0;
    let done: string[] = [];

    const pushLine = () => {
      if (cancelled) return;
      if (li >= queue.length) {
        const frame = nextFrame();
        frameHash = frame.receiptHash;
        queue = streamLines(copy, nativeSymbol, frame);
        li = 0;
        setLiveHash(frameHash);
      }
      const text = queue[li] ?? "";
      li += 1;
      let i = 0;
      const step = () => {
        if (cancelled) return;
        if (document.hidden) {
          timer = window.setTimeout(step, 500);
          return;
        }
        i += 1 + (Math.random() < 0.3 ? 1 : 0);
        const partial = text.slice(0, i);
        setLive({
          lines: [...done, partial].slice(-4),
          typing: i < text.length,
        });
        if (i < text.length) {
          timer = window.setTimeout(step, 24 + Math.random() * 30);
        } else {
          done = [...done, text].slice(-4);
          timer = window.setTimeout(pushLine, 1500);
        }
      };
      step();
    };
    timer = window.setTimeout(pushLine, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reduced, copy, nativeSymbol, templates]);

  return (
    <div className="forge-stream">
      <span className="visually-hidden">
        {interpolate(copy.landing.console.srOnly, { nativeSymbol })}
      </span>
      {live === null ? (
        <span className="forge-stream-static">
          {streamLines(copy, nativeSymbol, STREAM_FRAME).map((line, i) => (
            <StreamLine
              key={line}
              text={line}
              hash={STREAM_FRAME.receiptHash}
              fresh={i === templates.length - 1}
            />
          ))}
        </span>
      ) : (
        <span className="forge-stream-live" aria-hidden="true">
          {live.lines.map((line, i) => (
            <StreamLine
              key={i}
              text={line}
              hash={liveHash}
              fresh={i === live.lines.length - 1}
              typing={live.typing && i === live.lines.length - 1}
            />
          ))}
        </span>
      )}
    </div>
  );
}

/** Stats count-up: final values render in the markup; with motion allowed an
 *  IntersectionObserver triggers the rAF tween once at 50% visibility. */
function StatNumber({
  value,
  suffix,
  className,
}: {
  value: number;
  suffix: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  const [counting, setCounting] = useState(false);
  useEffect(() => {
    if (reduced || value === 0) return;
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setCounting(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, value]);
  useEffect(() => {
    if (!counting || reduced || value === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const dur = 1100;
    setDisplay(0);
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 4);
      setDisplay(Math.round(value * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [counting, reduced, value]);
  return (
    <span
      ref={ref}
      className={className}
      data-counting={counting && !reduced ? "" : undefined}
    >
      {display}
      {suffix !== "" && <span className="stat-suffix">{suffix}</span>}
    </span>
  );
}

/** Shared footer row (both designs style it through their scope class). */
function LandingFooter({ copy }: { copy: Copy }) {
  return (
    <footer className="landing-footer" id="footer">
      <div className="landing-footer-row">
        <small>{copy.landing.footer.credit}</small>
        <nav className="landing-footer-links">
          {copy.landing.footer.links.map((l) => (
            <a key={l.id} href={FOOTER_HREFS[l.id]}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

/** The hamburger trigger — the app iconButton recipe. */
function MenuTrigger({
  copy,
  expanded,
  onToggle,
}: {
  copy: Copy;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-button landing-menu-trigger"
      onClick={onToggle}
      aria-label={copy.a11y.explorePublicPaths}
      aria-expanded={expanded}
      aria-controls="landing-mobile-menu"
    >
      <Menu size={18} strokeWidth={1.5} />
    </button>
  );
}

interface LandingDesignProps {
  copy: Copy;
  onConnect: () => void;
  onGuide: () => void;
  go: (path: string) => void;
  toggleDesign: () => void;
}

/* ------------------------------------------------------------------ *
 *  Variant A — Dark Forge (default; dark theme side).
 * ------------------------------------------------------------------ */

/** The hero's right-column console card (beam-lit, square). Extracted so the
 * IslandGuard fallback and the BorderBeam child share one definition. */
function ForgeConsoleCard({
  copy,
  nativeSymbol,
}: {
  copy: Copy;
  nativeSymbol: string;
}) {
  return (
    <div className="forge-console-shell">
      <div className="forge-console">
        <div className="forge-console-bar">
          <span className="forge-agent-id">{copy.landing.console.agentId}</span>
          <span className="forge-sim-chip">
            <span className="forge-live-dot" aria-hidden="true" />
            {copy.landing.console.chip}
          </span>
        </div>
        <div className="forge-console-body">
          <div className="forge-orb-cell">
            <ConsoleOrb
              size={64}
              theme="dark"
              copy={copy}
              cycleMs={7000}
              fallbackClass="forge-orb-fallback"
            />
          </div>
          <ForgeStream copy={copy} nativeSymbol={nativeSymbol} />
        </div>
      </div>
    </div>
  );
}

function ForgePrincipleCard({ p }: { p: PrincipleItem }) {
  return (
    <article className="forge-principle">
      <span className="forge-p-icon" aria-hidden="true">
        <PrincipleIcon name={p.icon} />
      </span>
      <h3 dangerouslySetInnerHTML={{ __html: p.title }} />
      <p dangerouslySetInnerHTML={{ __html: p.body }} />
      {p.link !== "" && (
        <a href={PRINCIPLE_HREFS[p.icon]} className="forge-p-link">
          {p.link}
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </a>
      )}
    </article>
  );
}

function LandingForge({
  copy,
  onConnect,
  onGuide,
  go,
  toggleDesign,
}: LandingDesignProps) {
  const reduced = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const activeSection = useScrollSpy(SPY_IDS);
  const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;

  return (
    <div className="landing-page landing-forge">
      <ForgeField />
      <GrainOverlay />
      <ScrollProgress />
      <a className="skip-link" href="#hero">
        {copy.a11y.skipToContent}
      </a>

      <header className="forge-nav-shell">
        <div className="forge-nav-pill">
          <Logo glyph href="#hero" />
          <nav className="nav-inline" aria-label={copy.landing.nav.overview}>
            {navAnchors(copy).map((a) => (
              <a
                key={a.id}
                className={activeSection === a.id ? "is-active" : undefined}
                href={`#${a.id}`}
              >
                {a.label}
              </a>
            ))}
          </nav>
          <div className="nav-right">
            <DesignSwitch
              editorial={false}
              onToggle={toggleDesign}
              copy={copy}
            />
            <MetalCta>
              <button
                type="button"
                className="forge-btn forge-btn-primary forge-btn-nav"
                onClick={onConnect}
              >
                {copy.landing.nav.connect}
                <span className="forge-btn-icon" aria-hidden="true">
                  <ArrowRight size={13} strokeWidth={1.5} />
                </span>
              </button>
            </MetalCta>
            <MenuTrigger
              copy={copy}
              expanded={menuOpen}
              onToggle={() => setMenuOpen((v) => !v)}
            />
            {menuOpen && (
              <LandingMobileMenu
                copy={copy}
                onClose={() => setMenuOpen(false)}
                onGuide={onGuide}
                go={go}
              />
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="forge-hero" id="hero" tabIndex={-1}>
          <div className="forge-wrap forge-hero-inner">
            <div className="forge-hero-copy">
              <Reveal>
                <p
                  className="forge-eyebrow"
                  dangerouslySetInnerHTML={{
                    __html: interpolate(copy.landing.eyebrow, {
                      emphasis: "<b>",
                      endEmphasis: "</b>",
                    }),
                  }}
                />
              </Reveal>
              <Reveal delay={80}>
                <h1
                  className="forge-h1"
                  dangerouslySetInnerHTML={{
                    __html: emphasisHtml(copy.landing.title),
                  }}
                />
              </Reveal>
              <Reveal delay={160}>
                <p className="forge-lede">{copy.landing.description}</p>
              </Reveal>
              <Reveal delay={240}>
                <div className="forge-ctas">
                  <MetalCta>
                    <button
                      type="button"
                      className="forge-btn forge-btn-primary forge-btn-hero"
                      onClick={onConnect}
                    >
                      <Wallet size={16} strokeWidth={1.5} aria-hidden="true" />
                      {copy.nav.connectWallet}
                      <span className="forge-btn-icon" aria-hidden="true">
                        <ArrowRight size={14} strokeWidth={1.5} />
                      </span>
                    </button>
                  </MetalCta>
                  <button
                    type="button"
                    className="forge-btn forge-btn-ghost"
                    onClick={onGuide}
                  >
                    <CircleHelp
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    {copy.nav.howItWorks}
                  </button>
                </div>
              </Reveal>
            </div>
            {/* The live console card is the hero's right column (user call:
                the standalone #console section below was retired for it).
                Square, beam-lit — the page's prominent artifact. */}
            <Reveal className="forge-hero-console" delay={200}>
              <IslandGuard
                fallback={
                  <ForgeConsoleCard copy={copy} nativeSymbol={nativeSymbol} />
                }
              >
                <BorderBeam
                  size="md"
                  colorVariant="sunset"
                  staticColors
                  theme="dark"
                  strength={0.85}
                  duration={3.6}
                  borderRadius={24}
                  active={!reduced}
                  className="forge-console-beam"
                >
                  <ForgeConsoleCard copy={copy} nativeSymbol={nativeSymbol} />
                </BorderBeam>
              </IslandGuard>
            </Reveal>
          </div>
        </section>

        <section className="forge-section" id="principles">
          <div className="forge-wrap">
            <Reveal>
              <header className="forge-section-head">
                <h2
                  dangerouslySetInnerHTML={{
                    __html: emphasisHtml(copy.landing.principles.title),
                  }}
                />
              </header>
            </Reveal>
            <div className="forge-principles-grid">
              {copy.landing.principles.items.map((p, i) => (
                <Reveal
                  key={p.title}
                  className="forge-beam-host"
                  delay={i * 110}
                >
                  <IslandGuard fallback={<ForgePrincipleCard p={p} />}>
                    <BorderBeam
                      size="md"
                      colorVariant="sunset"
                      staticColors
                      theme="dark"
                      strength={0.85}
                      duration={3.6}
                      borderRadius={20}
                      active={!reduced}
                      className="forge-beam"
                    >
                      <ForgePrincipleCard p={p} />
                    </BorderBeam>
                  </IslandGuard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="forge-section" id="how">
          <div className="forge-wrap">
            <Reveal>
              <header className="forge-section-head">
                <h2
                  dangerouslySetInnerHTML={{
                    __html: emphasisHtml(copy.landing.how.title),
                  }}
                />
              </header>
            </Reveal>
            <div className="forge-how-rail">
              {copy.landing.how.steps.map((step, i) => (
                <Reveal
                  key={step.title}
                  className="forge-how-step"
                  delay={i * 120}
                >
                  <h3 dangerouslySetInnerHTML={{ __html: step.title }} />
                  <p dangerouslySetInnerHTML={{ __html: step.body }} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="forge-section forge-section-flush" id="stats">
          <div className="forge-wrap">
            <Reveal>
              <div className="forge-stats-band">
                {copy.landing.stats.map((s) => (
                  <div className="forge-stat" key={s.label}>
                    <StatNumber
                      value={s.value}
                      suffix={s.suffix}
                      className="forge-stat-num"
                    />
                    <span className="forge-stat-label">{s.label}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="forge-closing" id="start">
          <Reveal>
            <MetalRing>
              <button
                type="button"
                className="forge-btn forge-btn-primary forge-btn-closing"
                onClick={onConnect}
              >
                {copy.landing.closingCta}
                <span className="forge-btn-icon" aria-hidden="true">
                  <ArrowRight size={15} strokeWidth={1.5} />
                </span>
              </button>
            </MetalRing>
          </Reveal>
        </section>
      </main>

      <LandingFooter copy={copy} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Variant B — Light Editorial (light theme side).
 * ------------------------------------------------------------------ */

/** The hero console card. Log lines stream in on load (staggered,
 *  transform/opacity only — the "living ticket") and settle; reduced motion
 *  shows them instantly (CSS gate, no JS timer). */
function EditorialConsole({
  copy,
  style,
  className,
}: {
  copy: Copy;
  style?: CSSProperties;
  className?: string;
}) {
  const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;
  return (
    <aside
      className={`le-console${className ? ` ${className}` : ""}`}
      style={style}
      aria-label={copy.landing.console.previewA11y}
    >
      <div className="le-console-head">
        <span className="le-agent-id">{copy.landing.console.agentId}</span>
        <span className="le-orb-cell">
          <ConsoleOrb
            size={20}
            theme="light"
            copy={copy}
            cycleMs={4200}
            showLabel
            fallbackClass="le-orb-fallback"
          />
        </span>
      </div>
      <div className="le-console-body">
        {streamLines(copy, nativeSymbol, STREAM_FRAME).map((line, i) => (
          <div
            className={`le-log-line${i === 2 ? " is-receipt" : ""}`}
            key={line}
            style={{ "--d": `${0.9 + i * 0.25}s` } as CSSProperties}
          >
            <span className="le-log-prompt" aria-hidden="true">
              &gt;
            </span>
            <span className="le-log-text">{line}</span>
          </div>
        ))}
      </div>
      <div className="le-console-foot">
        <span>{copy.landing.console.chip}</span>
        <span className="le-ok">{copy.landing.console.indexing}</span>
      </div>
    </aside>
  );
}

/** Sliding tab rail for how-it-works (roving tabindex, arrow/Home/End keys,
 *  indicator re-measured on fonts-ready + resize). */
function HowTabs({
  steps,
  label,
}: {
  steps: readonly HowStep[];
  label: string;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  const moveIndicator = useCallback(() => {
    const btn = tabRefs.current[active];
    const ind = indicatorRef.current;
    if (!btn || !ind) return;
    ind.style.transform = `translateX(${btn.offsetLeft}px) scaleX(${btn.offsetWidth})`;
  }, [active]);

  useEffect(() => {
    moveIndicator();
  }, [moveIndicator]);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready?.then(() => {
      if (alive) moveIndicator();
    });
    window.addEventListener("resize", moveIndicator);
    return () => {
      alive = false;
      window.removeEventListener("resize", moveIndicator);
    };
  }, [moveIndicator]);

  const select = (i: number, focus: boolean) => {
    setActive(i);
    if (focus) tabRefs.current[i]?.focus();
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    let n: number | null = null;
    if (e.key === "ArrowRight") n = (i + 1) % steps.length;
    if (e.key === "ArrowLeft") n = (i - 1 + steps.length) % steps.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = steps.length - 1;
    if (n !== null) {
      e.preventDefault();
      select(n, true);
    }
  };

  return (
    <>
      <div className="le-tabs" role="tablist" aria-label={label}>
        <span
          className="le-tab-indicator"
          ref={indicatorRef}
          aria-hidden="true"
        />
        {steps.map((step, i) => (
          <button
            key={step.title}
            type="button"
            role="tab"
            id={`landing-tab-${i}`}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            aria-selected={active === i}
            aria-controls={`landing-panel-${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => select(i, false)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {step.title}
          </button>
        ))}
      </div>
      <div className="le-tab-panels">
        {steps.map((step, i) => (
          <div
            key={step.title}
            role="tabpanel"
            id={`landing-panel-${i}`}
            aria-labelledby={`landing-tab-${i}`}
            hidden={active !== i}
          >
            {active === i && (
              <div className={reduced ? undefined : "le-panel-in"}>
                <p dangerouslySetInnerHTML={{ __html: step.body }} />
                <span className="le-fact">{step.fact}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function LandingEditorial({
  copy,
  onConnect,
  onGuide,
  go,
  toggleDesign,
}: LandingDesignProps) {
  const reduced = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [gooDead, setGooDead] = useState(false);
  const compact = useMediaQuery("(max-width: 979px)");
  const gooActive = !reduced && compact && !gooDead;
  const activeSection = useScrollSpy(SPY_IDS);

  const walletItem = copy.landing.principles.items.find(
    (p) => p.icon === "wallet",
  );
  const receiptItem = copy.landing.principles.items.find(
    (p) => p.icon === "receipt",
  );
  const specAccountRows = [
    {
      label: copy.landing.spec.account.accessLabel,
      value: walletItem?.body ?? "",
    },
    {
      label: copy.landing.spec.account.receiptsLabel,
      value: receiptItem?.body ?? "",
    },
  ];

  const specBox = (
    <dl className="le-spec-inner">
      {copy.landing.spec.clusters.map((cluster) => (
        <div className="le-cluster" key={cluster.head}>
          <dt className="le-cluster-head">{cluster.head}</dt>
          {cluster.rows.map((row) => (
            <div className="le-srow" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {interpolate(row.value, {
                  chainName: APP_CHAIN.name,
                  chainId: APP_CHAIN_ID,
                })}
              </dd>
            </div>
          ))}
        </div>
      ))}
      <div className="le-cluster">
        <dt className="le-cluster-head">{copy.landing.spec.account.head}</dt>
        {specAccountRows.map((row) => (
          <div className="le-srow" key={row.label}>
            <dt>{row.label}</dt>
            <dd dangerouslySetInnerHTML={{ __html: row.value }} />
          </div>
        ))}
      </div>
    </dl>
  );

  return (
    <div className="landing-page landing-editorial">
      <GrainOverlay />
      <ScrollProgress />
      <a className="skip-link" href="#hero">
        {copy.a11y.skipToContent}
      </a>

      <header className="le-nav">
        <div className="le-wrap le-nav-inner">
          <a className="le-wordmark" href="#hero">
            <span className="le-wm">Axiom</span>
            <span className="le-wm-tag">Protocol</span>
          </a>
          <nav className="nav-inline" aria-label={copy.landing.nav.overview}>
            {navAnchors(copy).map((a) => (
              <a
                key={a.id}
                className={activeSection === a.id ? "is-active" : undefined}
                href={`#${a.id}`}
              >
                {a.label}
              </a>
            ))}
          </nav>
          <div className="nav-right">
            <DesignSwitch editorial onToggle={toggleDesign} copy={copy} />
            <button
              type="button"
              className="le-btn le-btn-primary le-btn-nav"
              onClick={onConnect}
            >
              {copy.landing.nav.connect}
            </button>
            {gooActive ? (
              <IslandGuard fallback={null} onFail={() => setGooDead(true)}>
                <GooMenu
                  open={menuOpen}
                  onToggle={() => setMenuOpen((v) => !v)}
                  onClose={() => setMenuOpen(false)}
                  copy={copy}
                  onGuide={onGuide}
                  go={go}
                />
              </IslandGuard>
            ) : (
              <>
                <MenuTrigger
                  copy={copy}
                  expanded={menuOpen}
                  onToggle={() => setMenuOpen((v) => !v)}
                />
                {menuOpen && (
                  <LandingMobileMenu
                    copy={copy}
                    onClose={() => setMenuOpen(false)}
                    onGuide={onGuide}
                    go={go}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="le-hero le-wrap" id="hero" tabIndex={-1}>
          <p
            className="le-eyebrow le-rise"
            style={{ "--i": 0 } as CSSProperties}
            dangerouslySetInnerHTML={{
              __html: interpolate(copy.landing.eyebrow, {
                emphasis: "<b>",
                endEmphasis: "</b>",
              }),
            }}
          />
          <h1
            className="le-h1 le-rise"
            style={{ "--i": 1 } as CSSProperties}
            dangerouslySetInnerHTML={{
              __html: emphasisHtml(copy.landing.title),
            }}
          />
          <div className="le-hero-grid">
            <div>
              <p
                className="le-lede le-rise"
                style={{ "--i": 3 } as CSSProperties}
              >
                {copy.landing.description}
              </p>
              <div
                className="le-cta-row le-rise"
                style={{ "--i": 4 } as CSSProperties}
              >
                <button
                  type="button"
                  className="le-btn le-btn-primary"
                  onClick={onConnect}
                >
                  {copy.nav.connectWallet}
                </button>
                <button
                  type="button"
                  className="le-btn le-btn-ghost"
                  onClick={onGuide}
                >
                  {copy.nav.howItWorks}
                </button>
              </div>
            </div>
            <EditorialConsole
              copy={copy}
              className="le-rise"
              style={{ "--i": 5 } as CSSProperties}
            />
          </div>
        </section>

        <section
          className="le-block le-wrap"
          id="principles"
          aria-labelledby="landing-le-principles-h"
        >
          <Reveal>
            <div className="le-section-head">
              <span className="le-sec-num" aria-hidden="true">
                01
              </span>
              <h2
                id="landing-le-principles-h"
                dangerouslySetInnerHTML={{
                  __html: emphasisHtml(copy.landing.principles.title),
                }}
              />
            </div>
          </Reveal>
          <Reveal>
            <div className="le-prows">
              {copy.landing.principles.items.map((p, i) => (
                <div className="le-prow" key={p.title}>
                  <span className="le-idx" aria-hidden="true">
                    {i + 1}.
                  </span>
                  <h3 dangerouslySetInnerHTML={{ __html: p.title }} />
                  <p>
                    <span dangerouslySetInnerHTML={{ __html: p.body }} />
                    {p.link !== "" && (
                      <a className="le-plink" href={PRINCIPLE_HREFS[p.icon]}>
                        {p.link}
                      </a>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section
          className="le-block le-wrap"
          id="how"
          aria-labelledby="landing-le-how-h"
        >
          <Reveal>
            <div className="le-section-head">
              <span className="le-sec-num" aria-hidden="true">
                02
              </span>
              <h2
                id="landing-le-how-h"
                dangerouslySetInnerHTML={{
                  __html: emphasisHtml(copy.landing.how.title),
                }}
              />
            </div>
          </Reveal>
          <Reveal>
            <HowTabs
              steps={copy.landing.how.steps}
              label={copy.nav.howItWorks}
            />
          </Reveal>
        </section>

        <section
          className="le-block le-wrap"
          id="stats"
          aria-labelledby="landing-le-spec-h"
        >
          <Reveal>
            <div className="le-section-head">
              <span className="le-sec-num" aria-hidden="true">
                03
              </span>
              <h2
                id="landing-le-spec-h"
                dangerouslySetInnerHTML={{
                  __html: emphasisHtml(copy.landing.spec.title),
                }}
              />
            </div>
          </Reveal>
          <div className="le-stats">
            {copy.landing.stats.map((s) => (
              <div className="le-stat" key={s.label}>
                <StatNumber
                  value={s.value}
                  suffix={s.suffix}
                  className="le-stat-num"
                />
                <span className="le-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
          <Reveal>
            <IslandGuard fallback={specBox}>
              <BorderBeam
                size="md"
                colorVariant="sunset"
                theme="light"
                duration={7}
                borderRadius={12}
                active={!reduced}
                className="le-beam"
              >
                {specBox}
              </BorderBeam>
            </IslandGuard>
          </Reveal>
        </section>

        <section
          className="le-closing le-wrap"
          id="start"
          aria-labelledby="landing-le-start-h"
        >
          <Reveal>
            <h2
              id="landing-le-start-h"
              dangerouslySetInnerHTML={{
                __html: emphasisHtml(copy.landing.closingTitle),
              }}
            />
          </Reveal>
          <Reveal delay={120}>
            <button
              type="button"
              className="le-btn le-btn-primary le-btn-closing"
              onClick={onConnect}
            >
              {copy.nav.connectWallet}
            </button>
          </Reveal>
        </section>
      </main>

      <LandingFooter copy={copy} />
    </div>
  );
}

export function Landing({
  onConnect,
  onGuide,
  go,
  locale,
}: {
  onConnect: () => void;
  onGuide: () => void;
  go: (path: string) => void;
  locale: Locale;
}) {
  const copy = getCopy(locale);
  const { state, dispatch } = useUiStore();
  const editorial = state.settings.theme === "light";

  const toggleDesign = useCallback(() => {
    dispatch({
      type: "settings",
      patch: { ...state.settings, theme: editorial ? "dark" : "light" },
    });
  }, [dispatch, state.settings, editorial]);

  // One-frame transition freeze around the design flip — the same recipe
  // AppShell applies in the console (.theme-switching is a global rule).
  const themeRef = useRef(state.settings.theme);
  useEffect(() => {
    if (themeRef.current === state.settings.theme) return;
    themeRef.current = state.settings.theme;
    const root = document.documentElement;
    root.classList.add("theme-switching");
    void root.offsetWidth;
    const raf = requestAnimationFrame(() =>
      root.classList.remove("theme-switching"),
    );
    return () => cancelAnimationFrame(raf);
  }, [state.settings.theme]);

  const shared: LandingDesignProps = {
    copy,
    onConnect,
    onGuide,
    go,
    toggleDesign,
  };
  return editorial ? (
    <LandingEditorial {...shared} />
  ) : (
    <LandingForge {...shared} />
  );
}
