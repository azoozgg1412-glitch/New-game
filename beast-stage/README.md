# Beast Stage

A jungle rally game that runs in the browser. You drive a detailed rally car down a gravel stage through a 2 km × 2 km jungle while a giant beast follows your dust. Hit checkpoints, earn nitro from drifts and jumps, drop flares to stun it, and never stop moving.

**Easiest:** download `beast-stage/beast-stage-single.html` and double-click it. That one file has everything, including the 3D engine, and plays offline.

Or open `beast-stage/index.html` in a browser to play (Chrome, Edge, Firefox or Safari with WebGL 2). It loads three.js from a CDN, so it needs an internet connection the first time. The game files are plain scripts, so it also works when opened straight from disk.

## Modes

- **Escape the Beast** — survive as long as you can. Score comes from distance, checkpoints (+500), drifts, airtime, close calls and smashing trees. The beast gets faster the longer you last. It catches you if you stop near it, and its swipes throw the car around.
- **Free Roam** — the same jungle with no beast. Learn the stage, the jumps and the fords.

Beast difficulty (Easy, Normal, Hard), driving assists (Full, Light, Off) and graphics quality (Low, Medium, High) are on the title screen.

## Controls

| Input | Action |
| --- | --- |
| W / ↑ | Throttle |
| S / ↓ | Brake, hold when stopped to reverse |
| A D / ← → | Steer |
| Space | Handbrake (for hairpins) |
| Shift | Nitro — fills up from drifting and airtime |
| F | Drop a flare — the beast is stunned when it reaches it |
| B | Look back |
| C | Camera: chase, far chase, hood, cockpit, bumper |
| R | Put the car back on the road |
| T, then Q / E | Manual gearbox, shift down / up |
| V | Co-driver voice on/off |
| M | Sound on/off |
| Esc / P | Pause |

Gamepad: right trigger throttle, left trigger brake, left stick steer, A handbrake, X nitro, B flare, Y camera, LB look back, RB / D-pad shift, Back reset, Start pause.

On a phone or tablet, on-screen buttons appear: steering on the left, gas, brake, handbrake and nitro on the right, and camera, flare, reset and pause along the top.

## What's in it

**The car** is built entirely in code: a lofted body from ~170 cross-sections with real wheel arches and flares, a painted livery atlas (door shut lines, race numbers, sponsor decals, windshield banner, plates), see-through glass with the roll cage, seats, harnesses and a two-person crew inside, a turning steering wheel, gravel tyres with tread blocks and sidewall lettering, gold rally rims, brake discs that glow when hot, calipers, coilover springs and control arms that move with the suspension, a four-lamp light pod, headlights, tail and brake lights, reverse light, rear wing (it can be torn off), mirrors, wipers, bonnet vents and pins, tow straps, mudflaps that flap, an exhaust that spits flames, dents where you hit things, and dirt that builds up on the paint.

**The driving model** is a custom rigid-body simulation at 240 Hz with render interpolation:
- four raycast suspension corners with springs, bump/rebound damping, bump stops and anti-roll bars
- a combined-slip tyre model (Pacejka-style curve with a friction circle and load sensitivity)
- an AWD drivetrain with a turbo engine (lag, anti-lag pops), torque curve, a six-speed sequential gearbox with auto or manual shifting, clutch launch, engine braking and a hydraulic handbrake that disconnects the rear
- surfaces that change grip and rolling resistance: gravel, grass and jungle floor, mud, water fords, wooden bridge decks
- aerodynamic drag and downforce, water drag and buoyancy, air control, and collisions with trees (small ones snap), rocks, ruins and walls
- assists you can turn down: counter-steer help, ABS, traction control and a stability system that lets you drift but catches spins

**The jungle** is generated at load: hills and boundary mountains, a river with sandy banks, a tributary, a lake, a 5 km rally loop with jumps, mud sections, fords and a bridge, two cross roads meeting at a temple plaza, a stepped pyramid, a giant stone head, a stone arch over the stage, a stilt-hut village, checkpoint gates and corner chevrons. About 50,000 plants are instanced with level of detail and wind: palms, giant buttressed canopy trees with lianas, mid trees, banana plants, ferns, bushes, grass and rocks.

**The beast** is a moss-covered, four-eyed jungle monster with a hinged jaw, horns, back spines and a tail, animated with a procedural gallop. It follows your trail, cuts corners when it is close, flattens trees, shakes the ground with every step, and roars.

**Also:** rally pacenotes on screen with an optional co-driver voice, a rotating minimap, a tachometer, dust, mud, water spray, tyre smoke and skid marks, falling trees, synthesized engine/turbo/gravel/roar audio with tension drums that speed up as the beast closes in, and adaptive resolution to keep the frame rate smooth.

## Files

- `beast-stage-single.html` — the whole game in one file (built by `build-single.py`)
- `index.html` — page, HUD, menus and the loader
- `js/util.js` — math, noise, geometry helpers
- `js/textures.js` — procedural terrain, bark, stone, skin and foliage textures
- `js/world.js` — terrain, rivers, roads, jumps, surface masks and ground queries
- `js/terrain.js` — terrain chunks and shader, water, sky, lights
- `js/flora.js` — vegetation models, placement, instancing, falling trees, collision obstacles
- `js/props.js` — temple, ruins, arch, bridges, village, checkpoints, signs
- `js/car-model.js` — the rally car model
- `js/vehicle.js` — vehicle physics
- `js/beast.js` — the beast model, animation and AI
- `js/fx.js` — particles, skid marks, debris
- `js/audio.js` — synthesized sound
- `js/input.js` — keyboard, gamepad and touch
- `js/hud.js` — gauge, minimap, pacenotes, beast meter
- `js/game.js` — game loop, cameras, rules
