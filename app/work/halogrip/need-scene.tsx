"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePinCoordinator } from "./pin-provider";

/**
 * 02.2 / REAL-WORLD NEED. The route line draws itself in every time the section scrolls into
 * view, and every other element on the poster (the three annotations, the frame around the
 * stalled vehicle, the "74" stat, RESPONSE ORIGIN) fades in synced to how far the line has
 * drawn toward that element's own position — not a fixed stagger. Unlike ./section-reveal.tsx's
 * one-shot fade, this replays on every entry (scrolling down in, or back up into it) rather
 * than only the first time: the section is a static "poster" (percentage/vw-positioned so it
 * scales as one image at any width — see halogrip.css's .need-scene history) and should still
 * read as one, just one that draws itself in each time it's seen.
 *
 * The draw-in is a mask rather than the visible paths' own stroke-dashoffset, so their styling
 * (line + blurred glow + end cap) stays independent of it: an invisible solid copy of the path
 * (#need-route-reveal-path) drives a <mask> that reveals the two real paths underneath as
 * its own dashoffset counts down from the path's full length to 0.
 *
 * Unlike ./section-reveal.tsx, this one replays every time the section re-enters the
 * viewport (scrolling down into it or back up into it), not just the first time — restarting
 * the same timeline from 0 on each entry.
 *
 * The drawn route ends at the frame's left edge (the car blocks it); the remainder to the fire
 * is a separate faint ghost path that fades in after the line has stopped.
 */

/*
 * Redrawn 2026-10-05 against the photo itself (sampled on a 1672x941 grid over
 * `emergency-route-background.png`, which has exactly the poster's aspect). The old line kinked three times
 * over a straight street with nothing in the photo to explain it, and ran *through* the frame.
 * Now it tells the scene's story: the response leaves the fire-station forecourt (truck nose at
 * ~240,560), runs along the street's centre line (y 530) and stops dead at the stalled robotaxi
 * (frame 735-935 x 450-585). Beyond the car, the rest of the way to the fire (~1490,500) is
 * only a faint dashed "ghost" route: the part the response cannot reach.
 */
const ROUTE_D = "M238,562 C290,566 310,532 360,530 L735,530";
const GHOST_D = "M935,530 L1270,530 C1330,530 1380,516 1478,497";
/** Leader anchor points, in route order: station exit, the blocking car, the fire. */
const POINT_EXIT = [300, 550] as const;
const POINT_CAR = [835, 450] as const;
const POINT_FIRE = [1478, 497] as const;
/** All three labels hang from one baseline; each leader drops vertically from it. */
const LEADER_TOP = 364;

