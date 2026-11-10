# GymTracker

Notes for the coding agent that works on this repo.

## House standards (shared across every app by this maker)

@../CoworkSyncHub/HOUSE-STANDARDS.md

For this app:
- Check the standards: `node ../CoworkSyncHub/standards.mjs gymtracker -v`. Keep it all `ok` before pushing.
- Test: `node test/check.mjs` (static, fast) and `npx playwright test` (the full suite, about 20 min; pin time with page.clock, see test/midnight.spec.mjs)
- Deploy: push to main: CI runs the suite, then deploy.yml publishes, live-checks and tags
- Work on `main`, push your own work when it passes, and add user-visible changes to `whatsnew.json`.
