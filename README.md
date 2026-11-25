# Dummy Pit

A blocky 3D ragdoll gore game that runs in the browser. You walk around a crash-test bay with five weapons. Yellow dummies wander and run away when things get loud. Red brutes chase you and punch.

Open `index.html` in a browser to play. It loads three.js and cannon-es from a CDN, so it needs an internet connection.

The repo also has two more games: [Crumple Zone](#crumple-zone) (`crash.html`), a soft-body car crash test facility, and [Lanternfall](#lanternfall) (`lanternfall.html`), a top-down wave survival roguelite.

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

Each car is a lattice of 63 point masses joined by 434 beams. A beam that is pushed past its strain limit takes a permanent set and gets a little stiffer, so dents stay. The crumple zones yield first. The passenger cell is stiff lengthways and weaker sideways, so doors cave in a side impact. The body mesh is deformed on the GPU from the 63 node positions. The physics takes well under a millisecond per frame, so it runs smoothly on phones.

## The car

The body is built from real panels: hood, trunk lid, front and rear bumpers, four doors with their windows, and two mirrors. It also has wrap-around headlights with LED strips and projectors, tail lamps with a light bar, brake and reverse lights, a grille, fog lamps, plates, exhaust tips, door handles, panel shut-lines and wipers. There is an interior (seats, dashboard, steering wheel) behind tinted glass, and an engine bay under the hood. The wheels have five twin-spoke rims, brake discs and calipers.

Every panel crumples with the body until the area around it is crushed. Then its latch lets go and it becomes a separate piece:

- The hood pops open on its hinges after a hard frontal hit. In a big one it tears off.
- Doors spring open and swing on their hinges. They stop at the door frame and at full opening, and tear off in a heavy side impact.
- Bumpers hang from one side, then fall off.
- Mirrors snap off in hard side hits.
- Windows shatter, and headlights and tail lamps break.
- Wheels come off when their mounts are pushed out of place.

Loose parts tumble, slide and can be hit by other cars. Repair puts everything back.

## Graphics

HDR rendering with bloom (lamps, sparks and sun glints glow), filmic tone mapping, a light colour grade and vignette. The paint has a clearcoat, and the reflection map shows sky, ground and buildings. The sky has clouds and the horizon has hills. Cars get contact shadows, crashes throw dust, sparks and debris, and drifting leaves tyre smoke and skid marks. Low quality turns off post-processing and real-time shadows for older phones.

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

Pick a speed from 20 to 200 km/h in Tests. The car is launched at that speed and a slow-motion replay plays after the hit. The facility also has a concrete crash apron, high-speed camera rigs, a 55 m ramp up to an 8 m platform, a bigger kicker ramp, three parked cars, cones, water barrels, tyre stacks, jersey barriers and a fenced perimeter.

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

# Lanternfall

`lanternfall.html` is a 2D top-down wave survival game for phones and desktop browsers. It needs no libraries: the game draws all its art in code and renders it with WebGL 2.

You carry a lantern through four arenas. Enemies come in waves. Your weapons fire on their own, and each kill drops a soul shard. Fill the bar to level up and pick one of three cards. At 8:00 the stage boss arrives; beat it to clear the stage and unlock the next one.

## Cards

There are over 200 different cards, so no two runs build the same way:

- **19 weapons**, each with five levels. Arc Bolt, Whirling Blades, Flame Breath, Hallowed Aura, Chain Lightning, Frost Nova, Bone Boomerang, Meteor Call, Caltrops, Seeker Wisps, Sunbeam, Toxic Flask, Scatter Shards, Ricochet Saw, Thunder Call, Quake Hammer, Void Rift, Guardian Drone, Bone Lance.
- **19 evolutions**. A level 5 weapon plus its matching passive offers a legendary evolution card, for example Arc Bolt and Quickening make Storm Lance, and Flame Breath and Ember Heart make Inferno Gale. Treasure chests from elites always give an evolution if one is ready.
- **26 passives** with up to five levels each: damage, cooldown, area, speed, crits, luck, freeze, burn and poison chances, thorns, lifesteal, dodge, a recharging shield, and more.
- **21 relics**, one copy each, that change how a run plays: Glass Cannon, Chain Reaction, Echo Charm, Four-Leaf Charm (choose from four cards), Phoenix Feather, Shatterglass, Wildfire and others.

You hold up to six weapons and six passives. Rarer cards (rare, epic, legendary) show up more with luck. Rerolls and skips are on the card screen.

## Stages

| Stage | Enemies | Boss |
| --- | --- | --- |
| Mossgrave Ruins | slimes that split, bats, skeletons, spore mushrooms, moss golems | Thornback Colossus: charges, thorn rings, summons slimes |
| Cinder Wastes | fire imps, ash wraiths that teleport, suicide beetles, charging crawlers, knights | Cinder Wyrm: a segmented snake that spits fire |
| Hoarfrost Crypt | ghouls, ice spiders, frost wisps, crystal turrets, yetis | Hoarfrost Lich: teleports, bullet spirals, raises ghouls |
| Void Sanctum | shades, gazers, phase stalkers, splitting orbs, abyssal brutes | The Many-Eyed: orbiting eyes, spirals, bullet rings |

Elites glow gold and drop chests. Surround waves and brutes arrive at set times.

## Heroes and the camp

Five heroes start with different weapons: Lantern Keeper (Arc Bolt), Blade Dancer (Whirling Blades), Pyromancer (Flame Breath), Iron Warden (Hallowed Aura) and Hexweaver (Toxic Flask). Gold you collect is banked even if you die. Spend it at the Camp on permanent upgrades such as damage, HP, speed, rerolls and an extra revive.

## Controls

On a phone, drag anywhere with your thumb to move; a joystick appears under it. On a desktop, use WASD or the arrow keys. Press P or Esc to pause, 1 – 4 to pick a card, R to reroll and F for full screen. The full screen button is on the main menu and in the top bar.
