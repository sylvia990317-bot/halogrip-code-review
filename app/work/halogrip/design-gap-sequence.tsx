"use client";

/** Current response → design gap: three photographic plates on one pinned timeline.
 * A single applyFrame writes transforms, opacity and SVG attributes without React
 * state updates per scroll frame. The base plate remains opaque while incoming
 * layers fade over it; a slight scale change accompanies the cabin entry.
 * Progress: far-car hold 0–0.18, transition to close-car 0.18–0.48,
 * close-car hold 0.48–0.58, cabin entry 0.58–0.72, final content 0.72–1.
 * The page pin coordinator starts measurement after the opening is ready.
 * Media changes restore the pinned DOM before switching to static content. */

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePinCoordinator } from "./pin-provider";

const FAR = "/media/halogrip/2.4/robotaxi-far.png";
const CLOSE = "/media/halogrip/2.4/robotaxi-close.png";
const IN_CAR = "/media/halogrip/2.4/robotaxi-interior.png";

const NODE_ICON = {
  responder: "/media/halogrip/2.4/first-responder-icon.png",
  control: "/media/halogrip/2.4/local-control.png",
  reposition: "/media/halogrip/2.4/safe-move.png",
} as const;

type Panel = { id: string; index: string; title: string; sub: string; x: number; y: number; rotateY: number; icon: () => ReactNode };

function IconWarn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4 L21 19 L3 19 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 10.5V14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconSupport() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 13a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="3" y="13" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="17" y="13" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconCar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 16.5 6 11h9l3 3.2v2.3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M4 16.5h1.5M18 16.5H20" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="16.7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="16.5" cy="16.7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** A solid filled triangle, not an outlined chevron — per Sylvia's brief this arrowhead must
 *  read as an obvious, unmissable "this way" cue at a glance, not a subtle stroke. */
function IconFlowHead() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 4 L21 12 L3 20 Z" />
    </svg>
  );
}

/** Three workflow panels only (not process-scene.tsx's old six) — a glance, not a diagram.
 *  `x`/`y` are the panel's own centre in 0-100 viewport %; `rotateY` is a static per-panel
 *  skew so the row reads as following the road's own perspective, not sitting flat-on. */
const PANELS: Panel[] = [
  { id: "incident", index: "01", title: "INCIDENT", sub: "EVENT DETECTED", x: 25, y: 68, rotateY: -3, icon: IconWarn },
  { id: "support", index: "02", title: "EXTERNAL SUPPORT", sub: "CALL · VERIFY · AUTHORIZE", x: 40.5, y: 60, rotateY: -6, icon: IconSupport },
  { id: "move", index: "03", title: "MOVE OR TOW", sub: "HELP REACHES THE VEHICLE", x: 56, y: 53, rotateY: -9, icon: IconCar },
];
const PANEL_W = 12.5;
const PANEL_H = 21;

/** A fixed, small pool (not a canvas particle system) of red dust motes that appear only
 *  as the state-1 cards dissolve — deterministic hash, not Math.random, for SSR/client
 *  parity. Positions cluster loosely around the panel row. */
const DUST_COUNT = 12;
function hash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
const DUST = Array.from({ length: DUST_COUNT }, (_, i) => ({
  left: 20 + hash(i) * 38,
  top: 48 + hash(i + 50) * 30,
  size: 1.5 + hash(i + 100) * 2.5,
  delay: hash(i + 150) * 0.15,
}));

/** Dashboard nodes, state 3. Start compressed near centre, spread out as the cabin settles. */
const NODES = [
  { id: "responder", label: "FIRST RESPONDER", startX: 47, endX: 25, accent: false },
  { id: "control", label: "LOCAL CONTROL", startX: 50, endX: 50, accent: true },
  { id: "reposition", label: "SAFE REPOSITIONING", startX: 53, endX: 75, accent: false },
] as const;
const NODE_Y = 82;
/** Percentage-of-section-width gap left clear on each side of a connector so its arrowhead
 *  lands in the open space between two icons instead of being drawn underneath the next one
 *  (icon-centre to icon-centre was the original span — at a 44-52px icon width that swallowed
 *  the whole arrowhead, which is why the connectors used to read as a plain unbroken line).
 *  Kept tight on purpose — per feedback that a wider gap read as three isolated icons with
 *  decorative lines floating nearby rather than one connected flow. */
