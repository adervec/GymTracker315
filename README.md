# GymTracker315

[![CI](https://github.com/adervec/GymTracker315/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/adervec/GymTracker315/actions/workflows/ci.yml)
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

Deployed to GitHub Pages: **https://adervec.github.io/GymTracker315/** — open it in mobile or desktop
Chrome and use *Install app* / *Add to Home Screen*. It's offline-first: a service worker caches the
app shell, so it launches and works without a connection.

**Deploy** (`.github/workflows/deploy.yml`): on every push to `dev` it runs the static check, bakes the
guides, copies `gym-tracker.html` → `index.html`, adds the manifest / service worker / icons, and stamps
the SW cache version from the build number, then publishes to Pages. One-time setup: in the repo,
**Settings → Pages → Source: GitHub Actions**. Regenerate icons with `node tools/make-icons.mjs`.

## Cloud Sync (cross-device)

Keep your log in sync between **phone and desktop** automatically — the in-gym path the desktop-only
File-System Auto-Save/Load can't cover. Every change is **merged**, not overwritten: sessions reconcile by stable
`id` + last-modified, with delete tracking (last-write-wins union), so no device clobbers another. **Export JSON**
stays as your manual backup. Enable it in **Settings → Data Management → ☁ Cloud Sync**.

The sync engine is **provider-pluggable** — one active backend at a time, your choice:

| Backend | Login | Works on | Notes |
|---|---|---|---|
| **Google Drive** | Google | everywhere | private `drive.appdata` folder |
| **Dropbox** | Dropbox | everywhere | App-folder scoped |
| **OneDrive** | Microsoft | everywhere | **personal** MS accounts only (app-folder scope) |
| **Custom endpoint** | none | everywhere (incl. **Apple**) | your own ~30-line worker; best privacy |

All four keep a single private file (`gymtracker-state.json`) scoped so the app can't see the rest of your storage.
OAuth access tokens live in memory; refresh tokens (Dropbox/OneDrive) are cached in your browser's IndexedDB so a
reload can re-sync silently. Connection state is **device-local** — each device authorizes itself, nothing about
the connection is synced. Each OAuth backend needs a one-time free **client ID** pasted into the `SYNC_CLIENTS`
constant in [`gym-tracker.html`](gym-tracker.html); the **custom endpoint** needs no registration at all. Until a
backend is configured, its button in the Cloud Sync card shows the setup steps instead.

```js
const SYNC_CLIENTS = { google: '…', dropbox: '…', onedrive: '…' }; // paste the ids you set up; leave others ''
```

For every OAuth provider, register the **app's URL** as the redirect URI / JS origin — both the deployed PWA
`https://adervec.github.io/GymTracker315/` and the local `http://localhost:4321/gym-tracker.html` if you dev locally.

### Google Drive — one-time setup (free, ~5 min)

Google Drive needs a public OAuth **client ID** that only you can create (it ties the app to *your* Google Cloud
project). It's safe to commit — it's an identifier, not a secret.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) → create a project (any name).
2. **APIs & Services → Library →** enable the **Google Drive API**.
3. **APIs & Services → OAuth consent screen →** User type **External** → fill the app name + your email →
   **Publishing status: Testing** → under **Test users**, add your own Google account. (Testing mode is fine for
   personal use; the only catch is a periodic re-consent.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.** Under
   **Authorized JavaScript origins** add both:
   - `https://adervec.github.io` (the deployed PWA)
   - `http://localhost:4321` (the local `npm run serve` origin)
5. Copy the **Client ID** (`…-xxxx.apps.googleusercontent.com`) into `SYNC_CLIENTS.google`.
6. Reload → **Settings → Data Management → Cloud Sync → Connect Google Drive**, grant the consent popup once.

### Dropbox — one-time setup (free)

1. Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps) → **Create app**.
2. Choose **Scoped access** → **App folder** (so the app only ever sees its own folder) → name it.
3. On the app's **Permissions** tab, enable `files.content.read` and `files.content.write` → **Submit**.
4. On the **Settings** tab, under **OAuth 2 → Redirect URIs**, add your app URL(s) (e.g.
   `https://adervec.github.io/GymTracker315/`). Copy the **App key**.
5. Paste the App key into `SYNC_CLIENTS.dropbox` → reload → **Connect Dropbox**. (Uses OAuth PKCE — no app
   secret in the browser — and requests offline access so reloads re-sync without re-consenting.)

### OneDrive — one-time setup (free, personal accounts only)

> OneDrive's app-folder scope is **personal Microsoft accounts only** (not work/school). Use Dropbox or the
> custom endpoint for those.

1. [Azure Portal](https://portal.azure.com/) → **App registrations** → **New registration**. Supported account
   types: **Personal Microsoft accounts**.
2. **Redirect URI**: platform **Single-page application (SPA)** → add your app URL(s) (the SPA platform is what
   enables PKCE + CORS on the token endpoint).
3. **API permissions** → add Microsoft Graph **delegated** `Files.ReadWrite.AppFolder` (and `offline_access`).
4. Copy the **Application (client) ID** into `SYNC_CLIENTS.onedrive` → reload → **Connect OneDrive**.

### Custom endpoint — no registration, works everywhere

The privacy-first, Apple-friendly option: your own tiny server holds the JSON. Ship the included
[`tools/sync-worker.js`](tools/sync-worker.js) — a ~30-line **Cloudflare Worker** (free tier) backed by a KV
namespace and gated by a bearer token you choose.

1. Deploy the worker (instructions are in the file header): bind a KV namespace as `GT`, add a secret `TOKEN`.
2. In **Cloud Sync → Custom endpoint**, paste the Worker URL + the same `TOKEN`, then **Connect**.

The app simply `GET`s the JSON and `PUT`s it back (with `Authorization: Bearer <TOKEN>`), so the same setup also
fronts any CORS-enabled store you can put behind that contract. iCloud isn't supported (it would need a paid Apple
Developer account + CloudKit); Apple-device users use Dropbox, OneDrive, or this custom endpoint in-browser.

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
