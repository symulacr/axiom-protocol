import { useEffect, useRef } from "react";

/**
 * useScrollReveal — IntersectionObserver-driven reveal.
 * Adds `data-revealed="true"` to elements with `[data-reveal]` or `[data-stagger]`
 * when they scroll into view. Works with the CSS in index.css.
 *
 * Usage:
 *   const ref = useScrollReveal<HTMLDivElement>();
 *   <div ref={ref} data-reveal>...</div>
 *
 * Or attach to a container and reveal all `[data-reveal]` descendants:
 *   const ref = useScrollReveal<HTMLElement>({ scope: true });
 *   <section ref={ref}>
 *     <div data-reveal>...</div>
 *     <div data-reveal>...</div>
 *   </section>
 */
export function useScrollReveal<T extends HTMLElement = HTMLElement>(
  options?: { scope?: boolean; threshold?: number; rootMargin?: string },
): React.RefObject<T> {
  const ref = useRef<T>(null) as React.RefObject<T>;
  const { scope = false, threshold = 0.15, rootMargin = "0px 0px -10% 0px" } =
    options ?? {};

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets: HTMLElement[] = scope
      ? Array.from(root.querySelectorAll<HTMLElement>("[data-reveal], [data-stagger], [data-svg-reveal], [data-svg-draw]"))
      : [root];

    if (targets.length === 0) return;

    // If IntersectionObserver is unavailable, reveal everything immediately.
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((t) => t.setAttribute("data-revealed", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "true");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin },
    );

    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [scope, threshold, rootMargin]);

  return ref;
}
