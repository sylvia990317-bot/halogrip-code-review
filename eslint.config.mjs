import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // Preserve existing media rendering. Image optimization is a separate visual change.
    files: [
      "app/work/halogrip/concept-carousel.tsx",
      "app/work/halogrip/design-gap-sequence.tsx",
      "app/work/halogrip/interaction-deck.tsx",
      "app/work/halogrip/overview-backdrop.tsx",
      "app/work/halogrip/page.tsx",
      "app/work/halogrip/sketch-lightbox.tsx",
    ],
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    // Keep full-page navigation and its existing scene teardown behavior.
    files: ["app/work/halogrip/page.tsx"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  {
    // Three.js owns mutable scene/material objects; they are not React render state.
    files: ["app/work/halogrip/scroll-intro-scene.tsx"],
    rules: { "react-hooks/immutability": "off" },
  },
  {
    // A stable mutable pose object bridges GSAP and the demand-rendered Three.js scene.
    files: ["app/work/halogrip/scroll-intro.tsx"],
    rules: { "react-hooks/refs": "off" },
  },
  globalIgnores([
    ".next/**", "out/**", "next-env.d.ts",
    "public/**", "test-results/**", "playwright-report/**",
  ]),
]);
