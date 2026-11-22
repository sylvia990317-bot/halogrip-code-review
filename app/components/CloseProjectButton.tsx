"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fixed top-right "close" pill, shared by every case-study route so all three read as the
 * same control (HALOGRIP's is the reference). Only the class prefix and the list of dark
 * surfaces differ per page — the markup, the roll-up hover and the dark/light flip are the
 * same everywhere. Each route styles `<prefix>` / `<prefix>.is-on-dark` /
 * `<prefix>-track` in its own CSS file, so CSS isolation is untouched.
 *
 * Tracks whether a dark section is currently sitting behind the button's own fixed screen
 * position and flips between a dark pill/white text and a light pill/dark text accordingly —
 * two clean opaque states, never a translucent/see-through one.
 *
 * Implemented as an IntersectionObserver per dark element, each gated to a 1px-tall rootMargin
 * band at the button's own vertical center — cheaper than a scroll listener re-measuring on
 * every frame, and IntersectionObserver already recomputes on scroll for free.
 */
export default function CloseProjectButton({
  className = "close-project",
  darkSelector,
  label = "CLOSE PROJECT",
  href = "/",
}: {
  /** Base class for the pill; the track span uses `${className}-track`. */
  className?: string;
  /** Selector list for this page's dark surfaces, scoped to the page's own <main>. */
  darkSelector: string;
  label?: string;
  href?: string;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [onDark, setOnDark] = useState(false);

  useEffect(() => {
    const intersecting = new Set<Element>();
    let observer: IntersectionObserver | undefined;
    const link = linkRef.current;
    const root = link?.closest("main") ?? null;
    if (!link || !root) return;

    function setup() {
      if (!link || !root) return;
      const rect = link.getBoundingClientRect();
      const y = Math.round(rect.top + rect.height / 2);
      const rootMargin = `-${y}px 0px -${Math.max(0, window.innerHeight - y - 1)}px 0px`;

      observer?.disconnect();
      intersecting.clear();
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) intersecting.add(entry.target);
            else intersecting.delete(entry.target);
          });
          setOnDark(intersecting.size > 0);
        },
        { rootMargin, threshold: 0 }
      );
      root.querySelectorAll<HTMLElement>(darkSelector).forEach((el) => observer!.observe(el));
    }

    setup();
    let frame = 0;
    const mutations = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(setup); });
    mutations.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", setup);
    return () => {
      observer?.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", setup);
    };
  }, [darkSelector]);

  return (
    <a
      ref={linkRef}
      className={`${className}${onDark ? " is-on-dark" : ""}`}
      href={href}
      aria-label={label}
    >
      <span className={`${className}-track`} aria-hidden="true">
        <span>{label}</span>
        <span aria-hidden="true">{label}</span>
      </span>
      {/* Mobile-only compact state (2026-09-24): each route's CSS shows this and hides
          `${className}-track` under its own narrow-viewport media query, shrinking the pill
          to a small icon so it covers less of whatever text scrolls under it. `aria-label` on
          the link above carries the accessible name in both states, so this can stay
          aria-hidden regardless of which state is visually showing. */}
      <span className={`${className}-icon`} aria-hidden="true">
        ✕
      </span>
    </a>
  );
}
