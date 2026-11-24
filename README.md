# Dummy Pit

A 3D ragdoll sandbox that runs in the browser. Crash-test dummies with real ragdoll physics: shoot them, blow them up, fire cannonballs at them, or grab them and throw them around. Limbs can be shot off, torn off, or blown to pieces.

Open `index.html` in a browser to play. It loads three.js and cannon-es from a CDN, so it needs an internet connection.

## Controls

| Input | Action |
| --- | --- |
| Left click / one finger | Use the current tool |
| Right-drag / two fingers | Orbit the camera |
| Scroll / pinch | Zoom |
| W A S D | Move the camera |
| Arrow keys | Orbit the camera |
| 1 – 4 | Grab, Pistol, Sticky bomb, Cannon |
| N | Drop a new dummy |
| T | Slow motion |
| C | Mop up blood and debris |
| R | Reset the bay |
| M | Sound on / off |

## How the gore works

- Each body part has its own health. Damage tints it red.
- When a part runs out of health, its joint breaks and the stump keeps pumping blood for a few seconds.
- Heavy damage (a second headshot, a bomb at close range) turns the part into chunks.
- Joints that get stretched too far, by a hard throw or an explosion, tear off.
- Hard landings count as fractures, and falls and throws do impact damage.
