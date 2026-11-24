# Jungle Dash

A quick 3D endless runner. Your rally car speeds down a jungle road on its own; switch lanes to dodge rocks, jump logs, grab golden idols and blue nitro cans, and keep the beast behind you.

**Play:** download `jungle-dash.html` and open it in a browser. It's one file with everything inside (including three.js), so it works offline and on phones.

| Phone | Keyboard | Action |
| --- | --- | --- |
| Swipe left/right, or tap a side | ← → or A D | Change lane |
| Swipe up | ↑, W or Space | Jump (clears logs, not rocks) |
| ⛶ button | | Full screen |
| ‖ button | Esc / P | Pause |

Crashing slows you down and shrinks the **beast gap**. Drive clean or grab nitro to win it back. If the gap hits zero, you're caught.

`src.html` is the source; `python3 build.py path/to/three.min.js` (three@0.160.0) rebuilds `jungle-dash.html`.
