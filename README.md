# HALOGRIP

HALOGRIP is a human-centered emergency steering concept for autonomous vehicles.
This repository contains only the standalone HALOGRIP case study and the code,
tests, 3D model, and visual assets required to run it.

The interface was designed by Sylvia Xie and implemented as an AI-assisted
frontend prototype with Next.js, React, TypeScript, GSAP, and Three.js.

## Run locally

Node.js 22.13.0 or newer is required.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The root route redirects to the case study at
`/work/halogrip`.

## Checks

```bash
npm run check
```

This runs ESLint, TypeScript checks, unit tests, and a production build. Browser
tests can be run separately with `npm run test:e2e` after installing Chromium
through Playwright.

## Scope

This is a portfolio and code-review repository. It does not contain backend,
database, authentication, or production vehicle-control software.

Unless stated otherwise, the project concept and visual assets are copyright
Sylvia Xie. No permission to reuse the visual assets is granted by publication
of this repository.