export default function NeedScene() {
  const { onPinsReady } = usePinCoordinator();
  const sectionRef = useRef<HTMLElement>(null);
  const revealPathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const revealPath = revealPathRef.current;
    if (!section || !revealPath) return;

    const annotations = Array.from(section.querySelectorAll<HTMLElement>(".need-annotation"));
    const leaders = Array.from(section.querySelectorAll<SVGElement>(".need-leader, .need-leader-dot"));
    const frameParts = Array.from(
      section.querySelectorAll<SVGElement>(".need-frame-fill, .need-frame-outline, .need-frame-corner")
    );
    const ghost = section.querySelector<SVGElement>(".need-route-ghost");
    const statParts = Array.from(section.querySelectorAll<HTMLElement>(".need-stat-number, .need-stat-caption"));
    const origin = section.querySelector<HTMLElement>(".need-origin");
    const sourceParts = Array.from(section.querySelectorAll<HTMLElement>(".need-source-mark, .need-source"));

    const length = revealPath.getTotalLength();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(revealPath, { strokeDasharray: length, strokeDashoffset: 0 });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    // Samples the path to find what fraction of its total length the draw-in has reached
    // by the time it passes closest to (targetX, targetY) — so timing always matches the
    // actual path geometry instead of duplicating hand-picked percentages here.
    const SAMPLES = 400;
    function fractionAt(targetX: number, targetY: number) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i <= SAMPLES; i++) {
        const len = (i / SAMPLES) * length;
        const pt = revealPath!.getPointAtLength(len);
        const dist = (pt.x - targetX) ** 2 + (pt.y - targetY) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = len;
        }
      }
      return best / length;
    }

    // The drawn route ends at the car, so the frame (and with it 02 and the stat) lands as the
    // line arrives; the ghost route and 03 follow once it has visibly stopped there.
    const fExit = fractionAt(POINT_EXIT[0], POINT_EXIT[1]);

    let context: gsap.Context | undefined;
    const unsubscribe = onPinsReady(["scroll-intro"], () => {
      context = gsap.context(() => {
        gsap.set(revealPath, { strokeDasharray: length, strokeDashoffset: length });
        gsap.set([...annotations, ...statParts, ...(origin ? [origin] : []), ...sourceParts], {
          opacity: 0,
          y: 6,
        });
        gsap.set([...leaders, ...frameParts, ...(ghost ? [ghost] : [])], { opacity: 0 });

        const DURATION = 1.2;
        const tl = gsap.timeline({ paused: true });
        tl.to(revealPath, { strokeDashoffset: 0, duration: DURATION, ease: "power1.inOut" }, 0);
        if (origin) tl.to(origin, { opacity: 1, y: 0, duration: 0.35 }, 0.1);

        if (annotations[0]) {
          tl.to([annotations[0], leaders[0], leaders[1]], { opacity: 1, y: 0, duration: 0.3 }, fExit * DURATION);
        }
        tl.to(frameParts, { opacity: 1, duration: 0.3 }, DURATION - 0.05);
        if (annotations[1]) {
          tl.to([annotations[1], leaders[2], leaders[3]], { opacity: 1, y: 0, duration: 0.3 }, DURATION);
        }
        tl.to(statParts, { opacity: 1, y: 0, duration: 0.35 }, DURATION + 0.15);
        if (ghost) tl.to(ghost, { opacity: 1, duration: 0.6 }, DURATION + 0.35);
        if (annotations[2]) {
          tl.to([annotations[2], leaders[4], leaders[5]], { opacity: 1, y: 0, duration: 0.3 }, DURATION + 0.7);
        }
        tl.to(sourceParts, { opacity: 1, y: 0, duration: 0.35 }, DURATION + 0.8);

        ScrollTrigger.create({
          trigger: section,
          start: "top 70%",
          onEnter: () => tl.restart(),
          onEnterBack: () => tl.restart(),
        });
        if (section.getBoundingClientRect().top < window.innerHeight * 0.7) tl.progress(1);
      }, section);
    });

    return () => {
      unsubscribe();
      context?.revert();
    };
  }, [onPinsReady]);

  return (
    <section ref={sectionRef} className="need-scene dark-section" aria-labelledby="challenge-need-title">
      <div
        className="need-bg"
        style={{ backgroundImage: "url(/media/halogrip/2.2/emergency-route-background.png)" }}
      />
      <div className="need-scrim" />
      <div className="need-fade-top" />

      <span className="eyebrow need-marker">[ 02.2 / REAL-WORLD NEED ]</span>

      <h2 id="challenge-need-title" className="need-heading">THE NEED TO MOVE<br />THE VEHICLE REMAINS.</h2>

      {/* Strokes use vector-effect: non-scaling-stroke (halogrip.css), so line weights are in
          screen pixels at any poster size; on a phone the poster is ~23% scale and scaled
          strokes had thinned to hairlines. Dots are zero-length round-capped strokes for the
          same reason: their size stays in screen pixels, which a circle's r would not. */}
      <svg className="need-graphic" viewBox="0 0 1672 941" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <mask id="need-route-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941">
            <path
              ref={revealPathRef}
              d={ROUTE_D}
              fill="none"
              stroke="#fff"
              strokeWidth={60}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </mask>
        </defs>

        <path className="need-route-ghost" d={GHOST_D} />
        <g mask="url(#need-route-reveal)">
          <path className="need-route-glow" d={ROUTE_D} />
          <path className="need-route" d={ROUTE_D} />
          <path className="need-route-stop" d="M735,530 l0,0.01" />
        </g>

        {[POINT_EXIT, POINT_CAR, POINT_FIRE].map(([x, y]) => (
          <g key={x}>
            <line className="need-leader" x1={x} y1={LEADER_TOP} x2={x} y2={y} />
            <path className="need-leader-dot" d={`M${x},${y} l0,0.01`} />
          </g>
        ))}

        {/* Phone only: on phones the annotations are listed under the poster, so each leader's
            free end carries its number to tie the route position to the list. */}
        {[POINT_EXIT, POINT_CAR, POINT_FIRE].map(([x], i) => (
          <text key={x} className="need-index-mark" x={x} y={LEADER_TOP - 18} textAnchor="middle">{`0${i + 1}`}</text>
        ))}

        <rect className="need-frame-fill" x="735" y="450" width="200" height="135" />
        <rect className="need-frame-outline" x="735" y="450" width="200" height="135" />
        <path className="need-frame-corner" d="M729,466 L729,444 L751,444" />
        <path className="need-frame-corner" d="M919,444 L941,444 L941,466" />
        <path className="need-frame-corner" d="M729,569 L729,591 L751,591" />
        <path className="need-frame-corner" d="M919,591 L941,591 L941,569" />
      </svg>

      {/* In route order, each hung from the shared leader baseline (bottom-anchored, so a
          label's height never runs into its leader): 01 at the station exit, 02 at the car,
          03 at the fire. Order matters on phones too, where these become three columns. */}
      <div className="need-annotation" style={{ left: `${(POINT_EXIT[0] / 1672) * 100}%`, bottom: `${((941 - LEADER_TOP) / 941) * 100}%` }}>
        <span className="need-annotation-index">01</span>
        <span className="need-annotation-label">BLOCKED FIRE STATION EXITS</span>
      </div>
      <div className="need-annotation need-annotation-mid" style={{ left: `${(POINT_CAR[0] / 1672) * 100}%`, bottom: `${((941 - LEADER_TOP) / 941) * 100}%` }}>
        <span className="need-annotation-index">02</span>
        <span className="need-annotation-label">BLOCKED ROADS</span>
      </div>
      <div className="need-annotation need-annotation-end" style={{ right: `${((1672 - POINT_FIRE[0]) / 1672) * 100}%`, bottom: `${((941 - LEADER_TOP) / 941) * 100}%` }}>
        <span className="need-annotation-index">03</span>
        <span className="need-annotation-label">DISRUPTED FIREFIGHTING</span>
      </div>

      {/* Below the frame rather than inside it: the frame now holds only the car. */}
      <span className="need-stat-number" style={{ left: "43.96%", top: "64.5%" }}>74</span>
      <p className="need-stat-caption" style={{ left: "43.96%", top: "78.6%" }}>
        AV-related disruptions to<br />emergency response in<br />San Francisco, Nov 2022–Aug 2023.
      </p>

      <div className="need-origin" style={{ left: "2.39%", top: "71.8%" }}>
        <span>RESPONSE ORIGIN</span>
        <strong>FIRE STATION</strong>
      </div>

      <span className="need-source-mark" style={{ left: "2.39%", top: "93.6%" }} />
      <p className="need-source" style={{ left: "2.39%", top: "95.0%" }}>
        SOURCE: SAN FRANCISCO FIRE DEPARTMENT, 2023.
      </p>
    </section>
  );
}
