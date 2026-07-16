# Driftline

Driftline is a one-touch momentum arcade game built for fast landscape sessions on mobile and desktop browsers. Hold to carve into a downhill, release to turn that speed into flight, then reconnect with the next slope cleanly enough to keep the run alive.

The project is a complete static web app: there is no framework, build pipeline, account, or server dependency. Progress, records, unlocked worlds, and equipped ball styles are stored locally in the browser.

## Play

- Touch or hold the canvas while moving downhill to dive and build speed.
- Release before the crest to launch.
- Match the next slope for a clean landing and a stronger score chain.
- Collect coins, complete goals, unlock ball styles, and reach new worlds.
- On a keyboard, use <kbd>Space</kbd> or <kbd>Arrow Down</kbd> for the same hold/release control.

The interface is designed around mobile Safari in landscape, including short viewports, safe-area insets, pause-on-interruption behavior, and 44-pixel minimum touch targets. Sound, haptics, and motion effects are individually configurable.

## Run locally

Service workers require an HTTP origin, so open the game through a local server rather than by double-clicking `index.html`.

```powershell
python -m http.server 4173
```

Then visit `http://127.0.0.1:4173/`. Use a private window or clear the site service worker when comparing cached and uncached builds.

## Project map

- `src/physics-core.js` owns the seeded terrain and fixed-step ball simulation.
- `src/score-system.js` owns flight, landing, distance, and multiplier scoring.
- `src/coin-routes.js` and `src/coin-field.js` build fair, terrain-aware reward lines.
- `src/sand-effects.js` and `src/sand-renderer.js` render the world, motion, particles, and feedback.
- `src/art.js` creates the centered ball, coin, and world-preview artwork used at runtime.
- `src/game-ui.js` owns menus, progression, records, accessibility settings, and local saves.
- `src/main.js` coordinates input, simulation, camera, audio, lifecycle, and run results.
- `sw.js` precaches the complete app shell for repeat visits and offline play.

The scripts in `tests/` are deterministic Node probes for terrain continuity, physics balance, route fairness, autopilot survival, and scoring rules.

## Publish with GitHub Pages

The deployable artifact is the repository root. In GitHub, open **Settings → Pages**, choose **Deploy from a branch**, and select the desired publishing branch with the `/ (root)` folder. The included `.nojekyll` file prevents Jekyll processing, and all runtime URLs are relative so the game works under a project path such as `/DUNE/`.

After publishing, verify one online run, one reload, and one offline reload. A new service-worker version replaces only Driftline caches and leaves other apps on the same GitHub Pages origin untouched.

## Art, audio, and attribution

All shipped artwork, interface marks, visual effects, and synthesized sound are original to this implementation and generated locally at runtime or stored as authored SVG. No third-party asset pack, font, sample, or game code is bundled. See [ATTRIBUTION.md](ATTRIBUTION.md) for the full provenance note.
