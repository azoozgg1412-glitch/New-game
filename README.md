# Dummy Pit

A blocky 3D ragdoll gore game that runs in the browser. You walk around a crash-test bay with five weapons. Yellow dummies wander and run away when things get loud. Red brutes chase you and punch.

Open `index.html` in a browser to play. It loads three.js and cannon-es from a CDN, so it needs an internet connection.

The repo also has a second game, [Crumple Zone](#crumple-zone) (`crash.html`), a soft-body car crash test facility.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Walk |
| Shift | Sprint |
| Space | Jump |
| Mouse | Aim (click the game to lock the mouse, Esc to free it) |
| Left click | Use the weapon in your hand |
| 1 – 5, Q, mouse wheel | Grabber, Pistol, Machete, Sticky bomb, Cannon |
| F or right click | Throw what the grabber is holding |
| V | Switch between first person (default) and third person |
| N / B | Spawn a dummy / a brute |
| T | Slow motion |
| C | Mop up blood, debris and corpses |
| R | Reset the bay |
| M | Sound on / off |

On a phone or tablet, the left thumb walks and the right thumb aims. Fire, jump, sprint, throw, view and weapon buttons are on the right, and Menu opens spawns, slow-mo, reset and full screen.

There is a Full screen button on the start card and in the control bar.

## Dummy AI

- **Dummies (yellow)** wander between random spots. Gunfire, explosions or injuries send them running with their arms flailing.
- **Brutes (red)** chase you when you get close, or when you hurt them, and punch for 13 damage. Your health comes back after a few seconds without getting hit.
- Leg shots, headshots, explosions, cannonballs, thrown bodies and the grabber knock them down. They get back up if both legs, the torso and the head are still attached. Otherwise they stay down and writhe.
- A dummy dies when it loses its head or torso, or bleeds out from open wounds.

## How the gore works

- Each body part has its own health, and damage tints it red.
- When a part runs out of health its joint breaks: a blood-red stump with a bone shows, and both ends keep pumping blood for a few seconds.
- Heavy damage, such as a second headshot or a bomb up close, turns the part into chunks.
- Joints that get stretched too far, by a hard throw or an explosion, tear off.

# Crumple Zone

`crash.html` is a soft-body car crash game for phones and desktop browsers. Open it to play. It loads three.js from a CDN, so it needs an internet connection.

Each car is a lattice of 63 point masses joined by 434 beams. A beam that is pushed past its strain limit takes a permanent set, so dents stay. The crumple zones yield first. The passenger cell is stiff lengthways and weaker sideways, so doors cave in a side impact. Windows crack when the frame around them bends, and wheels come off when their mounts are pushed out of place. The body mesh is deformed on the GPU from the 63 node positions. The physics takes well under a millisecond per frame, so it runs smoothly on phones.

## The test facility

| Test | What happens |
| --- | --- |
| Barrier | Full-width concrete block, hit square on |
| Pole | 0.6 m steel pole, hit in the middle of the bumper |
| Head-on | Two cars at the same speed, 40% offset |
| Side impact | T-bone into a parked car |
| Drop | Dropped nose-down from the height that gives the chosen impact speed |
| Rollover | One-side wedge that tips the car over |
| Ramp jump | 3 m launch ramp |

Pick a speed from 20 to 200 km/h in Tests. The car is launched at that speed and a slow-motion replay plays after the hit. The facility also has a 55 m ramp up to an 8 m platform, a bigger kicker ramp, three parked cars, cones, water barrels, tyre stacks and jersey barriers.

## Controls

| Input | Action |
| --- | --- |
| W A S D or arrows | Drive and steer. Hold S or Brake when stopped to reverse |
| Space | Handbrake |
| G or Tab, 1 – 7 | Crash tests |
| C | Camera: chase, wide, hood, trackside. Drag the screen to look around |
| T | Slow motion |
| P | Replay the last seconds |
| X / R | Repair / put the car back on its wheels |
| F | Full screen |
| M | Sound on / off |

On a phone, the left thumb steers with the arrow pads, and the right thumb uses Gas, Brake and Hand. The Full screen button is on the start card and in the top bar. iPhone Safari has no full screen for web pages, so add the page to the Home Screen instead.

Graphics quality (Low, Medium, High) is in Tests. The resolution also scales down by itself if the frame rate drops.
