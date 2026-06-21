# Gym Tracker — Design & As‑Built Spec

A single‑file, offline‑first progressive‑overload gym tracker plus an exhaustive
exercise reference. Everything (UI, data, exercise library, glossary, anatomy chart)
lives in **`gym-tracker.html`** — no build step, no dependencies, no network. All
user data is stored in the browser via `localStorage`, with optional file/folder
sync on Chromium desktop.

Guiding principle surfaced throughout the UI: **beat last session** — more reps,
more weight, or more sets. Strength sets are compared with estimated 1RM,
`e1RM = weight × (1 + reps/30)`.

The feature backlog lives in **`Fitness App Features.xls`** (legacy BIFF `.xls`).
Status legend used there: **DONE** shipped · **ONHOLD** deferred.

---

## 1. File architecture

`gym-tracker.html` is one HTML document with three top‑level `<script>` blocks that
share the global scope:

| Block | Role | Key contents |
|------|------|--------------|
| **1 — App logic** | The tracker | `FAMILIES` (compact, machine‑readable exercise data with UUIDs), state & storage, auto‑save/load, themes, settings drawer, volume/muscle model, muscle/cardio analytics, gyms, body comp, log modal, **`render()`** (tracker) |
| **2 — Reference & glossary** | The reference panel | `icons`, `exercises` (rich human‑readable docs sharing the same UUIDs), importance/difficulty ratings, body‑position tables, `glossary`, anatomy chart, **`renderRef()`** (reference) |
| **3 — Nav switcher** | Top‑bar panel switching | `switchPanel()`, build stamp |

Two parallel exercise datasets are intentional: **`FAMILIES`** drives logging,
the picker, volume and tracking; **`exercises`** drives the reference documentation.
They share variation **UUIDs**.

> **Adding/removing a variation touches BOTH datasets.** Put the variation in the readable
> `exercises` block (full cue/setup/movement/mistakes/programming/position docs) **and** in the
> compact `FAMILIES` JSON (`{id, uuid, title, cue, tip, warning, best, subvariation}`) under the
> matching family — using the **same UUID** in both. Editing only `exercises` documents the move
> but leaves it unloggable (it won't appear in the tracker picker); editing only `FAMILIES` makes it
> loggable but undocumented. (E.g. the Freemotion functional-trainer variations — feat 59.)

> **Latent bug fixed earlier:** both blocks declared a global `function render()`;
> block 2's reference one clobbered block 1's tracker one after load. The reference
> function was renamed **`renderRef()`**. An init simulation (`node` + DOM stub) is
> used to confirm all three blocks evaluate with no runtime errors and that every
> render path executes. It has since caught real bugs (a `GYM_EQUIP` TDZ; a string
> escaping error) before they shipped.

### Panels, tabs & overlays
- **Top bar:** title · `📈 Tracker` / `📚 Reference` tabs · `📖 Glossary` · `⚙ Settings` · `? Help`
  (Reference vs Glossary now use distinct emoji — feat 48).
- **Tracker panel** tabs: `Log` · `History` · `Volume` · `Trends` · `Body` · `Gyms`.
- **Reference panel:** searchable/filterable movement library.
- **Overlays:** Settings drawer, Help panel, Glossary panel (with anatomy chart), Log modal, Notes modal.
- The Glossary overlay relocates to `<body>` on open so it works from any panel and is themed globally.
- **Glossary view (feat 59):** opens as a full page by default, or a right-side slide-in drawer
  (Settings → Reference → *Glossary view*, persisted as `glossaryAsPage`, default `true`). Same panel and
  content either way — page mode just drops the slide animation/backdrop and goes edge-to-edge. The panel's
  z-index sits above the top bar so its header/✕ are never occluded in either mode.
- **Settings drawer cleanup (feat 60):** the drawer template stays flat (`.drawer-section-title` + sibling
  rows); after every render, **`decorateSettingsSections()`** wraps each title + its following siblings into a
  collapsible `.drawer-section`, so the giant template is untouched. A header search box (kept *outside*
  `#settings-drawer-body` so it survives re-renders) drives **`applySettingsFilter()`** for row/section-level
  filtering. Collapse state is persisted in `state.settingsCollapse` (in `SETTINGS_KEYS`, so it survives reloads
  and is kept on merge-imports); the **Theme** section is collapsed by default (43 swatches were the bulk) and
  shows the active theme as a header hint. Theme swatches were also compacted (6 cols, 24px dots).
- **Internationalization groundwork (feat 61):** `t(key, params)` resolves a string for the active language
  (`state.lang`, persisted in `SETTINGS_KEYS`; default *and only* option `'en'`) with **current → English → raw
  key** fallback and `{name}` interpolation. **`applyI18n(root)`** translates static markup tagged with
  `data-i18n` (text) / `data-i18n-title` / `data-i18n-aria` / `data-i18n-placeholder` (attributes) and runs on
  load and on every **`setLang()`**. Adding a language is **data-only**: push to `LANGUAGES` (code + native name)
  and add a matching `I18N[code]` dictionary — the Settings → *Language* picker (built from `LANGUAGES`) and the
  switch machinery handle the rest. Only the top bar + settings chrome are wired so far; JS-rendered strings use
  `t()`, and section titles can be translated safely via a `data-sec-id` override (keeps collapse IDs stable).
- **Read-only mode (feat 62):** `state.readonly` (Settings → Preferences, default off). `isReadonly()` +
  `roBlocked(action)` gate the main write paths (`saveSets`, `startWorkout`/`endWorkout`, `deleteExercise`,
  history set-delete, `importData`, `saveBodyEntry`, `saveNotes`, gym add/delete/edit, reset-all); `render()`
  toggles a `body.readonly` class that hides the FAB and shows the `#ro-banner` indicator. Settings/preferences
  stay editable (so the mode can be turned back off).
- **Choice dialog + unsaved-set guard (feat 62):** `choiceDialog({title, message, choices})` is a reusable
  promise-based 3-button modal. `endWorkout()` now checks `hasUnsavedSets()` (unsaved sets sitting in `pending`)
  and forces **Save & end / Discard & end / Continue** before finishing via `finalizeEndWorkout()`. `saveSets()`
  now returns `true`/`false` so the dialog knows whether the save succeeded.
- **Biometric freshness (feat 63):** bodyweight exercises (`exMode().mode==='bodyweight'`) can't be saved with no
  recorded bodyweight (`getCurrentBodyweightKg()`). `startWorkout()` surfaces `biometricWarnings()` — bodyweight
  missing/stale by default (`warnStaleBodyweight`), other biometrics opt-in (`warnOtherBiometrics`, default off),
  threshold `biometricStaleDays` (default 14 ≈ 2 weeks). Configured in Settings → *Biometrics*.
- **OSK Next/Done swap + About (feat 62):** the on-screen numpad's *Next* and *Done* swapped places (Next → header,
  Done → primary action). Settings → *About* now carries an **Early Access** disclaimer, a *Built by Adam Eryavec,
  P.Eng. with Claude Code* credit, and the `APP_BUILD` stamp.
- **OSK calculator + log-set fixes (feat 65):** a persistent 🧮 toggle adds `( ) ÷ × − +` keys and a safe
  BEDMAS evaluator (`evalExpr`, input restricted to arithmetic) so `45+45×2` commits `135`. `addSetRow` now
  enforces ≤1 incomplete row (no more stacked blanks); the exercise picker re-renders results-only on keystroke
  (`renderPickerResults`/`bindPickerResults`) so the search ✕ no longer jiggles.
- **TTS + UI polish (feat 66/67):** `speakRandomTip()` reads a random cue/tip aloud on exercise select
  (`state.ttsTips`, default on). App-wide `user-select: none` (form fields exempt) — supersedes the old
  highlight→glossary gesture. Tips & Details has an *Open full reference entry* link (`openReferenceFor`).
- **Workout metronome (feat 69):** customizable audio+haptic beat (`state.metronome`: bpm/audio/freq/vol/haptic/
  accentEvery, in `SETTINGS_KEYS`). Engine is a `setInterval` ticker driving a WebAudio click + `navigator.vibrate`;
  on/off is **runtime-only and resets OFF on `startWorkout`/end**. Toggle + BPM ±5 live on the Log tab during a
  workout; full config in Settings → *Metronome*.
- **Muscle-volume roll-up fix (feat 69):** `MUSCLE_CONTRIB` uses head-level ids (e.g. `biceps-long/short`); the
  `'muscle'`-level Volume view never rolled them to the parent (`biceps`), so multi-head muscles read blank and
  only single-part muscles like **brachialis** showed. `getWeeklyMuscleVolume` now applies **`toMuscleContrib`**
  (head→parent) for muscle level, mirroring `toHeadContrib` for head level.
