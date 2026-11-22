# HALOGRIP Development Guide

This repository contains only the HALOGRIP frontend prototype: an emergency-steering concept for autonomous vehicles developed as a master's-thesis project with Autoliv and Chalmers.

## Scope

- Next.js 16 App Router, React 19, and TypeScript.
- Frontend prototype only. There is no backend, database, authentication, or real vehicle-control integration.
- The implementation is AI-assisted and intended for portfolio demonstration and code review.
- Keep this repository limited to HALOGRIP. Do not add material, assets, or documentation from other projects.

## Product and visual direction

- Preserve the established red, black, and off-white visual language.
- Primary display and technical typefaces are Koulen and Roboto Mono.
- Maintain accessibility, semantic HTML, keyboard behavior, focus visibility, and reduced-motion support.
- Do not claim production safety, validation, or real-world vehicle functionality.

## Application structure

- `app/page.tsx` redirects the root route to `/work/halogrip`.
- `app/work/halogrip/page.tsx` owns the HALOGRIP case-study page.
- `app/work/halogrip/halogrip.css` is route-specific and must only be imported by that page.
- `app/globals.css` contains the Tailwind import, theme tokens, and minimal shared reset. Put shared reset additions inside `@layer base`.
- `app/work/hero-fonts.ts` defines the local hero fonts.
- `app/components/CloseProjectButton.tsx` and the route wrapper provide the close-project navigation.
- `app/work/halogrip/interaction-deck.tsx` contains the interaction presentation.
- The design-gap sequence, concept carousel, and sketch lightbox are part of the case-study narrative and should remain usable on keyboard and touch devices.

## Scroll intro architecture

The intro is a progressive enhancement, not required for access to the case study.

- The server render and first hydration frame must remain a full-height, near-white shell with an accessible visually hidden `h1`.
- During enhanced loading, show the outline title and subtitle. Do not mount the canvas until GPU warm-up succeeds.
- Reserve the intro's `850vh` scroll length in CSS with `.scroll-intro-track` and a sticky stage. Do not replace this with GSAP pinning.
- Phones below `760px` always use `StaticIntro` at `60svh`.
- Unsupported enhancement, a 45-second timeout, WebGL/render failure, or scene error must fall back to `StaticIntro`.
- `StaticIntro` contains the outline title plus case, place, and year. Do not restore the retired full hero image or metadata grid.
- With JavaScript disabled, the page intentionally leaves the server shell and document body; do not force `StaticIntro` into the no-JS path.
- Product metadata belongs below the intro. The retired hero image may remain only as social-sharing metadata.

Relevant modules:

- `scroll-intro*.tsx` and related CSS: React Three Fiber scene and intro presentation.
- `intro-timeline.ts`: authored poses and phase timing.
- `intro-motion.ts`: browser subscriptions and DOM cleanup.
- `intro-status.ts`: intro state transitions.
- `use-intro-lifecycle.ts`: capability checks, loading, failure, timeout, and GPU readiness.
- `intro-projection.ts`: orthographic camera fitting.
- `smooth-scroll.tsx`: Lenis integration with the GSAP ticker; it pauses for the lightbox and must clean up completely.
- `pin-provider` and `pin-coordinator`: coordinated scheduling for pinned sections.
- `scene-boundary`: scene-error fallback.
- `gpu-warmup`: cancellable GPU warm-up.
- `need-scene.tsx`: the Three.js product scene.

When changing motion code, remove all listeners, ticker callbacks, animation frames, ScrollTriggers, and temporary DOM state during cleanup. Avoid duplicate pin spacers or subscriptions after navigation and React development-mode remounts. Preserve reduced-motion and static fallbacks.

## 3D model and media

- HALOGRIP media lives under `public/media/halogrip图片`.
- The product model is `public/models/halogrip.glb`.
- Scene code depends on the model's node names, pivots, and hierarchy. Do not flatten, join, rename, or instance its nodes without updating and testing all scene references.
- Treat included assets as project-specific portfolio material; do not assume they are licensed for unrelated reuse.

## Engineering rules

- Keep components typed; do not introduce `any` to bypass errors.
- Prefer server components unless browser state, effects, or Web APIs require a client component.
- Keep browser-only APIs behind client boundaries and capability checks.
- Maintain demand-based rendering and dispose of Three.js resources when they are no longer used.
- Never expose secrets in client code or commit credentials and local environment files.
- Keep dependencies focused. Node.js `>=22.13` is required.

## Verification

Install reproducibly and run the complete local check:

```bash
npm ci
npm run check
```

`npm run check` covers ESLint, generated Next.js types and TypeScript, unit tests, and a production build. Browser tests are optional and require a separately installed Playwright browser:

```bash
npm run test:e2e
```

Do not download browser binaries solely for a routine code change unless browser verification is specifically requested. Automated checks do not cover every WebGL, GPU, or device-specific path, so visually inspect the enhanced and static intro paths when changing them.

## Before submitting a change

- Confirm `/` still redirects to `/work/halogrip`.
- Confirm desktop enhancement, narrow-screen static fallback, reduced motion, and failure fallback remain coherent.
- Confirm lightboxes and carousels work with keyboard, pointer, and touch input where applicable.
- Confirm no unrelated project names, files, or assets entered the repository.
- Run `npm run check` and report any browser path that was not exercised.
