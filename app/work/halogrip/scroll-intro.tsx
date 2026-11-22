"use client";

/** HALOGRIP opening: loading/static states and the HTML overlay.
 * intro-motion owns scroll writes; use-intro-lifecycle owns readiness and fallback.
 * The Three.js renderer stays dynamically loaded below. */

import dynamic from "next/dynamic";
import { memo, useEffect, useRef, useState } from "react";
import { Poppins } from "next/font/google";
import { bucketForDirection, mountIntroTimeline, POSE_PARKED, POSE_CLOSE_UP_BACKDROP, type DirectionIndex, type SceneState } from "./intro-motion";
import { useIntroLifecycle } from "./use-intro-lifecycle";
import { usePinCoordinator } from "./pin-provider";
import SceneBoundary from "./scene-boundary";

const loadScene = () => import("./scroll-intro-scene");
const ScrollIntroScene = dynamic(loadScene, { ssr: false });

// Opening-only font; keep this call here to preserve the generated font identity.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  display: "swap",
  variable: "--si-poppins",
});

/** Slide 2's four labels. `lead` ones are 20pt bold, the others 14pt light. */
const facts = [
  { text: "More Lives Saved", lead: true, left: "4.2%", top: "71.5%" },
  { text: "Speed Limitation", lead: false, left: "4.2%", top: "78.5%" },
  { text: "Visible Analog", lead: false, left: "4.2%", top: "83.3%" },
  { text: "More Life Lived", lead: true, left: "70.8%", top: "71.5%" },
] as const;

/** Slide 3's single stacked callout block. Vertical order is the PPT's, not alphabetical. */
const callouts = [
  { text: "Button & Tag", lead: true, top: "68.1%" },
  { text: "Parking – Remote Assistant", lead: false, top: "75.1%" },
  { text: "Activate Steering Device", lead: false, top: "79.9%" },
] as const;

/** Slides 5–9 labels; intro-motion.ts coordinates the arc and screen-plane tilt. */
const directions = [
  { title: "ACCELERATION", label: "Forward" },
  { title: "DECELERATION", label: "Brake" },
  { title: "REVERSE", label: "Backward" },
] as const;

/** Static counterpart to the animation's first frame. Used only when the animated path is
 * unavailable; it deliberately contains none of the retired image/metadata hero. */
function StaticIntro({ failed = false }: { failed?: boolean }) {
  return (
    <section className={`scroll-intro scroll-intro-static ${poppins.variable}`} aria-labelledby="project-title">
      <h1 className="si-title" id="project-title">HALOGRIP</h1>
      {/* Two unbreakable groups, so a narrow screen wraps between them, never inside one. */}
      <span className="si-subtitle">
        <span className="si-subtitle-part">[ CASE STUDY 001 ] &nbsp;/</span>{" "}
        <span className="si-subtitle-part">GOTHENBURG, SE / 2025</span>
      </span>
      {failed && <p className="si-load-status" role="status">The 3D introduction could not load. <button type="button" onClick={() => window.location.reload()}>Try again</button></p>}
    </section>
  );
}

/** Deck arc geometry: shorten the stroke under an explicit triangle to avoid a
 * protruding line cap. The head extends outside the viewBox, so overflow stays visible.
 * Group opacity below prevents the overlapping stroke and head from darkening twice. */
const ARC_VIEWBOX = "0 0 1000 286.06";
const ARC_PATH = "M 531.61 0.29 A 500 143.03 0 0 1 806.04 29.92";
const ARC_HEAD = "M 782.58 86.32 L 915.46 63.45 L 817.43 -29.13 Z";

const DirectionReadout = memo(function DirectionReadout({ index }: { index: DirectionIndex }) {
  return <>{directions[index].title}</>;
});

const DirectionLabel = memo(function DirectionLabel({ index }: { index: DirectionIndex }) {
  return <>{directions[index].label}</>;
});

