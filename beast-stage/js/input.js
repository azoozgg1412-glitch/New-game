'use strict';
// ============================================================ input: keyboard, gamepad, touch
const INPUT = {
  keys: Object.create(null), actions: new Set(), touch: Object.create(null),
  state: { throttle: 0, brake: 0, steer: 0, handbrake: 0, boost: 0, analogSteer: false, manual: false, shiftUp: false, shiftDown: false, lookBack: false },
  manual: false, padActive: false, lastPadButtons: [], device: 'keyboard',
};

(function () {
  const ACTION_KEYS = {
    KeyC: 'camera', KeyR: 'reset', KeyF: 'flare', KeyM: 'mute', Escape: 'pause', KeyP: 'pause', KeyT: 'transmission',
    KeyE: 'shiftUp', KeyQ: 'shiftDown', KeyV: 'voice', Enter: 'confirm',
  };
  const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyB', ...Object.keys(ACTION_KEYS)]);

  INPUT.init = function () {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat && ACTION_KEYS[e.code]) INPUT.actions.add(ACTION_KEYS[e.code]);
      INPUT.keys[e.code] = true;
      INPUT.device = 'keyboard';
    });
    window.addEventListener('keyup', (e) => { INPUT.keys[e.code] = false; });
    window.addEventListener('blur', () => { INPUT.keys = Object.create(null); INPUT.touch = Object.create(null); });
    // touch buttons: elements with data-touch="name" (hold) or data-tap="action"
    const holdEls = document.querySelectorAll('[data-touch]');
    holdEls.forEach((el) => {
      const name = el.dataset.touch;
      const down = (e) => { e.preventDefault(); INPUT.touch[name] = true; el.classList.add('on'); INPUT.device = 'touch'; if (window.BS && BS.userGesture) BS.userGesture(); };
      const up = (e) => { e.preventDefault(); INPUT.touch[name] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    });
    document.querySelectorAll('[data-tap]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); INPUT.actions.add(el.dataset.tap); el.classList.add('on'); });
      el.addEventListener('pointerup', () => el.classList.remove('on'));
      el.addEventListener('pointerleave', () => el.classList.remove('on'));
    });
  };

  INPUT.consume = function (a) { if (INPUT.actions.has(a)) { INPUT.actions.delete(a); return true; } return false; };
  INPUT.clearActions = function () { INPUT.actions.clear(); };

  const dz = (v, d) => (Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d));

  INPUT.poll = function () {
    const k = INPUT.keys, t = INPUT.touch, s = INPUT.state;
    let thr = (k.KeyW || k.ArrowUp || t.gas) ? 1 : 0;
    let brk = (k.KeyS || k.ArrowDown || t.brake) ? 1 : 0;
    let st = ((k.KeyA || k.ArrowLeft || t.left) ? 1 : 0) - ((k.KeyD || k.ArrowRight || t.right) ? 1 : 0);
    let hb = (k.Space || t.handbrake) ? 1 : 0;
    let bst = (k.ShiftLeft || k.ShiftRight || k.KeyN || t.nitro) ? 1 : 0;
    let look = !!(k.KeyB || t.look);
    let analog = false;
    s.shiftUp = false; s.shiftDown = false;
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const pressed = (i) => p.buttons[i] && p.buttons[i].pressed;
      const prev = INPUT.lastPadButtons;
      const edge = (i) => pressed(i) && !prev[i];
      const sx = dz(p.axes[0] || 0, 0.1);
      const rt = b(7), lt = b(6);
      if (Math.abs(sx) > 0.02 || rt > 0.05 || lt > 0.05) { INPUT.device = 'gamepad'; INPUT.padActive = true; }
      if (INPUT.device === 'gamepad') {
        if (Math.abs(sx) > 0) { st = -Math.sign(sx) * Math.pow(Math.abs(sx), 1.6); analog = true; }
        else if (!st) analog = true;
        thr = Math.max(thr, rt); brk = Math.max(brk, lt);
        if (pressed(0)) hb = 1;
        if (pressed(2)) bst = 1;
        if (pressed(4)) look = true;
      }
      if (edge(3)) INPUT.actions.add('camera');
      if (edge(1)) INPUT.actions.add('flare');
      if (edge(8)) INPUT.actions.add('reset');
      if (edge(9)) INPUT.actions.add('pause');
      if (edge(5) || edge(12)) INPUT.actions.add('shiftUp');
      if (edge(13)) INPUT.actions.add('shiftDown');
      if (edge(0)) INPUT.actions.add('confirm');
      INPUT.lastPadButtons = p.buttons.map((x) => x.pressed);
      break;
    }
    if (INPUT.consume('transmission')) INPUT.manual = !INPUT.manual;
    if (INPUT.manual) { s.shiftUp = INPUT.consume('shiftUp'); s.shiftDown = INPUT.consume('shiftDown'); }
    else { INPUT.consume('shiftUp'); INPUT.consume('shiftDown'); }
    s.throttle = thr; s.brake = brk; s.steer = st; s.handbrake = hb; s.boost = bst; s.analogSteer = analog; s.manual = INPUT.manual; s.lookBack = look;
    return s;
  };
})();
