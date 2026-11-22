import gsap from "gsap";

// Poses and timing follow the nine-slide deck in design-source/halogrip-pitch-deck/.
/** Degrees plus a screen rectangle expressed as viewport fractions. */
export type Pose = {
  pitch: number;
  yaw: number;
  roll: number;
  fx: number;
  fy: number;
  fw: number;
  fh: number;
};

export const POSE_PARKED: Pose = { pitch: 3.06, yaw: 0, roll: 0, fx: 0.0867, fy: 1.0167, fw: 0.8265, fh: 0.7218 };

const POSE_RAISED: Pose = { pitch: 26.67, yaw: 0, roll: 0, fx: 0.1851, fy: 0.1362, fw: 0.6298, fh: 0.5692 };

const POSE_CLOSE_UP: Pose = { pitch: 26.53, yaw: -50.42, roll: -20.73, fx: -0.0950, fy: -0.3939, fw: 0.8372, fh: 1.3513 };

export const POSE_CLOSE_UP_BACKDROP: Pose = { pitch: 43.12, yaw: 29.77, roll: 24.57, fx: 0.5459, fy: -0.4656, fw: 0.7056, fh: 1.0361 };

const POSE_SIDE: Pose = { pitch: 0, yaw: -90, roll: 0, fx: 0.3639, fy: 0.1081, fw: 0.2672, fh: 0.7838 };

/** GSAP mutates this object; the renderer reads it without a React update per frame.
 * tilt is a clockwise screen-plane rotation, separate from the model Euler angles.
 * backdrop is the fixed secondary model's opacity; direction selects the HTML labels. */
export type SceneState = Pose & {
  direction: number;
  tilt: number;
  backdrop: number;
};

// Keep the settled background aligned with --paper in halogrip.css.
const PAPER = "#f9f9fa";

type ArcFrame = { left: string; top: string; width: string; height: string; rotation: number; scaleX: number };

const ARC_INTRO: ArcFrame = { left: "21.65%", top: "19.88%", width: "34.54%", height: "17.57%", rotation: -25.96, scaleX: 1 };
const ARC_FORWARD: ArcFrame = { left: "28.84%", top: "19.88%", width: "34.54%", height: "17.57%", rotation: -25.96, scaleX: 1 };
const ARC_BRAKE: ArcFrame = { left: "43.36%", top: "24.32%", width: "36.35%", height: "18.49%", rotation: 27.94, scaleX: -1 };
const ARC_REVERSE: ArcFrame = { left: "31.82%", top: "18.34%", width: "36.35%", height: "18.49%", rotation: 13.97, scaleX: -1 };

// Slides 4–9 keep the side pose; only the screen-plane tilt changes.
const TILT_FORWARD = 15.12;
const TILT_BRAKE = 0;
const TILT_REVERSE = -22.79;

export type DirectionIndex = 0 | 1 | 2;

/** Named entry points in authored timeline seconds; each transition is followed by a hold. */
export const INTRO_PHASES = {
  parked: 0, raise: 0.06, closeUp: 0.19, side: 0.36,
  forward: 0.5, brake: 0.63, reverse: 0.79, release: 0.95,
} as const;

export function bucketForDirection(value: number): DirectionIndex {
  if (value < 0.5) return 0;
  if (value < 1.5) return 1;
  return 2;
}

export type IntroElements = {
  track: HTMLDivElement;
  pin: HTMLDivElement;
  title: HTMLHeadingElement | null;
  subtitle: HTMLSpanElement | null;
  facts: HTMLDivElement | null;
  callout: HTMLDivElement | null;
  note: HTMLParagraphElement | null;
  stageTitle: HTMLDivElement | null;
  stageLabel: HTMLParagraphElement | null;
  arc: SVGSVGElement | null;
  canvasInner: HTMLDivElement | null;
};


/** Build the authored sequence independently of scroll/browser ownership.
 * Times are timeline seconds (total 0.99), not normalized scroll progress.
 * GSAP owns pose/overlay writes; React owns the elements and discrete labels. */
