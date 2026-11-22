"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { usePinCoordinator } from "./pin-provider";
import { transitionIntro } from "./intro-status";

function canEnhance() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.innerWidth < 760) return false;
  try {
    const probe = document.createElement("canvas");
    const gl = (probe.getContext("webgl2") || probe.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Keep capability checks, loading, failure and renderer readiness out of the view. */
export function useIntroLifecycle(loadScene: () => Promise<unknown>) {
  const { markPinReady, resetPin } = usePinCoordinator();
  const [status, dispatch] = useReducer(transitionIntro, "checking");
  const enhancementChecked = status !== "checking";
  const enhanced = status === "loading" || status === "ready";
  const ready = status === "ready";
  const failed = status === "failed";
  const activeRef = useRef(false);
  const invalidateRef = useRef<() => void>(() => {});
  const handleFailure = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    dispatch("fail");
  }, []);
  const registerInvalidate = useCallback((invalidate: () => void) => { invalidateRef.current = invalidate; }, []);

  // Check after mount so hydration matches the server, then follow viewport/motion changes.
  useEffect(() => {
    let generation = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 760px)");
    const update = () => {
      resetPin("scroll-intro");
      const enable = !failed && canEnhance();
      const current = ++generation;
      activeRef.current = enable;
      dispatch(enable ? "enable" : "disable");
      // Start the chunk before the enhanced render; ignore rejection from an obsolete
      // attempt after a media change or unmount. No scene import on the static path.
      if (enable) void loadScene().catch(() => {
        if (current === generation) handleFailure();
      });
      if (!enable) markPinReady("scroll-intro");
    };
    update();
    motion.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      generation++;
      activeRef.current = false;
      invalidateRef.current = () => {};
      motion.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
      resetPin("scroll-intro");
    };
  }, [failed, markPinReady, resetPin, loadScene, handleFailure]);

  useEffect(() => {
    if (!enhanced || ready) return;
    // Allow 45 seconds for scene loading before showing the existing failure fallback.
    const timeout = window.setTimeout(handleFailure, 45000);
    return () => window.clearTimeout(timeout);
  }, [enhanced, ready, handleFailure]);

  const handleReady = useCallback(() => {
    if (!activeRef.current) return;
    dispatch("ready");
    invalidateRef.current();
  }, []);

  return { enhancementChecked, enhanced, ready, failed, invalidateRef, handleFailure, handleReady, registerInvalidate };
}
