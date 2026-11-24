# Dummy Pit

A blocky 3D ragdoll gore game that runs in the browser. You walk around a crash-test bay with five weapons. Yellow dummies wander and run away when things get loud. Red brutes chase you and punch.

Open `index.html` in a browser to play. It loads three.js and cannon-es from a CDN, so it needs an internet connection.

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