- **Workout plans (feat 70):** `state.plans` (in `SETTINGS_KEYS`, seeded once from `SEED_PLANS` — 8 plans:
  PPL / Upper / Lower / 2× Full Body / Core). A plan = `{id, name, steps:[{id, sets, options:[{type:'movement',
  familyId} | {type:'variation', uuid}]}]}` — ordered, **suggested-not-enforced** steps; each option is a whole
  movement or a specific variation. Optionally attached to a session via **`session.planId`** (changeable/
  abandonable mid-workout). On the Log tab `renderPlanGuide` shows the plan card (per-step `logged/target` sets,
  current/done state, tap-an-option to log it, **live ETA** from `computePlanETA` = remaining sets ×
  `computeRestStats` set+rest times, and a **⚠ gym** warning via `stepImpossibleInGym` when an active gym can do
  none of a step's options). The feat-55 auto PUSH/PULL/LOWER/CORE suggester (`computeRemainingWork`) is gated to
  run **only when no plan is attached**. The plan creator (the **`plan-creator` router page** since feat 184; was the
  `#plans-panel` overlay) is a full builder: list → editor (name, add/reorder/delete steps, per-step set count, add
  movement/variation options via a search picker) → use.
- **Plan descriptions, history & more plans (feat 71):** plans and steps carry an optional `desc` (shown on the
  card, list, and editor). Seeding is now **additive by id** with a `state.seededPlanIds` ledger (new seed plans
  append for existing users; deleted ones don't reappear) and **backfills descriptions** onto pristine seed
  plans. Library grew to **15** with rich theme/benefit blurbs, including **station / one-zone** plans (Squat
  Rack Strength, Dumbbell Corner, One Cable Station, Bench + Dumbbells) for staying posted up when the gym is
  packed, plus Arms Blaster / Glute Focus / Beginner Full Body. History (`renderSession`) shows a **plan badge**
  with full/partial completion (`stepStatus` over the session). The reference page's circular glossary **FAB was
  removed** — the top-bar 📖 is the single entry point.
- **Heart-rate monitor (feat 72):** **Web Bluetooth** (`navigator.bluetooth`, Android Chrome/Edge only) against the
  standard Heart Rate Service (`0x180D` / `0x2A37`) — connects to a BLE strap or a watch in *broadcast HR* mode
  (it cannot tap a watch bonded to its own app, or the phone's health store). `hrConnect()` (user gesture) picks +
  remembers the device in **`state.hrDevice`**; **`hrTryReconnect()`** auto-reconnects via `getDevices()` on load
  and at `startWorkout`, and a `gattserverdisconnected` retry loop keeps trying to get it back. Samples stream into
  **`session.hrSamples` = [[msFromStart, bpm], …]** at ~1 Hz (throttled saves); `hrFinalize` rolls them into
  `session.hr` avg/max on end. A Log-tab `renderHrBar` shows live BPM + connect/disconnect; **`renderHrChart`** draws
  the per-session trend with **set periods shaded** (`set.wTs→ts`) so the rise-during-set / recover-during-rest
  pattern is visible in history. Manual HR entry (feat 25) stays as the iOS fallback.
- **Garmin biometrics import (feat 73):** a browser cannot read Garmin directly (no public per-user API, internal
  Connect endpoints are non-CORS + behind SSO, no web access to the phone health store), so data arrives as a **file**.
  Body tab → **"Import biometrics"** (`#bc-import-btn`) reads a JSON or CSV via `importBiometrics()` →
  `parseBiometrics()`. **JSON** shape `{bodyComp:[{date, weightKg, bodyFatPct?, muscleMassKg?, boneMassKg?,
  bodyWaterPct?}], sleep:[{date, score?, note?}]}` (also accepts `weightLb`/`*MassLb`); **CSV** is tolerant — columns
  detected by header keyword (date/weight/fat/muscle/bone/water), unit inferred from the weight header (`lb`/`kg`,
  else `state.bodyCompUnit`). `normBiometricEntry()` normalizes to the canonical `bodyComp` entry (kg, noon-UTC date,
  rounded), merged **dedupe-by-calendar-day** exactly like `saveBodyEntry`. Sleep rows are matched to a workout's
  calendar day (`dayKey` anchors date-only strings to noon UTC so they don't slip a day in western TZs) and written to
  **`session.sleep`** (a short string, e.g. `"Score 78 · 7h12m"`), surfaced + editable in the workout-stats card
  (feat 25) and shown as `😴 …` in history. **`tools/garmin-sync.py`** (community `garminconnect` lib) logs in locally
  with the user's own credentials and writes that JSON from Index S2 body-comp + last-night sleep score. Kept lean:
  one optional sleep field, no per-metric ingestion beyond the S2 set.
- **Biometrics auto-load (feat 73):** Settings → Data → **"Biometrics Auto-Load (Garmin)"** picks a file or folder
  (`bioLoadPickFile`/`bioLoadPickFolder`) and **always merges** (never overwrites) — independent of the main
  Auto-Save/Load; `state.bioAutoLoad{enabled,mode}`. Unlike the main Auto-Load (memory-only handles), the handle is
  **persisted in IndexedDB** (`gymtracker-fs` store; tiny `bioIdbGet/Set/Del` wrappers) so it survives reloads.
  `bioLoadNow(silent, interactive)` restores it, checks `queryPermission` on boot (silent, no prompt) /
  `requestPermission` on the **Sync Now** gesture, then imports via `importBiometrics(text, {silent})`. Folder mode reads
  the newest file matching `bio|garmin|weight|gymtracker` (`.json|.csv|.txt`) by last-modified. Boot hook fires
  `bioLoadNow(true,false)` after the main auto-load. `importBiometrics` now takes `{silent}` and returns
  `{added, sleepN}` for status reporting.
- **Sound & haptics quick control (feat 74):** a top-bar button (`#app-sound-btn`, left of the glossary icon) opens a
  themed popover (`#sound-menu` + transparent backdrop, anchored under the button via `getBoundingClientRect`) to
  mute/adjust master **Audio** (toggle + volume slider) and **Haptics** (toggle), with a **Test** button and a
  "Sound settings →" link to the drawer. New master gate **`state.sound{audio,haptics,volume}`** (in `SETTINGS_KEYS`,
  normalized + volume-clamped) is enforced inside the four audio/haptic primitives — `safeVibrate` (haptics gate),
  `restBeep`/`metroBeep` (audio gate + `sndVol()` scaling), and `speakRandomTip` (audio gate + `u.volume`) — so one
  switch silences everything app-wide. Helpers `sndAudioOn/sndHapticOn/sndVol`. The icon reflects live state via
  `refreshSoundIcon()`: speaker glyph by volume (🔇/🔈/🔉/🔊) plus a 📳 badge shown only when haptics are on, and a
  dimmed `muted-all` state when both are off. Called on boot and after every change. Below the master controls a
  **"Per sound"** section (`soundSources()`) exposes the individual channels as 🔊/📳 chips wired straight to their
  settings — Metronome (`metronome.audio/haptic`), Rest cues (`workoutControls.feedbackBeep/feedbackVibrate`) and
  Spoken tips (`ttsTips`); the master switch still gates them all. Menu scrolls (`max-height`) on short screens.
- **Exercise reference media (feat 75):** attach form-reference clips (YouTube / Shorts, TikTok, Instagram Reels)
  to a variation and review them in a swipeable carousel popup. **`state.exerciseMedia{[uuid]:[{platform,vid,
  embedUrl,watchUrl,url,addedAt}]}`** (in `SETTINGS_KEYS`, normalized to `{}`), keyed by variation uuid — the same id
  Reference and Log Sets share. **`parseMediaUrl`** normalizes a pasted link → platform + embed URL: YouTube/Shorts/
  youtu.be/m. → `youtube-nocookie.com/embed/ID`, TikTok `/video/ID` → `tiktok.com/player/v1/ID`, Instagram
  `/reel|p|tv/CODE` → `/embed`; short links (`vm.tiktok`) and unknown hosts become **link-only** cards, non-domains are
  rejected. `add/get/removeExerciseMedia` (add is read-only-gated + de-duped). The **`#media-modal`** popover has a
  **carousel** mode (horizontal scroll-snap slides, lazy iframes loaded via `IntersectionObserver` so only the visible
  clip streams, dots, 9:16 frames / 16:9 for YouTube, an Open ↗ fallback when a clip can't embed — nothing is cached)
  and a **manage** mode (paste-to-add input + list + remove); empty opens to manage. Entry points: a 🎬 button in every
  Reference variation badge-row and a "🎬 Reference videos (N)" button in the Log-Sets exercise header.
  **Two levels:** media attaches to a **variation** (`v.uuid`) *or* a whole **movement** (`ex.id` = `fam.id` =
  `info.family.id`, shared across datasets). A variation's carousel — in Reference and Log Sets — merges its own clips
  **plus its movement's** (`openExerciseMedia(uuid, title, movementId)` → `combinedMediaItems()` de-dupes by embed/url
  and tags each slide "This variation"/"Whole movement"); manage mode shows one add/remove section per level. The
  Reference movement header has its own "🎬 Movement" button. `refreshMediaCounts()` recomputes every `[data-media-label]`
  badge (variation-only, movement-only, or combined via `data-media-mov`) without a re-render.
- **Reference compact views (feat 76):** a Detailed / 🌳 Tree / ▦ Table toggle (`#ref-view-toggle`, persisted in
  **`state.refView`** ∈ SETTINGS_KEYS) at the top of the Reference panel; `renderRef()` branches to `renderRefTree` /
  `renderRefTable` before its detailed render. **Tree** = collapsible movements → compact variation rows; **Table** =
  one row per variation (Movement · Variation · Group `megaBadge` · Meta). Both flag attached metadata *without* showing
  details via `refMetaBadges(uuid, movId)` — **📝** note (feat 54, per-variation) and **🎬**(+count) video links (feat
  75, own row only); the 🎬 badge opens the carousel (`stopPropagation`), tapping the row elsewhere calls `refDrillTo` to
  jump to the full detailed entry (expanded + scrolled, toggle re-synced). `syncRefViewToggle` keeps the segmented
  control in sync.
- **Strava reconciliation (feat 77):** link logged workouts to Strava strength activities (usually watch-synced). A
  browser can't reach Strava directly (OAuth needs a client secret + no CORS), so activities arrive as a **file**:
  `tools/strava-sync.py` (stdlib-only OAuth + `/athlete/activities`, writes `strava-activities.json`; `--push` PUTs
  descriptions back) or a Strava bulk-export `activities.csv`. **Settings → Data → Strava**: Import → `parseStravaActivities`
  (JSON raw-API or normalized, or quoted-CSV) → `normStravaActivity` → merged into **`state.stravaActivities`** (∈
  SETTINGS_KEYS, dedupe by id). `reconcileStravaBuckets()` does a **greedy 1:1 start-time match** (±`STRAVA_MATCH_WINDOW_MIN`
  = 120) into **linked / proposed / gymOnly / stravaOnly** (`isStrengthType` filters WeightTraining/Workout/etc). The
  reconcile overlay (`#strava-modal`, reuses the media-modal box) lists the buckets with per-row **Link / Unlink**, **Link
  all**, and **📋 copy description**; `linkStrava` sets `session.stravaId` and **enriches** the session (backfills
  `hr{avg,max,calories}` if empty; derives `endedAt` from `elapsed_time` for past sessions). `stravaDescriptionFor`
  builds an exercise/top-set/volume summary; `exportStravaPush` writes a `strava-push.json` for the script. `strava-token.json`
  + generated sync files are git-ignored.
- **Equipment "X Setup" pickers in the OSK (feat 78/79):** seven loading tools (`SETUP_KINDS`) — **Barbell** (renamed
  from Plate Loader; bar + per-side plates, smith via bar option), **Dumbbell** (per-hand / total-×2), **Kettlebell**
  (single / double), **Medicine Ball**, **Plate Picker** (plate sum), **Landmine** (loaded-end plates + optional bar),
  **Pin Setup** (stack stepper with adjustable increment + add-on **toppers**) — surfaced two ways from one source of
  truth via a namespace `ns` (`'inl'` | `'np'`): the **inline** sets-form panel (`renderSetupInline`, only when the OSK
  is off) and the **OSK** strip (`renderNpSetup`, top of the numpad on a weight field) — a chunky **"{icon} {label}:
  {total}"** button + a ⚙ configurator (`renderSetupBody`/`bindSetup`); tapping commits the weight and advances to reps
  (`commitSetField` → `numpadNext`). **Default assignment is per-variation**, not family-wide: `autoSetupKind` reads the
  variation's own title/id tokens (e.g. "Smith"→barbell, "Roc-It"→pin, "MTS/Iso-Lateral"→plate, "Landmine/Meadows",
  "Goblet"→dumbbell), excludes bodyweight (`exMode` + title) and time/distance, and for silent strength variations falls
  back to the **family's primary (first-listed) `equip`**. A per-variation **override** (`state.exerciseSetup`, ∈
  SETTINGS_KEYS) via the in-configurator Tool selector sets a specific tool or **None**. State is `modalState.setup[kind]`
  / `modalState.setupOpen` (reset per exercise); `setupTotal`/`plateSum` compute the loaded weight.
- **Pin profiles + picker graphics (feat 80):** Pin Setup gains **named machine profiles** — `state.pinProfiles`
  (`[{id,name,inc}]`, ∈ SETTINGS_KEYS): a "Machine profile" row of saved-stack chips (tap to apply that machine's
  increment, ✕ to delete) plus **＋ Save** (names the current increment via `prompt`); the active one is tracked on the
  pin state's `profileId`. And every picker now shows a **stylized theme-matching SVG glyph** via `setupIconSvg(kind)`
  (barbell/dumbbell/kettlebell/med-ball/plate/landmine/pin, `stroke="currentColor"` so it inherits the button's accent)
  in place of the emoji on the chunky OSK button and inline toggle/header.
- **Live loaded-barbell illustration (feat 81):** `renderBarbellSvg(st)` draws the plates actually on the bar inside
  the Barbell Setup configurator — symmetric, largest plate inside-out, **height ∝ weight**, theme-coloured by size band
  (`--accent` / `--accent2` / `--text3`), with a `+N more per side` label past 11 plates. Built from the same
  `st.plates` map, so it updates live on every add/remove.
- **Baseline-adaptive plans + intensity/ETA (feat 82):** plan steps carry a relative **`load`** (`light`/`moderate`/
  `heavy` → 0.7/0.85/0.95) and plans a **1-5 `intensity`**. `baselineWeightVar` (heaviest set in the most recent
  session that trained a variation) × `loadFactor(load)`, rounded to the unit increment, yields a **suggested working
  weight** shown per step in the plan guide ("heavy · ≈190lb", with a "% of baseline" tooltip). Starting a step seeds
  that weight into the first set **and pre-loads the matching equipment picker** (`_planLoadCtx` threaded through both
  `startExerciseFromSuggestion` and the picker-tap path → `seedSetupForWeight` → `solveSetupState`: `greedyPlates` solves
  a barbell/plate/landmine loadout, `nearestInList` snaps dumbbell/kettlebell/med-ball, pin rounds to its increment).
  `estimatePlanMinutes` (≈2.5 min/set + 1/exercise, **rounded to 15 min**) and `intensityDots` show on plan cards + the
  guide. Six new seed plans (Heavy Lower, Upper Hypertrophy, Express 30, Posterior Chain, Powerbuilding A, Athletic Full
  Body); `intensity`/`load` backfilled for existing users in the seed-merge.
- **Plan video (feat 83):** a plan can carry **one** attached web video — `plan.media` (a normalized `parseMediaUrl`
  item, persisted on `state.plans`). Attached/removed in the plan editor (paste a YouTube/Shorts/TikTok/Reel link →
  Attach; shows platform + Preview/🗑). Watched read-only via `openPlanMedia(planId)`, which reuses the feat-75
  `#media-modal` through a new explicit-list path: `_mediaCtx.items` makes `combinedMediaItems` return the given clip(s)
  and `renderMediaModal` hides the Manage button (editing lives in the plan editor). A 🎬 button surfaces on the plans
  list row and a "🎬 Watch" on the live plan guide.
- **Bulk exercise-media population (feat 84):** a browser can't enumerate a creator's YouTube Shorts or hold a Data-API
  key, so matching runs in **`tools/youtube-media.py`** (stdlib; resolves a channel handle → uploads, keeps Shorts
  ≤~60 s, fuzzy-matches video titles to exercises by token coverage, emits real `/shorts/<id>` URLs only where matched —
  no fabricated IDs). **Settings → Data → Exercise media**: `exportExerciseList()` dumps
  `{movements:[{id,title}], variations:[{uuid,title,movement}]}` for the script; `importExerciseMediaMap()` ingests the
  result `{media:[{uuid|id|match, url, source?}]}` → `resolveExerciseKey` (uuid → id → normalized exact/contains title)
  → `parseMediaUrl` → merged into `state.exerciseMedia` (de-duped; reports added/unmatched/dup/bad). Default channels:
  `@fitonomycoaching`, `@pathradecha`.
- **Deferred-trio cleanup (feat 85):** (1) **Equipment setup now persists within a workout** — the picker no longer
  wipes `modalState.setup` on every exercise switch (only collapses `setupOpen`); it's cleared instead at `startWorkout`
  and `finalizeEndWorkout`, so a loaded bar/dumbbell/pin config carries by type across exercises. (2) **Plan builder edits
  load + intensity** — `renderPlanEditor` gains a 1–5 intensity pill row (per plan) and a light/moderate/heavy load pill
  row per step (`data-plan-intensity` / `data-step-load`), so custom plans drive the feat-82 suggested weights too. (3)
  **Resizable SETS panel** — the sets list lives in `.sets-section` with a sticky header and a `.sets-scroll`
  (`resize: vertical`, `max-height`, internal scroll), and `.tips-content` is capped at `38vh` with its own scroll, so a
  long Tips section can never bury the sets.
- **Themed dialogs everywhere (feat 86):** every remaining native `confirm()`/`prompt()` is replaced by themed,
  Promise-based dialogs built on the `choiceDialog` sheet — `confirmDialog(msg, {title,okLabel,danger})` → `Promise<bool>`
  and `promptDialog({title,message,placeholder,…})` → `Promise<string|null>` (with a `.choice-input`). Converted sites:
  end-workout, reset-all, delete-all-history (now a 3-way export/delete/cancel `choiceDialog`), delete-set, delete-exercise,
  clear-notes, custom-variation name, pin-profile name, and `guardedConfirm`'s fallback. **`saveSets` is now async**
  (`Promise<boolean>`): the commit logic is extracted into an inner `commit()` gated behind `confirmDialog`, and its one
  return-value caller (the end-workout "Save & end" path) was updated to `.then`. No `confirm`/`prompt`/`alert` calls
  remain.
- **Smith/custom bar + assign-picker-from-Reference (feat 87):** Barbell Setup gains a **custom bar weight** input
  (`data-{ns}-barcustom` → `st.bar`) alongside the preset pills, and detects **Smith** variations (`isSmithVar`, title/id
  match) — `barbellBars()` swaps in counterbalanced-carriage presets (`[15,20,25,45,0]` lb), `defaultSetupState` seeds a
  lighter 25 lb / 15 kg default, and the body shows a "Smith carriage — effective weight" label + note. And the
  per-variation **loading-tool override** (`state.exerciseSetup`) is now assignable **from the Reference panel** too: each
  variation body with a relevant tool shows a `🛠 Loading tool` `<select>` (Auto · {detected} / 7 kinds / None) wired to
  `setSetupOverride` — which also lets you re-enable a tool after setting it to None.
- **Mix sub-variations in one log (feat 88):** a default-OFF setting (`workoutControls.mixSubvariations`, Settings →
  Workout Session) lets you pick a **sub-option per set** for exercises that have a subvariation (grip/bar/angle). When
  on (and not editing), each set row in the Log modal gets a `.set-sub-select` (`data-set-sub` → `set.subUuid`); on save
  `saveSets` tags each valid set with its sub and **groups them into one exercise entry per sub** (so each grip tracks
  separately under its own `varUuid|subUuid`), stripping the temp field. Off (default) = the original single-sub
  behaviour; editing mode always uses the one selected sub.
- **Strava activities auto-load (feat 89):** mirrors the feat-73 biometrics auto-load for Strava — `state.stravaAutoLoad
  {enabled,mode}` (∈ SETTINGS_KEYS), `_stravaLoad{File,Dir}Handle`, and `stravaLoad{NewestInDir,Apply,Now,PickFolder,
  PickFile,Disable}` reusing the same `bioIdb*` IndexedDB handle store (keys `stravaDir`/`stravaFile`). Pick a folder/file
  (e.g. where `strava-sync.py` writes); the handle persists across reloads, and on boot (`stravaLoadNow(true,false)`) +
  "Sync Now" it imports the newest `strava|activities|gymtracker` file via `importStravaActivities(text,{silent})` (which
  gained a silent option) — always merging. Settings → Data → Strava shows the auto-load controls (gated by
  `autoLoadSupported`).
- **Coaching & Progression tab + new disciplines (feat 90):** a third top-level panel (`panel-coaching`, 🧭) built
  from the bundled `/Guides` (endurance reference, bouldering, Captains-of-Crush grip). `renderCoaching()` builds three
  cards (Endurance / Bouldering / Grip & Digit Strength) from a `COACHING` data array — distilled cues, zone models,
  progression protocols and the CoC gripper ladder. **Crosslinking:** each card's chips call `openInReference(search,
  mega)` (sets `#ref-search` / clicks a mega pill, then `switchPanel`); a guide chip opens the full bundled guide; and
  the Reference panel carries a `coach-banner` back to the tab (`goPanel`). **New trackable families** arrive via a new
  `EXTRA_FAMILIES` + `applyExtraFamilies()` injector (mirrors `EXTRA_VARIATIONS`, pushes whole families into `FAMILIES`
  + `VAR_INDEX` + the Reference `exercises`): `neck-training` (mega `neck`), `jaw-training` (mega `jaw`), and `climbing`
  (mega `cardio`, so `isCardioVar()` logs **bouldering as a cardio session**). Grip/digit work (pinch hold, support
  hang, thick-bar, finger-extension band) is added to the existing `grip-training` family via `EXTRA_VARIATIONS`; the
  keyword-driven `exMode()` already routes holds/hangs → time and the rest → weight×reps. **Trainable muscles updated:**
  `forearms`, `neck`, `jaw` added to `BP_LABELS` + `BODY_PARTS`; a `FOREARM_FAMILIES` override in `getBP()` reclassifies
  grip/wrist work (sourced as `pull::arms` → biceps) to `forearms`, and `BP_MAP` gains `neck::strength`/`jaw::strength`/
  `cardio::climbing`. Covered by `test/coaching.spec.mjs`.
- **Guides baked into the single file + in-app themed reader (feat 91):** the three `/Guides` HTML docs are
  embedded into `gym-tracker.html` as inert, marker-delimited `<template id="guide-*">` blocks by
  `tools/embed-guides.mjs` (idempotent — re-run when a guide changes; strips their external font `<link>`s to stay
  offline). The Coaching tab's guide chips are now buttons → `openGuide(gid)` opens a full-screen reader
  (`#guide-reader`, z-index above the app chrome) whose `<iframe srcdoc>` = the template's HTML +
  `buildGuideTheme()`. That override reads the app's **live** theme (`getComputedStyle` of `--bg/--bg2/--bg3/--text/
  --text3/--accent/--border2` + the body font) and injects it over each guide — remapping bouldering's CSS variables
  (`--paper/--ink/--tape`…) and the hard-coded dark palettes of the coc/endurance guides — so all three adopt the app
  theme + font (bouldering flips from its light "field-guide" look to dark). The iframe still runs each guide's own
  script, so the collapsible coc cards and the data-driven endurance reference (69 topics built at runtime) keep
  working. The app is now fully self-contained — distribute `gym-tracker.html` alone. `test/check.mjs` strips the
  `GUIDES:START…END` block so the embedded guides aren't linted as app code. The reader (which covers the app's top
  nav) is escapable three ways: a prominent **✕ Close** button (safe-area-padded so it clears a phone notch), the
  **Escape** key, and the **device Back button** (open pushes a history entry; `popstate` closes the reader without
  leaving the app).
- **UI tap feedback on every button (feat 92):** `state.uiFeedback {audio,haptic}` (default **ON**, ∈ SETTINGS_KEYS)
  drives a single capture-phase `click` listener (`uiTapFeedback`) on `document`. For any interactive target —
  `_uiFeedbackTarget()` matches semantic controls (`button`/`a`/`[role=button]`/`[onclick]`/`select`) or, for the app's
  clickable divs, walks up to 4 ancestors looking for `cursor:pointer` — it plays a crisp `uiClickSound()` (a short
  1100→620 Hz triangle blip on the shared `_restAudioCtx`) and a `safeVibrate(8)` buzz. Both still route through the
  feat-74 master gates (`sndAudioOn`/`sndHapticOn` + volume), and a new **"Button taps"** row in the sound quick-menu
  toggles the audio/haptic independently. Capture phase means it fires even when a handler stops propagation; text
  inputs (cursor `text`) are skipped. Covered by `test/feedback.spec.mjs`.
- **Installable HTTPS PWA + deploy (feat 93):** the app ships as an offline-first PWA on GitHub Pages.
  Added `manifest.webmanifest` (standalone, dark theme, 192/512/maskable icons generated by
  `tools/make-icons.mjs`, which rasterises a branded dumbbell SVG via the Playwright we already depend on),
  a `sw.js` service worker (network-first for the document so it's fresh online + cached offline,
  cache-first for assets; cache `gt-cache-<build>` stamped from `APP_BUILD` at deploy, old caches purged on
  activate), and `<head>` meta + manifest/apple-touch links + an inline SW registration (skipped on
  `file://`; toasts "reopen to apply" when a new SW is waiting). `.github/workflows/deploy.yml` runs the
  static check, embeds the guides, assembles `_site/` (`gym-tracker.html`→`index.html` + manifest + sw +
  icons, `__BUILD__` stamped) and publishes to Pages on push to `dev`. `gym-tracker.html` stays the
  single-file source; the PWA files are deploy artifacts. `test/check.mjs` validates the PWA assets and
  `test/pwa.spec.mjs` checks the manifest, head wiring, and that the SW registers + caches the shell.
  *(Phase 1 of the PWA + Google-Drive-sync plan; data-model hardening + Drive sync follow.)*
- **Open-source / going-public legal (feat 94):** added a top-level `LICENSE` (MIT, © 2026 Adam Eryavec)
  and a single in-app disclaimer source, `legalDisclaimerHtml()`, surfaced in both **Help** (a "Disclaimer
  & licence" section) and **Settings → About** (a collapsible `<details>`): not-professional-advice +
  exercise-at-your-own-risk, no-warranty (MIT), trademarks-belong-to-owners / not-affiliated (Captains of
  Crush, Hoist/Roc-It, Life Fitness, Strava, Garmin, …), data-stays-local, and a references note. A license
  + disclaimer banner comment heads `gym-tracker.html`. README gained Disclaimer / Privacy / Trademarks /
  License sections + a MIT badge; `tools/garmin-sync.py` and the README flag that the Garmin helper uses the
  *unofficial* `garminconnect` library (Strava/YouTube helpers use official APIs). Audit confirmed: no
  bundled third-party libraries (vanilla single file; Playwright is a dev-only Apache-2.0 dep), no committed
  secrets, no remote fonts/CDN/trackers. Covered by `test/legal.spec.mjs`.
- **Sync data model (feat 95):** the foundation for cross-device Google Drive sync (Phase 2 of the plan).
  Every session now carries a stable `id` (`newSession()` → `crypto.randomUUID()`) + `updatedAt`; existing
  sessions are backfilled on load (`normalizeState` sets `updatedAt = endedAt || date` but **NOT** an id — so
  two devices migrating the same legacy session don't fork into duplicates; legacy sessions key by date).
  Deletions push a tombstone to `state.deletedSessions [{id, deletedAt}]` (`deleteExercise` session-removal,
  the full `finalConfirmDeleteAll` wipe; pruned > 1 yr). `touchSession()` bumps `updatedAt` on the non-set
  edits (cardio, notes, sleep, HR, Strava link); set logging needs none since `sessionTs()` already takes the
  newest set `ts`. `applyImport()`'s merge mode was rewritten from a naive date-merge into a **last-write-wins
  union**: sessions keyed by `id || 'd:'+date`, newest `sessionTs` wins, tombstones drop a session only when
  the deletion is at least as new as its last edit, and settings do a coarse whole-object LWW via a
  `saveState`-stamped top-level `savedAt`. Covered by `test/sync.spec.mjs`.
- **Tracker button press timing (feat 96):** `state.trackerPress { shortMs, longMs }` (default `{0, 2000}`, ∈
  SETTINGS_KEYS, in Settings → Preferences) defines a **short tap** (released ≥ `shortMs`; 0 = instant) vs a
  **press-and-hold long-press** (held ≥ `longMs`) that fires a *separate* shortcut, for Tracker-tab buttons.
  `longMs` is always kept ≥ `shortMs` + 1 s. `attachTrackerPress(btn, onShort, onLong, label)` classifies the
  press (reusing the `attachLongPress` `lp-holding` fill + a haptic on long-press; a release under `shortMs` is
  ignored as an accidental tap). The long-press time also now drives the existing destructive **hold-to-confirm**
  (`attachLongPress` defaults its hold to `trackerPress.longMs`). Specific per-button long-press shortcuts are
  wired on request. Covered by `test/press.spec.mjs`.
- **Tracker log UX pass (feat 97):** removed the wasted "Gym management moved" disclaimer from Settings; capped
  the in-modal Tips panel at 22vh (was 38vh) so an open Tips section no longer pushes the Sets pane off-screen;
  made the **on-screen numpad the default** (`workoutControls.onScreenNumpad`), which moves the plate/pin/bar
  **equipment setup into the keypad as a ⚙ toggle** (`renderNpSetup`) instead of the inline configurator — keeping
  the Sets pane visible on mobile; added rep-range **ghost text** under the numpad when entering reps (Strength
  1–5 · Hypertrophy 6–12 · Pump 15–20+). Also extended `attachTrackerPress` (feat 96) with a **two-phase progress
  indicator**: a charging fill toward `shortMs` (the accidental-tap "arming") then toward `longMs`, with an
  `lp-armed` accent-tint once the tap is valid (an instant tap with no long action shows nothing). Covered by
  `test/press.spec.mjs`.
- **History outlier review (feat 98):** `findOutlierSets()` scans weighted (standard-mode) history and flags a
  set as a likely **data-entry slip** when its weight exceeds the configured limit (`maxWeightLb`), its reps are
  absurd (> 100), or its e1RM is more than 3× this exercise's own median (needs ≥ 4 samples as a baseline — robust
  to the outlier itself). The History list prepends a **⚠️ review card** with per-set **Keep** (sets `set._ok`, a
  vetted flag that travels in export/sync so a confirmed-real PR is never re-flagged) and **Delete** (removes the
  set, prunes an emptied exercise, tombstones an emptied session). Read-only mode blocks edits. Covered by
  `test/history.spec.mjs`.
- **Top-bar long-press shortcuts (feat 99):** each top-bar icon gains a press-and-hold shortcut layered over its
  normal tap. `attachTopbarLongPress(btn, onLong, label, holdMs=550)` reuses the `.lp-holding` progress fill, fires
  a confirm haptic, and **swallows the trailing click** via a *document* capture-phase listener (so it beats the
  button's earlier-registered inline `onclick`). Shortcuts: **🔊** mute audio + haptics (`topbarMuteAll`); **📖**
  glossary search of the current muscle target (`BP_GLOSS_TERM[bp]` → `openGlossaryTo`); **📚** open the current/last
  variation in Reference (`openReferenceFor`); **⚙️** jump to the most recently changed setting (a drawer-body
  change/click listener records `state.lastSettingAnchor {id,sec}`; `openSettingsToLastChanged` expands the section,
  scrolls, and flashes it); **🧭** scroll Coaching to the most relevant card (`coachingCardForExercise` →
  endurance/bouldering/grip); **❓** unchanged (tap == hold). `currentOrLastExercise()` (active log → newest history)
  is the shared context. Covered by `test/topbar.spec.mjs`.
- **Numpad digit long-press ×10 (feat 100):** an on-screen-keypad digit **tapped** appends as before, but **held**
  (≥ 400 ms) from an *empty* field enters that digit ×10 (hold `7` → `70`) — a fast path for round numbers. With
  digits already present, or in calculator mode, a hold is just a normal short press. `bindNumpadKeys` now routes
  digit keys through `attachNumpadDigit` (self-contained pointer tap/hold, no document listener — safe under the
  numpad's frequent re-render) and the shared key logic was extracted to `numpadHandleKey(k)`. The ×10 fires
  `numpadHandleKey(k)` then `numpadHandleKey('0')`, shows a `×10` hold hint + the `lp-holding` fill. Covered by
  `test/numpad.spec.mjs`.
- **Rename "subscription" → "subvariation" (feat 101):** the variation sub-option concept was historically named
  `subscription` (a confusing word implying payment). Renamed the data property (`variation.subvariation`), every
  accessor, the `subvariations` lookup table, the `.var-subvariation` CSS class, the Trends `subvariation` dimension +
  its tab label, and comments — 819 lowercase + 2 capitalized occurrences, a same-length swap (both words are 12
  chars) so byte size is unchanged. **Safe** because persisted user data keys by `subUuid`, never the word
  `subscription`; the rename is confined to the static `FAMILIES`/`exercises` datasets and code. (Aligns with the
  already-"subvariation" `workoutControls.mixSubvariations` control.)
- **History filtering + time bounds + all-time link (feat 102):** the History list gains a filter bar —
  a **time window** (`HISTORY_RANGES`: all / year / 6mo / 3mo / month / week) plus cascading **body part → movement
  → variation** dropdowns and a debounced **text search**. State lives in `state.historyFilter
  {range,bp,family,varKey,q}` (device-local, not in `SETTINGS_KEYS`). `historyAggregate()` rebuilds the per-key
  stats over only the sessions/sets passing the window + filters (`exPassesHistoryFilter`); `historyFilterOptions()`
  builds the dropdown options present in-window, honoring parent selections so they cascade. The list is split into
  its own `#hist-list` so the text search re-renders **list-only** (keeps input focus); dropdown changes do a full
  re-render. A variation's **detail** now respects the window and, when one is active, shows a **🕘 View all-time**
  link (`#trk-all-time`) that drops the window. The outlier-review card (feat 98) was extracted to
  `buildOutlierReviewHtml()` and stays **filter-independent** (data hygiene is always surfaced). Covered by
  `test/historyfilter.spec.mjs`.
- **Metronome mantra mode (feat 103):** a `metronome.mantra` toggle (Settings → Metronome) makes the metronome
  **chant the current exercise's setup cues** on each beat instead of beeping — a looping, hypnotic form reminder.
  `metroNextMantraTip(ex)` cycles `collectExerciseTips(ex)` (cue / tip / family setup·movement·mistakes) by a module
  index; `metroSpeakNextTip` speaks it via `speechSynthesis`, guarded by `_metroSpeaking` (waits for the previous
  utterance's `onend` so a fast tempo doesn't clip words — the cues self-pace to speech length) and the master audio
  gate. The target exercise is the pending log exercise, else `currentOrLastExercise()`. `stopMetronome` cancels any
  in-progress chant. Covered by `test/metronome.spec.mjs`.
- **Metronome set-active gating + rest-cue timer (feat 104):** two parts. (1) `metronome.setActiveOnly`
  (**default on**) makes `metroTick` stay silent unless `metroSetActive()` (an open set — weight entered, reps
  pending) so the beat only sounds while you're actually repping; an Off pill restores free-run. (2) A **separate,
  configurable audible rest timer** `state.restCues {enabled,mode,target,interval,countdown,endCue,audio,haptic,freq}`
  (in `SETTINGS_KEYS`, default **off**), independent of the recommended-rest zone beeps. `restCueTick()` (hooked into
  the 1 Hz `restTick`, fires ≤ once per integer second via `_lastRestCueSec`) emits, during same-exercise rest:
  **count-up** interval beeps + an end cue at `target`; or **countdown** interval beeps, a per-second tick over the
  final `countdown` seconds, and a distinct triple end cue at zero. Countdown mode also shows `⏳ remaining` on the
  rest bar. Both configured in Settings → Metronome / Rest timer cues. Covered by `test/restcues.spec.mjs`.
- **Headphone-only audio (feat 105):** `state.audioHeadphonesOnly` (**default on**) suppresses *audio* output (every
  beep/cue/TTS — never haptics) unless it's routed to headphones, so the app never blares through a phone speaker in
  a public gym. Browser output detection is **best-effort**: `probeAudioOutput()` reads `audiooutput` device labels
  (`enumerateDevices`, refreshed on `devicechange`) and matches a headphone/bluetooth regex. `headphoneGatePasses()`
  blocks **only** when the setting is on AND we *positively* detected speaker-only (`_headphonesConnected === false`);
  when labels are hidden (no permission) or the API is absent it **fails open** (`null` → allowed) so audio is never
  silently broken. The gate is added to the four audio emitters (`metroBeep` / `restBeep` / `uiClickSound` /
  `metroSpeakNextTip`) + `speakRandomTip`. Settings shows live status + an optional **enable-detection** link
  (`unlockHeadphoneDetection` — a one-off `getUserMedia` to reveal device labels, then stops the track). Covered by
  `test/headphones.spec.mjs`. *(Caveat: on Android Chrome without the optional permission, labels are hidden →
  detection is unknown → fail-open, so the gate is effectively inert until the user enables detection.)*
- **Auto-connect HR on workout start (feat 106):** `workoutControls.hrAutoConnect` (**default on**, toggle in
  Settings → Workout, only shown when `hrSupported()`) gates the existing `startWorkout()` → `hrTryReconnect()` call,
  so each workout silently re-attaches your last heart-rate monitor (no chooser) — or not, if you turn it off. The
  reconnect uses `navigator.bluetooth.getDevices()` (no user gesture needed for a remembered device). Covered by
  `test/hrconnect.spec.mjs`.
- **Change-exercise / add-note buttons + picker escape hatch (feat 107):** the log modal's **Change exercise** and
  **Add note / edit** controls became real `<button>`s (proper tap targets + button styling) instead of tiny
  underlined text spans. And because tapping Change exercise opens the picker without clearing `pending.varUuid`, the
  picker now renders a **← Back to {current}** button (`#trk-picker-back-current`, shown when there's a current
  exercise and you're not editing/superset-picking) that sets `showPicker = false` to return to the in-progress
  exercise unchanged — recovering a mis-tap. Covered by `test/changeexercise.spec.mjs`.
- **Long-press End Workout skips the confirm (feat 108):** the **End Workout** button now uses `attachTrackerPress`
  (feat 96/97) instead of `setupConfirmButton`: a **tap** runs `endWorkout(false)` (the themed confirm dialog), a
  **long-press** runs `endWorkout(true)` (ends immediately, skipping the popup) — with the two-phase charging
  progress indicator, and independent of the global hold-to-confirm setting. A hold shorter than the threshold still
  falls back to the confirm dialog (accidental-press safety). Covered by `test/endworkout.spec.mjs`.
- **Data management as its own page (feat 109):** all data rows (Export/Import JSON, Export Workout/CSV, Activity
  Log, Auto-Save, Auto-Load, Biometrics, Strava, bulk Exercise media, Reset) moved out of the Settings drawer into a
  full-screen **Data Management page** (`#data-page`). Implementation avoids relocating ~340 lines of HTML + bindings:
  the sections still render inside the drawer wrapped in `#drawer-data-wrap`, and `renderSettingsDrawer` then **moves
  that wrapper node** (with its already-attached event listeners riding along) into `#data-page-body` — leaving only
  an "📦 Open Data Management →" entry button in Settings. `openDataPage()`/`closeDataPage()` toggle it; re-renders
  (from data actions) rebuild + re-relocate, so the page stays live. Covered by `test/datapage.spec.mjs`.
- **Desktop bulk media wizard (feat 110):** a desktop-only full-screen tool (`#media-wizard`, gated by
  `isDesktopWizard()` = File-System-Access support or a wide fine-pointer viewport; entry button in the Data page's
  Exercise-media section) to manage reference links across **every** exercise at once. `renderMediaWizard()` lists
  variations (search, "with media only" toggle, capped at 150) each with their links; per link: an embeddable/link-only
  badge, **↗ open** (new tab — the "test"), **→ move** (`reassignMedia` to another variation via an inline 2-char
  search picker), **✕ delete**; per row an **add-link** input. **↻ Re-test all** (`mediaWizardRetestAll`) re-parses
  every link to refresh `embedUrl`/platform. Reuses the existing `parseMediaUrl`/`add`/`removeExerciseMedia` API.
  Covered by `test/mediawizard.spec.mjs`.
- **Plan-progress dashboard (feat 111):** `renderPlanGuide` now shows, per step, **sets hit** (`logged/target ✓`) and
  an **effort badge** (`stepEffort` — did the heaviest logged set reach the step's `load`-derived target weight,
  within 3%; n/a when there's no baseline) plus a live roll-up line (`planExecutionSummary`: sets, steps, effort
  hits) and **ETC ~Nmin · ETA clock**. A **comparison line** (`findPlanExecutions`) shows the **most-recent** and
  **all-time-best** prior runs of the same plan (best by stored `finalScore.points`, else set count; either may be
  absent or the same run). Because step→exercise matching is by exercise (`stepLoggedSets`/`optionMatchesVar`),
  progress is **retroactive across a mid-workout plan change** — sets logged under the old plan count toward the new
  plan's matching steps automatically. Covered by `test/plandash.spec.mjs`.
- **Plan-aware picker (feat 112 + 115):** when a plan is active, the exercise picker shows its **incomplete steps as
  chips** (`renderPicker`); tapping one sets `modalState.planStepFilter` so `filterVariations()` returns **exactly
  that step's exercises** — the union of its options (`stepQualifyingVarSet`) — **overriding** the mega/sub/equip
  pills (a set no normal filter could produce). A "✕ all exercises" chip clears it. From the **dashboard**, tapping a
  `.plan-step` calls `openStepPicker(idx)` to open the same filtered picker (and seeds the suggested weight via
  `_planLoadCtx`). The filter clears on pick / modal close. Covered by `test/planpicker.spec.mjs`.
- **Log-Sets current-step indicator (feat 116):** the strength Log-Sets form now leads with a banner
  (`planStepIndicatorHtml`) naming the plan step the current exercise belongs to (`planStepForVar` — earliest
  incomplete matching step), its **sets logged/target with a progress bar**, and whether the **effort is on target**
  (`stepEffort`). Off-plan exercises get a muted "not part of any plan step" note. Covered by `test/logstep.spec.mjs`.
- **Plan-complete popup + post-save picker routing (feat 113 + 114):** when the plan finishes, the card shows a
  **🎉 complete banner** (End / Summary) and `showPlanCompleteDialog()` pops a summary (steps, sets, effort, time, vs
  best) offering **End workout / Keep training**. And `saveSets` no longer drops you on the dashboard after a save —
  it routes to the **exercise picker** instead: blank/unfiltered with no plan, or **pre-filtered to the earliest
  incomplete step** (`currentPlanStepIndex` → `planStepFilter`, seeding `_planLoadCtx`) with a plan. **Exception:** a
  save that *just completed* the plan (`planExecutionSummary().complete` flips false→true) closes to the dashboard and
  fires the complete dialog. A new `endingWorkout` arg keeps the end-workout "save & end" path on its old close-to-
  dashboard behavior (the Save button calls `saveSets()` with no event arg). Covered by `test/postsave.spec.mjs`.
- **"All relevant trends" deep-link (feat 117):** a 📈 button on the **Reference** variation row and the **Log-Sets**
  form calls `openTrendsFor(varUuid, subUuid)` → sets `trendFocus`, switches to the Trends tab, and renders a focused
  view (`renderFocusedTrends`) with three cards from `buildFocusedTrends`: the exercise's **own subvariation** trend
  (`getSeriesForKey`), its **muscle** trend (body-part `bp`-grouped), and its **muscle-group** trend (mega-category
  grouped) — each via the existing `computeTrend`/`renderTrendCard`. A "← All trends" button clears the focus.
  Covered by `test/trendfocus.spec.mjs`.
- **Custom hi-res anatomy chart + OCR mapping (feat 118):** the glossary anatomy chart gains a **Simple** (built-in
  wireframe) vs **Detailed** view toggle. Uploading a hi-res labelled chart stores it in IndexedDB
  (`bioIdb*` 'anatomyChartImage'), unlocks + defaults to **Detailed**, and renders the image with clickable **tap
  hotspots** (each → `openGlossaryTo`). The hotspot map (`state.anatomyChart.map`, normalized 0..1 coords keyed to
  glossary terms) is produced offline by a new **desktop helper `tools/anatomy-ocr.py`** (Tesseract + OpenCV) that
  OCRs English labels, follows each leader line to its muscle, and emits a JSON map you import in-app — keeping the
  app single-file/offline (no bundled OCR engine). `renderAnatomyChart` was extended with the view toggle +
  upload/import/remove; `anatomyImportMap` validates + clamps the map. Covered by `test/anatomy.spec.mjs` (app) and
  `check.mjs` py_compile (tool). *(Approach chosen by the user: desktop helper over a multi-MB in-app WASM OCR.)*
- **Collapsible plan card (feat 127):** the active-workout plan card (`renderPlanGuide`) folds down to just its
  name + progress line. Tapping `.plan-card-head` (keyboard-operable, `role=button`) toggles
  `state.dashboard.planCollapsed` (persisted; a chevron flips ▾/▸) and re-renders; the bulky `.plan-card-body`
  (meta, comparison, steps, complete-banner, actions) gets the `hidden` attribute while the glanceable progress
  line stays visible. Covered by `test/plandash.spec.mjs`.
- **More mobility content (feat 128):** 24 new bodyweight movements drawn from yoga, pilates, tai chi and martial
  arts — 7 **dynamic** (Sun Salutation flow, Tai Chi Cloud Hands, Cossack flow, Pilates roll-up, shoulder
  pass-throughs, Frankenstein walks, Spiderman lunge) added to `mobility-warmup`; 8 **static** stretches (down dog,
  cobra/up-dog, seated fold, lizard, frog, seated twist, cow-face arms, standing side-bend) added to
  `static-stretch`; and a brand-new **Isometric Holds** family (`iso-poses`) with 9 held poses (chair, warrior II,
  boat, tree, horse stance/Mabu, Zhan Zhuang standing post, goddess, bridge, locust). Like every exercise these are
  hand-maintained in **both** representations — the detailed `exercises` array (drives the Reference panel's
  setup/movement/mistakes/programming) and the lean minified `FAMILIES` array (drives the picker / logging /
  `VAR_INDEX`) — plus a tier-map entry for the new family. Covered by `test/coaching.spec.mjs` (present + indexed in
  both, well-formed).
- **Per-category export + data summary (feat 129 / 130):** the Data Management page gains a **"By category"** block
  driven by one registry, `dataCats()` — Workouts, Body composition, Sleep, Strava, Plans, Exercise media, Custom
  variations, Settings. Each row shows the **count + date range** (`dataCatRange`) and offers export as **app-readable
  JSON** (a state slice — `{sessions,…}` for workouts, or a settings-type slice stamped with a fresh `savedAt` so
  `applyImport` merge re-adopts it) or a **human-readable CSV** (`csvWorkouts` one-row-per-set incl. cardio +
  e1RM, `csvBodyComp`, `csvSleep`, `csvStrava`, `csvPlans`; map-shaped categories are JSON-only). `exportCategoryJson`
  / `exportCategoryCsv` download a `gymtracker-<key>_<ts>.(json|csv)`; the table is built by `dataCategoryTableHtml`
  and rides along into the relocated Data page. Covered by `test/dataexport.spec.mjs` (counts/ranges, slice shapes,
  CSV rows, JSON re-import round-trip, rendered buttons).
- **Centered modal close button (feat 131):** `.media-head .media-close` (the ✕ on the media carousel and the Strava
  reconciliation modal) was a fixed 30×30 box with no flex centering, so the glyph sat low/off-center. Added
  `display:inline-flex; align-items:center; justify-content:center; line-height:1; padding:0`. An audit of the other
  ✕/× controls found this was the only fixed-square one missing centering (the picker clear button was already
  flex-centered; the rest are padding-sized). Covered by `test/mediawizard.spec.mjs` (computed-style centering).
- **Defensive OAuth origin allowlist (feat 132):** the committed public OAuth client ids (`SYNC_CLIENTS`) are
  gated app-side to an `OAUTH_ORIGINS` allowlist (`https://adervec.github.io` + localhost via a hostname check).
  `cloudOriginAllowed(origin)` (pure, parses `new URL(origin).hostname`, arg-overridable for tests) backs three
  gates: `cloudConnect` refuses `kind:'oauth'` providers on an unlisted origin (custom endpoint exempt);
  `cloudSyncCardHtml` disables the OAuth buttons + shows a note when the origin isn't allowed; and
  `cloudOAuthHandleRedirect` won't complete a token exchange off-origin. Defense-in-depth only — the providers
  already enforce their *Authorized JavaScript origins* server-side — but it makes a **fork of this public repo**
  fail fast (clear message, no leaked consent screen / quota use) instead of relying solely on Google's rejection.
  Data isolation was never at risk: each user authenticates as themselves and their data lives in their own Drive
  `appDataFolder`; the owner can't see others' data. Covered by `test/sync.spec.mjs` (allowlist logic + enabled/
  disabled button render); existing connect tests stay green since the test origin (`127.0.0.1`) is allowlisted.
- **PDF export of a data-review view (feat 133):** a **📄 PDF** button in the tracker header (shown only on the
  History / Volume / Trends tabs via `render()`) exports the current view. `exportCurrentViewPdf()` clones
  `#trk-main`'s HTML into a body-level `#print-root` with a titled header (`currentViewLabel()` → view + sub-context:
  e.g. *Volume · Group · Last week*, the History range, or the focused-Trends exercise) and calls the native
  `window.print()` — no library, so the app stays single-file/offline. The charts are inline **SVG** so they clone
  faithfully; an `@media print` block hides all chrome (`body.printing > *:not(#print-root)`), drops interactive
  controls (`.sub-tabs`/buttons/inputs), and sets `print-color-adjust: exact` so the dark theme + chart colours
  render. "Save or share" is the browser's print sheet (Save as PDF on desktop; Save/Share on Android). `afterprint`
  (+ a timeout fallback for mobile) clears `#print-root` and the `printing` class. Covered by `test/pdfexport.spec.mjs`
  (button visibility per tab, label/sub-context, clone-into-#print-root with header).
- **Promote Cloud Sync, archive File-System auto-save (feat 134):** the legacy desktop-only Auto-Save + Auto-Load
  sections on the Data Management page are wrapped in a collapsed `<details class="drawer-archived">` ("Legacy file
  auto-save / load — use ☁ Cloud Sync instead"; auto-opens if either is currently enabled) so Cloud Sync is the
  default cross-device path. The functions are untouched. Separately, the **Settings (⚙) long-press** is repointed
  from `openSettingsToLastChanged` to **`openDataPage`** — hold the gear to jump straight to Data Management.
  Covered by `test/dataexport.spec.mjs`.
- **Per-gym equipment stables + pin slider (feat 135):** each gym can now stock its own dumbbell / kettlebell /
  med-ball sizes and pin stack, edited in a collapsible **Equipment stable** block in the gym editor
  (`renderGymStableEditor` / `ensureGymStable`, stored on `gym.stable = { unit, db[], kb[], ball[], pin{first,inc,max} }`
  — tagged with the unit so cross-unit numbers are never misread). The setup tool's size lists resolve from the
  **active** gym (`activeStable()`), falling back to typical commercial defaults (`defaultDbSizes` 5,7.5,…,120 lb,
  `defaultKbSizes`, `defaultBallSizes`, `defaultPinStable`). The **pin stack** is reshaped to a first-step + main
  increment + max model: the default is *+5 then +10 up to 295 lb* (`pinStep()` — pure, testable — walks
  0→first→+inc≤max and back), and the **main increment is now a range slider** (`data-…-pininc`) instead of pills,
  with the add-on *Toppers* unchanged. Pin profiles persist `{inc, first, max}` (old `{inc}`-only profiles still
  load via fallbacks). Covered by `test/gymstable.spec.mjs` (defaults, `pinStep`, active-gym resolution incl.
  wrong-unit ignore, pin default state, slider render, gym-editor render + `parseSizeList`/`ensureGymStable`).
- **"Needs a spotter" flag (feat 136):** a discrete amber **🦺 spot** badge on the exercises where a free-weight
  barbell can pin/trap you at failure. `spotterMatch(v, fam)` is a precision-biased heuristic (reads only `.title`/
  `.id`, so it works on either the `exercises` or `FAMILIES` representation): it flags the bench/chest-press and
  squat families plus `back squat`/`skullcrusher` by name, then subtracts everything guarded or self-rescuable
  (smith, machine, fixed, cable, dumbbell, kettlebell, band, floor press, hack, goblet, belt/landmine, front/split/
  overhead/bodyweight squats, …). It lands on ~26 of 816 variations — all genuine barbell bench presses + loaded
  back/front squats + skullcrusher. The badge (`spotterBadge`) renders in the **exercise picker** rows and the
  **Reference** variation rows; `needsSpotter(uuid)` is the VAR_INDEX wrapper. Covered by `test/spotter.spec.mjs`
  (flag/no-flag sets, precision-count sanity, badge render, picker render).
- **Live plan progress for unsaved sets (feat 137):** the plan-progress dashboard was counting only *saved* sets,
  so the sets you were mid-entering didn't show — misleading. `stepLoggedSets` / `stepTopWeight` now fold in the
  **unsaved `pending` sets** (`pendingStepSets`) — but only for the **live** session (`session === getActiveSession()`),
  never while **editing** a saved exercise (those rows already exist → double-count), and only rows with a weight.
  Discarding the log (Clear / pick another exercise / end-and-discard) empties `pending` → the progress reverts.
  Closing the modal (✕/footer/backdrop/Esc) now re-`render()`s the dashboard so it reflects (or drops) the pending
  sets. A `_planIgnorePending` guard keeps `saveSets`' "was the plan already complete *before* this save?" snapshot
  on saved-only counts (else the plan-complete popup wouldn't fire). Covered by `test/plandash.spec.mjs`.
- **Tap plan progress → full plan (feat 138):** the progress line on the workout dashboard is now a button
  (`#plan-progress-open`, keyboard-operable, with a `›` affordance) that opens the active plan in the full plans
  overlay via a new `openPlanFull(id)` (sets `_plansEditId` → `renderPlanEditor`, showing every step). Distinct from
  the card header, which still toggles collapse (feat 127). Covered by `test/plandash.spec.mjs`.
- **Notched current-step HUD bar (feat 139):** the current-step progress bar moved out of the log form into a global
  `#plan-step-bar` strip docked **directly below the rest-timer bar** (a fixed HUD; its `top` and the `.panel`
  padding stack under the rest bar via `rest-bar-on`/`-idle` × `plan-step-bar-on` body classes; z-index 9997 so it,
  like the rest bar, floats over the log modal). The bar is **notched** — one segment per target set: saved sets
  solid (`.filled`), unsaved pending sets dimmed (`.pending`, feat 137), green when the step is done.
  `refreshPlanStepBar()` runs on every `refreshRestBar()` path; it picks the step you're logging (`pending.varUuid`)
  else the earliest incomplete (`currentPlanStepIndex`), and hides outside a planned workout / when complete. Tapping
  it opens the full plan (feat 138). The old in-form `planStepIndicatorHtml` is removed from the form (function kept).
  Covered by `test/stepbar.spec.mjs`; visually verified via a `page.pdf`/screenshot pass.
- **Headphone-only mute no longer mutes Bluetooth headsets (feat 140):** the speaker/headphone detector
  (`probeAudioOutput`) classified an output as headphones only when its label matched a keyword regex, so a Bluetooth
  headset shown by **brand name** ("Sony WH-1000XM4", "Bose QC35", "Galaxy Buds") matched nothing and — combined with
  the old `.some()` reducer — collapsed to `false` (speaker only) → audio wrongly muted. The classifier is now a pure,
  three-way `classifyAudioOutputs(labels)`: **headphones (`true`)** if any output positively reads as a headphone
  (`_HEADPHONE_RE`, now also `\bbt\b`/`hands-free`/`hfp`, and never a `_SPEAKER_RE` match); **speaker-only (`false`)**
  only when **every** labeled output positively reads as the built-in speaker/earpiece; **unknown (`null`, fail open)**
  for anything else — so an unrecognized non-speaker output (a brand-name BT headset) keeps audio playing instead of
  silently muting. Faithful to the feature's stated fail-open design. Covered by `test/headphones.spec.mjs`.
- **OSK ×10 digit hold is weight-only (feat 141):** the on-screen-keyboard digit long-press (hold `7` from an empty
  field → `70`, feat 100) now arms **only on the weight field**. `numpadDigitX10Eligible()` gained a `np.field === 'w'`
  guard, so the reps numpad treats a hold as a plain tap and never shows the `×10` affordance. Reps are typically small
  literal counts (1–20) where the shortcut mostly produced fat-finger 5→50 mistakes; weights are the multiples-of-10
  case it was built for. Covered by `test/numpad.spec.mjs` (weight x10 retained, reps hold inert + no label).
- **Long-press Copy → copy previous reps (feat 142):** the footer **Copy** button gains a second gesture. A **tap**
  still copies the weight to the next set (`copyWeightToNextSet`, feat 58); a **hold** runs a new
  `copyRepsToOpenSet()` that fills the **open set**'s still-empty reps (`isSetOpen` = weight in, reps not) with the
  **previous rep count** — the nearest earlier pending set that has reps, else the last logged set in history for the
  exercise — so an identical-reps scheme (e.g. 3×8) logs in one gesture. It reuses `commitSetField(i,'r',…)` (parse,
  `ts` stamp, persist, live-update) and is a no-op with a toast when there's no open set or no prior reps
  ("applicable"). Wired via `attachTopbarLongPress` **once at init** (the footer button is static) so the long-press
  and its click-swallower don't stack across modal re-renders; the button `title` now documents tap-vs-hold. Covered
  by `test/copyreps.spec.mjs` (prior-pending source, history fallback, no-op guards, end-to-end tap-vs-hold).
- **Setup-picker ×N remove is its own button (feat 143):** in the equipment setup tools (Barbell / Plate / Landmine
  plate grids + the Pin **toppers**), the per-plate count was a tiny `<span class="setup-ct">×N</span>` **nested inside**
  the add pill — a finicky, fat-finger-prone remove target that often added instead. Each weight is now a
  `.setup-pill-grp` **segmented control**: the add pill (`data-…-padd` / `-topper`) plus, only when a plate is on, a
  **separate** `.setup-ct-btn` remove button (`data-…-psub` / `-toppersub`, accent, turns danger-red on press) joined
  to its right. Two distinct, full-height tap targets — tap the pill to add, tap **×N** to remove one — with no
  handler changes (same data-attributes). Covered by `test/setuppills.spec.mjs` (×N is a sibling BUTTON not nested,
  add/remove counts, ×N hidden at zero); visually verified via a barbell-setup screenshot.
- **Per-step minimum completion % (feat 144):** a step now counts as "done" once it reaches a **minimum % of its
  target sets**, not necessarily all of them. The threshold resolves **per-step (`step.minPct`) → per-plan
  (`plan.minPct`) → global default (`state.planDefaults.minPct`, default 1%)** via `resolveStepMinPct`; `stepMinSets`
  = `ceil(target × %)` with a floor of 1 (so the 1% default = "even 1 set counts the step as done"). `stepStatus`
  now returns **`done`** (full target met — *pending-inclusive*, drives the current-step pointer + the step HUD bar,
  unchanged) **and `satisfied`** (the min-% threshold met by **SAVED sets only**). The split is deliberate: the min-%
  is *checked after a save, never on the live pending set*, and the pointer keeps using the full target — so
  **following the plan exactly never ends a step prematurely** (you keep working a step until its full sets even
  though 1 saved set already "satisfied" it). `planExecutionSummary` exposes `stepsDone` (satisfied count) +
  `stepsFull` (full-target count); **`complete` (the 🎉 banner / plan-complete popup) fires on min-% satisfied**. The
  dashboard shows "N/Y steps (M full)", a per-step "· min ✓" marker, and keeps the satisfied-but-incomplete current
  step highlighted; the history badge reads "✓ full" / "✓ done" / "partial". Editable via a **Workout Session →
  Plan step min completion** default and per-plan / per-step inputs in the plan editor (blank inherits). Covered by
  `test/minpct.spec.mjs` (resolution, saved-only-after-save vs pending, no premature pointer advance, complete at
  min%, 100% override, editor persistence, persisted default); visually verified (editor + dashboard).
- **Plan Execution View (feat 145):** a detailed drill-down (richer than the dashboard plan card) that shows, per
  step, **which variation(s) were actually logged to "satisfy" it** — the key ask. `renderPlanExecutionView(body,
  plan, session)` renders into the plans overlay (new `_plansExecId` / `_plansExecSessionDate` mode in
  `renderPlansOverlay`): a header + roll-up (`stepsDone/total (M full)`, sets, effort, complete 🎉), then each step
  with a status chip (**✓ full / ✓ min (≥k/n) / ▶ in progress / … partial / ○ not done**, following feat 144's
  satisfied-vs-done split) and a **"Satisfied by"** block listing every matching logged exercise — variation name (+
  spotter badge), the sets (`135×5 · 135×5 · 140×4`), top weight and est 1RM, plus the planned options, load and
  effort. Opened from a new **📊 Execution** button on the dashboard plan card (active session) and from **any
  session's plan badge** (now clickable, wired once via a delegated `[data-plan-exec-sess]` handler so it works in
  history too). Status classes are namespaced (`pe-full`/`pe-min`/…) to avoid the global `.full{}` collision. Covered
  by `test/planexec.spec.mjs` (variations + sets + statuses, roll-up + back, history-badge entry); visually verified.
- **Dashboard (today) vs Log (paginated history) split (feat 146):** the default tab — internally still `log` (keeps
  the FAB + workout controls) — is **renamed "Dashboard"** and is now **today-only** (its old "Recent Sessions" +
  "All-Time" blocks were removed; an unobtrusive `#dash-see-log` link points to the Log). A **new "Log" tab**
  (`data-tab="sessions"` → `renderSessionsLog`) lists **every** session newest-first with an all-time summary
  (sessions, total sets, date range) and **pagination** (`SESSIONS_PER_PAGE = 10`, `_sessionsLogPage`, ← Newer /
  Older →) so a long history isn't dumped at once. The per-session card interactions (edit / superset / HR / share /
  notes) were extracted into a shared `bindSessionCards(main)` used by both tabs, and tab switching is centralised in
  a `switchToTab(name)` helper (resets the page + history/volume sub-state). "History" stays a separate filtered/
  searchable view. Covered by `test/sessionslog.spec.mjs` (tab labels, today-only Dashboard, pagination math + nav,
  single-page no-pager, see-Log link); visually verified.
- **Categorized, searchable, filterable plan picker (feat 147):** the plans overlay list (`renderPlansList`) gains a
  **search box** (name/theme), **category** filter chips and **length** filter chips, with plans **grouped under
  category headers**. Categories are *derived* (`planCategory` → Push / Pull / Legs / Upper / Full Body / Core /
  Mixed / Mobility / …) from each plan's step **muscle-mega mix** (`planMegaDist`, mirroring `sessionSplitLabel`), so
  no hand-maintained field is needed and user plans categorize automatically; length buckets (quick ≤40 / standard /
  long ≥90 min) come from `estimatePlanMinutes`. Filters live in `_plansSearch` / `_plansCatFilter` /
  `_plansLenFilter` (reset on overlay open), the search keeps focus + caret across re-render, an empty result shows a
  **Clear filters** action, and each row carries a category tag. `PLAN_CAT_ORDER` ranks the chips + headers. Covered
  by `test/planlist.spec.mjs` (category derivation, chips + grouped headers, search, category filter, length filter +
  clear); visually verified on the real seed plans.
- **Rest/plan-step bar no longer overlaps the log sheet (feat 148):** the Log-Sets sheet (`#trk-modal`) is a
  full-screen fixed overlay at `top:0`, so the fixed top bar (z9999) + the rest-timer bar (z9998) + the plan-step HUD
  bar (z9997) floated **over** its top content — clipping the exercise title and the first sets. The sheet now gets
  body-class-driven `top` offsets mirroring the `.panel` rules (`top:48px` base for the top bar → `78`/`102`/`90`/…
  as the rest/idle + plan-step bars show), so it always starts just below whichever bars are visible. Bonus: the
  modal's own "Log Sets" header (previously hidden behind the top bar) is now visible. Covered by
  `test/restbaroverlap.spec.mjs`; visually verified.
- **Set/reps field flashes on value change (feat 149):** when a set input's value changes for any reason, the field
  briefly flashes. `commitSetField` (the single chokepoint for typing, OSK writes, and copy-reps) now calls a new
  `flashSetField(i,f)` when the value actually changed (skipped when unchanged); `copyRepsToOpenSet` re-flashes after
  its `renderModal`. The flash is an animated **box-shadow ring** (`@keyframes field-flash`), not a border-color —
  `.set-input` has `border-color … !important` which would beat an animated border, whereas the ring is free. The
  animation restarts each call (reflow trick) so rapid edits hold a steady glow then fade. Covered by
  `test/fieldflash.spec.mjs` (changed flashes, unchanged doesn't, input-event path, copy-reps path).
- **OSK on by default + strongly recommended (feat 150):** the on-screen numpad was effectively **off** by default —
  the initial `DEFAULTS.workoutControls.onScreenNumpad` was `false` and won the `normalizeState` merge over the (true)
  default. Set it `true` in `DEFAULTS` + the `ensureWC` fallback so fresh installs default-on; explicit user "off" is
  still respected (no force-migration). The settings toggle now carries a **★ Recommended** badge, a **"Strongly
  recommended — keep this on"** hint (noting the OSK powers ×10-hold, the calculator, plate setup + equipment tools),
  and an "On ★" pill. Covered by `test/oskdefault.spec.mjs` (fresh-install default, recommendation UI, explicit-off
  respected).
- **Confirm change-exercise with 2+ unsaved sets (feat 151):** the Log-Sets "🔄 Change exercise" button now counts
  the entered (weight-filled) sets; with **≥2** it pops a themed `confirmDialog` ("…N sets … aren't saved yet.
  Picking a different exercise will discard them.") before switching to the picker — picking a different exercise
  discards the in-progress sets, so this guards real work. <2 sets (or a blank trailing row) proceeds straight
  through, and editing a saved exercise is exempt. Covered by `test/changeexconfirm.spec.mjs` (confirm→proceed,
  cancel→stay, single-set bypass, blank-row not counted).
- **Step bar opens the execution view (feat 156):** the notched current-step HUD bar (`#plan-step-bar`) now opens the
  detailed **Plan Execution View** (feat 145, `openPlanExecution`) instead of the plan editor (`openPlanFull`); title
  updated. Covered by `test/planexec.spec.mjs`.
- **Discard active workout (feat 154):** a new **🗑 Discard** button in the active-workout controls (next to End
  Workout) runs `discardActiveWorkout()` — a themed `confirmDialog` (showing the set count, "as if the session never
  happened, can't be undone") then `clearPending()` + `stopMetronome()` + **`tombstoneSession()`** (feat 95, so sync
  won't resurrect it) + removes the session from `state.sessions`. Distinct from End Workout, which keeps and grades
  the session. Covered by `test/discardworkout.spec.mjs` (confirm removes+tombstones, cancel keeps, button renders).
- **Data-op progress popup + missing-UUID resilience (feat 152/153):** every commanded data operation now runs inside
  `runDataOp(title, fn)` — a popup that shows progress (spinner), then a **✓ success** (auto-dismisses after 1.3s when
  clean) or a **✕ failure with a human-readable explanation** (`humanizeDataError` maps JSON-parse / quota / network /
  permission / not-a-backup errors). `fn(ctx)` runs **synchronously** so a `downloadBlob` stays inside the click
  gesture, but may return a Promise for async work; `ctx.warn(msg)` collects non-fatal warnings. Wired through
  `exportData`, `exportCategoryJson/Csv`, and the import parse + apply. **feat 153:** `missingVarReport` /
  `missingVarWarning` detect sessions/plans referencing a variation UUID this build doesn't know (e.g. a custom
  exercise changed by an update); the op **warns but never fails** and the rows are **kept with their original IDs**
  (export) / **merged anyway** (import) so nothing is silently dropped. Covered by `test/dataop.spec.mjs` (error
  mapping, failure popup, missing-UUID report + warning, export warns-not-fails, clean success, resilient import);
  visually verified.
- **Step suggestion = loose weight×reps, tuned to the variation (feat 161):** the plan-step load badge suggested only
  a weight, and for a *movement* option it used the family-wide **max** baseline — over-suggesting from your single
  heaviest variation. `baselineWeightForOption` now tunes a movement to the **most-recently-trained** variation in the
  family, and a new `suggestedSetForOption(o, load)` returns a **weight×reps** suggestion (`repTargetForLoad`: heavy 5
  / moderate 8 / light 12; weight scaled from your recent baseline, or `null` → suggest reps only when there's no
  history). The badge reads "load · suggest ≈ {w}×{r}" with a "just a guide, not a target" tooltip. Covered by
  `test/stepsuggest.spec.mjs` (rep targets, tuned weight, movement→most-recent-not-max, no-history reps-only, render).
- **Grades: S top, D floor, ≥ filter (feat 158):** the grade scale now tops out at **S** (replacing A+) and floors at
  **D** (no F, for positivity) via a single `GRADE_SCALE` source of truth — `gradeFor`, `computeWorkoutScore`, and the
  live-score estimate all use it. New `GRADE_ORDER`/`gradeRank` (legacy `A+`→A, `F`→D-floor) power a **Grade ≥** chip
  filter on the **Log** tab (`_logMinGrade`) that narrows the session list to a chosen grade or better, with an
  empty-state + "show all". A gold **`.g-S`** chip style marks the top tier. Covered by `test/grades.spec.mjs` (scale,
  ranking + legacy, Log ≥-filter, S chip).
- **Wake lock during a workout (feat 160):** the honest answer to "PWA can't play audio/haptics unless open+unlocked"
  — a web app genuinely can't fire them when the screen is **locked** or the app is closed (OS restriction). So we
  hold a **Screen Wake Lock** while a workout is active (`acquireWakeLock`/`releaseWakeLock`/`refreshWakeLock`,
  gated by `wakeLockSupported()` + the default-on `workoutControls.keepAwake` + an active session), keeping the
  display on so the metronome / rest cues keep playing. Acquired on `startWorkout`, released on end/discard,
  re-acquired on `visibilitychange` (locks drop when hidden) + at boot. A **Keep screen awake during workout**
  settings toggle states the limitation plainly. Covered by `test/wakelock.spec.mjs` (acquire/release, setting + no-
  session gates, settings UI).
- **Live score: real value + autoscaled sparkline (feat 157):** the live estimate was rounded to the nearest 5
  (`Math.round(pts/5)*5`), so it "stuck" to round numbers. It now shows the **real integer** score (no faked
  volatility — just stop hiding the real moves), tracks it across the session (`trackLiveScore`, de-duped + reset per
  session, ephemeral) and draws an **autoscaled sparkline** (`sparklineSvg`, y mapped to the series min/max so small
  real changes are visible) plus a "▲/▼ N this session" delta. `sparklineSvg` is a reusable helper for other live
  trends. Covered by `test/livescore.spec.mjs` (sample tracking, autoscale + flat/short series, no-rounding code path).
- **HR connection robustness across app open/close (feat 159):** the Web-Bluetooth HR link dropped when the app was
  backgrounded/closed and nothing re-attached on return. The foreground-return path (`visibilitychange`→visible +
  `window 'focus'`) now silently re-attaches the remembered device via `hrTryReconnect()` (the existing
  `getDevices()` reconnect), and a boot-time reconnect attempt covers a full reopen mid-workout. The
  `gattserverdisconnected` retry (`hrScheduleReconnect`) now fires **immediately** instead of waiting the first 6s and
  persists longer (30 tries). Covered by `test/hrreconnect.spec.mjs` (silent re-attach, no-op guards, wiring present).
- **Exclude muscle groups from the overall trend (feat 165):** the Overall Progress Index can now omit chosen muscle
  groups (e.g. an injured area unfairly dragging the average). `computeOverallProgress` filters tracking keys whose
  `bp` is in the persisted `state.trendExclude`; the Overall trend view shows tap-to-exclude muscle-group chips and —
  when any are excluded — a **loud reminder banner** ("⚠️ excluding Chest — restore once recovered") with a one-tap
  **Restore all**, plus a "filtered" tag + warn-bordered card so it's never forgotten. Covered by
  `test/trendexclude.spec.mjs` (exclusion drops exercises, toggle on/off, banner+chips render, persisted setting).
- **New plan from a past freestyle workout (feat 155):** the plans list gains a **＋ From a past workout** button
  (shown when `_freestyleSessions()` — plan-less sessions with strength sets — exist). It pops a `choiceDialog` of the
  10 most recent freestyle sessions; picking one runs `newPlanFromSession()` which builds a plan with **one step per
  logged strength exercise** (sets = sets logged, the variation as the step option, named "&lt;split&gt; · &lt;date&gt;",
  `createdFromSession` recorded) and opens it in the editor to tweak. Covered by `test/planfromworkout.spec.mjs`
  (step-per-exercise + cardio skip, freestyle filtering, button shown/hidden).
- **GymTracker315 branding (feat 170):** the tracker header is now a generic **GymTracker315** wordmark (stylized
  text placeholder — "Gym" + accent "Tracker" + a "315" badge; not trademarked/copyrighted) instead of "📈 Overload
  Tracker". A **Preferences → Show GymTracker315 branding** toggle (`state.hideBranding`) hides it via a `brand-hidden`
  body class (`applyBranding()` on every render). **Exports always carry the brand regardless:** `brandLogoHtml(true)`
  heads the PDF print-root, and the share-image card draws "GymTracker315" at the top of the header band (and keeps
  its footer credit). Covered by `test/branding.spec.mjs` (header wordmark, hide toggle, PDF brand-while-hidden,
  persisted setting); visually verified.
- **Time-bounded "Copy for Claude" digest (feat 171):** the most efficient way to hand a progress summary to Claude —
  a **compact markdown digest** (`buildClaudeDigest`) built over the export dialog's existing time window
  (week/month/last30/all/custom). It **aggregates per exercise** (not every raw set, so it fits one message): an
  explicit analysis ask, an overview (sessions, span, /week, sets, avg grade), per-exercise **e1RM progression**
  (first→latest top set + % change + best, capped at 30 with an overflow note), and body/cardio notes. Surfaced as a
  **🤖 Copy summary for Claude** button in the export dialog. Covered by `test/claudeexport.spec.mjs` (digest shape +
  progression + body, exercise cap, button present).
- **Illicit-drug / illegal-activity sweep (feat 172):** swept the app's text for anything that could read as
  encouraging illicit drug use or illegal activity. The glossary's PED/steroid "slang" entries are **kept for
  awareness but neutralized** — removed the glamorizing drug-stacking meme ("Tren hard, eat clen, anavar give up"),
  added explicit **health + "illegal without a prescription"** caveats and a **not-recommended / natural, drug-free
  training** framing to Sauce/Juice, PEDs, TRT, Roid Rage, Tren, Roid, Natty; reframed caffeine's "Legal PED" label to
  "Everyday boost". Alcohol mentions were all already cautionary (sleep/recovery) or benign sport tradition — left as
  is. Covered by `test/contentsweep.spec.mjs`.
- **More seed plans (feat 168):** added a 4th tranche of 10 plans across varied flavours — **5×5 Strength A/B**
  (classic linear progression), **Calisthenics Foundations** (bodyweight), **Posterior Strength** (hinge-led), **Arm
  Day**, **Core & Midsection**, **Lunch Break 20** (quick), **Chest Specialization**, **Shoulder Sculpt**, **Back &
  Biceps** — all using already-valid movement family ids, so they categorize/search/filter via the feat 147 picker.
  Copy kept clean per the feat 173 sweep. Covered by `test/moreplans.spec.mjs` (new plans present, **every** seed
  plan's options resolve to real movements/variations, categories spread).
- **Achievement paths (feat 169):** a new **🏅 Milestones** sub-view in the Trends tab with ladders of classic,
  challenging-but-realistic goals: plate-count **Bench / Squat / Deadlift** (135→405/495/585), the **Captains of
  Crush** grip ladder (self-tracked), and **Running / Rowing distance** (5K→marathon, 2K→half). `ACHIEVEMENT_PATHS`
  + `computeAchievement` read progress from your **own logged best** — *not strict on variation or powerlifting aids*
  (any bench counts toward "X plates"; strength compared in lb, cardio in km). Each card shows reached tier, next
  target ("85 lb to 3 plates"), a tier ladder, and a **per-path safety note**; the view opens with a prominent
  **disclaimer discouraging dangerous behaviour** (heavy unspotted bench, overly long runs). Covered by
  `test/achievements.spec.mjs` (tier from best lift, cardio distance, disclaimer + notes + all paths, tab view);
  visually verified.
- **Reconcile duplicate movements (feat 166):** "Neck Training" and "Resistance Band Work" each existed as **two**
  families across the base + extra datasets (and in both the picker and the Reference). A load-time `dedupeFamilies()`
  now collapses same-title families into one canonical (`_dedupeMovementList` over **both** `FAMILIES` — re-pointing
  `VAR_INDEX` so logged sets still resolve — and the Reference `exercises`). Canonical preference: a feat-90 EXTRA id
  wins, then more variations, then first-seen — so `neck-training` (the expected canonical) beats the legacy `neck`,
  and the richer `resistance-bands` (15 vars) beats `band-work` (7); distinct variations are unioned. Dropped family
  ids are kept resolvable via `_FAMILY_ALIAS` + `resolveFamilyId` (used in `optionMatchesVar`) so a plan's movement
  option still matches. Covered by `test/dedupfamilies.spec.mjs` (no dup titles, variations resolve, alias matching).
- **Variation cross-listing — primary + secondary parents (feat 167):** beyond duplicate *families* (feat 166), the
  datasets carried ~25 cases of the **same exercise filed under two different movements** (the canonical example:
  **Plate Pinch** under both *Grip Training* and *Forearm Work*; also Landmine Press, Meadows Row, Muscle-Up, Wall
  Ball, Anderson Squat, Dragon Flag, …). A variation now has exactly **one primary parent** (the family it lives in)
  and may be **cross-listed** under additional **secondary parent** movements, where it renders at the **bottom** of
  that family's picker list with a *"↳ primarily a &lt;movement&gt;"* link that jumps to its home movement. A plan
  **movement-step is satisfied by a variation whether the movement is its primary OR a secondary parent** —
  `optionMatchesVar` and `stepQualifyingVarSet` both honour `secondaryParentsOf()` / `secondaryVarsForFamily()`.
  Authored as `VAR_DUP_RECONCILE` `{keep, drop}` uuid pairs: `keep` is the canonical/primary; `drop` is the duplicate
  copy, which `reconcileVariationParents()` (run at load after `dedupeFamilies()`) **suppresses** from its own
  family's list (`_VAR_SUPPRESS` → `varVisibleInPicker`) and whose family becomes a **secondary parent of the
  canonical**. Net: the exercise shows **once per family** (never a stale twin), yet both movement steps still match
  it. No logged data is destroyed — suppressed copies stay in `VAR_INDEX` (old sessions resolve + render) and still
  natively satisfy their own family's steps. Primary picks are editorial (the more natural "home"); the relationship
  is plain data, trivially re-pointed, with a `SECONDARY_PARENTS_EXTRA` hook for purely-additive cross-listings.
  Covered by `test/secondaryparents.spec.mjs` (primary+secondary matching, qualifying-set union, suppression + the
  cross-link row, no remaining visible cross-family dups, data preserved); `test/planpicker.spec.mjs` updated for the
  union semantics.
- **Claude-fillable media reference sheet (feat 174):** the bulk-media tools previously only spoke JSON — `Export
  exercise list` emitted machine JSON for the python matcher, and `Import media map` consumed a *different* JSON
  shape. New **round-trip** path so a human (or **Claude chat / cowork**) can populate reference clips: **`📝 Media
  sheet`** (`buildMediaSheet(scope)`) exports a plain-markdown list of every exercise — grouped by movement, each line
  carrying a stable `{id: <uuid>}` tag and a `media:` slot pre-filled with any existing links — with fill-in
  instructions at the top; scope is **all** or **only those missing links**. You hand it to Claude ("find good form
  clips for each"), Claude fills the `media:` lines, and you re-import the **same text** — `parseMediaSheet()` reads
  each exercise block by its `{id}` tag (falling back to the **title** if the tag was dropped) and grabs every
  `http(s)` URL on the `media:` line *or* bare continuation lines, tolerant of light reformatting. Import is unified
  via **`importMediaData()`**, which sniffs the first char (`{`/`[` → JSON map, else → sheet), so the one **Import
  file** button (now also `.md`) and a new **`📋 Paste sheet to import`** (reads the clipboard) both accept either
  format. The JSON importer was refactored to share `applyMediaEntries()` (attach + dedup + match-by-uuid/id/title)
  with the sheet path, so matching/merging/reporting stay identical. The export also lands on the clipboard for an
  immediate paste into Claude. Covered by `test/mediasheet.spec.mjs` (sheet shape, export→wipe→import round-trip,
  parser tolerance + title fallback, JSON-or-sheet dispatch, missing-only scope, graceful unmatched handling).
- **Target-weight Load reuses the open set (feat 247):** the feat-234 "Load `<weight>`" prefill found the first
  *weight-less* set, so a second tap (the open set now has a weight) appended a fresh set — repeated taps stacked
  open sets. It now targets the first **incomplete** set (`!isSetValid` — an open or blank set), so taps re-load
  the same open set. `test/progsheet.spec.mjs`.
- **Rest timer snaps live on foreground return (feat 248):** browsers freeze/throttle `setInterval` while a tab is
  hidden, so the 1 s rest tick stalled (phone screen off / app switch) and the bar showed a stale time on return.
  The `visibilitychange` handler now also `ensureRestTick()` + `restTick()` on becoming visible, repainting at once.
  `test/resttickvis.spec.mjs`.
- **Bigger OSK weight/reps text (feat 249):** the numpad's "Set N · Weight/Reps" label was a tiny 12px in a
  full-width header → 16px/800; the rep-range hint 11→13px; the set-row figures 15→16.5px.
- **Brand personalization (feat 250):** a **custom brand emoji** (`state.brandMark`, Cosmetic-settings picker +
  free-text, exports too) replaces the 🏋️; and the **315 easter egg** — the wordmark's "315" is split into digits
  that quietly sparkle once you've put 315 lb (≈142.9 kg, ≥1 rep) on the bar for the matching lift (3=bench,
  1=deadlift, 5=squat via `lift315`). `test/branding.spec.mjs`.
- **Exercise screen — time + media (feat 251):** the log sheet shows a **total-time + %-active** readout
  (`exerciseTiming`: first set start → last done, active = summed under-tension ÷ span), and a context-aware media
  button — "Configure Media" when empty, else "Watch `<type>` from `<creator>`" (`exMediaBtnLabel` /
  `mediaTypeLabel`). `test/exscreen.spec.mjs`.
- **Plan-progress steps underline (feat 252):** wherever the plan progress shows "X/Y steps" (the dashboard strip +
  the card progress line) the text is underlined with a thin accent bar sized to the fraction (`stepsFracHtml`
  → `--sf`).
- **Powerlifting milestones are barbell-only (feat 253):** the bench/squat/deadlift "plates on the bar" achievement
  paths matched any variation, so hack squat / leg press / Smith / RDL inflated the number. Each path now carries an
  `exclude` regex; `_achKwBestLb` skips matching variations, so only the genuine barbell lift counts (names became
  "Barbell …"). `test/achievements.spec.mjs`.
- **What-weight-to-record clarity (feat 254):** a `weightRecordHint` on the exercise screen states the convention
  so logging stays consistent — two-dumbbell upper lifts log **one** dumbbell's number (45, not 90); independent-arm
  machines (Freemotion) **write the number you read**; a weight **held for a leg movement** (goblet/KB squat,
  DB lunge) logs the **total** held; barbell/plate/pin/bodyweight get no hint. Per-muscle volume is set-count based,
  so the convention doesn't change group-hit math — it keeps per-exercise weight comparisons honest.
  `test/exscreen.spec.mjs`.
- **Themed split picker (feat 255):** `THEMED_SPLITS` — curated complementary-plan weeks with coy, euphemistic names
  alluding to famous on-screen physiques ("Man of Lifting Steel", "The Golden-Era Oak", "Three Hundred Reasons", "God
  of Thunder", "The People's Pump", "The Caped Crusader's Cut"). No source is named and no copyrighted routine is
  reproduced — the programming is our own PPL/upper-lower/full-body archetype and the recommender fills each slot
  from your library. `buildRecommendedSplit` takes an explicit `opts.slots`; the planner page gains the picker (sets
  slots + session count, tap again to clear) and a themed save names the program after the theme.
  `test/splitplanner.spec.mjs`.
- **Notes modal clears the top bar (feat 256):** the full-screen Session-Notes modal layered at `z-index: 210`, but
  the fixed top bar (the feat-227 breadcrumb) is `z-index: 9999` and ~83 px tall — so the bar painted over the modal's
  sticky header, hiding the "Session Notes" title + Close (and the first form field): "top of notes gets clipped". The
  `.modal` overlay now sits **above** the bar (10041, backdrop 10040 — matching the glossary/wizard/data-page
  full-screen overlays; still below the OSK numpad at 10060 and the confirm/choice dialog at 10070), and `.modal-header`
  gains an `env(safe-area-inset-top)` pad so it also clears a phone's notch. `test/notes.spec.mjs`.
- **Live hold timer for timed sets (feat 257):** isometric holds (planks, dead hangs, wall sits, L-sits — anything
  `exMode` tracks as `time`, logging **Seconds**) no longer need a separate stopwatch. Once the set has **started**
  (weight/0 entered → `wTs` stamped) but isn't done, its row shows a **count-up button** (`.hold-timer-btn`) that ticks
  every second from the start stamp; a tap drops the **current elapsed seconds** straight into the Seconds field
  (`commitSetField(i,'r',sec)` → stamps `ts`, fires the set-end cue). Logging-only (hidden while editing a past
  session, where `wTs` may be days old). `tickHoldTimers`/`ensureHoldTimers`/`stopHoldTimers` run one shared 1 s
  interval, self-terminating when no button remains and re-armed by `bindSetsForm`; `renderModal` + `closeLogModal`
  clear it. `test/holdtimer.spec.mjs`.
- **Prison / cell bodyweight plans (feat 258):** four zero-equipment, tiny-footprint templates seeded into
  `SEED_PLANS` (tranche 8) — **Cellblock Circuit** (full-body circuit), **The Yard** (bodyweight strength — harder
  push-up/dip/inverted-row variations), **Quiet Cell** (zero-impact isometrics: wall sit, plank, slow grinds — no
  jumping/noise), and **Burpee Ladder** (conditioning blast). Built from the bodyweight families (`push-ups`,
  `squat`, `lunge`, `dips`, `pull-up`, core/obliques/calves/glutes, `conditioning`, `plyometrics`) plus pinned
  variations (burpee, jump squat, plank, wall sit, inverted row, diamond push-up, bench dip). Several lean on the
  **timed holds** (wall sit, plank) so they naturally surface the feat-257 hold timer. They seed additively via the
  `seededPlanIds` ledger; every step verified satisfiable (resolves to ≥1 qualifying variation).
  `test/prisonplans.spec.mjs`.
- **Gym is the session location, separated from notes (feat 259):** "where you trained" lived in two disconnected
  places — the structured **active gym** (feat 245, shown on the active-workout dashboard) and a freeform **Location**
  text field bundled into the session-notes modal with supps/injuries/general. Unified: the **gym is the location**.
  (1) The gym chip now shows on the **workout page in every state** (before/during/after a workout — `workoutGymHtml`
  moved out of the active-only branch; self-hides when no gyms). (2) `stampActiveSessionGym()` records the active gym
  as `session.notes.location` on **workout start** and on **any gym change** (`setActiveGym`), so history captures
  where you trained automatically. (3) The **Location field is gone from the notes modal** (now Supps / Injuries /
  General only); it shows the gym **read-only** with a "set it on the Workout page" hint, and `saveNotes`/`clearNotes`
  **preserve** the gym-sourced location. (4) In history the gym renders as its **own "📍 Trained at" line**
  (`.session-gym-line`), distinct from the Session Notes card. `test/notes.spec.mjs`, `test/workoutgym.spec.mjs`.
- **Plan/split coverage pass (feat 260):** an audit of the catalogue (category × length matrix + a recommender
  simulation) found the **PPL/upper-lower slots were not covered at both ends of the clock**: Pull had no quick and
  no long option, Push had no long, Upper had no quick — so the split recommender filled those slots at 50–78 % time
  fit at the budget extremes. Added a "tranche 9" of six plans that close every hole: **Express Push / Pull / Legs /
  Upper** (~30 min) and **Push Marathon / Pull Marathon** (2 h, to sit alongside the existing 90 min–3 h legs/upper/
  full-body marathons). Now every Push/Pull/Legs/Upper category spans quick→standard→long, and the recommender fills
  the express (30 min) and marathon (120 min) slots at ~100 % fit. Two categorisation fixes fell out of the audit: the
  Pull Marathon's lower-back step tripped the "balanced compound mix → Full Body" rule (swapped for a third row so it
  reads as **Pull**), and Express Legs needed a glute step to clear the slot-coverage bar and win the 30 min Legs slot.
  A catalogue-wide guard asserts **every** seed step is satisfiable. `test/plancoverage.spec.mjs`.
- **RPE / RIR per-set logging — fully hideable (feat 261):** an optional effort field per set. Mode lives in
  `state.workoutControls.rpeMode` = `'off'` (default) | `'rpe'` (Rate of Perceived Exertion 6–10, .5 steps) |
  `'rir'` (Reps In Reserve 0–5); **off hides it completely** — no column, no header, no badges, no migration, so a
  workout looks exactly as before. Canonical store is a single **`set.rpe`** number (RIR is just a display/entry lens,
  `RIR = 10 − RPE`, via `rpeToRir`/`rirToRpe`); it's persisted only when present (the `saveSets` `clean()` adds `rpe`
  conditionally, keeping existing JSON byte-identical). Entry is a compact **`<select>`** (`rpeSelectHtml` → never
  fires the mobile keyboard, works in numpad mode), added as a 5th set-row column only when `rpeEnabled()`; the grid
  switches via a `.sets-section.rpe-on` class. `estimated1RMSet(set)` sharpens e1RM by mapping a tagged set to its
  reps-to-failure (`reps + RIR`) before Epley — **additive**, so the core overload/PR engine (`getOverloadScore`,
  raw-rep Epley) is untouched and untagged sets are unchanged. History pills show a gated `@8` / `2 RIR` badge. The
  3-way toggle sits in Settings → Preferences (`data-rpemode`). `test/app.spec.mjs` (off-by-default, scale mapping,
  adjusted e1RM, select gating).
- **Muscle-group recovery / readiness model (feat 262):** a Fitbod-style "what's fresh to train today" card atop the
  **Volume** tab. Pure compute over the log (stores nothing new): each group accrues fatigue from recent sessions that
  **decays exponentially** (per-group half-lives in `RECOVERY_HALFLIFE_H` — big compounds recover slower), and
  `readiness = 1 − fatigue / the user's own median per-session load` for that group (`bpReferenceLoad`, last ~8 wk,
  clamped). Muscle contributions roll up to body-parts via `MUSCLE_INDEX[id].group`; logged **RPE** nudges a session's
  contribution (`_bpSessionIntensity`). `recoveryReadiness()` returns per-group readiness + last-trained; the card
  (`renderRecoveryCard`) lists still-recovering groups (most-fatigued first, coloured bar + "trained Xh/Xd ago") and
  names the fresh ones as "Good to train", with an ⓘ explainer. Directional, not lab-accurate (same spirit as the
  per-muscle distribution). `test/app.spec.mjs` (fatigued-vs-fresh, card render).
- **Plateau / stall detection + deload nudge (feat 263):** flags a lift whose per-session best **e1RM** (RPE-adjusted
  when tagged, via `sessionBestE1RM` → `estimated1RMSet`) hasn't set a new high for several sessions and is essentially
  flat. `detectPlateau(varUuid, subUuid)` needs ≥4 sessions in the last ~12 wk and fires when the high is **3+
  sessions old**, the window is **flat (±2 %)**, and it spans **≥ ~2 weeks** (so a single off day or two close sessions
  never trip it). Surfaced two ways: an advisory in the **log-sets sheet** when you start a stalled exercise
  (`plateauAdvice` → deload −10 % / variation-swap nudge), and a **🧱 Possible plateaus** roll-up atop the Trends →
  Overall view (`findPlateaus`/`renderPlateauCard` over `allTrackedKeys`). `test/app.spec.mjs` (flat flagged, climbing
  not, roll-up + card).
- **RPE autoregulation + plateau-aware progression (feat 264):** makes feat 261/263 *actionable* inside the existing
  next-load engine (`suggestProgression` — the "🎯 Aim for w×r" target in the log sheet and the Progression page), so
  the logged effort and detected stalls change the recommendation instead of just being displayed. `recentTopSet` now
  carries the top set's **RPE**; when present it steers the next target — **RPE ≥ 9.5** (≈0 in reserve) → `hold`
  (repeat and consolidate), **RPE ≤ 6.5** (plenty left) → push harder (jump +2 reps, or add load if already at the top
  of the rep range), **RPE ≥ 9** mid-range → a single cautious rep; **RPE 7–8.5** and **no RPE** fall through to the
  unchanged double progression (zero behaviour change for users who don't log it). A **stall** (`detectPlateauVar`, a
  new variation-level sibling of `detectPlateau` aligned to the var-keyed engine) overrides progression with a
  **−10% deload** target. The plateau core was refactored to a shared `_plateauFromSeries(rows)` used by both the
  key-level and var-level detectors. `test/app.spec.mjs` (RPE-easy pushes reps, RPE-10 holds, no-RPE unchanged, stall
  → deload).
- **Recovery hint at the point of logging (feat 265):** brings the feat-262 model into the daily flow — opening an
  exercise in the log sheet shows a one-line readiness chip for the **group it mostly trains** (`exerciseDominantGroup`
  = the largest rolled-up muscle contribution), e.g. "🔴 Chest **18%** recovered · Fatigued". `exerciseRecoveryHint`
  self-suppresses when there's nothing useful to say (too little history, the group is fresh ≥85%, or it wasn't
  trained in the last week), so it only appears when it's actionable. Read-only, no settings. `test/app.spec.mjs`
  (present for a just-trained group, absent for a rested/untrained one).
- **Recovery-aware plan recommender (feat 266):** the quick-pick recommender (`recommendPlans`) now factors **muscle-group
  recovery** alongside time-fit and the coarse push/pull/lower freshness. `planRecoveryScore` is the volume-weighted
  readiness (feat 262) of the groups a plan trains; the score became `time·0.65 + fresh·0.2 + recov·0.15` (+fav) — time-fit
  stays dominant, so the existing budget-sensitivity ordering is preserved, while recovery breaks ties the mega-level
  freshness can't see (e.g. a chest-heavy vs a delts-heavy push day when chest is fried but delts are fresh). The
  recommendation reason gains a **"⚠ <group> still recovering"** heads-up (`planFatiguedGroup`, groups <40% recovered).
  `recoveryReadiness()` is computed once per call and reused. `test/quickpick.spec.mjs` (fresh-group plan outranks the
  fatigued-group one + warning note; all prior ordering assertions still hold).
- **RPE/RIR in workout exports (feat 267):** when the feature is on (feat 261), the per-set strings in the **text** and
  **image** exports carry the effort tag — `100×5 @8` (RPE) or `100×5 (2 RIR)` (RIR). One change in `summarizeSession`
  via `rpeExportTag(set)` flows to both, since the Canvas image reuses the same `e.detail` line. Gated and per-set:
  untagged sets stay bare, and with the feature off the exports are byte-identical to before. `test/app.spec.mjs`
  (tagged when on across both lenses, absent when off).
- **Recovery strip on the active workout (feat 268):** a compact, glanceable strip on the live dashboard
  (`renderRecoveryStrip`, above the session card) showing each recently-trained group as a colour-coded chip
  (freshest→most-fatigued, e.g. "🟢 Hams 99% … 🔴 Shoulders 0%"), so mid-workout you can see what's recovered enough to
  add. Shares the feat-262 model; tapping opens **Volume → Recovery**. Gated by a new **Dashboard → Recovery strip**
  toggle (`state.dashboard.recovery`, default on) and self-hides without history. `test/app.spec.mjs` (chips render,
  gated by history + the toggle).
- **Images & animated GIFs in reference media (feat 269):** the media system (feat 75) now accepts **images and GIFs**
  alongside embeddable videos. `parseMediaUrl` detects direct files (`.gif/.png/.jpe?g/.webp/.avif/.bmp`, a `?format=`
  hint) and **giphy** share/embed links (→ the direct `media.giphy.com/.../giphy.gif`), returning `platform:'image'|'gif'`
  with an `img` field (the displayable URL; `watchUrl`/`url` keep the original link for "Open original" + sheet
  round-trip). New helpers `isImageMedia` / `mediaImg` / `mediaPlayable`. Every surface renders them inline via `<img>`
  instead of an iframe: the **carousel** (contained, natural aspect), the **gallery** (the image is its own thumbnail; a
  GIF animates; IMG/GIF badge), the **manage list** + **bulk wizard** (a preview that mounts an `<img>`, "image"/"gif"
  badge, counted as displayable not link-only). The **media sheet** round-trips with no change (URL → `parseMediaUrl`
  re-classifies); the exercise-screen button reads "🖼 View image/GIF". `test/app.spec.mjs` (image/gif/giphy/format
  detection + helpers).
- **Inline trend peek in the log sheet (feat 270):** `renderTrendPeek(varUuid, subUuid)` shows a glanceable **e1RM
  sparkline** for the exercise you're logging, right under the media/Trends row — so you can read the trajectory
  without leaving for the Trends page. RPE-aware (`sessionBestE1RM` over `getHistoryByKey`, last ~12 sessions
  chronological), with `<latest> e1RM · best <best> · ±%` and an up/down/flat colour; tapping opens the full focused
  Trends (`openTrendsFor`). Self-hides with fewer than 2 prior sessions for the lift. `test/app.spec.mjs` (sparkline +
  stats present, up-trend on climbing e1RM, hidden with one session).
- **Anatomy chart as a media owner (feat 271):** bridges the feat-118 detailed anatomy chart to the feat-269 image
  media system, so a labelled chart imports the same way as exercise clips. A reserved key `ANATOMY_MEDIA_KEY =
  'anatomy-chart'` is a first-class media owner: `mediaOwnerInfo`/`mediaTitleFor` name it "Anatomy Chart" (so it shows
  in the **gallery**), `resolveExerciseKey` accepts it by id or by the title "anatomy"/"anatomy chart" (so **JSON/sheet
  import** can target it), and `buildMediaSheet` lists it at the top (`{mid: anatomy-chart}`) so the Claude-fillable
  sheet round-trips it. The chart's Detailed View now sources its image from `anatomyImageSrc()` = the uploaded
  IndexedDB file **or** a media-attached image URL (upload wins), and the toolbar gains a **📥 Import URL** button
  (`promptDialog` → `addExerciseMedia(ANATOMY_MEDIA_KEY, …)`, image-only). Fulfils part of the ONHOLD #49
  externally-attached-chart idea via the existing media plumbing. `test/app.spec.mjs` (import-by-id/title, attach,
  display source, gallery owner, sheet round-trip).
- **Sync-on-workout-end + per-device AI-ready auto-export (feat 272):** two wrap-up automations fired from
  `finalizeEndWorkout`. **(1) Cloud sync on end** — `state.cloudSync.syncOnEnd` (default on, device-local) does an
  immediate `cloudPushNow()` when a workout ends, guaranteeing the session is pushed even if you close the app before
  the 1.2 s debounced auto-sync fires; a toggle sits in the connected Cloud Sync card. **(2) AI brief export** —
  writes the **Claude-ready digest** (`buildClaudeDigest`, feat 171) into a chosen folder so a desktop can drop the
  latest brief into e.g. a Claude cowork folder for a morning strength-progress analysis. **Device-local by design**:
  the readwrite folder handle lives in IndexedDB (`aiExportDir`) and the config (`state.aiExport`
  `{enabled,onWorkoutEnd,daily,scope,filename,lastWriteDay}`) is preserved-on-merge (in `SETTINGS_KEYS`), so only the
  device you set up exports. Triggers: **on workout end** and **once per calendar day** (on load + on tab refocus,
  guarded by `lastWriteDay`). Mirrors the bio-auto-load handle plumbing (`bioIdbGet/Set`, permission query/request)
  but with a `createWritable()` write. Scope picker (30 days / month / all) feeds `selectSessionsForExport`. Settings
  UI is in the Data Management page under the File-System-Access gate. `test/app.spec.mjs` (defaults, scope labels,
  no-op without a folder, and a mock-handle folder write of the digest).
- **New movement disciplines + more plans & themed splits (feat 273):** four whole **disciplines** added via the
  runtime `EXTRA_FAMILIES` injection (so they land in both the tracker and the reference, like neck/jaw/climbing):
  **Pilates Mat** (`pilates-mat`, `mega:'core'` → counts as core volume; `MUSCLE_CONTRIB` added; the Hundred,
  roll-up, series-of-five, teaser, swan, saw, side-plank hold), **Tai Chi** (`tai-chi`, `mega:'mobility'`; standing-post
  and horse-stance **holds** become time-mode via the "hold" keyword, plus cloud hands, brush knee, grasp-sparrow's-tail,
  golden-rooster balance), **Systema** (`systema`, `mega:'mobility'`; breathing push-ups/squats, breath-hold walk,
  rolling, tension–relaxation), and **Boxing & Bag Work** (`boxing-bag`, `mega:'cardio'` → logs through the cardio form;
  heavy bag, shadow boxing, speed/double-end bag, boxer's jump rope, mitt work, combinations). All `mega::sub` combos
  map through `BP_MAP`. **11 new seed plans** (Pilates Core Flow, Tai Chi Morning Flow, Systema Breath & Movement,
  Mind-Body Flow, Heavy Bag Conditioning, Fighter's Circuit, plus strength variety — Powerbuilding Upper, Posterior
  Chain, Athletic Full Body, Chest & Arms, Back & Biceps) append via the additive `seededPlanIds` ledger, and **5 new
  themed splits** (Way of the Dragon, The Crane & The Tiger, The Shaolin Path, The Contender, The Shield-Bearer) whose
  "Core" slots can surface the new core/conditioning plans. `test/coaching.spec.mjs` (families inject + classify, holds
  are timed, boxing routes to cardio, every new plan step resolves, 11 plans + 5 splits present).
- **Study read/unread + listen-as-podcast (feat 274):** the **Glossary** (the Study area's entry list) gains per-entry
  **read/unread** tracking and a **"🎧 Listen"** mode that reads the whole unread pile as a continuous, conversational
  podcast. State is `state.glossaryRead = { term: { at, src } }` (in `SETTINGS_KEYS`, so progress syncs across devices);
  the read flag records the **date** and whether it was set **manually** (a tap) or **earned by listening** to the whole
  entry (`src:'manual'|'listen'`). The glossary panel gets a sticky study toolbar — unread count, an All/Unread/Read
  filter, a Listen button, a logical↔shuffle order toggle, and Mark-all — and every entry shows a ✓/○ toggle plus a
  "🎧 listened / ✓ read · <date>" badge. The player (`startGlossPodcast` → a segment state machine: intro · entries ·
  outro) speaks via the existing coach voice (`coachify`); `_speechClean` expands acronyms and symbols (×→"by", %→
  "percent", "1RM"→"one-rep max", ranges→"6 to 12") and `glossNarration` adds varied openers + category transitions so
  it's a coach talking, not a table read. A **generation counter** makes a *skip* never mis-mark the skipped entry, and
  natural utterance-end is what marks an entry read (`src:'listen'`); a periodic `resume()` defeats Chrome's long-speech
  cutoff, and the other speakers (tips/annunciations) yield while the podcast plays. A fixed bottom **player bar**
  (⏸/⏭/⏹, now-playing, n/m) drives it. Logical order = category then term; shuffle = Fisher–Yates. `test/app.spec.mjs`
  (read state + symbol-free narration; a mock-speech drive proving full-listen marks read and skip does not).
- **Study generalized to Advice + Guides, resume & daily nudge (feat 275):** lifts feat 274 from glossary-only to the
  whole Study area. Read-state is now **unified + namespaced**: `state.studyRead = { 'type:id': {at,src} }`
  (`glossary:<term>` · `advice:<coach-id>` · `guide:<gid>`), with the feat-274 `glossaryRead` migrated in once and the
  glossary helpers kept as thin wrappers. The podcast engine became **content-agnostic** (segments carry a `readKey` +
  `label`; a natural utterance-end marks that key read). **Advice** (the `COACHING` topics) gains per-card read toggles,
  a "🎧 Listen to unread" study bar, and `adviceNarration` (blurb + sections, tags stripped). **Guides** get
  read-on-open + a manual toggle + a "🎧 Listen" button in the reader that speaks the guide text (`guideText` strips the
  template HTML; `_chunkText` splits it into sentence groups so only the final chunk marks it read). **Resume**:
  stopping persists the in-progress entry (`state.studyPod.resumeKey`); the next listen rotates the queue to lead with
  it. **Daily nudge**: a once-a-day "you have N unread study items" toast (`studyDailyNudge`, gated by `state.studyNudge`,
  skipped if you already listened today) plus an unread-count **badge** on the Study/Glossary/Advice nav-menu items
  (`renderMenu` + `refreshStudyBadge`). `studyUnreadTotal` sums all three surfaces. `test/app.spec.mjs` (advice/guide
  read-state + counts, tag-stripped narration, once-a-day nudge, resume rotation).
- **Read-only plan view (feat 276):** the Plan Creator list gains a **👁 View** action (beside Use/Edit/Del) that opens
  the editor in a **read-only mode** — the exact same layout and data, but every input is `disabled` and every mutating
  control (Commit, Revert, author, step add/move/delete, +exercise, option ✕, add-step, media add/remove) is hidden, so
  the **Commit button can't be accidentally pressed**. A `_plansViewMode` flag drives it: `renderPlanEditor` wraps the
  body in `.plan-ro-wrap` (CSS hides the mutators) under a "👁 Read-only view" banner with an **✎ Edit** switch;
  `bindPlanEditor` binds only Back / History / media-preview / the Edit toggle then early-returns with inputs frozen.
  History stays browsable (read-only). `openPlanView(id)` deep-links to it. `test/app.spec.mjs` (same data, inputs
  disabled, commit/add-step hidden, ✎ Edit unlocks).
- **Plan "siblings" (feat 277):** the plan editor/view shows a **🔀 Sibling plans** section — other plans whose steps
  hold the **same exercises in the same order** (ignoring set counts / intensity / load / notes), i.e. volume/intensity
  variants of the same template. `planSignature` is the per-step sorted exercise-id list in step order; `planSiblings`
  finds matches. Each sibling is **colour-coded by relative effort** (`planEffort = total sets × intensity`, mapped to
  green/amber/red across the group's min–max via `siblingEffortClass`) with a ▲ harder / ▼ easier / ≈ same label vs the
  current plan, sorted lightest-first. Tapping a sibling opens it in the current mode (view stays read-only). Shown in
  both the editor and the feat-276 read-only view. `test/app.spec.mjs` (signature match, sibling sets, effort scaling +
  colour classes).
- **Exercise log renders on the tab, not a slide-in (feat 278):** the Log-Sets surface (`#trk-modal`) used to animate
  **up from the bottom** like a sheet even though it fills the Exercise tab — a leftover sheet transition. It now sits
  in place directly under the topbar (`top: var(--topbar-h); transition: none`), so opening the Exercise tab shows the
  set-entry content **immediately, on the tab**, with no slide. No behavioural change to the form itself.
- **On-screen numpad commits on Next/Done, not mid-keystroke (feat 279):** typing on the OSK used to write each
  keystroke straight into the set field (live), so a half-typed value (e.g. "9" before "90") momentarily *was* the
  field. The numpad now buffers: `numpadHandleKey` only updates `np.buf` + the `.np-display`, and the value is
  **flushed into the field once** via `_numpadFlush(np)` — invoked by **Next** (`numpadNext`), **Done** (`closeNumpad`),
  and `saveSets` (so an open buffer isn't lost on save). Calculator mode flushes through `finalizeCalc`. The field no
  longer changes until you commit. `test/numpad.spec.mjs` (buffer not committed before Done; committed after).
- **A set counts toward exactly ONE plan step (feat 281):** plan progress matched sets to steps **independently per
  step**, so a set whose variation satisfied several steps (e.g. the three `row` steps in *Pull Marathon*) was counted
  toward **every** matching step — doing the first row step wrongly completed the later ones. New `planStepAllocation`
  distributes a session's sets **uniquely**: steps are filled to target **in plan order** (so the earlier duplicate
  completes first via `_allocSetsToSteps`, least-shared set first to avoid starving a step), and any **surplus** beyond
  every target ("extra work") attaches to the **last** step it matches. `stepStatus` reads `logged`/`saved` from this
  allocation (legacy per-step counters kept only as a plan-less fallback); the step HUD bar, picker chips, log-sets
  banner, `setPositionInfo` and ETA all route through it. Single-entry memo keyed on session+plan+set fingerprint.
  `test/dupsteps.spec.mjs` (3 row sets complete only step 1; 9 sets give each step exactly 3; surplus lands on the last;
  every set allocated exactly once).
- **Limelight for under-used movements (feat 280):** a coverage audit (`_mvOpt` usage across SEED_PLANS) found
  movements with **zero** plan appearances — **decline bench press, front raise, gymnastics core holds** — and several
  with only one (pullover, rotator cuff, Olympic lifts, strongman, medicine ball, grip). Three master-crafted plans now
  feature them: **Complete Chest** (flat→incline→**decline** pressing, flyes/dips and a **pullover**), **Delt Sculpt**
  (overhead press, **front raises**, lateral + rear raises, traps, **rotator-cuff** balance) and **Power Athlete**
  (**Olympic lifts**, **medicine-ball** ballistics, **strongman** loading, **gymnastics-core** holds, **grip** finisher).
  They append to SEED_PLANS (tranche 12) and self-seed via the additive `seededPlanIds` ledger. Also fixed three
  **pre-existing duplicate display names** from the feat-273 tranche so the library no longer shows two of each:
  *Posterior Chain → Posterior Chain Power*, *Athletic Full Body → Athletic Strength*, *Back & Biceps → Back & Biceps
  Builder* (ids unchanged, so existing users' seeded plans are untouched; only fresh seeds get the clean names).
  `test/limelight.spec.mjs` (new plans seed; every step satisfiable; the once-starved movements now have ≥1 step; the
  whole catalogue is free of duplicate ids **and** names).
- **Splits longer than a week — hybrid scheduling (feat 282):** the planner's day selector was mislabelled "Days /
  week" and capped at 7. It's now **"Days in the split"** (a week always has 7 days; a split's rotation needn't) and
  goes up to **28**. Scheduling is **hybrid**: a split of **≤7 days** still saves as the familiar weekday program
  (`week[7]`, JS day-of-week — unchanged); a split of **>7 days** saves as a **rotating N-day cycle** anchored to a
  start date — `{mode:'rotation', splitLen, start, rotation[N]}` — where *today's* session is computed by rotation
  (`rotationDayIndex`), so a 9-day split repeats from Day 1 every 9 days regardless of weekday. Both modes resolve a
  date → planId through one helper (`scheduledPlanIdForDate`), so `programToday`, `programNextUp`, `programWeekAdherence`
  and the streak all work for either without branching. `buildProgramFromSplit` gained a `splitLen` arg and spreads the
  sessions evenly across the cycle (`_spreadIndices`); the program card renders a **Day 1…N agenda** (tap to reassign,
  `cycleProgramRotDay`) for rotations and the Mon–Sun agenda for weeks. Coverage math scales a long split's volume by
  `7/days` so "sets/week" stays honest. Old weekday programs are untouched (normalize accepts both shapes).
  `test/splitlength.spec.mjs` (rotation build, date rotation + wrap both directions, slot cycling, normalize
  validation, planner saves a rotation + Day 1…N agenda, the selector exposes lengths up to 28).
- **Split Planner — collapsible sections + searchable themed splits + many more (feat 283):** with the day range now
  reaching 28 the themed-split list grew, so every Split Planner card is now **collapsible** (`.sp-sec` + a
  `data-sp-coll` header chevron; state in `state.spUI.collapse`, persisted via SETTINGS_KEYS). **Themed splits default
  collapsed** (the other sections expand); the section also gains a **🔎 text search** (client-side, hides non-matching
  chips without a re-render so typing keeps focus) and a **length filter** (All / ≤1 wk / 8–14d / 15–28d, in
  `state.spUI.themeFilter`). THEMED_SPLITS expanded from 11 to **27** — each now carries its own `days` (rotation
  length) via `themeDays`, and the new entries span **8–28 days** (Eight-Day Engine → The Lunar Cycle / Monthlong
  Odyssey), so picking a long theme sets the split length and saves a **rotating cycle** (feat 282). Coy, non-infringing
  names continue the feat-255 style; the recommender still fills every slot from your own library. `test/
  splitplannerui.spec.mjs` (≥25 themes with valid `days`≤28, long theme → rotation, collapse defaults + persistence,
  search hides-not-removes, length-filter bucket). `test/splitplanner.spec.mjs` updated: a theme may now span up to 28
  slots/days.
- **Live HUD lingered after a workout ended (feat 287):** the ⏱ workout-elapsed stat (by the brand) and the rest-timer
  bar could keep showing after a workout was ended or discarded. Two causes: the **rest bar** computed its idle "since
  last set" strip from *any* past set's timestamp (`lastExerciseEndedMs` scans all sessions), so it kept showing with
  no active workout; and the **elapsed stat** only refreshed on the next 1 s rest tick, so it flashed for up to a
  second after End. Fix: `refreshRestBar` now returns early (hiding the bar + clearing its body classes) whenever
  `getActiveSession()` is null — the bar belongs to an in-progress workout only — and `finalizeEndWorkout` /
  `discardActiveWorkout` call `refreshTopbarLive()` (and `refreshRestBar()`) immediately so both clear the instant the
  workout ends. `test/endtimer.spec.mjs` (rest bar + elapsed visible mid-workout, both gone the instant it ends and on
  later ticks; the bar stays hidden with no active session despite past logged sets).
- **Time-mode sets read "Time" and accept hh:mm:ss (feat 288):** timed holds (planks / dead hangs / wall sits / L-sits)
  record a DURATION, but the set table's column header was hard-coded **"REPS"**. The header now derives from
  `exMode().wLabel`/`rLabel`, so timed sets read **"TIME"** (and carries read "DISTANCE"). The value can be **entered
  as raw seconds ("90") OR as a clock string ("1:30", "1:05:05")** and is stored as total seconds: `parseTimeToSeconds`
  normalizes any form (raw / mm:ss / h:mm:ss / leading-or-trailing colon), `formatSecondsClock` renders it back as
  m:ss / h:mm:ss for the field. The native input becomes a text field in time mode (so a colon can be typed), and the
  on-screen numpad swaps its "." key for a **":"** key (no leading/double colon, max two — h:m:s; colons don't count
  toward the 7-digit cap). `commitSetField` parses time for the time-mode reps field; `openNumpad` seeds the buffer in
  clock form so editing reads naturally. The feat-257 hold timer still logs straight into it. `test/timeentry.spec.mjs`
  (parse/format round-trip, "TIME" header, commit accepts both forms, numpad ":" buffer); `test/holdtimer.spec.mjs`
  updated for the new label + clock display.
- **Settings sections default collapsed + remembered everywhere (feat 289):** the per-section collapse state already
  persisted in `state.settingsCollapse`, but (a) sections defaulted to *expanded* and (b) the Settings sub-pages
  (Profile / Cosmetic / Preferences) force-**expanded** every section on projection (`_relocateSettingsPage` did
  `classList.remove('collapsed')`), so the memory never showed on the actual screen. Now every section **defaults
  collapsed** and an explicit expand is remembered: the store reads "collapsed unless the value is exactly `false`"
  (a user-expanded section), applied in `decorateSettingsSections`, `applySettingsFilter`, **and**
  `_relocateSettingsPage` (which now honours the state instead of clearing it). The moved section header keeps its
  bound toggle, so expanding/collapsing on a Settings page persists and survives leaving + returning. `test/
  settingscollapse.spec.mjs` (all collapsed by default, expand persists across navigation, re-collapse persists too).
- **Weekly Summary digest (feat 284):** the Reflect review pages (Log / History / Trends / Volume …) hold a lot of
  detail, so a new **Reflect › Summary** page (📋) distils each **complete** calendar week (Mon–Sun) into a few
  **highlights** (🌟) and **lowlights** (⚠️). The current, in-progress week is intentionally skipped. `weekSummary(off)`
  aggregates a week's sessions (sets, total volume, top lift by e1RM, best session score, most-trained split) and
  compares to the prior week (volume ±%, session count, a split trained last week but dropped) plus program adherence
  (hit-all / missed) when a program exists; `summaryWeeks(max)` returns the complete weeks within the user's training
  history, most-recent-first (capped at 12). The page renders one compact card per week with green/amber bullet lists;
  an empty week within the span shows a single "no training" lowlight. Pure over `state.sessions` + existing helpers
  (`startOfWeek`, `estimated1RMSet`, `programWeekAdherence`). `test/summary.spec.mjs` (skips current week, most-recent
  first, highlight content + week-over-week deltas, page renders cards, rest-week lowlight).
- **Mandatory branding + synced-account identity (feat 290):** the top branding is now **always shown** (the feat-170
  hide toggle is retired and `state.hideBranding` is force-normalized off) so the layout is consistent. A new top-bar
  **identity** chip (`#app-identity`, pinned left, mirrors the live HR/elapsed on the right) shows the **current profile
  name** and, when cloud-synced, the **account avatar**. Cloud connect now requests Google's non-sensitive
  `openid`+`userinfo.profile` scopes and, best-effort, fetches `userinfo` into `state.cloudSync.account =
  {name,email,picture}` (`cloudRefreshAccount`, wrapped so a denied/absent profile scope just means no avatar). An
  active cloud account **force-locks the profile name** to the account name: `effectiveProfileName()` returns it, the
  Profile name input is **disabled** with a 🔒 note, and the Data sync card shows the avatar + name + email. Helpers:
  `cloudAccount/Name/Pic`, `profileNameLocked`, `effectiveProfileName`, `refreshIdentity` (called from `applyBranding`).
  The same `account` shape will light up Dropbox/OneDrive once those flows surface a profile endpoint. `test/
  identity.spec.mjs` (no-cloud uses manual name; synced account locks name + supplies avatar; top-bar render; Profile
  input disabled + lock note; Data card shows account). `branding.spec` / `settingspages.spec` / `navtopbar.spec`
  updated: branding is mandatory and the hide toggle is gone.
- **Timed-hold "Ready · Set · Go" count cue (feat 291):** an opt-in voice cue for holds & hangs. On a timed set's
  start the coach voice says **"Ready… Set… Go"** (fixed lead-in: 0 s / 0.9 s / 1.8 s) and the **set timer (`wTs`)
  only starts on "Go"** — `commitSetField`'s weight path defers the timestamp and runs `startHoldCue(i)` instead of
  stamping immediately. From "Go" it **counts the seconds aloud** (1, 2, 3…) on a `setInterval`, at a **configurable**
  step (`state.holdCue = {enabled, every}`; every=1 → every second, every=5 → 5,10,15…). While active it **overrides**
  the metronome / Mantranome (`metroTick` early-returns) and the rest cues (`restCueTick`), via `holdCueActive()`. The
  cue cancels when the set completes (reps/seconds land), the weight is cleared before "Go", or the log is cleared.
  Config lives in **Settings › Metronome** (toggle + interval). Reuses the feat-257 live hold timer (which keys off
  `wTs`, so it appears on "Go") and the feat-206 `annunce` speaker. `test/holdcue.spec.mjs` (cfg defaults/clamp,
  deferred-then-stamped `wTs` on "Go", abort on weight-clear, completion cancels, metronome suppression, settings UI).
- **Fitness Focus & Archetype (feat 292):** a new **Reflect › Fitness Focus** page (🎯) gives a descriptive,
  personality-type read of *how* you train — **not** a score or judgment (grades/progress already live on
  Achievements & Trends). Each logged exercise is classified into one of six **athletic dimensions** (Max Strength,
  Hypertrophy, Strength-Endurance, Power & Agility, Endurance, Flexibility & Mobility) by its family taxonomy
  (`mega`/keywords), its tracking mode (holds/carries → strength-endurance; cardio → endurance) and — for plain
  resistance — its **rep range** (≤5 strength · 6–12 hypertrophy · ≥13 strength-endurance). `fitnessFocus` tallies the
  last ~16 weeks (broadening to all-time if thin) into a normalized profile; `fitnessArchetype` cosine-matches it to
  the nearest of **16 archetypes** (Powerlifter, Bodybuilder, Powerbuilder, Olympic Weightlifter, Strongman, CrossFit
  Athlete, Hybrid Athlete, Endurance Athlete, Tactical, Calisthenics, Mobility Specialist, Yoga-Runner, Martial Artist,
  Explosive Athlete, All-Rounder, Movement Athlete), with a secondary when close. The page shows the archetype headline
  + blurb, a 6-axis **radar** of the profile shape, and per-dimension bars (% + the top exercise feeding each). Gated
  behind `FOCUS_MIN_SETS`(30)/`FOCUS_MIN_SESSIONS`(5) with a progress bar until there's enough data; a single-focus
  athlete (e.g. a pure powerlifter, all low-rep strength) still qualifies. `test/archetype.spec.mjs` (classification by
  mode/rep-range, the data gate, cosine archetype matching for strength/endurance/flex/balanced profiles, page render).
- **Full-body "monster" plans (feat 293):** six big, demanding, train-it-all-in-one-sitting seed plans (SEED_PLANS
  tranche 13) — **The Full-Body Behemoth, Total-Body Annihilation, The Iron Decathlon, Strongman's Full-Body Gauntlet,
  Hybrid Beast (Full Body)** and **The Two-Hour Full-Body Crucible** — each ≥8 steps and ≥30 sets, opening with heavy
  compounds then sweeping every pattern (squat · hinge · push · pull · carry · core, plus strongman/Olympic/plyo
  flavours on the hybrid ones). They self-seed via the additive `seededPlanIds` ledger. Four classify as **Full Body**;
  the strongman & hybrid ones legitimately read as **Mixed** (they blend strength + conditioning + odd implements).
  `test/fullbodyplans.spec.mjs` (seed, every step satisfiable, monster size, category, unique ids/names catalogue-wide).
- **Purge all non-embeddable media (feat 294):** the Media Wizard toolbar gains a **🗑 Purge link-only (N)** button
  (shown only when `N > 0`) that, after a confirm, removes every **non-embeddable** clip across all exercises — pure
  external links with no inline preview (no `embedUrl` and not an image). `purgeNonEmbeddableMedia` filters each
  `state.exerciseMedia[key]` to `mediaPlayable(m)` (so embeddable videos **and** images are always kept) and drops any
  emptied key; `countNonEmbeddableMedia` powers the button label. Read-only-guarded, save-on-change.
  `test/mediapurge.spec.mjs` (purge keeps embeds/images, removes link-only, drops emptied keys; toolbar button appears
  only with link-only media, carrying the count).
- **HIIT Blocks — coach-driven interval timer (feat 295):** a new **Execute › HIIT Blocks** page (⏱️) of preset,
  coach-driven interval workouts — a fixed series of **timed work + rest** the engine auto-runs while the voice urges
  you through it. `hiitFlatten` expands a block (`{prep, work, rest, rounds, exercises[]}`) into a flat step list —
  `prep`, then `(work, rest)` per round (rotating the exercises, no rest after the last round). The runtime (`_hiit`)
  drives a 200 ms tick that counts down each step, **announces** work/rest transitions (`annunce`) with last-3-second
  countdown beeps, and auto-advances; `_hiitAdvance` logs each completed work interval's seconds. A **full-screen
  runner overlay** (`#hiit-runner`, work=green / rest=blue / prep=amber) shows the big timer, current exercise, round
  X/N, and Skip / **Pause** / Stop. **Pausing is recorded** — `pauseCount` + accumulated `pausedMs` — and surfaced live
  and in the saved summary. On finish/stop, `hiitFinalize` logs to the active-or-new session: per-exercise **time sets**
  (seconds, `hiit:true`) plus a **`session.hiitBlocks`** entry `{name, work, rest, rounds, pausedSec, pauses,
  completed, at}`. Six presets cover **Tabata** (classic + mixed), **battle-rope intervals**, **bodyweight 30/30**,
  **sprint intervals** and an **AMRAP** burner — all time-based conditioning movements. `test/hiit.spec.mjs` (flatten
  shape + rotation, preset validity, full walk → session log, pause accounting recorded, launcher + runner open/close).
- **Coach personalities (feat 296):** the spoken coach is now a selectable **persona** — a voice profile **and** a
  phrasing flavour — beyond the old neutral/gruff pair. `COACH_PERSONAS` ships seven: **Neutral** (the device voice,
  untouched), **Gruff Coach** (the deep default), **Hype Coach**, **Zen Coach**, **Drill Sergeant**, **The Analyst**
  and **Hype Buddy**. Each carries `pitch`/`rate` (applied in `coachify`) and a `flavor` map that reshapes the key cues
  via `coachPhrase(kind, base, ctx)` — e.g. the Sergeant shouts (`'Last set'` → `'LAST SET, MOVE!'`), Hype hypes, Zen
  breathes — wired through set start/end (`annunceSetStart/End`), HIIT work/rest/prep (`hiitCueStep`) and the hold-cue
  "go". `ttsVoice` stays the master voice toggle (`'system'` = untouched, honouring the legacy contract + explicit
  voiceURI overrides); the **Settings persona picker** sets `state.coachPersona` and keeps `ttsVoice` in sync
  (neutral → `system`, else → `auto`), then previews the persona's sample line. `state.coachPersona` is persisted and
  migrates from the old toggle. The registry is declared before `loadState()` so `normalizeState` reads it without a
  temporal-dead-zone error. `test/coachpersona.spec.mjs` (registry shape, per-persona pitch/rate, per-persona phrasing,
  picker persist + voice-sync, legacy migration); `coachvoice.spec` updated for the picker.
- **Per-coach TTS voice (feat 297):** each persona now has its **own** TTS voice with a **sensible auto-default**.
  `state.coachVoices` maps `personaId → 'auto' | 'system' | voiceURI`; `coachVoiceFor(persona)` resolves it ('system' →
  device default, a voiceURI → that voice if present-on-device else fall back to auto). The **auto** pick is
  persona-aware: `pickCoachVoiceFor` scores `getVoices()` against the persona's **`vbias`** (e.g. Gruff/Sergeant favour
  a deep male voice, Zen leans softer/female, the Analyst a clear UK voice), so every coach starts on a fitting voice.
  The Settings persona block gains a **per-coach voice `<select>`** (Auto-for-this-coach / System default / every device
  voice, EN-first, UK/US tagged) for the *active* persona; choosing one persists to `state.coachVoices[id]` and previews
  it in that voice. Neutral shows no picker (it uses the device default). The `onvoiceschanged` handler re-renders the
  open drawer so the list fills once the OS reports its voices, and a legacy explicit `ttsVoice` URI migrates into the
  active coach. `coachVoice()`/`pickCoachVoice()` stay as active-persona wrappers (back-compat). `test/
  coachpersona.spec.mjs` (per-persona auto-pick differs by bias, explicit + system per-coach choices win, the settings
  voice picker renders + persists, neutral has none); `coachvoice.spec` updated to the per-coach override.
- **Plans for neglected movement areas (feat 298):** a fresh per-family coverage audit (count of SEED_PLAN steps
  referencing each family) found loggable movements **no plan touched** — Roman chair, CrossFit moves, TRX,
  specialty bars, pin lifts, mace/club & specialty implements, cable attachments — plus the lower-leg / joint prehab
  set used only once (tibialis, ATG knees-over-toes, adductor, neck). Seven new SEED_PLANS (tranche 14) feature them:
  **Lower-Back & Core Fortress** (Roman chair), **Functional Throwdown** (CrossFit moves), **Suspension Total Body
  (TRX)**, **Specialty Bar Power** (specialty bars + pin lifts), **Mace & Club Flow** (mace/club + implements),
  **Bulletproof Joints & Lower Leg** (tibialis/ATG/adductor/neck) and **Cable Sculpt Circuit** (cable attachments).
  Every step was verified to resolve to a qualifying variation; they self-seed via the additive `seededPlanIds`
  ledger. `test/neglected.spec.mjs` (seed, every step satisfiable, the once-zero families now have ≥1 step, catalogue
  still free of duplicate ids/names).
- **Composite "Today's Readiness" score (feat 299):** the capstone over the feat-261..264 trio — one **0..100**
  headline that answers "push, hold, or back off today?" by folding the three signals into a single card atop the
  **Volume** tab (above the per-group breakdown). `compositeRecovery` is the **load-weighted** mean of feat-262
  group readiness over groups trained in the last ~10 days (weighting by each group's own most-recent load anchors
  it to the lifts you actually train, and returns `null` when there's no recent signal); `rpeTrend` compares the
  mean session-RPE of the 3 most-recent RPE-tagged sessions vs the prior up-to-5 (positive = sessions feeling
  harder; `null` unless RPE logging is on, feat 261, with ≥4 tagged sessions); `findPlateaus().length` (feat
  263/264) counts currently-stalled lifts. `trainingReadiness` starts from `recovery×100`, docks **−6 per stalled
  lift** (capped at 4) and up to **−15** for a rising RPE trend, then bands the result: **≥80 Primed · ≥60 Ready ·
  ≥40 Ease off · else Back off**. The action line is **reactive** (unlike the scheduled mesocycle deload, feat
  232): when low recovery is corroborated by **≥2 stalled lifts** it escalates to "take a **deload week** (~−10%
  load & volume)" — the classic unplanned-overreaching signal. Pure compute over the log (stores nothing new, same
  spirit as feat 262); hidden until ≥3 sessions + a recent recovery signal. `renderReadinessCard` shows the score,
  status pill and the factor chips (Recovery % · N stalled · Effort ↑/→/↓). `test/readiness.spec.mjs` (null on thin
  history, rested→Primed/Ready, thrashed→deload band, composite null when nothing recent, RPE-trend rising/off/sparse).
- **Add-set keeps the new row in view (feat 300):** appending a set on the log-sets sheet left the new row
  hidden, because two scroll layers stack — the sets list is an inner box (`#trk-sets-container`,
  `max-height:40vh`, own `overflow-y`) and the modal below it has a `position:sticky` footer. `revealLastSetRow()`
  (called from `addSetRow`, `copyWeightToNextSet`, `duplicateLastSet`) first scrolls the inner list to its
  bottom to surface the newest row, then — only if that row still sits behind/below the sticky footer at the
  modal level — nudges the modal just enough to clear it (minimal, `behavior:'smooth'`). `test/setaddscroll.spec.mjs`
  (after appending the 41st row to an overflowing list, the last `.set-row` ends fully above the footer and on-screen).
- **Hack squat counts for a squat plan step (feat 301):** clarifying feat 253 — a hack squat should *satisfy a
  squat step in a normal plan*, even though it must NOT inflate the BARBELL squat *achievement*. The two are
  separate mechanisms: the achievement exclusion is a name regex (`exclude:/hack|…/`, unchanged), while plan-step
  matching is family-based. Hack squats live in the **leg-press** family, so a `_mvOpt('squat')` step didn't accept
  them. Fixed by the additive secondary-parent cross-listing (feat 167): `SECONDARY_PARENTS_EXTRA` now maps the six
  hack-squat variants (Hack Squat / Machine / Reverse + the three extra foot-placement/sissy seeds) → `['squat']`,
  so `optionMatchesVar`/`stepQualifyingVarSet` accept them and the squat-step picker offers them as cross-links —
  while leg-press stays their primary. The `SECONDARY_PARENTS_EXTRA` application moved out of
  `reconcileVariationParents()` into `applyExtraSecondaryParents()`, called **after** `applyExtraVariations()` so the
  extra-injected (`b1a1…`) hack squats are in `VAR_INDEX` in time to be cross-listed. `test/hacksquat.spec.mjs`
  (satisfies squat + still matches leg-press; extra foot-placement variant cross-listed; achievement still excludes).
- **Life Fitness arm machines (feat 302):** added the **Preacher Curl Machine (Life Fitness)** and **Triceps
  Extension Machine (Life Fitness)** the user couldn't find. Both go in via `EXTRA_VARIATIONS` (feat 17/18), so a
  single entry each lands in **both** the loggable `FAMILIES` (picker/tracking, via `applyExtraVariations`) and the
  reference `exercises` docs (via `injectExtraIntoReference`) — attached to the existing **Bicep Curl** /
  **Tricep Extension** families with full cue/setup/movement/mistakes/programming/tip. `test/lifefitness.spec.mjs`
  (loggable in the right family + standard mode, present in reference docs, findable by "life fitness"/"preacher" search).
- **Workout-tab cleanup (feat 242):** the active-workout dashboard's **metronome bar** (run toggle · bpm · ⚙)
  was a duplicate of the Mantranome controls in the 🔊 sound menu (feat 205) — removed to reclaim space; the
  HR bar and End/Discard controls stay. The engine + its `refreshMetronomeUI` updater already guarded the
  now-absent elements.
- **Set-start cue on a copied weight (feat 243):** the short-press **Copy** (`copyWeightToNextSet`) wrote the
  copied weight and stamped `wTs` *directly*, bypassing `commitSetField`, so the **set-start annunciation**
  (feat 206) never spoke when you started a set with Copy. It now routes through `commitSetField` like the
  long-press copy paths (`copyRepsToOpenSet` / `duplicateLastSet`), so both branches stamp `wTs` **and** speak
  the new set's position. Covered by an `annunce.spec` case.
- **Live HR + elapsed by the brand (feat 244):** a `#topbar-live` status next to the centered brand shows
  **💓 bpm + a sparkline** of recent samples whenever a monitor is connected, and **⏱ elapsed** (mm:ss → h:mm:ss)
  whenever a workout is active. `refreshTopbarLive()` is driven by the 1 s rest tick (elapsed) and each HR sample
  (`hrOnSample` fills a capped `_hrSpark` ring buffer). On narrow screens a `has-topbar-live` body class
  de-centers the brand (drops the 315 badge, shrinks it, brand-left / stats-right) so both fit; desktop keeps the
  centered brand with the stats pinned right. Covered by `test/topbarlive.spec.mjs`.
- **Current gym on the active workout (feat 245):** the active dashboard opens with a gym strip (`workoutGymHtml`)
  — 📍 the active gym, a *located* badge when it has GPS coordinates, a 📡 re-locate button, and Change → the Gyms
  page; "No gym set · Pick a gym" when gyms exist but none is active, hidden entirely when no gyms are defined.
  Workout start already GPS-auto-selects the nearest saved gym within 2 km (feat 38, `startWorkout` →
  `pingLocationSelectGym`); this surfaces the result. Covered by `test/workoutgym.spec.mjs`.
- **End slot → Plan Detail; plan card off the workout tab (feat 246):** the contextual shortcut row's third slot
  changed from **🏁 End** to **🗺️ Plan** (`openPlanLive` → Plan Detail; ending a workout lives on the Workout page's
  ⏹ End Workout, tap-confirm / hold-skip). The workout tab now shows only a **compact plan strip** (`renderPlanStrip`:
  name · sets/steps · ETC · "Details ›") instead of the verbose step card; tapping it opens the Plan Detail page.
  That page now hosts the **interactive plan guide** (`renderPlanGuide` + the extracted `bindPlanGuide`: step-pick,
  ⏭ skip, option buttons) for the **live** session — a plain visit (🗺️ / strip / breadcrumb) shows the guide, while a
  pinned execution (the step-bar deep-link, the guide's 📊 Execution button, or a past session) shows the read-only
  recap (`renderPlanExecutionView`). `openPlanLive()` clears the pin so a stale recap can't shadow the live guide.
  Covered by repointed `dupsteps`/`skipstep` cases + new `plandash` (strip-vs-card) and `workoutshortcuts` (🗺️ Plan)
  cases.
- **Refresh always lands on Workout (feat 241):** a refresh / PWA restart used to sometimes open to a blank or
  wrong screen — you had to tap the brand to get to your workout. Cause: the legacy `restorePanel()` boot step
  re-surfaced the last-visited *panel* from `gt_panel` (e.g. `panel-reference`) on **top** of the router, which had
  already rendered Workout into `#panel-tracker`; with the nav-tabs retired this left a stale non-tracker panel
  showing (blank if it hadn't been populated) until a later re-render — or a brand tap — flipped it back. The
  router (`currentPage`) is the source of truth now, so boot simply `navTo('workout', { replace:true })` and the
  panel restore is gone. Two defensive hardenings ride along: `switchPanel` no longer throws on a null `btn` (the
  router surfaces panels without one), and `_surfacePanelForPage` activates the wanted panel even when *no* panel
  is currently active instead of bailing out (which would leave a black screen). Covered by
  `test/boottoworkout.spec.mjs` (browse to the Reference → refresh → lands on Workout with `#trk-main` populated;
  `switchPanel(panel, null)` surfaces without throwing).
- **Plan picker — 3h Quick Pick budget + paginated list (feat 240):** two refinements to the plan picker.
  `PLAN_PICK_TIMES` gains **150** and **180** chips, so Quick Pick now spans **15 min → 3 h** (the budget cap
  was already 240, and the recommender's time-fit scoring + reason text handle the longer budgets unchanged —
  a ≈90-min plan that sank on a half-hour now "fits your 180"). The plan **list paginates at 12/page**
  (`_plansPage`): it pages over the category-rank-ordered, favourites-first flat list and re-emits a category
  head whenever it changes on a page, with a **‹ Prev / Page X / Y · N plans / Next ›** pager top and bottom
  (disabled at the ends). Any search/category/length/favourite change resets to page 1. Covered by
  `test/quickpick.spec.mjs` (the 180 chip is offered, selectable, and lifts a long plan's rank) and
  `test/planlist.spec.mjs` (12/page, prev/next + end-disabling, filter-resets-page); the favourites test now
  reads the on-star from the favourites-only view since a deep favourite may sit past page 1.
- **Media Gallery page (feat 239):** a dedicated **Study › 🎞️ Media Gallery** page that shows *every* reference
  clip — movement demos and variation links alike — in one searchable, filterable, scrollable grid, reachable
  from the **Reference** header (a 🎞️ button) and the **bulk wizard** toolbar (🎞️ Gallery), plus the breadcrumb
  nav-tree. `allMediaClips()` flattens `state.exerciseMedia` into `{ key, idx, m, owner, watchedAt, creator }`
  records (`mediaOwnerInfo(key)` resolves a variation uuid or a movement/family id to a label + kind);
  `mediaGalleryClips()` applies the search (exercise / creator / link text), a **watch filter** (All / ▶ Unwatched
  / 👁 Watched) and a **kind filter** (All / Movements / Variations), sorting **unwatched-first** then by most-recent
  watch. Each tile shows a YouTube thumbnail (`mediaThumb`) or a platform placeholder, a ▶/↗ affordance, the
  movement/variation label + parent + creator, and a **👁 watched `<when>`** badge (or "unwatched"). Clicking a
  playable tile toggles an **inline embed** in place and starts the feat-238 dwell — lingering past the window marks
  the clip watched (`_watchDwell` → `markMediaWatched`), so the gallery doubles as a "what have I actually
  reviewed?" tracker; merely scrolling the grid never marks anything. The list caps at 120 with a "refine the
  search" note. Covered by new `test/mediagallery.spec.mjs` (flatten + filter, the YouTube-thumbnail helper, the
  rendered grid + segments, the dwell-marks-watched-then-filter path, unique-emoji Study registration, and the
  Reference → gallery navigation).
- **Media wizard — "needs media" filter, inline preview, watch tracking (feat 238):** three additions to the
  bulk wizard. (1) A **⚠ needs media** toggle (`mediaWizardState.uncoveredOnly`) restricts the list to genuine
  gaps — a **variation** is "uncovered" only when it has no clip of its own *and* its parent **movement** has no
  demo either, and a movement is "uncovered" when it lacks its own demo; it overrides "with media only". (2) An
  embeddable link gets a **▶ preview** button that toggles an inline `<iframe>` (the same nocookie embed URL the
  carousel uses) right under the row, so you can eyeball a clip without leaving the wizard. (3) A **watch-tracking**
  engine records the last time you *actually watched* a clip: `mediaWatchKey(m)` keys by the clip itself
  (`platform:vid`, or the URL) so a watch is shared everywhere that clip appears; `_watchDwell(el, m)` starts a
  5 s timer when a preview iframe mounts and only calls `markMediaWatched(m)` if the embed is **still connected**
  after the dwell — opening the preview and lingering counts, scrolling past a row never does. Each row shows a
  **👁 watched <when>** badge (`fmtDate`) or "never watched". State lives in `state.mediaWatched` (a clip-key →
  ISO map, in `SETTINGS_KEYS`, normalized to `{}`). Covered by new `test/mediawizard.spec.mjs` cases (clip-keyed
  marking shared across exercises, the uncovered-by-self-and-parent filter, the rendered preview button + iframe
  mount, and the dwell marking a previewed clip watched while a merely-rendered row stays unwatched).
- **Creator "stable" in the media wizard (feat 237):** the wizard now surfaces *who* your reference clips
  come from. `mediaCreator(entry)` reads the creator/channel from the link wherever the platform exposes it —
  a **TikTok**/​**Instagram** `@handle` in the path, a **YouTube** channel link (`/@handle`, `/c/`, `/user/`,
  `/channel/`), or a YouTube watch URL carrying **`&ab_channel=`** (what a desktop "copy link" includes); a
  plain video URL has no channel, so it reads as **untagged**. The creator is stored on each entry at add
  time (`addExerciseMedia`/`applyMediaEntries`) and derived on the fly for older links. A **🎬 Creator stable**
  panel atop the wizard lists every distinct creator by link count (plus an untagged tally), each with a **🗑
  purge** button — `purgeCreator(name)` removes every link attributed to that creator across all exercises
  (confirm-gated, with the count). Each link row now shows its **creator label** (or "untagged"). Covered by
  new `test/mediawizard.spec.mjs` cases (per-platform creator extraction incl. the plain-video null, the
  stable grouping + counts + cross-exercise purge, and the rendered panel + purge buttons + per-entry label).
- **Bulk media wizard — movements, filter, coverage, parent badge, sheet I/O (feat 236):** the desktop
  wizard (feat 110) managed only variation links; it now mirrors the feat-235 two-level model. `mediaWizardRows()`
  emits **MOVEMENT rows** (family-keyed demos) alongside variations — the movement row is accent-bordered with
  a **MOVEMENT** tag, its own links, and a **child-coverage** read ("X/Y variations have video", green when
  full / amber partial / red none). Every **variation row** that sits under a movement with its own demo gets a
  **▸ movement demo ✓** badge. A **kind filter** (All / Movements / Variations) restricts the list; the stat
  line splits the counts ("V variations · M movements · L links · N not embeddable"). The toolbar gains
  **📝 Export sheet** (the feat-174/235 `exportMediaSheet` choice dialog) and **⬆ Import sheet** (a file input
  → `importMediaData`), so the whole Claude round-trip happens inside the wizard. All media ops are key-generic
  (`addExerciseMedia`/`removeExerciseMedia`/`reassignMedia` on a uuid *or* a family id), and the move-target
  search now lists movements too, so a general demo can be moved up to its movement. Covered by new
  `test/mediawizard.spec.mjs` cases (movement rows + child coverage + parent badge, the kind filter, the
  toolbar controls + tagged movement row + split stat, and the Import-sheet → importMediaData round-trip);
  the existing wizard tests were updated for the row `.id` field (uuid for variations, family id for movements).
- **Media sheet covers movements + variations with explicit parentage (feat 235):** the Claude-fillable
  media reference sheet (feat 174) listed only variations, with the movement merely a `## ` group header.
  It now lists **both levels**: each `## ` section opens with a fillable **MOVEMENT** entry
  (`- MOVEMENT — <title>  {mid: <familyId>}`) — a slot for a general demo of the pattern itself — and every
  **variation** below carries a `{parent: <familyId>}` tag right after its `{id: <uuid>}`, so the
  movement→variation hierarchy is explicit even reading a line out of context. `parseMediaSheet()` learns
  two tags: `{mid:…}` → a `{id: familyId}` entry (which `resolveExerciseKey` already maps to the family key,
  and `openExerciseMedia(uuid, …, movementId)` already surfaces on the variation's "Whole movement" carousel
  — so movement-level media displays with **zero model change**), and it strips the new `{mid}`/`{parent}`
  tags from titles; the `{id: <uuid>}` variation tag stays byte-identical so the existing round-trip is
  untouched. The header stamp now reports both counts ("84 movements (N with links) · 789 variations (M with
  links)"); the missing-links scope keeps a movement on the to-do sheet when it lacks its own demo even if
  all its variations are covered. The sheet help text explains the two levels. Covered by new
  `test/mediasheet.spec.mjs` cases (movement entry + per-variation parent tag + dual-count stamp,
  movement-link round-trip keyed to the family and combined onto the variation carousel, missing-scope
  movement retention) alongside the unchanged feat-174 round-trip tests.
- **Next-load suggestion in the log sheet (feat 234):** brings feat-233's auto-progression to the moment
  you load the bar. When you open an exercise to log it live (standard weight×reps, not editing a past
  entry) and it has history, the sheet shows a concrete **🎯 Aim for W × R** target — the same
  double-progression, deload-aware `suggestProgression()` result — with its rationale ("Hit 12 reps — add
  load, reset to 8") and colour by action (green add-load / accent add-rep / amber deload), sitting just
  under the existing qualitative `getProgressionSuggestion` feedback. A one-tap **↪ Load W** prefills the
  **weight only** of the next empty set (you still log the reps you actually do) and pre-seeds the plate/
  loader picker via `seedSetupForWeight` — done with a direct `pending.sets` assignment (matching the
  feat-58 history and feat-82 plan prefills) so it doesn't prematurely stamp the set-start or annunce.
  Gated off for cardio/time/bodyweight modes, edits, and no-history lifts. Covered by
  `test/progsheet.spec.mjs` (the target + Load button for add-load, weight-only prefill, the add-a-rep case,
  the deload back-off, and the edit/no-history/non-standard gating); the full logging-spec cluster stays
  green.
- **Auto-progression (feat 233):** closes the planning loop by connecting periodization's *intent* to your
  *logged* numbers. A new **Reflect › 🚀 Progression** page reads each recently-trained lift's **most recent
  top set** (`recentTopSet` — the heaviest set by e1RM of the latest session that trained it) and suggests
  the next target via **double progression** (`suggestProgression`): climb a rep window keyed to where you
  already train (`progRepRange`: ≤6 → 3–6 · ≤12 → 8–12 · else 12–20), and when you hit the top, **add the
  smallest sensible load** for the implement (`progLoadStep` — a barbell's +5 lb/+2.5 kg, the next dumbbell/
  kettlebell size, a pin's +10 lb/+5 kg) and reset to the bottom; mid-range just **adds a rep**. On a
  **deload week** (periodization on) it instead suggests backing the load off ~10% — so the suggestion line
  honors `mesoCurrentWeek()`. `progressionList(120d)` gathers every recently-trained lift (deduped, newest
  first) and the page shows each as **current → next** with an ⬆ add-load / ➕ add-a-rep / ⬇ deload tag and a
  one-line rationale. Strictly **suggestions** — nothing is written to your sets. Covered by
  `test/progression.spec.mjs` (most-recent-session top set, add-load vs add-rep double progression, the
  deload back-off, rep-range buckets + unit-aware load step, list dedup/recency, and the page's rows +
  empty state).
- **Periodization mesocycle (feat 232):** an optional multi-week block layered onto the split planner —
  volume **ramps base → peak then deloads**, repeating. `mesoWeekPlan(length)` lays out a 3–6 week cycle:
  the accumulation weeks scale linearly **1.0× → 1.3×** (Base → Build → Peak) with rising RPE cues, the last
  week deloads to **0.55×** (RPE 5–6); `mesoCurrentWeek()` reads the current week from the start date,
  cycling continuously after each deload. The big tie-in: `splitAnalysis(plans, volMult)` now takes a volume
  multiplier, so the **coverage over/under analysis scales to the current week** — accumulation weeks read
  closer to (or past) MRV, the deload pulls everything down — and the card flags "week N · X%". A
  **📈 Periodization** card on the planner toggles the cycle on/off (`state.meso = {enabled, length, start}`,
  in `SETTINGS_KEYS`), shows a current-phase banner ("Week 2 of 4 · Build · 115% volume · RPE 8"), a week
  strip (each week's phase + volume %, current highlighted), cycle-length chips, and a "↻ Restart this week"
  to re-anchor the block. It's planning guidance — not auto-applied to logged sets. Covered by
  `test/periodization.spec.mjs` (the ramp/deload plan, current-week tracking + wrap, the analysis multiplier,
  the card toggle/strip/banner/coverage-tag, and length-change + restart re-anchoring).
- **Program adherence tracking (feat 231):** closes the loop on the scheduled program by matching your
  logged sessions back to it. `programWeekAdherence(weeksBack)` walks a Mon–Sun week and grades each
  scheduled day **done** (a session logged that day on the scheduled plan) · **off-plan** (you trained, but
  a different/no plan) · **missed** (a past scheduled day with nothing) · **today** · **upcoming**, with
  this-week totals; `programAdherenceStreak()` counts consecutive scheduled sessions trained walking back
  from yesterday; `programAdherenceTrend(4)` gives done/scheduled for the last four weeks. The program card
  now leads with an adherence line ("This week **3/7** done · 2 missed · 🔥 2-session streak" + four
  trailing-week dots), the **weekly agenda shows a ✓ / ✗ status per scheduled day** (missed days struck
  through, done days greened), and once **today** is done the **Start** button is replaced by a "done ✓"
  marker so you're not nudged to repeat it. Trailing weeks are retrospective (they assume the same schedule
  applied) — a fair proxy for "are you training on your planned days". Covered by `test/adherence.spec.mjs`
  (done vs missed vs off-plan, the streak with a gap, the trailing trend, the no-program guard, the card
  summary + per-day icons, and Start→done once today is logged).
- **Scheduled weekly program (feat 230):** the future-oriented layer over the split planner — turn a
  recommended split into a saved, day-by-day weekly **program** the app remembers and looks ahead with.
  **📅 Save as program** lays the recommended split onto sensible, recovery-spaced days
  (`PROGRAM_DOW_PICKS`: 3 → Mon/Wed/Fri, 4 → Mon/Tue/Thu/Fri, …) as `state.program` ({sessions, minutes,
  pool, week[7]} keyed by JS day-of-week). The planner then shows a **Monday-first weekly agenda** (each day
  its plan or a rest day, today highlighted), a **Today** banner with a **▶ Start** button, and lets you
  **tap any day to reassign it** (`cycleProgramDay` rotates Rest → each pool plan → Rest); **↻ Reschedule**
  re-lays the split, **Clear** drops it. `programToday()` / `programForDow(dow)` / `programNextUp()` resolve
  the planned session for a day or the next one within the coming week. The **dashboard plan bar** now
  surfaces the day's scheduled session — when a program has today planned and there's no active plan, a
  **📅 Today: <plan>** Start button sits next to "Use a plan" so the program is actionable right where you
  begin a workout. `state.program` travels with settings (`SETTINGS_KEYS`), validated/dropped if malformed.
  Covered by `test/program.spec.mjs` (day placement + distinct pool, dow resolution, day-cycling, next-up,
  the planner save/agenda/clear, day reassignment, and the dashboard Start hook attaching the plan).
- **Split Planner (feat 229):** an optional **Prepare › 🗓️ Split Planner** page that answers "given X
  sessions across Y days with Z hours each, what split should I run — and how well does it cover me?" Two
  halves: a **recommender** and an **over/under analysis**. `buildRecommendedSplit({sessions, minutes})`
  lays out a slot template by session count (2 → Full Body ×2, 3 → PPL, 4 → Upper/Lower ×2, 5 → PPL+UL,
  6 → PPL ×2) and fills each slot with the plan that best **covers that slot's muscle groups** (`slotCoverage`
  = breadth over `SLOT_GROUPS`, ≥2 sets per group — so a proper rowing day wins the Pull slot, not a tiny
  Arm Day, and a tidy 60-min Upper day beats a 3-hour marathon) **and fits the clock** (`planTimeScore`),
  avoiding repeats. `splitAnalysis()` then rolls the chosen plans' per-muscle volume (`planMuscleAcc` →
  `splitGroupVolume`) up to groups and compares each to its weekly **MEV–MAV–MRV** band (`GROUP_TARGETS`,
  summed from the muscle model), classifying **under / light / on-target / over** and an overall **balance
  score** (how far off-base, 0–100) with under/over counts — so 3 sessions/week honestly reads as many
  groups under MEV while 5 climbs toward balanced. The page renders session/day/hour input chips
  (`state.splitPlan`, in `SETTINGS_KEYS`), the recommended day-by-day split (each with a **Use** button via
  `planUseForWorkout`), and a coverage bar per group (your sets vs the green MEV–MRV window). Covered by
  `test/splitplanner.spec.mjs` (target bands, plan→group loading + over/under flags, slot template + per-slot
  coverage, more-sessions→better-balance, the rendered page + chip persistence, Use attaches the plan).
- **Anatomy heatmap resolution actually splits the ovals (feat 228):** the wireframe heatmap painted the
  same fixed ~24 region ovals at every resolution — switching group → muscle → heads only recoloured them,
  never adding detail. Now `heatValuesFromAcc()` computes each region's **sub-components** for the chosen
  level (`regionSubsFor`: group → the one muscle group; muscle → each modeled muscle; head → each muscle's
  heads, or the muscle itself if it has none), each with its own value, and `anatomyHeatmapSvg()` tiles each
  region's bounding ellipse(s) into one sub-oval per sub-component (`_splitEllipse` stacks them along the
  longer axis). So the oval **count grows with resolution** — e.g. group 29 → muscle 42 → head 56, and the
  Delts region becomes 1 oval (shoulders) → 3 (front/side/rear) → its heads — with each split oval carrying
  its own colour, `data-hm-v`, `data-hm-sub` label and tooltip. Group level is unchanged (one oval per
  bilateral placement, the group value), so the live/replay group-level views and their specs are
  untouched. Covered by a new `heatmap.spec` case (group < muscle < head oval counts; Delts 1→3→heads;
  split ovals carry sub-labels).
- **Breadcrumb-only top bar (feat 227):** finishes retiring the legacy nav chrome. feat 224 only *hid* the
  old 7-tab bar (Dashboard/Log/History/Volume/Trends/Body/Gyms) with CSS, so anyone on a cached PWA shell
  still saw it — now it's **removed from the DOM entirely** (the `currentTab` variable mirror still drives
  `switchToTab`/`render()`; nothing visual depends on the elements). The top-bar **⚙️ Settings** and **❓ Help**
  buttons are hidden too (`display:none !important` to beat their later `display:flex`), kept in the DOM only
  so the goPanel/openHelp shims and specs can still click them — navigation to those sections now goes
  through the **breadcrumb → nav tree** (Settings ▸ Preferences/Help). The 🔊 sound/haptics menu stays (it's
  an intentional popup). Specs updated off the dead tab DOM: `router.spec`/`sessionslog.spec` assert on
  `currentTab`/`currentPage` + `pageTitle()` instead of `.tab.active`; `navtree.spec` asserts the bar is gone
  and the buttons are hidden; `feedback.spec`'s haptic probe taps the always-visible brand button.
- **Quick-pick plan recommender (feat 226):** a **⚡ Quick Pick** block at the top of the plan picker that
  recommends the best plans for the time you have and what you've trained lately. Two pure, unit-testable
  scoring axes: **time** — `planTimeScore()` peaks when `estimatePlanMinutes` exactly fills the chosen
  budget, eases off for finishing early and falls steeply for overrunning (0 at 2× the budget); and
  **freshness** — `recentMegaLoad(4d)` tallies logged sets per muscle-group (mega) over the last four days
  (mirroring `sessionSplitLabel`'s bucketing), and `planFreshnessScore()` weights a plan by how *little* its
  mega mix has been hammered (saturating at ~12 sets) — so it steers you toward recovery-aware variety. The
  combined score (0.6 time + 0.4 freshness, with a small favourite bump) drives `recommendPlans()`, whose
  top-3 render as cards with a plain reason ("≈45 min, fits your 45 min · legs is well-rested"). A row of
  time chips (15/30/45/60/90/120) remembers the budget in `state.planPickMinutes` (in `SETTINGS_KEYS`); the
  block shows on the unfiltered landing view and steps aside once you search or filter. Recommendation Use
  buttons reuse the existing `data-plan-use` → `planUseForWorkout` path. Covered by `test/quickpick.spec.mjs`
  (recentMegaLoad tally, freshness ordering, time-fit ordering, end-to-end ranking + reason, the rendered
  block + active chip, chip click persists + re-recommends, Use attaches the plan, hide-on-filter).
- **More workout plans — tranche 7 (feat 225):** 14 new seed plans broadening the library to ~74:
  aesthetics (Beach Body Pump, Glutes & Shoulders), specialization (Back Width, Hamstring Focus, Bench
  Press Specialist, Deadlift Builder), dedicated hypertrophy splits (Push / Pull / Leg Hypertrophy),
  quick hits (Express 10, Hotel Room 20, Total Core & Abs) and conditioning (Sprint & Sled, EMOM Full
  Body 30). Authored against **verified** movement family ids (re-probed via `tools/probe-families.mjs` —
  the feat-175 lesson: a wrong id silently no-ops), each with a 1–5 intensity and a written description, so
  they seed through the existing additive `seededPlanIds` ledger for current users. The short entries
  deliberately deepen the "quick" length bucket so the feat-226 recommender has range to match a tight
  time budget. Covered by `test/plansmore.spec.mjs` (all 14 present + complete + options resolve, ids
  unique, fresh-user seeding + authorship + ledger, sensible categories, widened quick bucket).
- **Retire the residual legacy tab pills (feat 224):** the feat-221 breadcrumb + global nav tree made the
  old 7-pill tracker tab bar (Dashboard · Log · History · Volume · Trends · Body · Gyms) redundant — a
  second, less intuitive navigation surface sitting right under the breadcrumb. It's now hidden
  (`#panel-tracker > header .tabs { display:none }`) but kept in the DOM so the `currentTab` class-mirror
  that legacy specs assert on still updates. With the pills gone the tracker `<header>` only ever carries
  the **contextual 📄 PDF button** (History/Volume/Trends), so `renderCurrentPage()` now toggles a
  `header-collapsed` class that zeroes the header's padding + border on every other page — no empty strip
  under the breadcrumb. Covered by the two new `test/navtree.spec.mjs` cases (pills hidden yet in-DOM with a
  working mirror; header collapses on Workout, expands to host the PDF button on Volume).
- **Equipment-true setup tools (feat 223):** classic movements whose *names* carry no equipment word
  (Arnold Press, Kroc Row, Viking Press, Turkish Get-Up, Svend Press…) were silently inheriting the
  family's first-listed equipment in `autoSetupKind()` — so the **Arnold Press shipped with the barbell
  plate-loader** instead of a dumbbell picker. A new authoritative **`VAR_EQUIP_OVERRIDES`** table (keyed
  by variation id) pins ~25 such movements to their real implement and is consulted first; the keyword
  regexes also now accept **spaced names** (`trap bar`, `t bar`, `roc it`) and a bare **`Plate`** title
  routes to the plate picker (Plate Front Raise, Plate Pinch, plate tibialis raises). User overrides
  (`state.exerciseSetup`) still win over the table. The Arnold Press setup text was corrected ("clear the
  bar/DB path"). Covered by `test/equipkind.spec.mjs` (Arnold→dumbbell incl. user-override precedence, the
  named-movement table, bare-Plate routing, every override id exists + names a valid kind) and a reusable
  **`tools/probe-equip.mjs`** audit that flags any variation whose loader contradicts its own text
  (returns "0 flagged" — run it after editing content).
- **French internationalization (feat 222):** the feat-61 i18n groundwork goes live. **Français** joins
  `LANGUAGES` (the drawer's Language picker was already wired to `setLang`), backed by an `I18N.fr` dictionary
  (~100 keys) covering the **UI chrome**: top-bar buttons + static tagged markup, all **page titles** via a new
  `pageTitle(id)` ('page.<id>' from the active dictionary, falling back to the registry's English title), which
  the feat-221 **breadcrumb** and **nav tree** now render — so the whole navigation system speaks French
  (Séance / Journal / Bilan / Préparation / Étude / Réglages…) — plus the **Body page end-to-end** (titles,
  stat tiles, form fields, girth labels via `girthLabel()`, avatar card) as the dynamic-render pattern.
  `t(key, params)` interpolation is used in anger ('{page} — ouvrir le plan de navigation', girth-unit
  substitution). English remains the byte-identical default; the **reference/coaching/glossary content corpus
  deliberately stays English** for now — flagged honestly in the Language setting's subtitle in both languages.
  Covered by `test/i18n.spec.mjs` (fr registered + t() translate/interpolate/fallback chain, pageTitle en/fr/
  passthrough, live chrome flip on setLang — html lang, top bar, breadcrumb, nav tree — French Body page,
  picker → state + localStorage persistence via SETTINGS_KEYS, and English-by-default untouched).
- **Nav rework v2 — breadcrumbs + global nav tree, no full-screen menus (feat 221):** three guarantees: you can
  get **from any screen to any screen** (two taps), you can always **see where you are**, and **no screen is ever
  just a nav menu**. The top-bar title is now a **breadcrumb** (`_pagePath`): ancestors as emoji crumbs, the current
  page as emoji + name; every crumb opens the new **global nav tree** — a compact anchored popover (`#nav-tree`,
  width ≤ min(370px, 94vw), height ≤ 68vh — never the whole screen) listing every leaf page grouped by section
  (Execute / Reflect / Prepare / Study / Settings), with the current page highlighted and the tapped crumb's section
  focused + scrolled into view. Menu ids (home/train/reflect/execute/prepare/study/settings) are now **grouping
  nodes only**: `navTo()` forwards them to a designated `primary` leaf (home/train/execute→Workout, reflect→Log,
  prepare→Gyms, study→Reference, settings→Preferences), so the old full-screen drill-down lists are unreachable and
  the history stack only ever holds content pages — Back/Forward and the empty-stack parent fallback ride through
  the resolution. Brand tap → Workout dashboard; ⚙️ → Preferences. Covered by `test/navtree.spec.mjs` (breadcrumb
  path shape, crumb→focused tree with active chip, every leaf reachable yet popover < 78% viewport height,
  any→any in two taps, backdrop/✕ close) + updated `router.spec` / `navtopbar.spec` / `glosspage.spec` /
  `refpage.spec` / `datapage.spec` for the forward-to-primary contract.
- **Profile-shaped wireframe avatar + circumference biometrics (feat 220):** the anatomy wireframe is now
  **customizable by profile**. Body-comp entries grow seven optional **tape measurements** (neck / chest / waist /
  hips / biceps / thigh / calf) behind a collapsible 📏 row in the Body form — stored canonically in **cm**, entered
  and shown in cm (kg mode) or inches (lb mode), surfaced on the latest-stats line, prefilled on edit, exported in
  the body-comp CSV and accepted by the biometrics JSON importer. A new **Wireframe Avatar** card on the Body page
  picks **Classic** (the original outline, byte-for-byte) or **My profile**, plus playful **hat** (cap/beanie/
  headband/crown/top hat/cowboy) and **hairstyle** (buzz/spiky/curly/mohawk/ponytail/long) overlays with a live
  preview. Profile mode (`avatarProportions()`) shapes shoulders/chest/waist/hips/thighs/calves/arm thickness from
  **gender** (Settings → Profile), **BMI** (latest weight + height, clamped), and the **newest logged girth per
  dimension** — specific tape data overrides the BMI estimate. `anatomyOutline(cx, p?)` resolves the avatar itself,
  so the glossary chart, the volume/live/replay heatmaps and the preview all pick it up automatically; `state.avatar`
  ({style, hat, hair}) travels with settings (`SETTINGS_KEYS`). Covered by `test/avatar.spec.mjs` (classic default
  byte-identical + no headgear, girth save/round-trip/CSV in inches→cm, proportions vs gender/tape/BMI, profile +
  headgear reshaping the heatmap renderer and restoring on classic, Body-page card UI with live preview).
- **Historical replay (feat 219):** a new **Reflect › ⏪ Replay** router page that scrubs or **▶ plays**
  through training history week by week (capped at 104), animating four things in lockstep: the anatomy
  **heatmap** for that week (full group/muscle/head toggles), the **top-6 volume bars**, a whole-history
  **trend strip** (weekly set totals sparkline) with a glowing cursor at the replay position, and **that
  week's log** (sessions with exercise/set counts + grades). Controls: ⏮ oldest / ▶⏸ / ⏭ now / a range
  scrubber; Play restarts from the oldest week, advances every 1.1 s (test-tunable `_replayTickMs`),
  stops itself at "now" and politely dies when you leave the page. Opens on the current week. Covered by
  `test/replay.spec.mjs` (Reflect registration + opens-on-now with all parts, scrub swaps heat+log between
  a squat week and a bench week, play runs oldest→now and self-stops, leaving the page kills the timer).
- **Live-workout heatmap — hit so far + plan projection (feat 218):** the same wireframe renderer, live
  on the workout dashboard while a session runs: **"Hit so far"** builds its accumulator from the active
  session's saved sets plus COMPLETED pending sets (the feat-211 semantics — an open set paints nothing),
  and **"When plan done"** layers on every remaining step's outstanding sets through its first option's
  representative variation (`planProjectionMuscleAcc`), so you can see what the finished workout will have
  covered before you do it. Mode pair + the group/muscle/head resolution toggles, set totals in the title
  ("so far 6 sets" / "projected 18 sets"), projection disabled with a tooltip when no plan is attached, and
  the card only renders for a live (un-ended) session. Covered by `test/liveheatmap.spec.mjs` (so-far
  semantics incl. the open-set exclusion, projection math = remaining×steps onto the right muscles, the
  dashboard card's mode/level flow with exact titles, and absent-card cases).
- **Volume heatmap on the anatomy wireframe (feat 217):** the Volume page now opens with a 🔥 heatmap
  card — weekly volume painted straight onto the built-in front/back wireframe figures. Resolution
  toggles between **muscle group / muscle / muscle head** (the user-asked trio) or **🔁 auto-cycles**
  through them every 3.5 s (test-tunable `_heatCycleMs`; the cycle politely kills itself when the card
  leaves the DOM). Plumbing: `HEAT_REGION_MODEL` maps each `ANATOMY_REGIONS` wireframe ellipse set to its
  volume-model group + muscle ids (regions outside the model — forearms, adductors, tibialis — render as
  gray dashed "not modeled"); `heatValuesFromAcc(acc, level)` rolls any muscle-level accumulator up/down
  (group rollup via `MUSCLE_INDEX`, head expansion via each muscle's `heads`), with the weekly source
  being the existing `getWeeklyMuscleVolume` honoring `volWeekOffset`; `heatColor` maps value/max onto a
  green→red hsla ramp (transparent at zero); `anatomyHeatmapSvg` re-renders the wireframe with filled
  ellipses + per-region set-count tooltips and a 0→max legend. The renderer is deliberately
  accumulator-agnostic — feat 218 feeds it live-workout and plan-projection accs. Covered by
  `test/heatmap.spec.mjs` (region math incl. n/a + untouched, the color ramp, full-card render with exact
  ellipse/na counts + level toggles, and the auto-cycle advance/self-stop).
- **Info pack export (feat 216):** Settings › Data gained an **"Info pack export"** block: pick all or a
  subset of the app's information sections — ❓ Help (the live `renderHelp` output), ℹ️ About (brand,
  credit, `APP_BUILD`), 📋 Quick reference (every movement with its tag, 💡 quick cue and variation index,
  with an as-of count), 🧭 Coaching guides (all `COACHING` cards with their sections), 📖 Glossary (every
  term grouped by category) — and export them as a **fully branded, self-contained HTML document**: wordmark
  header, generation timestamp, build number, data-last-saved stamp, and the complete
  `legalDisclaimerHtml()` block appended to EVERY export (the legal section is not optional) plus an
  informational-only footer. ⬆ downloads `gymtracker315-info-<date>.html` via `downloadText`; 🖨 stages the
  same body in the feat-133 `#print-root` and calls `print()` (choose "Save as PDF"). Covered by
  `test/infoexport.spec.mjs` (branding/date/build/disclaimers/footer on the full doc, subset keeps only its
  picks but always the legal block, real section content + counts, the Data-page UI round-trip with a spied
  download, and the print-root staging/cleanup).
- **Note templates + stock-ticker display (feat 215):** variation notes keep their freetext, but the
  feat-54 editor now opens with **eight quick-pick calibration chips** (💺 Seat, 🛋 Backrest, 💪 Armrest,
  🦵 Leg pad, 📌 Pin/stack, 🤝 Handles, 📐 Incline, #️⃣ Machine #) that append a structured field to the
  text — separator-aware (`· ` joins non-empty text) with the caret parked after the inserted label, so
  "Seat: 4 · Pin: 7" takes three taps and two digits. The saved note then **plays like a stock ticker**
  on the active exercise header: a single-line marquee (doubled content + `translateX(-50%)` keyframe for
  a seamless loop) whose duration scales with text length (8–60 s), static under
  `prefers-reduced-motion`. Covered by `test/notetemplates.spec.mjs` (chip set + separator-aware
  appends, freetext save path untouched, ticker markup/animation/duration, no chips outside edit mode).
- **Skip a step → back of the queue (feat 214):** every not-done step on the dashboard plan card now has
  a **⏭** control: skipping does NOT remove the step — it goes onto `session.skippedSteps` (per-session,
  skip-ordered, synced with the session) and `currentPlanStepIndex` serves unskipped steps first, then
  skipped ones **in skip order** (oldest first), so a busy or unwanted station stops nagging but its work
  never disappears. Everything downstream inherits the new pointer for free: the picker's step filter
  (feats 114/115), the step HUD bar, rest-bar next-up (feat 177) and the feat-207 "time for X" cue. The
  row dims with a struck number + a "skipped → back of queue" tag, the control flips to **↩** un-skip
  (restores its natural place), and completing a skipped step anyway still counts/clears normally.
  Covered by `test/skipstep.spec.mjs` (pointer walk incl. all-skipped oldest-first service + persistence,
  done-beats-skipped, and the rendered control flow).
- **Duplicate-step indicator (feat 213):** when one single variation could satisfy **2+ steps of the same
  plan** (two curl-reachable steps, a pinned variation overlapping its own family step, …), those steps
  now wear a dashed **⧉ with N** badge on the dashboard plan card, with a tooltip explaining that one
  station can serve them all but each step still needs its own sets. `planDuplicateSteps(plan)` builds
  per-step qualifying pools by testing every `VAR_INDEX` uuid through `optionMatchesVar` — so feat-166
  alias resolution and feat-167 secondary parents count — and intersects them pairwise. Covered by
  `test/dupsteps.spec.mjs` (movement×movement and movement×variation overlaps, disjoint and single-step
  negatives, and the rendered badges naming their partner steps).
- **Extra-set notches glow (feat 212):** sets logged BEYOND a plan step's target used to simply vanish —
  the notch row was capped at the target count. Now the row grows by the overflow and every over-target
  notch carries `.extra`: a **glowing `--warn` border** (box-shadow halo), with a **glowing warn fill**
  when the extra set is complete and the feat-211 **checkered fill** (in warn) when it's still
  in-progress. Pairs with feat 206's "Extra set N" spoken vocabulary. The X/Y label keeps showing the
  honest counted overflow (e.g. `3/2 ✓`). Covered by `test/extrasets.spec.mjs` (the exact class sequence
  `filled,filled,pending extra,inprog extra` + label + done state, the no-overflow negative, and computed
  border/glow CSS resolution).
- **In-progress sets no longer count toward plan X/Y + checkered notch (feat 211):** a set with a
  weight entered but reps still pending used to inflate live plan progress (`pendingStepSets` counted any
  weight-filled pending set), so a step could read "done" off the back of a set you hadn't finished. Now
  only **completed** pending sets (weight AND reps) fold into `stepLoggedSets` — the feat-137 intent
  (unsaved-but-complete sets count, revert on discard) survives intact — and a new display-only
  `pendingStepOpenSets()` feeds the step HUD bar, where the in-prog set renders as a **checkered notch**
  (`repeating-conic-gradient` checkerboard) between the dimmed pending-complete notches and the empty
  ones; the X/Y label excludes it. `minpct.spec`'s live-progress expectation updated to the new contract.
  Covered by `test/inprogsets.spec.mjs` (open set excluded from logged/done, no done-via-open-set, the
  full notch sequence solid→dimmed→checkered→empty with the label, and reps landing converting the
  checkered notch into a counted one).
- **Gruff coach voice (feat 210):** all spoken output now defaults to a **deeper, gruffer,
  tough-but-fair coach**. Within what the Web Speech API offers (voice choice + pitch/rate):
  `pickCoachVoice()` ranks `getVoices()` for a deep male English voice (named-male heuristics score up,
  female-named voices score down, local/default nudge; cache invalidated on `voiceschanged` since Chromium
  loads voices async), and `coachify(u)` applies the profile — the picked voice + **pitch 0.8** — to every
  utterance on all three speech paths: annunciations (`annunce`), the Mantranome chant
  (`metroSpeakNextTip`) and tip narration (`speakRandomTip`). `state.ttsVoice` (a settings key):
  `'auto'` (default, the coach pick) / `'system'` (leave the device voice completely untouched) / an
  explicit voiceURI-or-name override that wins verbatim. Preferences → "🏋️ Coach voice" pills, with an
  audible sample on switch ("Coach voice on. Get under the bar."). Covered by `test/coachvoice.spec.mjs`
  (default+pitch profile vs system, ranked pick over stubbed voices + cache, explicit override, and an
  utterance-capture proving all three paths run through `coachify`).
- **Annunciation audio ducking (feat 209):** while a cue speaks, audio gets out of the way — within what
  a web app can honestly do: **(1)** the app's OWN sounds (metronome ticks, rest beeps, UI clicks) route
  through a new `duckedVol()` that drops to **30%** while an utterance is in flight (`_annDuckActive`,
  armed by `annunce()` with `onend`/`onerror` + a 6 s safety timer so it can never stick); the speech
  itself never ducks. **(2)** iOS 17+ is asked to duck other apps' music via
  `navigator.audioSession.type='transient'` around the speech (feature-detected, restored to `'auto'`).
  **(3)** Android generally ducks for system TTS on its own — noted in the setting's sub-text, which is
  explicit that a web app cannot force other apps' volume. Default **on** (`annunciation.duck`); toggle
  under the cue settings in Preferences. Covered by `test/annunce.spec.mjs` (default-on, 30% gain while
  active + restore, annunce arms/skips the duck by setting, drawer toggle).
- **Annunciation first/last-X limits (feat 208):** both spoken cues can now be bounded to where they
  matter: with a limit **L** set, a cue speaks only for the **first L** or the **last L** sets
  (`annunceWithinLimit(pos, L)` — the "last L" half needs the plan target `y`; plan-less positions honor
  only the "first L" half; 0 = every set, the default). Separate `startLimit` / `endLimit` fields on
  `state.annunciation`, two "↳ … cue limit" number inputs (0–10) under the toggles in Preferences. So
  "limit 1" gives exactly the gym-useful pair: "First set of 4" … silence … "Last set — make it count".
  Covered by `test/annunce.spec.mjs` (gate matrix incl. the muted middle and plan-less halves, a
  3-set integration run speaking only first+last, drawer input persistence).
- **Set-end annunciations (feat 207):** the closing half of the spoken-cue pair — when a set COMPLETES
  (reps land; the `commitSetField` reps→`ts` rising edge, so rep edits on an already-done set stay silent
  and a zero-rep entry never counts): **"One down — 3 to go" / "2 of 4 down" / "Half done" (at ⌈y/2⌉ for
  targets ≥3) / "One more, then Squat" / "All done — time for Squat" / "Extra set down"**, or plan-less
  "One down" / "3 down". `setPositionInfo` gained an `'end'` mode that counts completed sets only;
  `nextStepLabelAfterCurrent()` names the next incomplete step after the current exercise's step (wrapping,
  via `stepStatus`/`optionLabel`) so the all-done and one-more cues hand you to the next station. Toggle:
  Preferences → "🗣 Annunciate set end" (off by default; same `state.annunciation` settings object).
  Covered by `test/annunce.spec.mjs` (full end-phrase matrix, rising-edge/edit/zero-rep/off behavior, and
  the plan flow speaking "One more, then <next>" → "All done — time for <next>").
- **Set-start annunciations (feat 206):** a new opt-in spoken cue the moment a set STARTS (the canonical
  `commitSetField` weight→`wTs` stamp, so the native inputs and the OSK share one hook; edits to an
  already-open set stay silent): **"First set of 4" / "Set 2 of 4" / "Last set — make it count" /
  "Extra set 1"** (beyond-target vocabulary that feat 212's glowing notches will mirror), or plan-less
  "First set" / "Set 3". Plan-aware position via `setPositionInfo()` — the active plan's first step whose
  options match the current exercise supplies the target `y`, with that step's SAVED sets counting toward
  `x` (mid-edit sessions excluded). The new engine (`annunciationCfg` / `annunce` / `setStartPhrase` /
  `annunceSetStart`) respects the master audio gate + headphone-only mode and never stacks utterances;
  state lives in `state.annunciation` (a `SETTINGS_KEYS` member; `startLimit`/`endLimit`/`duck` fields are
  pre-seeded for feats 207-209). Toggle: Preferences → "🗣 Annunciate set start" (off by default). Covered
  by `test/annunce.spec.mjs` (default+persistence, the full phrase matrix, plan-aware x/y math,
  speak-once-per-start with silent edits + silent when off, drawer toggle round-trip).
- **Mantranome (feat 205):** the feat-103 "mantra mode" grew into a proper named feature. **(1) Renamed**
  to 🧘 **Mantranome** in the Preferences drawer (sub-text now explains the cycle cap). **(2) The audio
  dropdown controls the metronome**: the 🔊 sound menu gained a Metronome row — ▶ Start/⏸ Stop, a ±5 bpm
  stepper (clamped 20–300, restarts a running metronome), and the 🧘 Mantranome chip — so tempo and chant
  live where every other sound control lives (the per-source audio/haptic chips were already there; their
  handler selector is now scoped to `.snd-src .snd-chip` so the new row's buttons keep their own handlers).
  **(3) The 4-cycle cap**: `metroTick` tracks the set-active rising edge (`_metroWasActive`) and resets the
  chant index when a NEW set starts; while chanting, once every cue has been spoken **4×** for the current
  set (`_metroMantraIdx >= tips×4`) the tick falls through to the regular beep path — the chant teaches,
  then gets out of the way. With no cues at all it now ticks instead of staying silent. Covered by
  `test/mantranome.spec.mjs` (cap → ticks, rising-edge restart, dropdown run/bpm/chip controls, rename
  sweep) with `metronome.spec` / `restcues.spec` green unchanged.
- **Reference deep-link lands on the exact variation (feat 204):** `openReferenceFor` (the "full
  reference" link from the current exercise's Tips & Details, and the top-bar long-press "Recent") used to
  just fill the search box — the list narrowed but everything stayed collapsed, leaving the user to hunt.
  Now a new `_refRevealVariation(famId, varUuid)` runs after the (synchronous) search re-render: it expands
  the family card (`.exercise.open`), expands the precise `.variation[data-uuid]`, restarts the feat-99
  `coach-flash` highlight on it, and smooth-scrolls it to center. Tree/table views (no expansion concept)
  no-op silently and report `false`. Covered by `test/refdeeplink.spec.mjs` (routing + search + both
  accordions open + flash + log-sheet closed, the variation body's Setup detail actually visible, and the
  detailed-vs-table landing contract).
- **Long-press teaching shimmer (feat 203):** while any hold is charging, every OTHER control that has its
  own long-press action now **shimmers** (a soft accent box-shadow pulse), passively teaching what else can
  be held — discoverability for the growing family of hold shortcuts (feats 99/108/142/199/200). Mechanism:
  all three attachers (`attachLongPress`, `attachTrackerPress` when it has an `onLong`,
  `attachTopbarLongPress`) tag their element `[data-lp-able]` at wire time and toggle `body.lp-teaching`
  on hold begin/end; one CSS rule animates `body.lp-teaching [data-lp-able]:not(.lp-holding):not(:disabled)`
  (the held button itself is excluded), with a static glow under `prefers-reduced-motion`. A capture-phase
  `pointerup`/`pointercancel` listener on `document` is the safety net so the teaching state can never
  stick after a mid-render release. Covered by `test/shimmer.spec.mjs` (wire-time tags on
  Save/Clear/Copy/sound/settings, on→off around a hold with the holder excluded, off-button release safety
  net, the CSS animation actually resolves to `lp-shimmer`).
- **OSK setup key strikes through when not in effect (feat 202):** the numpad's equipment-setup key
  (feat 78) now *passively* communicates state instead of just dimming or vanishing. Two struck cases:
  **(a)** the tool exists but nothing is configured (total 0 — only possible for empty-default kinds like
  dumbbell/kettlebell/plate/pin; a barbell's default is the bar itself) → label struck + key inert;
  **(b)** the variation's tool override is **"none"** → previously the whole strip disappeared, now it stays
  visible struck with an "· off" suffix and the ⚙ configurator still opens (showing the Tool selector, so
  flipping the tool back on is one tap away). Implementation: `renderNpSetup` derives the tool itself
  (override-aware), wraps the label in `.np-setup-text`, adds `.struck` (CSS line-through, icon unstruck);
  `renderNumpad` renders/binds the strip for any weight field (`isW`) rather than gating on a pre-derived
  kind. Covered by `test/oskstrike.spec.mjs` (struck+inert at total 0, configured total un-strikes via
  `solveSetupState`, override-none stays visible/struck/recoverable, reps fields never show the strip).
- **Hold 📋 Copy with no open set = duplicate the last set (feat 201):** the feat-142 hold (fill the open
  set's empty reps) used to no-op with a toast when nothing was open. Now `copyRepsToOpenSet` routes that
  case to a new `duplicateLastSet()`: it appends a set carrying BOTH the weight and reps of the most recent
  set — the latest valid pending set, else the last logged set in history for this exercise — reusing the
  form's single blank row when one exists (the feat-65 invariant) and committing through `commitSetField`
  (proper `wTs`/`ts` stamps, persistence, save-button refresh, both fields flashed per feat 149). So the
  one-gesture flow is now: hold Copy → identical set created → hold Save → logged, no popups anywhere.
  Open-set behavior is unchanged; with nothing anywhere it stays a toast no-op. Covered by
  `test/copydupe.spec.mjs` (dupe from pending, blank-row reuse, history fallback picks the LAST set of the
  most recent session, feat-142 path intact, empty no-op) + the updated `copyreps.spec.mjs` contract.
- **Hold ✕ Clear to skip the confirm (feat 200):** same gap and same fix as feat 199, on the other footer
  button: the only "long-press" Clear ever had was the feat-32 arm-then-hold flow (tap first, *then* hold —
  reads as broken). The confirmed-clear body moved out of `clearPendingModal` into a shared
  `doClearPending()` (guarded to no-op silently when nothing is pending, so a stray feat-32 armed resolve
  after a direct hold can't double-toast), and the static `#trk-modal-clear` is wired once through
  `attachTopbarLongPress`: tap → `clearPendingModal` (popup / arm flow as before), 1.2 s hold → straight to
  `doClearPending`. An empty-state hold toasts "Nothing to clear". Covered by `test/holdclear.spec.mjs`
  (hold clears with zero `.choice-backdrop` + picker returns, tap still asks + cancel keeps data,
  empty-state no-op).
- **Hold 💾 Save to skip the confirm (feat 199):** "long-press Save to avoid the popup" never actually
  existed — the footer button only had per-mode `onclick` handlers, and the feat-32 hold-to-confirm flow
  needed a tap *first* to arm. Now the static `#trk-save-btn` is wired once through `attachTopbarLongPress`
  (the feat-142 Copy pattern: tap keeps the existing onclick, a 1.2 s hold fires the shortcut and swallows
  the trailing click): the hold sets a one-shot `_saveSkipConfirm` flag and re-invokes the button's own
  current-mode handler, so sets / cardio / superset all get "hold = same save, no popup". `saveSets`'s
  confirm gate (`hasInfeasible || alwaysConfirm`) honors the flag for that one synchronous invocation —
  deliberate, user-initiated skipping of the over-limit warning included. A hold on a disabled Save is a
  no-op. Covered by `test/holdsave.spec.mjs` (hold saves with zero `.choice-backdrop`, tap still asks +
  cancel leaves nothing saved + the flag never leaks, disabled-hold no-op).
- **Freemotion chest fly (feat 198):** the Freemotion dual-cable chest fly was missing from the library.
  Two variations join the `chest-fly` family via the `EXTRA_VARIATIONS` injector (uuids `f8ee0001…/f8ee0002…`):
  **Freemotion Cable Chest Fly** (independent swing arms, constant-tension fly arc) and **Freemotion Chest
  Fly — Half-Dome Seat** (the same station with a half dome on the seat — unstable surface, lighter load,
  more core; tracked separately on purpose so the two loads don't muddy one progress trend). Both carry full
  reference detail (cue/setup/movement/mistakes/programming/tip), mirror into the Reference dataset, pass the
  picker gate, and log standard weight×reps. Freemotion joined the About-page trademark disclaimer list.
  Covered by `test/freemotion.spec.mjs`.
- **Abandon time ×3 (feat 197):** the open-set auto-reap (`abandonMinutes`, feat 51 — deletes a set with a
  weight entered but no reps after N minutes) defaulted to **5 minutes, ~3× too quick** in real gym use (a
  long rest + a chat = your loaded set vanished). The default is now **15 min** everywhere it appears (state
  default, `ensureWC`, the drawer input fallback, `reapAbandonedSet`'s fallbacks), and `normalizeState`
  migrates a stored `5` (the old default) forward to 15 so existing devices pick up the new pace — a
  deliberate non-default value (e.g. 8 or 30) is left alone. Covered by `test/abandontime.spec.mjs` (fresh
  default, 5→15 migration, deliberate-value preservation, and reap behavior at 10 vs 16 minutes).
- **A heaping helping of masterly crafted plans (feat 196):** `SEED_PLANS` grew **tranche 6 — 20 new plans**
  that finally exploit the library's untouched breadth (the previous tranches drew on ~29 of the 84 movement
  families): implements (**Kettlebell Complete**, **Landmine One-Bar**, **Strongman Saturday**, **Power & Speed**,
  **Band Anywhere**, **Athletic Power 30**, **Kettlebell Builder (90m)**), the feat-194 disciplines as *runnable*
  plans (**Yoga Foundations Flow**, **Pilates-Style Core Control**, **Morning Mobility 15**, **Deep Stretch Hour**,
  **Active Recovery Day**), cardio engines (**HIIT Engine Room**, **Zone 2 Base**, **Race Sim (HYROX-style)**), joint
  health (**Knees Over Toes**, **Shoulder Prehab**, **Desk Posture Reset**) and specialty days that cross-link the
  Advice guides (**Grip Forge**, **Climber Conditioning**). Discipline plans pin **real variation uuids** probed at
  runtime via the new `tools/probe-families.mjs` (the feat-175 lesson institutionalized), so e.g. the yoga flow runs
  Sun Salutation → Warrior II → Tree → Pigeon by name. The picker now spans **9+ derived categories** (Mobility,
  Recovery, Cardio and Upper/Pull/Legs/Core join the classics), all three length buckets (15 m – 90 m additions;
  3 h stays the ceiling) and the full 1–5 intensity range. Also fixes a latent **duplicate-id bug**: tranche 4's
  *Core & Midsection* reused `id:'seed-core'` (taken by tranche 1's *Core & Conditioning*), so it **never seeded**
  for anyone — renamed to `seed-midsection`, it now appears via the additive `seededPlanIds` ledger, and the new
  spec asserts seed-plan ids stay unique. Covered by `test/planlibrary.spec.mjs` (presence/completeness, every
  pinned familyId+uuid resolves, unique ids + resurrection, category/bucket/intensity spread, 90/180 clusters
  hold with the 180-min max, fresh-user seeding + GymTracker315 authorship).
- **Cleanup — Data folded into the router (feat 195):** Settings › Data became a proper **router page**
  (`renderDataPage`), completing the Settings "everything its own page" split — `set-data` was the last leaf still
  served by a bare overlay opener. The full‑screen `#data-page` is now shown via `navTo('set-data')`
  (`openDataPage` → `navTo`), its Done/✕ + leaving go through `navBack`, and `renderCurrentPage` calls
  `_syncDataOverlay()` to hide it when you navigate away — the same overlay‑as‑page pattern as Glossary. The
  load‑bearing `#drawer-data-wrap` → `#data-page-body` relocation (built by `renderSettingsDrawer`) is **unchanged**,
  so the `datapage` / `sync` / `dataexport` specs stay green (they relocate with `currentPage='workout'`, which
  `_relocateSettingsPage` leaves alone). `router.spec`'s open‑leaf case moved to `exercise` (now the only `open:`
  leaf). The legacy settings *drawer* and the hidden nav‑tabs are intentionally **kept** — they are load‑bearing
  (the drawer renders every settings page's sections; the nav‑tabs are the `switchPanel` surfacing primitive), not
  dead code.
- **Yoga / Pilates / Mobility coaching + progression (feat 194):** the **finale** of the epic — three new `COACHING`
  cards on the Advice page (Study › Advice), cross‑linked to the feat‑128 `mega:'mobility'` Reference families.
  **🧘 Yoga** (Hatha / Vinyasa / Yin, breath‑leads, patient progression, a foundational sun‑salutation flow),
  **🩰 Pilates** (the six principles, mat vs reformer, control‑then‑load, a starter set + safety), and **🤸 Mobility &
  Flexibility** (dynamic‑vs‑static timing, CARs, range → load → control, a weekly template). `coachingCardForExercise`
  now routes `mega:'mobility'` moves to the matching card (sun‑salutation / downward‑dog → Yoga, else → Mobility), so
  the relevant‑coaching jump lands on them. The bundled‑guide `📖` chip became **optional** in `renderCoaching` (the
  new cards are full coaching cards without a separate deep‑dive guide document). `test/coaching.spec.mjs` updated
  (six cards, the new ids, mobility routing). With this the whole navigation‑rework + new‑guides epic is shipped.
- **Equipment page (feat 193):** Prepare › Equipment became a **router page** (`renderEquipmentPage`) instead of a
  toast. Equipment setup is inherently per‑exercise (the inline bar / dumbbell / kettlebell / pin‑stack loader in the
  log sheet, `modalState.setup`) plus per‑gym stables (feat 135) — there is no standalone equipment state — so the
  page explains both levels and links to where each is configured: **✍️ Open an exercise** (→ the log sheet / Exercise
  page) for the per‑exercise loader, and **📍 Manage gym equipment** (→ the Gyms page) for the per‑gym stables (the
  active gym is surfaced). Covered by `test/equipmentpage.spec.mjs`. With this, every Prepare leaf is a real page.
- **Exercise page — the log-sets sheet joins the router (feat 192):** the **highest‑risk** conversion, taken by the
  safe route. Instead of re‑homing the whole log‑sets flow into `#trk-main` (the `_modalHost` rewrite), the existing
  `#trk-modal` sheet — already a full‑screen surface below the top bar — is **router‑integrated as the `exercise`
  page**: `openLogModal()` / `editExisting()` also mark `currentPage='exercise'` (the top bar shows ✍️ Exercise + an
  enabled Back, and the ✍️ workout‑shortcut lights up) via `_markExercisePage()`, and `closeLogModal()` restores the
  page behind the sheet via `_restoreFromExercisePage()` (remembering `_exercisePrevPage`). `topbarBack` closes the
  sheet when it's open. The sheet's **content, picker, OSK numpad, equipment setup, and the entire save flow are
  untouched** — only the surrounding chrome changed, so the whole logging‑spec cluster stayed green (722). Covered by
  `test/exercisepage.spec.mjs`; `router.spec`'s open‑leaf case moved to `set-data`. (A later cleanup could re‑home the
  sheet's *content* into `#trk-main` proper, but the overlay‑as‑page keeps the app's core flow risk‑free.)
- **Reference page — last of the 3‑panel‑switcher teardown (feat 191):** Study › Reference became a **router page**.
  Rather than rewrite the whole `renderRef` catalog (its own search / mega + equip filters / detailed·tree·table
  views), `#panel-reference` is now the **host panel for the reference page**: the panel‑surfacing was reworked so the
  active panel keys off `currentPage` — `_surfacePanelForPage()` (called from `renderCurrentPage`) shows
  `panel-reference` when `currentPage==='reference'` and `panel-tracker` otherwise (it `switchPanel`s directly to
  avoid recursing through the navTo shim). The old pre‑`currentPage` `_surfaceTracker()` calls were dropped from
  `navTo` / `navBack` / `navForward`, and `topbarBack` collapsed to a plain `navBack()` now that Reference is in the
  router history. Every entry point routes to the page: `goPanel('panel-reference')` → `navTo('reference')` (covers
  `openInReference`, `topbarReferenceCurrent`), plus `openReferenceFor(uuid)` and the hidden 📚 nav‑tab.
  `renderReferencePage` clears `#trk-main` (it's covered by the panel) and re‑runs `renderRef`. Covered by
  `test/refpage.spec.mjs`; the coaching / navtopbar crosslink + panel‑switcher tests stay green. With this, all three
  legacy slide‑ins (coaching, glossary, reference) are gone — `switchPanel` survives only as the thin surfacing
  primitive for `panel-tracker` ↔ `panel-reference`.
- **Glossary + Anatomy pages (feat 190):** Study › Glossary and Study › Anatomy became **router pages**, and the
  glossary slide‑in mode is retired — it always shows **full‑page** now (the user's "never a slide‑in / full page").
  The existing `#ref-gloss-panel` overlay machinery (search, category filters, term list, the feat‑30 anatomy chart +
  OCR hotspots) is reused verbatim: `_showGlossOverlay(chartOpen)` displays it (Glossary → list, Anatomy → chart pane
  open) and `renderGlossaryPage` / `renderAnatomyPage` are the leaf renderers. External entry points are now router
  shims — `openGloss()` → `navTo('glossary')`; `openGlossaryTo(term)` re‑renders in place when you're already on the
  page (an anatomy hotspot) else `navTo('glossary')`, so highlight‑to‑glossary, the Reference glossary button, the
  📖 long‑press, and the anatomy crosslinks all land on the page. The panel keeps its own header; its **✕ and Escape
  go Back through the router** (`navBack`), and `renderCurrentPage` calls `_syncGlossOverlay()` to auto‑hide it when
  you navigate away. (The panel still sits above the app top bar — a later cleanup can re‑home it below the bar for
  full chrome consistency.) Covered by `test/glosspage.spec.mjs`; `test/anatomy.spec.mjs` (which drives
  `renderAnatomyChart` directly) is unaffected.
- **Advice page — coaching out of the panel switcher (feat 189):** Study › Advice became a **router page**
  (`renderAdvicePage`) and the **`panel-coaching` slide‑in was retired** — the first dismantling of the legacy
  3‑panel switcher. The Coaching & Progression content (endurance / bouldering / grip cards + the bundled‑guide
  reader) renders into `#trk-main` by reusing `renderCoaching()` / `bindCoaching()` verbatim against
  `#coaching-content`. `goPanel('panel-coaching')` is now a shim → `navTo('advice')`, so every entry point flows to
  the page: the Reference panel's `.coach-banner`, the `topbarCoachingRelevant` long‑press (its scroll‑to‑relevant
  card still works), and the hidden 🧭 nav‑tab (rewired to `navTo('advice')`). The bundled‑guide reader
  (`#guide-reader`, body‑level) and the coaching↔Reference crosslinks are unchanged. `test/coaching.spec.mjs`
  updated: the five panel‑coaching cases now drive `navTo('advice')` and assert `currentPage==='advice'` /
  `#trk-main #coaching-content`. (Reference / Glossary / Anatomy follow in later phases.)
- **Contextual workout shortcuts (feat 188):** while a workout is active, the top bar grows a **third row** —
  🔥 Workout · ✍️ Exercise · 🏁 End — for one‑tap access from anywhere; it's hidden otherwise (the nav stays a pure
  hierarchy, the locked decision). Visibility is driven by `body.workout-active`, toggled by `updateWorkoutBar()`
  (called from `refreshRestBar`, which runs on every workout‑state change), and the row grows `--topbar-h` by 40px so
  every fixed offset (panel padding, rest/step bars, log sheet) keys off the taller bar automatically (122px, or 84px
  with the brand hidden — a two‑class selector wins by specificity). 🔥 → `navTo('workout')` (highlighted when
  there) · ✍️ → `navTo('exercise')` (the log‑sheet shim until the Exercise page lands) · 🏁 → the feat‑108
  `attachTrackerPress` (a tap confirms, a hold skips). The `#rest-bar` deep‑link was rewired from the legacy
  `switchPanel`+`currentTab` dance to a plain `navTo('workout')`. Covered by `test/workoutshortcuts.spec.mjs`
  (hidden↔shown + the 82→122px height, navigation + highlight, end hides it, rest‑bar deep‑link).
- **Settings split — Profile / Cosmetic / Preferences pages (feat 187):** the next slice of "everything its own
  page." The three leaves stopped opening the all‑in‑one drawer and became **router pages** that each relocate a
  *bucket* of the existing settings‑drawer sections (DOM nodes + their live bindings) into `#trk-main` — the same
  proven trick as the Data Management page (`#drawer-data-wrap`). A `SETTINGS_PAGE_SECS` map routes each `data-sec`
  section to a page: **Profile** = profile + biometrics · **Cosmetic** = theme + branding · **Preferences** =
  language, preferences, workout‑session, metronome, rest‑timer‑cues, live‑dashboard, categories, reference. The
  branding toggle was promoted from a row inside *Preferences* into its own **Branding** section so it lands under
  Cosmetic (themes/branding). `renderSettingsDrawer()`'s tail now calls `_relocateSettingsPage()`, so any toggle whose
  binding re‑renders the drawer (pref pills, theme swatches) refreshes the open page **in place**. The legacy drawer
  still exists for the ⚙️ long‑press + sound‑menu "More" entry points; the Gyms drawer section is intentionally not
  bucketed (gym management lives on the dedicated Gyms page). Covered by `test/settingspages.spec.mjs` (disjoint
  buckets, branding under Cosmetic, in‑place toggle refresh, legacy drawer intact). Data + the remaining drawer
  retire in a later phase.
- **Help page (feat 186):** Settings › Help became its own **router page** (`renderHelpPage`) — the same content as
  the ❓ quick-help overlay, now **searchable + collapsible** (the user asked for "up-to-date, searchable,
  collapsible"). `renderHelp()` gained an optional target id so the page reuses its exact copy verbatim (no
  duplication); `_decorateHelpCollapsible()` then groups each `<h3>` section into a `<details>`, and a sticky search
  box live-filters the sections (auto-expanding matches). The content styles were promoted from `#help-body` to a
  shared `.help-content` class so the overlay and the page render identically. The `set-help` leaf flips from
  `open:()=>openHelp()` to a `render` page; the top-bar ❓ overlay is left unchanged for quick access. Covered by a
  `test/legal.spec.mjs` case (sections present + collapsible, search narrows the visible list).
- **About page (feat 185):** Settings › About became its own **router page** (`renderAboutPage`) instead of a
  collapsible section buried in the settings drawer — the build stamp (`APP_BUILD`), the early-access notice, the
  designer / Claude-Code credit, and the **consolidated disclaimer / trademarks / MIT-licence** block (reusing the
  single `legalDisclaimerHtml()` source, now shown expanded in a card rather than behind a `<details>`). The
  `set-about` leaf flipped from `open:()=>openSettingsDrawer()` to a `render` page — the first slice of the Settings
  "everything its own page" split. `test/legal.spec.mjs` adds a case asserting the page carries the build + the
  disclaimer keys (no-advice / MIT / trademarks).
- **Plan Creator → page (feat 184):** the Workout Plans creator/list/editor moved out of the `#plans-panel`
  slide-in into the **router page `plan-creator`** (Train › Prepare › Plan Creator), retiring the overlay DOM +
  chrome CSS entirely. `renderPlansOverlay()` now hosts its list / editor / revision-history sub-views in `#trk-main`
  whenever `currentPage==='plan-creator'`; the entry points became page adapters — `openPlansOverlay()` resets the
  picker filters and `navTo('plan-creator')`, while `openPlanFull(id)` sets a transient `_plansDeepLink` so the page
  render opens straight to that plan's editor (plain menu / `openPlansOverlay` entries default to the list root via
  `renderPlanCreatorPage`). In-page sub-navigation (Edit · 🕘 History · ← All plans) re-renders within the page via
  the existing direct `renderPlansOverlay()` calls; the top-bar ◀ Back leaves the page. Picking **Use** now
  `navTo('workout')` (lands you on the dashboard with the plan active) instead of closing an overlay; the
  `closePlansOverlay()` shim is a thin `navBack()`. Dashboard deep-links (plan progress line, Plans / Change buttons,
  `#wc-plans-btn`) are unchanged — they flow through the same adapters. `planlist` / `minpct` / `planrevisions` /
  `plandash` specs updated to read `#trk-main` + assert `currentPage==='plan-creator'` instead of the retired
  `#plans-body` / `#plans-panel`.
- **Plan Detail → page (feat 183):** the detailed plan-execution view (feat 145/163/164) moved out of the
  `#plans-panel` overlay into the **router page `plan-detail`** (Train › Execute › Plan Detail). `openPlanExecution`
  now stashes the target plan/session ids and `navTo('plan-detail')`; `renderPlanDetailPage(main)` resolves the
  plan+session (explicit ids → else active) and hosts `renderPlanExecutionView` in `#trk-main` (a friendly empty
  state when there's no execution). The view's Back button is now a page `navBack()`. Every existing entry point
  (rest bar, step bar, session badges, dashboard progress) flows through `openPlanExecution`, so they all open the
  page unchanged. `test/planexec.spec.mjs` updated to assert `currentPage==='plan-detail'` + read `#trk-main`
  instead of the overlay. (feat 181 already turned the container-based screens — Log/History/Trends/Volume/Gyms/
  Body/Achievements — into working pages, so this kicks off the overlay→page conversions.)
- **Top-bar redesign — brand centered/topmost + Back/Forward (feat 182):** phase 2 of the nav rework makes the
  router visible. The **GymTracker315 brand** moved out of the tracker-panel header into a dedicated **centered,
  topmost row** of `#app-topbar` (tap → Home); below it a controls row carries **◀ Back / page-title / ▶ Forward**
  (`topbarBack`/`navForward`, disabled when the history stack is empty), then 🔊 ⚙️ ❓. The gear now routes to the
  Settings menu (`navTo('settings')`). The two-row bar made the topbar taller, so all fixed offsets (panel
  `padding-top`, `#trk-modal` / `#rest-bar` / `#plan-step-bar` positions, and their rest/step-bar combos) were
  refactored onto a single **`--topbar-h`** variable (`calc(var(--topbar-h) + …)`); `body.brand-hidden` both hides
  the brand row and collapses `--topbar-h` to the controls row, so the whole layout shrinks with one knob.
  `updateTopbarChrome()` keeps the title + Back/Forward state fresh each render; `_surfaceTracker()` brings the
  tracker panel forward on page navigations, and `topbarBack()` exits a Reference/Coaching slide-in back to the app.
  The legacy 📈/📚/🧭 panel switcher + 📖 glossary button are **hidden but kept in the DOM** (compat) until
  Reference/Advice become pages — then removed in feat 196; `coaching.spec`/`feedback.spec` now drive panels via
  `goPanel()`. Covered by `test/navtopbar.spec.mjs` (brand topmost+centered, hide collapses the offset, Back/Forward
  enable/disable, title, brand→Home + gear→Settings, hidden switcher + panel-exit Back); `restbaroverlap.spec`
  updated for the new offsets.
- **Page router — keystone of the nav rework (feat 181):** first phase of the total IA rework (drill-down pages +
  back/forward, per the approved plan). Adds a thin router over the existing renderers: a `PAGES` registry (`id →
  {title, emoji, kind:'menu'|'leaf', parent, tab?, render(main) | open()}`) covering the full target tree (Home ›
  Train{Reflect/Execute/Prepare}/Study/Settings), `navTo(id)` with a depth-capped back/forward stack
  (`navBack`/`navForward`, `localStorage gt_page`), and `renderMenu(main, children)` for the drill-down menus. The
  tracker `render()` now routes through `renderCurrentPage()` (dispatch on `currentPage`), but **everything stays
  backward-compatible**: `currentTab` is kept as a mirror, `switchToTab` routes through `navTo`, and a `_navTab`
  guard makes the legacy `currentTab = X; render()` pattern still work — so the 648 existing tests pass unchanged.
  Leaves not yet converted to pages (Exercise, Plan Detail, Reference, Glossary, Settings, …) carry an `open()` that
  calls their existing overlay opener, so the hierarchy is wired end-to-end while screens migrate incrementally
  (feat 182+). No content moved yet; the top bar is unchanged this phase. Every nav button has a unique emoji.
  Covered by `test/router.spec.mjs` (unique-emoji registry, leaf render + currentTab mirror + tab highlight, menu
  drill-down + item click, Back/Forward + parent-fallback + depth cap, legacy-opener leaves, switchToTab/`currentTab`
  compatibility, `gt_page` persistence).
- **Calendar view of the Log (feat 180):** the Log tab gains a **List / Calendar** toggle (`_logView`). The calendar
  (`renderLogCalendar`) draws a month grid (Sun-start) from `_sessionsByDay()`; each day with logged session(s) is
  highlighted and shows a **grade chip** (`sessionGrade`, colour-coded S/A→green … D→grey) or a dot, plus a **×N**
  badge for multiple sessions. **‹ / ›** page months (`_shiftMonth`, year-wrapping), **Today** jumps back to the
  current month, and tapping a workout day expands that day's full session card(s) below the grid (reusing
  `renderSession` + `bindSessionCards`). Today's cell and the selected day are outlined. View state is in-memory
  (`_logView` / `_calYM` / `_calSelDay`); the grade filter stays a List-view concern. Covered by
  `test/logcalendar.spec.mjs` (toggle routing, only-workout-days marked + ×N, day-select expands the cards + hint
  otherwise, month-wrap navigation, controls present).
- **Exercise-picker filters stack with the plan step (feat 179):** picking a plan-step chip in the exercise picker
  used to **override** the mega/sub/equip pills (it showed only the step's exercises and ignored the pills). Now a
  step change **resets** those pills + search to "all" (`resetPickerNormalFilters`) so every one of that step's
  compatible variations shows, and the pills/search then **stack** with (intersect) the step set instead of being
  ignored — letting you narrow *within* a step. The result count reads **"X of Y step-compatible variations shown"**
  while a step is active (`filterVariations` / `renderPickerResults`). Wired at all three step entry points: the
  picker step chip, `openStepPicker` (dashboard), and the post-save auto-advance. Covered by
  `test/planpicker.spec.mjs` (stacking intersection, filter-reset on entry, X-of-Y count).
- **Favorite plans & variations (feat 178):** a ★ toggle on every plan row and every exercise-picker row, backed by
  two synced settings maps (`state.favoritePlans` / `state.favoriteVars`, both in `SETTINGS_KEYS`, defaulted in
  `normalizeState`). Helpers `isFavPlan`/`toggleFavPlan` + `isFavVar`/`toggleFavVar` (+ a shared `favStarHtml`
  button) drive it; the star `stopPropagation`s so tapping it favorites without selecting the row. **Surfacing:**
  the exercise picker gains a **★ pill** (`modalState.pickerFavOnly`) that filters to favorites only, and within
  each family favorites **float to the top**; the plan picker gains a **★ Favorites chip** (`_plansFavOnly`, shown
  with a count when any exist) and favorites sort to the top of each category group. Favorites live in serialized
  state, so they persist locally and ride along cloud sync. Covered by `test/favorites.spec.mjs` (toggle idempotence
  + settings-key membership, normalize backfill, the picker star/float/filter, the plan star/chip/filter, and
  serialized-state persistence).
- **Rest-bar prev → next exercise heads-up (feat 177):** during between-sets rest the global rest bar now shows
  the exercise you just finished **and what's next**. `restBarNextExercise(prevUuid)` resolves the next by priority:
  (1) an exercise already **selected in the log but not started** (a queued pick), else (2) the **next incomplete
  step of the active explicit plan** (skipping the step the prev exercise belongs to), else (3) an **implicit
  pseudo-step** — `implicitNextSuggestion` names the least-trained main split this session (push/pull/lower/core),
  preferring a different split than the one just done, e.g. `Pull (suggested)` — else (4) nothing. The bar's sub-line
  becomes `prev → next` (plan steps tagged `(plan)`); when there's no next it keeps the existing rest-target range
  (the colour zone + countdown still encode target adherence). Inter-exercise rest now reads `prev → selected`
  instead of a bare "between exercises". Covered by `test/restbarnext.spec.mjs` (each tier of the chain, the
  null case, and the rendered `prev → next` bar).
- **Advisory suggested rest between steps (feat 176):** the detailed execution view now interleaves a small
  `💤 suggested rest ~m–m` divider between step cards, scaled by the heavier of the two adjacent steps' loads
  (`suggestedStepRestRange`: heavy 2½–4 min, moderate 1½–2½ min, light ¾–1½ min). It is **purely a guide** — the
  plan tracks no order (steps can be done in any sequence, with off-plan work in between), so unlike the feat-163
  between-exercise rest total, **nothing is ever measured against it**. A single-step plan shows no divider.
  Covered by `test/steprest.spec.mjs` (load scaling, N-1 dividers for N steps, none for a single step).
- **Plan length distribution — 90-min + 3-hour marks (feat 175):** the seed-plan library bunched at 30–60 min with
  a few 2-hour marathons and **nothing at the 90-minute or 3-hour marks**. Added a tranche-5: four **~90 min** plans
  (Full Body Builder, Upper Body Power, Leg Day, Push/Pull — 7 steps × ~5 sets) and three **~3 hour** marathons
  (Full Body Marathon, Leg Annihilation, Upper Body Epic — 10 steps × 6–8 sets), tuned so `estimatePlanMinutes`
  lands exactly on 90 / 180. The 3-hour plans carry honest descriptions (advanced, high-volume, run sparingly,
  manage fatigue). New ids append for existing users via the `seededPlanIds` merge. Distribution is now
  30/45/60/**90**/120/**180** min. Covered by `test/plans90180.spec.mjs` (clusters at 90 + 180, every option
  resolves, 3-hour plans fall in the picker's `long` bucket); `test/moreplans.spec.mjs` validates the new options too.
- **Plan authorship + revisions / audit trail (feat 162):** plans were silently auto-saved with no history. Now
  every plan carries an **`author`** (user plans → "You", seeds → "GymTracker315") and a numbered, append-only
  **revision history** (`plan.rev` + `plan.revisions[]`, each `{rev, at, author, note, content}` where `content`
  is a deep snapshot of name/desc/intensity/minPct/steps). The creator gains a **revision bar** — `rev N`, author
  (tap to edit), a dirty/clean badge, and **Commit / Revert / History** buttons. The editor still auto-saves the
  working **draft** (nothing is lost); **Commit** (`commitPlanRevision`) snapshots the draft as the next revision,
  **Revert** (`revertPlanToCommitted`) discards uncommitted edits, and **History** lists every revision (newest
  first) with **Restore-to-draft** (`restorePlanRevision`). Dirtiness is an id-independent content compare
  (`planContentSnapshot` → JSON) so reordering ids never shows a false change; `ensurePlanRevisioned()` backfills a
  baseline in `normalizeState` (idempotent) and the history is capped at 30. **Crucially, an execution is only ever
  compared to runs of the same revision**: `planUseForWorkout` stamps `session.planRev = plan.rev`,
  `findPlanExecutions(planId, excludeId, rev)` filters to that revision (no rev → legacy all-runs behaviour), and the
  detailed execution view judges a past run against `planAtRevision(plan, session.planRev)` — the exact content it
  ran, not a later, arbitrarily-different one (the view shows a `rev N` badge). Covered by
  `test/planrevisions.spec.mjs` (baseline, seed authorship, dirty→commit→clean, revert, restore, planAtRevision,
  same-revision comparison, planRev stamping, the editor bar).
- **Deep plan-execution analytics (feat 163):** the detailed execution view (feat 145) gains a full analytics
  layer from a session's set timestamps (`wTs` = set start, `ts` = set done). `computePlanExecutionDetail(session,
  plan)` (pure — also seeds the feat-164 snapshot) computes: the **actual step sequence** performed (off-plan
  exercises flagged inline), rest spent **within** exercises vs **between** exercises (clamped gap sums), **active**
  (under-tension) time, **% active for completed steps**, per-step **estimated vs actual** time (est uses an
  a-priori `DEFAULT_PER_SET_SEC`; actual is measured active+within), an **ETC drift series** (the projected finish
  recomputed at each completed set, drawn with `sparklineSvg`) plus its **delta from the plan's original estimate**
  (`estimatePlanMinutes`), and an **off-plan summary** (count / sets / active time / names of exercises that matched
  no step). The view renders an analytics panel (ETC + spark, a 4-up time grid, the sequence chips, the off-plan
  line) and a per-step `⏱ est · actual · %active` line; the panel is suppressed when a session has no timing data.
  Covered by `test/planexecdetail.spec.mjs` (exact active/within/between math, %active, est-vs-actual, sequence
  ordering, off-plan totals, ETC delta + series length, render integration, and graceful no-timing degradation).
- **Historized plan execution + end-of-workout recap (feat 164):** the detailed analytics (feat 163) are now
  **snapshotted onto the session** at workout end so a run stays reviewable later even if the plan changes or is
  deleted. `finalizeEndWorkout` calls `finalizePlanExecution(session)`, which judges the run at the revision it ran
  (`planAtRevision(plan, session.planRev)`) and stores `session.planExec = {at, planName, planRev, summary, detail,
  incomplete, skipped}` — where **incomplete** = steps started but left under their min% (`{label, logged, req}`)
  and **skipped** = steps never touched (`planIncompleteSkipped`). The execution view shows a finished-run recap
  banner (⚠ incomplete / ⏭ skipped, or "✓ Every step completed") for any ended session, and the Log session badge
  prefers the stored snapshot (and the run revision) for its `done/total` count and surfaces a `· N skipped` tag.
  The snapshot travels inside the session (so it syncs + exports for free). Covered by
  `test/planexechist.spec.mjs` (snapshot shape + incomplete/skipped classification, end-to-end finalize, the recap
  banner, the all-complete case, the Log badge, and no-recap-while-live).
- **Volume "Split" view (feat 119):** the Volume tab gains a **Split** level (alongside Group / Muscle / Heads) that
  aggregates the week's strength sets by **training split** — the family **mega** category (push / pull / lower /
  core / full). `getWeeklySplitVolume(weekOffset)` mirrors `getWeeklyVolume` but keys by `family.mega`;
  `renderVolumeSplit` draws the per-split bars (sets + %) plus a quick **push:pull** and **upper:lower** balance
  read. Covered by `test/volumesplit.spec.mjs`.
- **Richer Log workout cards (feat 120):** each `renderSession` card now shows a **grade chip** (`sessionGrade` —
  stored `finalScore` or live `computeWorkoutScore`), the **plan** it followed (explicit badge when `planId`, else an
  **inferred split** via `sessionSplitLabel` — push/pull/legs/upper/full-body/mixed from the mega mix, marked
  "implicit"), a **key-deltas** line (`sessionDeltaSummaryHtml`: 🏆 PR count, the biggest non-PR e1RM gainer, and #
  regressions vs each exercise's prior best), and — when the gap to the previous logged workout exceeds **48h** — a
  "🛌 rested N days" banner (`sessionGapTagHtml`). Covered by `test/logcards.spec.mjs`.
- **Picker "touched" familiarity badge (feat 121):** every exercise-picker row shows a discrete familiarity/recency
  chip — **new** if never trained, else **N×** (distinct calendar days you've logged it) colored by recency
  (recent ≤ 14 d / stale ≤ 60 d / old). `buildTouchMap()` does one pass over sessions per picker render
  (varUuid → distinct-day set + last timestamp); `touchBadgeHtml()` renders the chip (full "trained on N days · last
  X ago" in the tooltip). Covered by `test/touched.spec.mjs`.
- **Notes: gym + injury suggestions (feat 122):** the session-notes modal's **Location** field gets a `<datalist>`
  of your saved gyms (`state.gyms`) for quick autocomplete, and the **Injuries / Pain** field autocompletes from a
  curated `COMMON_INJURIES` list as you type. The injuries field is **multi-value** (comma-separated):
  `renderInjurySuggest()` matches the token after the last comma (excluding already-listed entries) and clicking a
  chip appends it + `, ` so you can list several. Covered by `test/notes.spec.mjs`.
- **End-workout confirm → add notes (feat 123):** `finalizeEndWorkout`'s confirm is now a 3-way `choiceDialog` —
  **🏁 End workout / 📝 Add notes, then end / Cancel**. Choosing notes opens the session-notes modal via a new
  `openNotesModal(date, onSaved)` callback; **Save** (relabeled "Save & End Workout") runs the chained `finish()` to
  end the workout, while closing the modal without saving cancels the end (`closeNotesModal` clears `_notesOnSaved`).
  Long-press End / plan-complete "End" still skip straight through (`skipConfirm`). Covered by `test/endnotes.spec.mjs`.
- **Cloud sync — Google Drive (feat 124, plan Phase 3):** automatic cross-device sync that works on the **phone**
  (unlike the desktop-only File-System Auto-Save/Load). A provider-agnostic engine sits behind the feat-95
  last-write-wins merge: a `SyncProvider` only reads/writes **one** canonical state JSON and `applyImport(remote,
  'merge')` reconciles edits/deletes (session `id` + `updatedAt` + tombstones). `saveState()` → `cloudPushTrigger()`
  (1.2 s debounce); boot does a silent `cloudPullNow`. Every push is **read-merge-write** (re-pull + merge before
  upload) so no device clobbers another. The first backend, **Google Drive**, uses the GIS browser token model
  (scope `drive.appdata` — a private per-app folder, light consent), stores one `gymtracker-state.json`, loads the
  Google Identity SDK **dynamically** on connect (keeps the app single-file + the no-external-`<script src>` lint),
  holds the access token **in memory only** (never persisted) and caches the Drive fileId in IndexedDB (`bioIdb*`
  `cloudGoogleFileId`). `state.cloudSync` is **device-local — intentionally NOT in `SETTINGS_KEYS`** so connection
  state never travels cross-device (each device authorizes with its own browser-scoped consent). The public OAuth
  client id lives in `SYNC_CLIENTS.google` (empty until the user does the one-time free Google Cloud setup — see
  README → Cloud Sync; until then the Settings card shows the setup steps instead of a Connect button). The engine
  is provider-pluggable: a custom-endpoint / Dropbox / OneDrive backend can be added by registering another entry in
  `CLOUD_PROVIDERS` with no engine changes. Covered by `test/sync.spec.mjs` (stubbed GIS + routed Drive REST:
  connect → find-or-create → push; pull → LWW merge; device-local-by-default).
- **Cloud sync — more backends (feat 125):** three more entries in `CLOUD_PROVIDERS`, no engine change. **Custom
  endpoint** (`kind:'endpoint'`) — the universal/Apple-friendly option: `GET`/`PUT` one JSON to a user-supplied
  URL with an optional bearer token (`state.cloudSync.perProvider.custom`, local only); ships a ~30-line Cloudflare
  Worker template [`tools/sync-worker.js`](tools/sync-worker.js). **Dropbox** + **OneDrive** (`kind:'oauth'`) share
  a hand-rolled **OAuth 2.0 PKCE redirect** flow (no SDK, no client secret): `cloudOAuthBegin` stashes a PKCE
  verifier + redirects to consent; on return the app boots with `?code=…`, `cloudOAuthHandleRedirect` exchanges it
  (`cloudOAuthExchange`) and finishes via the shared `cloudFinishConnect`. Access tokens stay in memory
  (`_cloudOAuthTokens`); **refresh tokens** persist in IndexedDB (`bioIdb*` `cloud_<provider>_rt`) so a reload
  re-syncs silently (`cloudOAuthToken` → `cloudOAuthForceRefresh` on expiry/401). Dropbox uses the content API
  (App-folder, `/gymtracker-state.json`); OneDrive uses Graph `special/approot` (personal accounts only —
  `Files.ReadWrite.AppFolder`). `cloudConnect` returns early when a provider's `connect()` reports `'redirecting'`.
  The Settings card became a provider picker (`cloudSyncCardHtml`) listing every backend + custom URL/token inputs +
  a Setup-help disclosure. iCloud stays out of scope (needs a paid Apple Developer account + CloudKit). Covered by
  `test/sync.spec.mjs` (PKCE digest; custom connect/push/pull with bearer auth; simulated Dropbox+OneDrive
  redirect-return → token exchange → push; registry + multi-provider picker render).
- **Two-hour seed plans (feat 126):** four high-volume `SEED_PLANS` for longer sessions — **Full Body Blast**,
  **Leg Marathon**, **Chest & Back**, and **Shoulders & Arms** (all "(2h)") — each tuned to ~45 sets across
  10–11 steps so `estimatePlanMinutes` (`round((2.5·sets + steps)/15)·15`) reports **~120 min**. They use only
  existing movement families (`_mvOpt` ids), so they inherit gym-feasibility, picker matching and progress
  tracking for free, and auto-append for existing users via the `seededPlanIds` merge in `normalizeState`.
  Covered by `test/app.spec.mjs` (present + 120-min estimate + every step references a real family).

---

## 2. State & storage

- `STORAGE_KEY = overload_tracker_v2` — the full `state` object (JSON).
- `PENDING_KEY = overload_tracker_pending_v2` — in‑progress log entry (incl. cardio / superset drafts).
- `LOG_KEY = overload_tracker_log_v1` — **separate** activity/error log; kept out of the data JSON.
- `SETTINGS_KEYS` — keys preserved on *merge* import / replaced on *overwrite* import.
- `normalizeState()` backfills nested defaults so older saved state stays valid.

### `state` shape (high level)
```
{
  unit, theme, maxWeightLb, alwaysConfirm, tipsMode, tipsExpanded,
  autoSave{}, autoLoad{}, workoutControls{ autoEndMinutes, showLiveScoreAfterMin, paceAnalysisStartMin },
  profile{ name, dob, heightCm, gender },                  // feat 34
  dashboard{ stats, timeline, liveScore, pace, physique },  // feat 33
  longPressConfirm{ enabled, ms },                          // feat 32
  bodyComp[], bodyCompUnit,                                 // feat 24
  muscleWeights|null, muscleWeightPreset,                   // feat 10/11
  hiddenVars{}, hiddenMovements{},                          // feat 23
  hiddenCategories{},                                       // feat 8  (cardio/mobility/recovery)
  cardioGoals{ weeklyMinutes, weeklyDistance, weeklySessions, distanceUnit }, // feat 7
  customVariations[],                                       // feat 16
  gyms[], activeGymId,                                      // feat 36/37/38/44/46
  glossaryHighlight,                                        // feat 31
  sessions[]
}
// session: { date, exercises[], endedAt?, endReason?, finalScore?, hr?:{avg,max,calories}, notes? }   (hr = feat 25)
// exercise: { varUuid, subUuid, sets:[{w,r,wTs?,ts}], supersetId?, cardio?:{elapsedMin,distance,distanceUnit,steps,power,calories,setting,effort,temp,weather,notes,ts} }
//   set timing (feat 51): wTs = set START (weight entered); ts = set DONE (reps entered). Old sets have ts only.
```

---

## 3. Feature catalog (as built)

### Data, backup & import/export — DONE
Export/import JSON (merge vs overwrite); auto‑save / auto‑load to file or folder with
deletion policies (Chromium); settings inside the JSON; CSV export of the reference.

**Workout export (50):** export a single workout (the `⤴` button on any session card) or a date
range (Settings → Data → *Export Workout / Range…*) as a **themed portrait image** and as **plain
text**. Scope presets: single workout · this week · this month · last 30 days · all‑time · custom
from/to (`selectSessionsForExport`). The image is drawn with the **Canvas 2D API** (zero‑deps — no
html2canvas / SVG `<foreignObject>`, which taints the canvas on iOS Safari): a header band in the
active theme's `--accent` (header text auto‑contrasted via `pickContrast`), a 2×3 stat grid
(duration · volume · sets · score · HR · calories), then the exercise list with top sets; height is
computed before sizing and scaled by `devicePixelRatio` for crisp output. Delivery shares one
`downloadBlob` helper (the JSON/CSV/log exporters were refactored onto it) plus `copyText`
(Clipboard API + `<textarea>`/`execCommand` fallback) and `shareExport` (Web Share with the PNG as a
`File` where `navigator.canShare({files})`). `buildWorkoutText()` produces clean, Strava‑ready text.

### Profile & preferences — DONE
- **Profile (34):** name, DOB→age, height, gender → BMI / relative‑strength context.
- **Hold‑to‑confirm (32):** press‑and‑hold replaces yes/no popups on destructive buttons.
- **Highlight → glossary (31):** select & hold text 5s to open the matching entry.

### Themes (22, 47) — DONE
**43 themes in 10 categories** — Classic, Grimdark, Animanga, Neon, Elemental, Mono, Gemstone, **Coffee, Bloom, Dusk**
— with oblique thematic names. The 5 original themes use CSS `[data-theme]` blocks; the rest are
**palette‑driven** via `mkTheme()` → CSS custom properties applied inline by `applyTheme()`.

### Workout session dashboard — DONE
Start/End (12) with confirmation (13); auto‑start/auto‑end; workout score vs prior sessions;
live chunky estimate (14); pace algorithm (28); a remaining‑exercises suggester (55, superseding balanced‑physique 15); per‑element
visibility toggles (33). **Forerunner stats (25):** manual avg HR / max HR / calories attached to
any session via an inline ❤️ editor on the session card.

### Smart rest timer & set lifecycle (51) — DONE
A set now **starts when its weight is entered** (`wTs`) and is **done when reps are entered** (`ts`); the reps
field stays locked until a weight is present (`isSetOpen`). Only **one open set** is allowed at a time, and an
open set left without reps for `workoutControls.abandonMinutes` (default 5) is reaped (`reapAbandonedSet`).
**Add Set:** single‑click adds an empty (or plate‑loader) set, double‑click pre‑fills the previous set's weight
(`addSetRow`); the old clone button is hidden. A global **rest bar** under the top bar — driven by a single 1 s
`restTick`, visible across tabs while a workout is active — shows the live *set‑active* time or the rest since the
last set, colour‑coded against a **recommended range** (`recommendRest`): research‑based bands by exercise nature,
adjusted by previous‑set intensity (overload level / e1RM / reps) and in‑session fatigue, then blended toward the
user's own median rest for that exercise (`medianInterSetRest`) as data accrues — clamped 1 s…10 min. Optional
vibrate / beep fire once per zone transition (settings toggles). The **timeline** draws `wTs→ts` duration bars +
rest gaps (inter‑exercise rest styled distinctly, legacy ticks for un‑timed sets), and the Log tab shows live
**set‑time / rest** analytics (`computeRestStats`) with inter‑exercise rest bucketed separately.

### Rest bar — opaque progress bar in the top bar (56) — DONE
The feat‑51 bar was reworked into a **solid, opaque** strip flush under the emoji top bar (zone colours no longer
use `rgba` whole‑bar tints, so page content never shows through). It now doubles as a **progress bar**: an
absolutely‑positioned `.rest-bar-fill` grows left→right to show how far through the *current* colour zone you are —
how close the next colour change is (`restZoneFill`: `restSec/minSec` in the orange zone,
`(restSec−minSec)/(maxSec−minSec)` in the green zone ⇒ 50 % at mid‑green; 100 % + flash in the red over‑zone, with
the flash now animating the *fill* rather than the whole bar so opacity is preserved). When **not** working out it
stays visible as a **compact 18 px strip** ("`<d>d <h>h since last set`" via `lastExerciseEndedMs`/`formatSinceGap`),
expanding to the 30 px timer while training; `body.rest-bar-on` (78 px) / `body.rest-bar-idle` (66 px) drive the
panel offset. Hidden only when the timer setting is off or no set has been logged yet.

### On-screen numpad for set entry (57) — DONE
An opt-in `workoutControls.onScreenNumpad` (Settings → On-screen numpad) replaces the native mobile keyboard for the
weight/reps set inputs, whose slide-in used to reflow the form ("jump around"). When on, `renderSetsForm` renders the
inputs as `type="text" inputmode="none" readonly` (no keyboard fires) and a tap opens a **fixed bottom-sheet numpad**
(`#trk-numpad`); being `position:fixed` it never reflows the form. Keys (digits · `.` · `±` · `⌫` · Clear · Next ·
Done) are built by the pure **`numpadApplyKey(buf, key, {decimal, sign, maxLen})`** — decimal only for weight and
time/distance reps, `±` for bodyweight "assist" weight, integer reps otherwise. Entry flows through the shared
**`commitSetField(i, f, val)`** (extracted from the native input handler, used by both paths) so `wTs`/`ts` stamping,
the reps-locked-until-weight rule, overload tags and the rest bar behave identically; `updateRowLive` was hoisted to
module scope so both paths can call it. With the option off, native keyboard entry is unchanged (cardio/superset/HR
inputs still use it).

### Set-form button rework + opt-in prefill (58) — DONE
The set-action buttons now live on one row — the modal footer is **Save · Add · Copy · Clear · Close** (the old hidden
Clone is gone; the body "+ Add Set" row and the "LAST: …" quick-fill row are removed). The footer `Add`/`Copy` are
sets-only (`renderModal` hides `#trk-add-set` for the picker/cardio/superset forms, since the footer is shared).
**Add Set** is now single-click = a fresh empty set (or the plate-loader default); the old double-click-for-previous-
weight behaviour is gone. **Copy** (`copyWeightToNextSet`) builds the *next* set's weight only: if the bottom set has a
weight it appends a new set carrying it (≡ the old double-click), else it fills the empty bottom set from the nearest
weighted set above, else from history (`getLastSetForExercise`) — it never copies reps. Auto-prefilling the first set
from the last session is now an **opt-in** `workoutControls.prefillFromHistory` (**default off**); the three
start-an-exercise prefill sites (picker tap, sub-option change, suggestion chip) are gated on it.

### Tracking modes — DONE
`exMode()` classifies a variation as **standard** (weight×reps), **bodyweight** (added load; − =
assist; shows effective load — feat 26), **distance** (carries — feat 27), or **time** (holds — 27).
**Cardio (feat 6)** is a fully separate path: `isCardioVar()` (mega `cardio`) routes the log modal to
`renderCardioForm()`, which captures elapsed time + optional distance/steps/power/setting/calories/
effort(1–5)/temp/weather/notes. Cardio entries store `cardio:{}` with empty `sets`, so they are
**excluded from volume, scoring, trends and progression history** but render with their metrics in
the session/history views.

### Plate loader (41/42) — DONE
For barbell movements (`isBarbellVar`), an optional collapsible loader in the sets form: pick a bar
(default 45 lb / 20 kg + variants), tap plates per side, see the live total, and **“Set as weight”**
fills empty sets and becomes the default weight for newly added sets. Symmetric only; a note explains
asymmetric is reserved for a few obscure lifts.

### Supersets — DONE (two distinct features)
- **Post‑hoc link (39):** a `⇄` button links a logged exercise with the one above it (shared `supersetId`).
- **Obscure real‑time superset (43):** a discrete “⇄ Superset two exercises” entry in the picker lets you
  pick exercise A then B, then add sets of **either** in any order; saved as two `supersetId`‑linked entries.
  Changing the chosen exercise discards the in‑progress superset, and a normal in‑progress set cannot be
  converted into a superset (you start superset mode fresh from the picker).

### Volume & muscle analysis — DONE
Body‑part, **per‑muscle (9)** and **per‑head (29)** views from a muscle model + per‑family contribution
map; adjustable **weightings (10)** scaling MEV/MAV/MRV targets with **cited sources** and revert‑to‑default;
imbalance **presets (11)**; over/under‑doing sort. **Cardio goals & adherence (7):** a card on the Volume
tab sets weekly minutes/distance/sessions goals and shows this‑period adherence bars (hidden when cardio
category is hidden).

### Session analytics (52) — DONE
A **Sessions** sub‑tab in Trends (`renderSessionTrends`) gives a light, *informational* read on training
habits — explicitly not progression. From `sessionTrendData()` (per‑session size/length/time, duration via
`endedAt` else last‑set time): summary tiles (avg length / sets / volume / typical start), sparklines for
per‑session **volume** and **duration** (`trendSparkSVG`), and bar charts (`trendBarsSVG`) for **time of day**
(6 buckets), **day of week**, and **workouts per week** (last 10). Reuses `computeSessionStats`/`lastSetTs`/
`startOfWeek`; charts are theme‑coloured via CSS vars.

### Categories visibility (8) — DONE
Settings → Categories hides **cardio / mobility / recovery** entirely: `categoryHidden()` removes them from
the picker (via `varVisibleInPicker`) and suppresses their features (e.g. cardio goals).

### Body composition (24) — DONE
`Body` tab: manual Garmin Index S2‑style entry (weight, body‑fat %, muscle/bone mass, water %), kg‑canonical,
displayed in lb/kg; BMI from latest weight + profile height; history with deltas.

### Reference, variations & glossary — DONE
Hide flags + reset (23); custom variations (16, manual‑flagged, removable only if unlogged, basis selectable);
built‑in extras (17/18 — Roc‑It dip/leg press/leg extension/leg curl/abdominal & oblique crunch, Life Fitness
torso rotation, hack‑squat foot positions, sissy hack squat); same‑stimulus alternatives with cues (19);
top‑bar glossary (20) & help (21); bodybuilder/lore entries (40) in a `Lore` category — **with no personal
lifespans (feat 45)**; **anatomy chart (30)** as a clickable left pane, bidirectionally cross‑linked to entries.

### Gyms (36/37/38/44/46) — DONE
Gym management is its **own tab (46)**. Define gyms by available equipment, build **from a template**,
select the **active** gym (overrides hide flags / force‑shows specific exercises), pin **GPS** (manual,
“pin here”, or **paste a Google Maps link / lat,lng — feat 44** via `parseMapsLatLng`), and a Maps **search**
link. Workout start pings location to auto‑select the nearest saved gym (≤2 km).

### Activity & error log (35) — DONE
Ring‑buffer event log in its own storage key; global error capture; in‑drawer viewer; export to `.txt`.

### UI chrome & build stamp (53) — DONE
The top app bar is **emoji‑only** (📈 / 📚 panel tabs · 📖 / ⚙️ / ❓ actions) to save width on mobile — no
wordmark, height stays 48px (so the rest‑bar/panel/picker offsets are untouched). The build identity is a
**single `APP_BUILD` constant** shown discreetly at the foot of the **Help** panel (not the top bar); a tracked
**`.githooks/pre-commit`** hook (`stamp-build.js`) rewrites it to `build <commit#> · <YYYY‑MM‑DD HH:MM>` on
every commit, so it never goes stale. The auto‑save status badge is a self‑contained fixed pill (decoupled
from the old top‑bar `#app-ts` anchor).

### Per‑exercise notes (54) — DONE
The log‑sets header (`.selected-exercise`) carries a **custom note that sticks to the exercise** —
add / edit / view / clear inline, persisted globally and re‑shown every time that exercise is logged (the
Strong/Hevy convention), independent of any session. Stored as `state.exerciseNotes[varUuid] = {text, updatedAt}`
keyed by **variation** (so the note is stable across grip/sub‑option changes); `getExerciseNote`/`setExerciseNote`
read/write it and `normalizeState` defaults the map. The header shows "📝 …note… · edit" when set and
"＋ Add note" when empty; an inline textarea (Save / Cancel / Clear) drives it, toggled by
`modalState.exNoteEditing` + a `renderModal()` re‑render, and reset on every modal open / exercise switch.

### Remaining‑exercises evaluation (55) — DONE
The live "what's left to round out this session" card (upgrades the feat‑15 balance card, same `dashboard.physique`
toggle). `computeRemainingWork(session)` finds the dominant mega and the still‑light **bodyparts** via `getBP()`
(the clean per‑exercise bodypart — `push`→chest/shoulders/triceps, `pull`→back/biceps, `lower`→quads/hams/glutes/calves,
`core`), then suggests one specific, currently‑visible exercise per missing area (excluding what's already done,
preferring the user's most‑used). Suggestions render as **tappable chips** — `startExerciseFromSuggestion(varUuid)`
opens the log modal preset to that exercise. Recomputed on every submit (it lives in `renderLog`). This also fixes a
latent feat‑15 bug: the old card tallied `family.sub` against keys (`triceps`/`biceps`/`core`) that are never a `sub`,
so those areas always read "light". The **projected grade** (Live score estimate) already reevaluated per submit and
is unchanged.

### Deferred — ONHOLD
- **#49** — Make the anatomy chart toggle to externally‑attached, more richly detailed charts and ensure the
  glossary covers everything on them. (Requires source charts that aren't provided; the built‑in stylized
  chart + comprehensive anatomy glossary ship today.)
- **#50‑Strava** — push the workout summary into the Strava activity the Garmin Forerunner
  auto‑generates (match by overlapping time window, then `PUT /activities/{id}` description). Deferred:
  Strava's API only exposes the activity *description/name* (no structured sets), and OAuth needs a
  server‑side secret + token refresh — so it requires a small backend (the same one the multi‑device
  sync question is parked on; a serverless worker would cover both). The text export is already
  Strava‑ready, so this becomes "authenticate + match + PUT" once a backend exists.

---

## 4. Notable design decisions
- **Palette‑driven theming** keeps each new theme to a single data entry, no per‑theme CSS.
- **Runtime injection over editing giant literals** for custom + built‑in‑extra variations.
- **Single picker‑visibility source of truth** (`varVisibleInPicker`) composes category‑hide, gym rules,
  hide flags and custom flags; gym force‑show wins for specific exercises.
- **Cardio is data‑shaped to opt out of strength math**: empty `sets` means every volume/score/trend
  function ignores it automatically; a guard in History skips zero‑set entries.
- **Separate log storage** so JSON export/import stays clean.
- **Two-layer test suite** (see §6): a zero-dependency static check (parses every inline `<script>`, lints,
  verifies the build stamp + Python helpers) plus a Playwright behavioral suite that boots the real file in
  headless Chromium and asserts the pure helpers + a clean boot. GitHub Actions runs both on every push/PR.

## 5. Known limitations
- Per‑muscle distribution is directional (explicit map for major lifts, even split otherwise), not lab‑accurate.
- The anatomy chart is a stylized schematic (see ONHOLD #49 for the richer‑chart follow‑up).
- Auto‑save/load and GPS need Chromium / geolocation permission; file handles reset on reload.
- Editing one of several cardio bouts of the *same* machine in a single session targets the first match.
- `parseMapsLatLng` reads coordinates from common Google Maps URL forms or a plain `lat,lng`; it does not call any Maps API.
- Rest analytics & the recommended‑rest blend only populate from sessions logged **after** feat 51 shipped (older sets lack the `wTs` start timestamp); they fall back to heuristics until then.
- The build stamp auto‑updates via a git pre‑commit hook; enable it once per clone with `git config core.hooksPath .githooks` (Node must be on PATH). Each commit therefore touches `gym-tracker.html` with the refreshed stamp.
- Exercise notes are **global per variation** — the same note shows for every grip/sub‑option and in every session; they are intentionally not repeated on per‑session history rows or in the image/text export (easy follow‑ups).
- The remaining‑exercises suggester uses the coarse `getBP` bodypart map (compound lower lifts count as quads; only the four strength megas are covered) and surfaces one suggestion per missing area — a nudge to round out balance, not a full program.

## 6. Testing & CI
The app is one ~1.4 MB self‑contained file, so the test tooling lives alongside it (`package.json`, `test/`,
`playwright.config.mjs`, `.github/workflows/ci.yml`) and never touches the shipped HTML. Two layers:

**Layer 1 — static checks (`npm run check`, zero dependencies, ~1 s).** `test/check.mjs` extracts every inline
`<script>` block and parses each with `vm.Script` (this is what catches a stray token that would otherwise break
the whole script at load — the exact failure mode that has bitten this repo). It also lints for native
`confirm/alert/prompt` calls (the themed dialogs replaced them), `debugger` statements and external `<script src>`
(the file must stay single‑file); checks `APP_BUILD` is well‑formed; greps that the critical functions are still
defined; and `py_compile`s the three `tools/*.py` helpers. Wired into the pre‑commit hook so a parse break can't be
committed (bypass with `git commit --no-verify`).

**Layer 2 — behavioral suite (`npm test`, Playwright + headless Chromium).** `test/app.spec.mjs` serves the file
over `http://127.0.0.1` (a tiny zero‑dep server, `test/serve.mjs`) and, in an isolated context per test, asserts:
the app boots with **no console/page errors** and renders its shell; the critical globals are exposed; and the pure
helpers compute correctly — `estimated1RM` (Epley), `kgToLb`/`lbToKg` round‑trip, `parseMediaUrl`
(YouTube/TikTok/Instagram id extraction + junk rejection), `estimatePlanMinutes`/`intensityDots`, `autoLoadSupported`,
`normalizeState` → `saveState` sync defaults, and a silent `importStravaActivities` merge. `npm test` runs the static
checks first (`pretest`).

**CI.** `.github/workflows/ci.yml` runs both layers on every push to `main`/`dev` and on PRs (Ubuntu, Node 20 +
Python 3, `npm ci`, then `playwright install chromium`), uploading the Playwright report as an artifact.

> The behavioral suite paid for itself on day one: its clean‑boot assertion caught a real shipped bug — the feat‑72
> HR auto‑reconnect call in the INIT block ran *above* the `let _hrConnected` declaration, so it threw a
> temporal‑dead‑zone rejection on every load and **auto‑reconnect never actually ran**. Fixed by deferring the call
> one tick (`setTimeout(hrTryReconnect, 0)`) so it fires after the script finishes initializing.
