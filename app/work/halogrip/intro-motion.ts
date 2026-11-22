import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { buildIntroTimeline, type IntroElements, type SceneState } from "./intro-timeline";
export { bucketForDirection, POSE_PARKED, POSE_CLOSE_UP_BACKDROP } from "./intro-timeline";
export type { Pose, SceneState, DirectionIndex } from "./intro-timeline";

/** Own only browser subscriptions and GSAP cleanup. The sequence is independently seekable. */
export function mountIntroTimeline(elements: IntroElements, state: SceneState, callbacks: {
  onUpdate: () => void;
  onVisible: () => void;
  onReady: () => void;
}) {
  gsap.registerPlugin(ScrollTrigger);
  const context = gsap.context(() => {
    buildIntroTimeline(elements, state, {
      onUpdate: callbacks.onUpdate,
      // CSS reserves the 850vh track. Never insert a pin spacer here.
      scrollTrigger: {
        trigger: elements.track, start: "top top", end: "bottom bottom",
        scrub: 1, invalidateOnRefresh: true,
      },
    });
    callbacks.onReady();
  }, elements.pin);
  const refresh = requestAnimationFrame(() => ScrollTrigger.refresh());
  document.addEventListener("visibilitychange", callbacks.onVisible);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(refresh);
    document.removeEventListener("visibilitychange", callbacks.onVisible);
    context.revert();
  };
}