export default function ScrollIntro() {
  const { markPinReady, resetPin } = usePinCoordinator();
  const { enhancementChecked, enhanced, ready, failed, invalidateRef, handleFailure, handleReady, registerInvalidate } = useIntroLifecycle(loadScene);
  const [directionIndex, setDirectionIndex] = useState<DirectionIndex>(0);

  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLSpanElement>(null);
  const canvasInnerRef = useRef<HTMLDivElement>(null);
  const factsRef = useRef<HTMLDivElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const stageTitleRef = useRef<HTMLDivElement>(null);
  const stageLabelRef = useRef<HTMLParagraphElement>(null);
  const arcRef = useRef<SVGSVGElement>(null);

  const stateRef = useRef<SceneState>({ ...POSE_PARKED, direction: 0, backdrop: 0, tilt: 0 });
  const lastBucket = useRef<DirectionIndex>(0);

  useEffect(() => {
    const pin = pinRef.current;
    const track = trackRef.current;
    // Begin tracking before GPU readiness so a cold load keeps the current scroll pose.
    if (!enhanced || !pin || !track) return;
    const state = stateRef.current;
    const invalidate = () => { if (!document.hidden) invalidateRef.current(); };
    return mountIntroTimeline({
      pin, track,
      title: titleRef.current,
      subtitle: subtitleRef.current,
      canvasInner: canvasInnerRef.current,
      facts: factsRef.current,
      callout: calloutRef.current,
      note: noteRef.current,
      stageTitle: stageTitleRef.current,
      stageLabel: stageLabelRef.current,
      arc: arcRef.current,
    }, state, {
      onUpdate: () => {
        invalidate();
        const bucket = bucketForDirection(state.direction);
        if (bucket !== lastBucket.current) {
          lastBucket.current = bucket;
          setDirectionIndex(bucket);
        }
      },
      onVisible: invalidate,
      onReady: () => markPinReady("scroll-intro"),
    });
  }, [enhanced, markPinReady, resetPin, invalidateRef]);

  // The server cannot know whether WebGL is available. Keep the first paint neutral while
  // the client checks, so no alternate hero flashes before the 3D opening.
  if (!enhancementChecked) {
    return (
      <div className="scroll-intro-track">
        <section className="scroll-intro-blank" aria-labelledby="project-title">
          <h1 id="project-title">HALOGRIP</h1>
        </section>
      </div>
    );
  }

  if (!enhanced) return <div className="scroll-intro-track is-static"><StaticIntro failed={failed} /></div>;

  return (
    <div className="scroll-intro-track" ref={trackRef}>
    <div className={`scroll-intro ${poppins.variable}`} ref={pinRef}>
      {/* Behind the canvas, exactly as in the deck — the model passes in front of it. */}
      <h1 className="si-title" id="project-title" ref={titleRef}>
        HALOGRIP
      </h1>
      <div className="si-stage-title" ref={stageTitleRef} style={{ opacity: 0 }} aria-hidden="true">
        <DirectionReadout index={directionIndex} />
      </div>

      <div className={`scroll-intro-canvas${ready ? " is-visible" : ""}`}>
        <div className="scroll-intro-canvas-inner" ref={canvasInnerRef}>
          <SceneBoundary onError={handleFailure}><ScrollIntroScene
            state={stateRef.current}
            backdropPose={POSE_CLOSE_UP_BACKDROP}
            onReady={handleReady}
            registerInvalidate={registerInvalidate}
            onError={handleFailure}
          /></SceneBoundary>
        </div>
      </div>
      {!ready && <p className="si-load-status" role="status">Loading 3D introduction…</p>}

      <span className="si-subtitle" ref={subtitleRef}>
        [ CASE STUDY 001 ] &nbsp;/&nbsp; GOTHENBURG, SE / 2025
      </span>

      <div className="si-layer" ref={factsRef} style={{ opacity: 0 }} aria-hidden="true">
        {facts.map((fact) => (
          <p
            className={`si-note${fact.lead ? " is-lead" : ""}`}
            key={fact.text}
            style={{ left: fact.left, top: fact.top }}
          >
            {fact.text}
          </p>
        ))}
      </div>

      <div className="si-layer" ref={calloutRef} style={{ opacity: 0 }} aria-hidden="true">
        {callouts.map((callout) => (
          <p
            className={`si-note${callout.lead ? " is-lead" : ""}`}
            key={callout.text}
            style={{ left: "68.7%", top: callout.top }}
          >
            {callout.text}
          </p>
        ))}
      </div>

      <p className="si-note is-lead si-note-wide" ref={noteRef} style={{ opacity: 0 }} aria-hidden="true">
        Tilt-Based Control System Design
      </p>

      <p className="si-note is-lead si-stage-label" ref={stageLabelRef} style={{ opacity: 0 }} aria-hidden="true">
        <DirectionLabel index={directionIndex} />
      </p>

      <svg
        className="si-arc"
        ref={arcRef}
        viewBox={ARC_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        // The deck's arrowhead extends beyond the shape box.
        style={{ overflow: "visible", opacity: 0 }}
        aria-hidden="true"
      >
        {/* Composite stroke and head before applying the shape's opacity. */}
        <g opacity="0.7">
          <path d={ARC_PATH} fill="none" stroke="var(--accent)" strokeWidth="40.2" strokeLinecap="butt" />
          <path d={ARC_HEAD} fill="var(--accent)" />
        </g>
      </svg>

    </div>
    </div>
  );
}