const CONNECTOR_GAP_PCT = 2.4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Ramps 0->1 over [from,from+span] and holds at 1 — for anything that must persist into
 *  the final composition once revealed (not a transient pulse). */
function rampHold(t: number, from: number, span: number) {
  return clamp01((t - from) / span);
}

function canEnhance() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.innerWidth < 760) return false;
  return true;
}

/**
 * Phone (and reduced-motion) version: no pin, the page scrolls normally. It carries the same
 * information as the pinned sequence (the three workflow panels and the three dashboard
 * nodes used to be missing here, leaving only a headline over a dark plate). With motion
 * allowed, the far plate crossfades to the close one as it scrolls past (the vehicle
 * approaching), and copy, panels, nodes and connectors reveal in order as they arrive
 * (Sylvia, 2026-10-05: "scroll in sequence", not a pinned scrub). Everything is visible by
 * default; `dgs-fb-animate` is only added from JS when motion is allowed, so no-JS and
 * reduced motion get the complete static composition.
 */
function DesignGapSequenceFallback() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("dgs-fb-animate");

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -12% 0px" });
    root.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.fromTo(closeRef.current, { opacity: 0 }, {
        opacity: 1, ease: "none",
        scrollTrigger: { trigger: mediaRef.current, start: "top 55%", end: "bottom 35%", scrub: true },
      });
    }, root);

    return () => {
      observer.disconnect();
      context.revert();
      root.classList.remove("dgs-fb-animate");
    };
  }, []);

  return (
    <div className="dgs-fallback" ref={rootRef}>
      <section className="dgs-fb-panel" aria-labelledby="response-title">
        <div className="dgs-fb-media" ref={mediaRef}>
          <img className="dgs-fb-bg" src={FAR} alt="A first responder views a stalled robotaxi from a distance on a wet city street at night." loading="lazy" />
          <img className="dgs-fb-bg dgs-fb-bg-close" ref={closeRef} src={CLOSE} alt="" aria-hidden="true" loading="lazy" />
          <div className="dgs-fb-scrim" />
          <div className="dgs-fb-copy" data-reveal>
            <span className="eyebrow dgs-fb-label">[ 02.3 / CURRENT RESPONSE ]</span>
            <h2 id="response-title" className="dgs-fb-headline">
              HELP EXISTS.
              <br />
              BUT IT IS NOT IMMEDIATE.
            </h2>
            <p className="dgs-fb-para">Moving a stalled robotaxi still depends on external support, authorization and time on site.</p>
          </div>
        </div>
        <ol className="dgs-fb-steps">
          {PANELS.map((panel, i) => (
            <li key={panel.id} className="dgs-fb-step" data-reveal style={{ "--i": i } as CSSProperties}>
              <div className="dgs-panel-head">
                <span className="dgs-panel-index">{panel.index}</span>
                <span className="dgs-panel-icon"><panel.icon /></span>
              </div>
              <h3>{panel.title}</h3>
              <p>{panel.sub}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="dgs-fb-panel" aria-labelledby="design-gap-title">
        <div className="dgs-fb-media dgs-fb-media-cabin">
          <img className="dgs-fb-bg" src={IN_CAR} alt="View from inside the robotaxi cabin, looking out at the city through the rear window." loading="lazy" />
          <div className="dgs-fb-scrim" />
          <div className="dgs-fb-copy dgs-fb-copy-center" data-reveal>
            <span className="eyebrow dgs-fb-label">[ 02.4 / DESIGN GAP ]</span>
            <h2 id="design-gap-title" className="dgs-fb-headline">
              WHAT IF LIMITED CONTROL
              <br />
              WAS ALREADY ON BOARD?
            </h2>
            <p className="dgs-fb-sub">FROM EXTERNAL DEPENDENCY TO DIRECT, ON-BOARD CONTROL.</p>
          </div>
          <div className="dgs-fb-flow" data-reveal>
            {NODES.map((node, i) => (
              <Fragment key={node.id}>
                {i > 0 && (
                  <span className="dgs-fb-flow-arrow" style={{ "--i": i * 2 - 1 } as CSSProperties} aria-hidden="true">
                    <span className="dgs-flow-shaft" />
                    <span className="dgs-flow-head"><IconFlowHead /></span>
                  </span>
                )}
                <div className={`dgs-fb-node${node.accent ? " dgs-node-accent" : ""}`} style={{ "--i": i * 2 } as CSSProperties}>
                  <div className="dgs-node-icon-slot">
                    <img className="dgs-node-icon" src={NODE_ICON[node.id]} alt="" aria-hidden="true" loading="lazy" />
                  </div>
                  <span className="dgs-node-label">{node.label}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function DesignGapSequence() {
  const { markPinReady, onPinsReady, resetPin } = usePinCoordinator();
  const [enhanced, setEnhanced] = useState<boolean | null>(null);
  const disposeSequence = useRef<() => void>(() => {});

  const sectionRef = useRef<HTMLElement>(null);
  const farRef = useRef<HTMLImageElement>(null);
  const closeRef = useRef<HTMLImageElement>(null);
  const inCarRef = useRef<HTMLImageElement>(null);
  const bgStackRef = useRef<HTMLDivElement>(null);

  const s1CopyRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const connectorRef = useRef<SVGGElement>(null);
  const dustRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const s3CopyRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const arrowARef = useRef<HTMLDivElement>(null);
  const arrowBRef = useRef<HTMLDivElement>(null);

  // Keep the static and pinned versions in sync with viewport and motion preferences.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 760px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      resetPin("design-gap-sequence");
      const result = canEnhance();
      // GSAP wraps the section in a pin spacer. Restore its parent before React
      // replaces the animated subtree with the static version on a media change.
      if (!result) disposeSequence.current();
      setEnhanced(result);
      if (!result) markPinReady("design-gap-sequence");
    };
    update();
    desktop.addEventListener("change", update);
    motion.addEventListener("change", update);
    return () => { desktop.removeEventListener("change", update); motion.removeEventListener("change", update); };
  }, [markPinReady, resetPin]);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!enhanced || !section) return;

    // Preload + decode all three plates up front so the crossfades never stall on a
    // mid-scroll image decode.
    [farRef.current, closeRef.current, inCarRef.current].forEach((img) => {
      if (img && "decode" in img) img.decode().catch(() => {});
    });

    gsap.registerPlugin(ScrollTrigger);
    const ease = gsap.parseEase("power1.inOut");

    // Each connector spans the full distance between one icon's own centre and the next
    // icon's centre — `left`/`width` are both plain horizontal percentages (no diagonal, both
    // endpoints share NODE_Y), so this never touches `.dgs-graphic`'s non-uniformly-stretched
    // viewBox (preserveAspectRatio="none") and the arrowhead cap at the end stays undistorted.
    let stageWidth = section.clientWidth;
    function setConnector(el: HTMLDivElement | null, x1: number, x2: number, opacity: number) {
      if (!el) return;
      const length = Math.max(0, (x2 - x1) * stageWidth / 100);
      el.style.left = "0";
      el.style.width = "100%";
      el.style.transform = `translateX(${x1 * stageWidth / 100}px)`;
      const shaft = el.firstElementChild as HTMLElement;
      const head = el.lastElementChild as HTMLElement;
      shaft.style.transform = `scaleX(${Math.max(0, length - 20) / Math.max(stageWidth, 1)})`;
      head.style.transform = `translateX(${Math.max(0, length - 20)}px)`;
      el.style.top = `${NODE_Y}%`;
      el.style.opacity = String(length >= 20 ? opacity : 0);
    }

    function applyFrame(t: number) {
      // Keep a fully opaque base plate beneath the two incoming layers.
      const fadeT = ease(clamp01((t - 0.18) / 0.3)); // 0.18 -> 0.48: far -> close, cards recede
      const transT = ease(clamp01((t - 0.58) / 0.14)); // 0.58 -> 0.72: close -> in, cabin entry

      const farOpacity = 1;
      const closeOpacity = fadeT;
      const inOpacity = transT;
      if (farRef.current) farRef.current.style.opacity = String(farOpacity);
      if (closeRef.current) closeRef.current.style.opacity = String(closeOpacity);
      if (inCarRef.current) inCarRef.current.style.opacity = String(inOpacity);

      // Animate only the compositor-friendly scale; avoid full-screen blur work.
      const scale = lerp(1, 1.015, transT);
      if (bgStackRef.current) {
        bgStackRef.current.style.transform = `scale(${scale})`;
      }

      // State 1 copy + panels fade and recede together over the same 0.18-0.48 window —
      // panels never translate/scale independently of their shared opacity.
      const s1Opacity = 1 - fadeT;
      if (s1CopyRef.current) {
        s1CopyRef.current.style.opacity = String(s1Opacity);
        s1CopyRef.current.style.transform = `translateY(${lerp(0, -10, fadeT)}px)`;
      }
      if (connectorRef.current) connectorRef.current.style.opacity = String(s1Opacity);
      const panelScale = lerp(1, 0.93, fadeT);
      const panelShift = lerp(0, -2.5, fadeT);
      panelRefs.current.forEach((el, i) => {
        if (!el) return;
        el.style.opacity = String(s1Opacity);
        el.style.transform = `translate(-50%,-50%) translateY(${panelShift}%) scale(${panelScale}) rotateY(${PANELS[i].rotateY}deg)`;
      });

      // A small, restrained dust layer — opacity-only, no motion of its own — that appears
      // only around the midpoint of the card dissolve and is fully gone before and after it.
      const dustEnvelope = Math.sin(clamp01(fadeT) * Math.PI);
      dustRefs.current.forEach((el, i) => {
        if (el) el.style.opacity = String(Math.max(0, dustEnvelope - DUST[i].delay) * 0.6);
      });

      // State 3: headline only once the interior is mostly visible, nodes only after that,
      // spreading from a compressed cluster near centre out across the dashboard.
      const s3Opacity = ease(rampHold(t, 0.74, 0.08));
      if (s3CopyRef.current) {
        s3CopyRef.current.style.opacity = String(s3Opacity);
        s3CopyRef.current.style.transform = `translateY(${lerp(10, 0, s3Opacity)}px)`;
      }

      const nodesOpacity = rampHold(t, 0.8, 0.06);
      const spreadT = ease(clamp01((t - 0.82) / 0.13));
      const positions = NODES.map((n) => lerp(n.startX, n.endX, spreadT));
      positions.forEach((x, i) => {
        const el = nodeRefs.current[i];
        if (el) {
          el.style.left = "0";
          el.style.transform = `translateX(${x * stageWidth / 100}px) translate(-50%,-50%)`;
          el.style.opacity = String(nodesOpacity);
        }
      });
      setConnector(arrowARef.current, positions[0] + CONNECTOR_GAP_PCT, positions[1] - CONNECTOR_GAP_PCT, nodesOpacity);
      setConnector(arrowBRef.current, positions[1] + CONNECTOR_GAP_PCT, positions[2] - CONNECTOR_GAP_PCT, nodesOpacity);
    }

    let context: gsap.Context | undefined;
    const unsubscribe = onPinsReady(["scroll-intro"], () => {
      context = gsap.context(() => {
        applyFrame(0);

        const progress = { value: 0 };
        gsap.to(progress, { value: 1, ease: "none", onUpdate: () => applyFrame(progress.value), scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "+=300%",
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefresh: () => { stageWidth = section.clientWidth; applyFrame(progress.value); },
        } });

        markPinReady("design-gap-sequence");
      }, section);
    });

    // Layout-effect cleanup also restores the original parent before React removes
    // the section during route navigation. Media changes call this same disposer.
    const dispose = () => {
      unsubscribe();
      context?.revert();
      context = undefined;
    };
    disposeSequence.current = dispose;
    return () => {
      dispose();
      disposeSequence.current = () => {};
    };
  }, [enhanced, markPinReady, onPinsReady]);

  if (!enhanced) return <DesignGapSequenceFallback />;

  return (
    <section className="design-gap-sequence dark-section" id="design-gap" ref={sectionRef} aria-label="Current response and design gap">
        <div className="dgs-bg-stack" ref={bgStackRef}>
          <img className="dgs-bg" ref={farRef} src={FAR} alt="A first responder views a stalled robotaxi from a distance on a wet city street at night." loading="eager" decoding="async" />
          <img className="dgs-bg" ref={closeRef} src={CLOSE} alt="The first responder approaches the stalled robotaxi, now close, on the wet street." loading="eager" decoding="async" style={{ opacity: 0 }} />
          <img className="dgs-bg" ref={inCarRef} src={IN_CAR} alt="View from inside the robotaxi cabin, looking out at the city through the rear window." loading="eager" decoding="async" style={{ opacity: 0 }} />
        </div>
        <div className="dgs-scrim" aria-hidden="true" />

        {/* State 1 — 02.3 CURRENT RESPONSE */}
        <div className="dgs-s1-copy" ref={s1CopyRef}>
          <span className="eyebrow dgs-s1-label">[ 02.3 / CURRENT RESPONSE ]</span>
          <h2 id="response-title" className="dgs-s1-headline">
            <span className="dgs-s1-headline-line">HELP EXISTS.</span>
            <span className="dgs-s1-headline-line">BUT IT IS NOT IMMEDIATE.</span>
          </h2>
          <p className="dgs-s1-para">Moving a stalled robotaxi still depends on external support, authorization and time on site.</p>
        </div>

        <svg className="dgs-graphic" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <g className="dgs-connector" ref={connectorRef}>
            <path
              className="dgs-connector-line"
              d={`M${PANELS[0].x},${PANELS[0].y} L${PANELS[1].x},${PANELS[1].y} L${PANELS[2].x},${PANELS[2].y}`}
            />
            {PANELS.map((p) => (
              <circle key={p.id} className="dgs-connector-dot" cx={p.x} cy={p.y} r="0.55" />
            ))}
          </g>
        </svg>

        <div className="dgs-dust" aria-hidden="true">
          {DUST.map((d, i) => (
            <span
              key={i}
              className="dgs-dust-mote"
              style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size }}
              ref={(el) => {
                dustRefs.current[i] = el;
              }}
            />
          ))}
        </div>

        {PANELS.map((panel, i) => (
          <div
            key={panel.id}
            className="dgs-panel"
            style={{ left: `${panel.x}%`, top: `${panel.y}%`, width: `${PANEL_W}%`, height: `${PANEL_H}%` }}
            ref={(el) => {
              panelRefs.current[i] = el;
            }}
          >
            <div className="dgs-panel-head">
              <span className="dgs-panel-index">{panel.index}</span>
              <span className="dgs-panel-icon">
                <panel.icon />
              </span>
            </div>
            <h3>{panel.title}</h3>
            <p>{panel.sub}</p>
          </div>
        ))}

        {/* State 3 — 02.4 DESIGN GAP */}
        <div className="dgs-s3-copy" ref={s3CopyRef}>
          <span className="eyebrow dgs-s3-label">[ 02.4 / DESIGN GAP ]</span>
          <h2 id="design-gap-title" className="dgs-s3-headline">
            WHAT IF LIMITED CONTROL
            <br />
            WAS ALREADY ON BOARD?
          </h2>
          <p className="dgs-s3-sub">FROM EXTERNAL DEPENDENCY TO DIRECT, ON-BOARD CONTROL.</p>
        </div>

        {NODES.map((node, i) => (
          <div
            key={node.id}
            className={`dgs-node${node.accent ? " dgs-node-accent" : ""}`}
            style={{ left: `${node.startX}%`, top: `${NODE_Y}%` }}
            ref={(el) => {
              nodeRefs.current[i] = el;
            }}
          >
            {/* Fixed-height slot, icon bottom-aligned inside it: LOCAL CONTROL's icon can stay
                visibly larger than the other two without pushing its label down — every label
                sits the same distance below NODE_Y regardless of the icon size above it. */}
            <div className="dgs-node-icon-slot">
              <img className="dgs-node-icon" src={NODE_ICON[node.id]} alt="" aria-hidden="true" loading="lazy" />
            </div>
            <span className="dgs-node-label">{node.label}</span>
          </div>
        ))}
        {/* Each connector spans the gap between two icons (see setConnector/CONNECTOR_GAP_PCT)
            — stopping short of both icon edges so the arrowhead lands in open space and stays
            fully visible instead of being drawn underneath the next node. */}
        <div className="dgs-flow-connector" ref={arrowARef} aria-hidden="true">
          <span className="dgs-flow-shaft" />
          <span className="dgs-flow-head"><IconFlowHead /></span>
        </div>
        <div className="dgs-flow-connector" ref={arrowBRef} aria-hidden="true">
          <span className="dgs-flow-shaft" />
          <span className="dgs-flow-head"><IconFlowHead /></span>
        </div>
      </section>
  );
}
