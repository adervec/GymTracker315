# GymTracker315

[![CI](https://github.com/adervec/GymTracker/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/adervec/GymTracker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A single-file workout tracker — log lifts and cardio, follow adaptive plans, picker-driven
equipment setup (barbell/dumbbell/kettlebell/plate/landmine/pin…), per-exercise reference
media, biometrics + Strava sync, and offline-first localStorage persistence. Built for
**Android Chrome / Chromium**.

The entire app is one self-contained file: [`gym-tracker.html`](gym-tracker.html) (~1.7 MB,
inline HTML/CSS/JS, no build step, no runtime dependencies — the coaching guides are baked in too,
so you can distribute just this one file). Design notes and the per-feature changelog live in
[`DESIGN.md`](DESIGN.md).

## Run it

Open `gym-tracker.html` in a Chromium browser — that's it. For a local server (so File System
Access auto-load and other secure-context features work):

```sh
npm run serve     # serves the repo at http://127.0.0.1:4321/gym-tracker.html
```

## Install (PWA)

Deployed to GitHub Pages: **https://adervec.github.io/GymTracker/** — open it in mobile or desktop
Chrome and use *Install app* / *Add to Home Screen*. It's offline-first: a service worker caches the
app shell, so it launches and works without a connection.

**Deploy** (`.github/workflows/deploy.yml`): on every push to `dev` it runs the static check, bakes the
guides, copies `gym-tracker.html` → `index.html`, adds the manifest / service worker / icons, and stamps
the SW cache version from the build number, then publishes to Pages. One-time setup: in the repo,
**Settings → Pages → Source: GitHub Actions**. Regenerate icons with `node tools/make-icons.mjs`.

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

Optional — you run them locally with your own credentials/API keys; they write JSON files the app
imports. Their output and any tokens are git-ignored.

- `tools/strava-sync.py` — pull strength activities (official Strava API + your own OAuth app); optional description push-back.
- `tools/youtube-media.py` — match a creator's Shorts to your exercises (official YouTube Data API + your own free key).
- `tools/garmin-sync.py` — pull bodyweight / sleep biometrics. **Unofficial:** Garmin has no public per-user read API, so this uses the community [`garminconnect`](https://github.com/cyberjunky/python-garminconnect) library (your Garmin login → Garmin Connect's private endpoints). That may conflict with Garmin's Terms of Service and can break or be blocked at any time — personal use, at your own risk.
- `tools/anatomy-ocr.py` — OCR a hi-res labelled anatomy chart into a glossary label map (Tesseract + OpenCV), so the app's Detailed Chart View can place tap targets without bundling an OCR engine. One-time, offline; `pip install pytesseract opencv-python pillow numpy` + the Tesseract binary.

## Layout

```
gym-tracker.html          the app (everything)
DESIGN.md                 design decisions + per-feature changelog
Guides/                   source coaching guides (baked into the HTML)
tools/                    Python sync helpers + embed-guides.mjs (bakes Guides/ into the app)
test/
  check.mjs               Layer 1 — static checks (zero deps)
  serve.mjs               tiny static server for the suite
  app.spec.mjs            Layer 2 — boot + pure-helper behavior
  setup.spec.mjs          Layer 2 — equipment-setup / plate-math solvers
  coaching.spec.mjs       Layer 2 — Coaching tab, new families & muscles, crosslinks
playwright.config.mjs     Playwright config (desktop + Pixel projects)
.github/workflows/ci.yml  CI
```

## Disclaimer

GymTracker315 is a personal training log built by a software developer — **not** a doctor, coach,
physiotherapist, or lawyer. Its plans, cues, coaching notes, and bundled guides are **educational
only** and may not be right for you. Consult a qualified professional before starting or changing a
program, especially with any injury or health condition. Exercise carries a real risk of injury —
warm up, start light, and stop on sharp pain. **You use this app and follow its content entirely at
your own risk.** It is provided "as is" under the MIT License, without warranty of any kind; the
author is not liable for any injury, loss, or damage.

Training concepts referenced (HR zones, 80/20 polarized, periodization, MEV/MAV/MRV, e1RM, …) are
widely-known frameworks, attributed where relevant via the in-app glossary and links; the guides and
exercise cues are otherwise the author's own writing.

## Privacy

No account, no servers, no analytics — nothing is sent to the author. Your data lives in your
browser's `localStorage`, plus any local files or your **own** cloud storage if you enable
auto-save/sync. The helper scripts run locally with your own credentials.

## Trademarks

Product and brand names referenced (e.g. Captains of Crush, Hoist / Roc-It, Life Fitness, Fat Gripz,
Concept2, StairMaster, VersaClimber, Strava, Garmin) belong to their respective owners. GymTracker315 is
independent — not affiliated with, endorsed by, or sponsored by any of them — and uses these names
only descriptively. Captains of Crush gripper ratings are IronMind's and vary unit-to-unit.

## License

[MIT](LICENSE) © 2026 Adam Eryavec. Built with [Claude Code](https://claude.com/claude-code).
