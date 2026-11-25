# Jungle Dash

A 3D endless runner. Your rally car races down a jungle road that curves and rolls over hills while a giant beast crashes through the trees beside you. Dodge, jump, hit ramps, grab idols and power-ups, and keep the gap open.

**Play:** download `jungle-dash.html` and open it in a browser. It's one file with everything inside, so it works offline and on phones (portrait or landscape).

## Controls

| Phone | Keyboard | Action |
| --- | --- | --- |
| Swipe left/right, or tap a side | ← → or A D | Change lane |
| Swipe up | ↑, W or Space | Jump (clears logs, not rocks) |
| ⛶ / 🔊 / ‖ buttons | F / M / Esc | Full screen, sound, pause |

## How it plays

- **Beast gap**: crashing shrinks it, clean driving and nitro grow it back. As it closes, the beast draws level with you in the trees, smashing them down. At zero it lunges onto the road.
- **Obstacles**: rocks (dodge), logs and double logs (jump), rolling boulders, mud (slows you), river fords, and ramps that launch you into barrel rolls over rocks.
- **Pickups**: golden idols, **nitro** (smash through anything, pushes the beast back), **shield** (blocks one crash), **magnet** (pulls idols in).
- **Score**: distance, idols, near misses, air time and barrel rolls, all times a multiplier (×1 to ×5) that grows with clean driving and resets when you crash. Distance gates every 500 m.
- Day turns to sunset, then night with headlights and fireflies, then dawn.

## Building

`src.html` is the source. It reuses the Beast Stage engine (rally car, beast, plant models, textures, particles and synthesized sound) from `../beast-stage/js/`. `python3 build.py path/to/three.min.js` (three@0.160.0) inlines everything into `jungle-dash.html`.