export function buildIntroTimeline(elements: IntroElements, state: SceneState, options: gsap.TimelineVars = {}) {
  Object.assign(state, { ...POSE_PARKED, direction: 0, backdrop: 0, tilt: 0 });
  const { pin } = elements;
  gsap.set(elements.arc, { ...ARC_INTRO, opacity: 0 });
  const timeline = gsap.timeline({ defaults: { ease: "none" }, ...options });
  for (const [name, time] of Object.entries(INTRO_PHASES)) timeline.addLabel(name, time);
  // Each stage moves, then holds. Preserve these relative times when reorganizing.
  // Stage 0 (0.00-0.06) — slide 1 held: ghost wordmark, model parked below frame.

  // Stage 1 (0.06-0.19) — slide 2: rise and pitch to 26.7deg, fact labels in.
  timeline.to(state, { ...POSE_RAISED, duration: 0.06 }, "raise");
  timeline.to(elements.subtitle, { opacity: 0, duration: 0.03 }, "raise");
  timeline.to(elements.facts, { opacity: 1, duration: 0.035 }, 0.085);

  // Stage 2 (0.19-0.36) — close-up, callouts and the fixed backdrop appear together.
  timeline.to(state, { ...POSE_CLOSE_UP, duration: 0.075 }, "closeUp");
  timeline.to(elements.facts, { opacity: 0, duration: 0.03 }, "closeUp");
  timeline.to(elements.callout, { opacity: 1, duration: 0.05 }, 0.215);
  timeline.to(state, { backdrop: 1, duration: 0.05 }, 0.215);

  // Stage 3 (0.36-0.50) — slide 4: settle to the side view the rest of the deck holds.
  timeline.to(state, { ...POSE_SIDE, duration: 0.06 }, "side");
  timeline.to(elements.callout, { opacity: 0, duration: 0.03 }, "side");
  timeline.to(state, { backdrop: 0, duration: 0.03 }, "side");
  timeline.to(elements.note, { opacity: 1, duration: 0.035 }, 0.385);
  timeline.to(elements.arc, { opacity: 1, duration: 0.035 }, 0.385);

  // Stage 4 (0.50-0.63) — Forward: tilt the held side pose in the screen plane.
  timeline.to(elements.title, { opacity: 0, duration: 0.03 }, "forward");
  timeline.to(elements.note, { opacity: 0, duration: 0.025 }, "forward");
  timeline.to(elements.arc, { ...ARC_FORWARD, duration: 0.055 }, "forward");
  timeline.to(state, { tilt: TILT_FORWARD, duration: 0.055 }, "forward");
  timeline.to(elements.stageTitle, { opacity: 1, duration: 0.035 }, 0.52);
  timeline.to(elements.stageLabel, { opacity: 1, duration: 0.035 }, 0.52);

  // Stage 5 (0.63-0.79) — Brake: flip the arc, then return the tilt to level.
  timeline.to(state, { direction: 1, duration: 0.03 }, "brake");
  timeline.to(elements.arc, { ...ARC_BRAKE, duration: 0.035 }, "brake");
  timeline.to(state, { tilt: TILT_BRAKE, duration: 0.035 }, 0.71);

  // Stage 6 (0.79-0.95) — slides 8/9, REVERSE / Backward. Still flipped, new angle.
  timeline.to(state, { direction: 2, duration: 0.03 }, "reverse");
  timeline.to(elements.arc, { ...ARC_REVERSE, duration: 0.035 }, "reverse");
  timeline.to(state, { tilt: TILT_REVERSE, duration: 0.035 }, 0.87);

  // Stage 7 (0.95-0.99) — release into #overview.
  timeline.to(
    [elements.stageTitle, elements.stageLabel, elements.arc, elements.canvasInner],
    { opacity: 0, duration: 0.04 },
    0.95,
  );
  timeline.to(pin, { backgroundColor: PAPER, duration: 0.04 }, "release");

  return timeline;
}
