# GymTracker

[![CI](https://github.com/adervec/GymTracker/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/adervec/GymTracker/actions/workflows/ci.yml)

A single-file workout tracker — log lifts and cardio, follow adaptive plans, picker-driven
equipment setup (barbell/dumbbell/kettlebell/plate/landmine/pin…), per-exercise reference
media, biometrics + Strava sync, and offline-first localStorage persistence. Built for
**Android Chrome / Chromium**.

The entire app is one self-contained file: [`gym-tracker.html`](gym-tracker.html) (~1.4 MB,
inline HTML/CSS/JS, no build step, no runtime dependencies). Design notes and the per-feature
changelog live in [`DESIGN.md`](DESIGN.md).

## Run it

Open `gym-tracker.html` in a Chromium browser — that's it. For a local server (so File System
Access auto-load and other secure-context features work):

```sh
npm run serve     # serves the repo at http://127.0.0.1:4321/gym-tracker.html
```

## Develop & test

The app ships as plain HTML, but the repo carries a two-layer test suite so a regression can't
slip in unnoticed (see [`DESIGN.md` §6](DESIGN.md)).

```sh
npm install                      # one-time: dev dependencies (Playwright)
npx playwright install chromium  # one-time: the test browser

npm run check   # Layer 1 — zero-dep static checks (~1s): parses every inline <script>,
                #           lints, verifies the build stamp, compiles the Python helpers
npm test        # Layer 1 then Layer 2 — Playwright boots the real file in headless
                #           Chromium (desktop + emulated Pixel) and asserts behavior
```

- **Layer 1** (`test/check.mjs`) needs no dependencies and runs in the **pre-commit hook**, so a
  stray token that would break the whole inline script is caught before it's committed.
- **Layer 2** (`test/*.spec.mjs`) loads the app for real and checks a clean boot plus the pure
  helpers — 1RM, unit conversion, media-URL parsing, plan estimates, and the equipment-setup /
  plate-math solvers.

[GitHub Actions](.github/workflows/ci.yml) runs both layers on every push to `main`/`dev` and on
pull requests.

### Enable the build-stamp + pre-commit hook (once per clone)

```sh
git config core.hooksPath .githooks
```

This auto-stamps the build number into `gym-tracker.html` and runs the static checks on each commit.

## Helper scripts

Optional local sync helpers (Python standard library only — you supply your own API keys/tokens):

- `tools/garmin-sync.py` — pull bodyweight / sleep biometrics.
- `tools/strava-sync.py` — pull strength activities (and optionally push descriptions back).
- `tools/youtube-media.py` — match a creator's Shorts to your exercises for the media carousel.

## Layout

```
gym-tracker.html          the app (everything)
DESIGN.md                 design decisions + per-feature changelog
tools/                    optional Python sync helpers
test/
  check.mjs               Layer 1 — static checks (zero deps)
  serve.mjs               tiny static server for the suite
  app.spec.mjs            Layer 2 — boot + pure-helper behavior
  setup.spec.mjs          Layer 2 — equipment-setup / plate-math solvers
playwright.config.mjs     Playwright config (desktop + Pixel projects)
.github/workflows/ci.yml  CI
```
