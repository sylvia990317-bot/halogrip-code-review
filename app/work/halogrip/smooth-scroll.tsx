"use client";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/**
 * Wheel smoothing for /work/halogrip only. A Windows wheel notch jumps ~100px, so even with the
 * timelines' own `scrub` the sticky/pinned stages moved in steps. Lenis eases the scroll
 * position itself and is driven by GSAP's ticker, so ScrollTrigger reads the smoothed value on
 * the same frame it renders. Touch keeps native scrolling (Lenis's default), reduced motion
 * skips it entirely, and unmounting restores native scrolling for every other route.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ anchors: true, autoRaf: false });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // The sketch lightbox locks the page with body overflow. Pause with it, so the wheel
    // neither eases the page underneath nor swallows the dialog's own scrolling.
    const body = document.body;
    const syncLock = () => { if (body.style.overflow === "hidden") lenis.stop(); else lenis.start(); };
    const observer = new MutationObserver(syncLock);
    observer.observe(body, { attributes: true, attributeFilter: ["style"] });

    return () => {
      observer.disconnect();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, []);
  return null;
}
