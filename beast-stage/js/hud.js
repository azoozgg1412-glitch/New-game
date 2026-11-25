'use strict';
// ============================================================ HUD: gauges, minimap, pacenotes, beast meter
const HUD = { notes: { fwd: [], rev: [] }, lastSpoken: -1, voice: true, toasts: [] };

(function () {
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------ pacenotes
  function buildNotes(road, reverse) {
    const n = road.pts.length;
    const idx = (i) => ((i % n) + n) % n;
    const order = (i) => (reverse ? idx(n - 1 - i) : idx(i));
    const head = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const f = road.fr[order(i)];
      head[i] = Math.atan2(f.tz, f.tx) + (reverse ? PI : 0);
    }
    const k = new Float32Array(n);
    for (let i = 0; i < n; i++) k[i] = wrapAngle(head[idx(i + 6)] - head[idx(i - 6)]) / 24;
    const ks = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = -4; j <= 4; j++) s += k[idx(i + j)]; ks[i] = s / 9; }
    const notes = [];
    let i = 0;
    const th = 1 / 190;
    while (i < n) {
      if (Math.abs(ks[i]) < th) { i++; continue; }
      const sg = Math.sign(ks[i]);
      let j = i, peak = 0, peakAt = i;
      while (j < n + i && (Math.sign(ks[idx(j)]) === sg && Math.abs(ks[idx(j)]) >= th * 0.7)) { if (Math.abs(ks[idx(j)]) > peak) { peak = Math.abs(ks[idx(j)]); peakAt = j; } j++; }
      const len = (j - i) * 2;
      if (len > 12) {
        const R = 1 / peak;
        const grade = R > 140 ? 6 : R > 95 ? 5 : R > 65 ? 4 : R > 45 ? 3 : R > 28 ? 2 : 1;
        const dir = sg > 0 ? 'R' : 'L';
        const rel = (peakAt - i) / Math.max(1, j - i);
        let mod = '';
        if (len > 110) mod = 'long';
        else if (rel > 0.7 && grade <= 4) mod = 'tightens';
        else if (rel < 0.25 && grade <= 4) mod = 'opens';
        const word = grade === 1 ? (R < 20 ? 'hairpin' : '1') : String(grade);
        notes.push({ i, dir, grade, mod, text: `${dir === 'L' ? 'Left' : 'Right'} ${word}${mod ? ' ' + mod : ''}`, short: `${dir}${grade === 1 && R < 20 ? 'H' : grade}` });
      }
      i = j + 1;
    }
    const mapIdx = (orig) => (reverse ? idx(n - 1 - orig) : orig);
    for (const jmp of WORLD.jumps.filter((q) => q.road === 'loop')) {
      const ii = mapIdx(jmp.i) - 14;
      notes.push({ i: idx(ii), dir: null, grade: 0, text: jmp.height > 1.45 ? 'Big jump' : 'Jump', short: 'JUMP', kind: 'jump' });
    }
    for (const c of road.crossings) {
      const ii = mapIdx(c.i) - 18;
      notes.push({ i: idx(ii), dir: null, grade: 0, text: c.type === 'ford' ? 'Into water, careful' : 'Over bridge', short: c.type === 'ford' ? 'WATER' : 'BRIDGE', kind: c.type });
    }
    notes.sort((a, b) => a.i - b.i);
    return notes;
  }

  HUD.init = function () {
    const loop = WORLD.roads[0];
    HUD.notes.fwd = buildNotes(loop, false);
    HUD.notes.rev = buildNotes(loop, true);
    HUD.loopIdx = 0;
    HUD.gauge = $('gauge'); HUD.gctx = HUD.gauge.getContext('2d');
    HUD.map = $('minimap'); HUD.mctx = HUD.map.getContext('2d');
    buildMapImage();
    HUD.voice = safeStore('bs-voice') !== '0';
  };

  // ------------------------------------------------ minimap base image
  function buildMapImage() {
    const S = 1024, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const N = WORLD.N;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = Math.min(N - 1, Math.round(x / (S - 1) * (N - 1))), j = Math.min(N - 1, Math.round(y / (S - 1) * (N - 1)));
      const k = j * N + i, h = WORLD.h[k];
      const shade = 0.75 + 0.25 * (WORLD.nx[k] * -0.6 + WORLD.nz[k] * -0.6 + WORLD.ny[k] * 0.4);
      let r, g, b;
      if (h < WORLD.WATER) { r = 40; g = 95; b = 110; }
      else { const t = clamp(h / 120, 0, 1); r = lerp(38, 90, t) * shade; g = lerp(70, 92, t) * shade; b = lerp(30, 70, t) * shade; }
      const o = (y * S + x) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const toPx = (p) => [((p.x + WORLD.HALF) / WORLD.SIZE) * S, ((p.z + WORLD.HALF) / WORLD.SIZE) * S];
    for (const road of WORLD.roads) {
      for (const [w, col] of [[7, 'rgba(20,16,10,0.7)'], [4, '#d8b77a']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round';
        ctx.beginPath();
        road.pts.forEach((p, i) => { const [x, y] = toPx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        if (road.closed) ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#c9b48a';
    const [px, py] = toPx(WORLD.plaza); ctx.beginPath(); ctx.arc(px, py, (WORLD.plaza.r / WORLD.SIZE) * S, 0, TAU); ctx.fill();
    if (PROPS.temple) { const [tx, ty] = toPx(PROPS.temple); ctx.fillStyle = '#8d8a7c'; ctx.fillRect(tx - 8, ty - 8, 16, 16); }
    for (const cp of PROPS.checkpoints) { const [x, y] = toPx(cp); ctx.fillStyle = cp.index === 0 ? '#fff' : '#f0bf2c'; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke(); }
    HUD.mapImg = c;
    HUD.mapToPx = toPx;
  }

  HUD.drawMap = function (car, beast, flares) {
    const ctx = HUD.mctx, W = HUD.map.width, H = HUD.map.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, TAU); ctx.clip();
    ctx.fillStyle = '#1b2414'; ctx.fillRect(0, 0, W, H);
    const scale = (W / 2) / 260 * (WORLD.SIZE / HUD.mapImg.width); // ~260 m radius
    const [cx, cy] = HUD.mapToPx(car.pos);
    ctx.translate(W / 2, H / 2 + H * 0.12);
    ctx.rotate(car.yaw + PI);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.drawImage(HUD.mapImg, 0, 0);
    for (const f of flares) { const [x, y] = HUD.mapToPx(f.pos); ctx.fillStyle = '#ff3b2f'; ctx.beginPath(); ctx.arc(x, y, 4 / scale * 1.6, 0, TAU); ctx.fill(); }
    if (beast && beast.active) {
      const [bx, by] = HUD.mapToPx(beast.pos);
      const r = 9 / scale;
      ctx.fillStyle = 'rgba(255,60,30,0.25)'; ctx.beginPath(); ctx.arc(bx, by, r * 2.2 * (1 + 0.2 * Math.sin(performance.now() * 0.008)), 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff3c1e'; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // player arrow (fixed, pointing up)
    ctx.save();
    ctx.translate(W / 2, H / 2 + H * 0.12);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // beast off-map pointer
    if (beast && beast.active) {
      const dx = beast.pos.x - car.pos.x, dz = beast.pos.z - car.pos.z, d = Math.hypot(dx, dz);
      if (d > 230) {
        const th = car.yaw + PI, c = Math.cos(th), s = Math.sin(th);
        const rx = dx * c - dz * s, ry = dx * s + dz * c;
        const L = Math.hypot(rx, ry), R = W / 2 - 10;
        ctx.fillStyle = '#ff3c1e';
        ctx.beginPath(); ctx.arc(W / 2 + rx / L * R, H / 2 + ry / L * R, 6, 0, TAU); ctx.fill();
      }
    }
    // ring
    ctx.strokeStyle = 'rgba(240,191,44,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, TAU); ctx.stroke();
  };

  // ------------------------------------------------ gauge
  HUD.drawGauge = function (v) {
    const ctx = HUD.gctx, W = HUD.gauge.width, H = HUD.gauge.height;
    const dpr = W / 220;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 220, 220);
    const cx = 110, cy = 112, R = 92;
    const a0 = PI * 0.75, a1 = PI * 2.25;
    const maxR = 8000;
    // dial
    ctx.fillStyle = 'rgba(14,16,14,0.78)'; ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, TAU); ctx.fill();
    ctx.lineWidth = 9; ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, R - 4, a0, a1); ctx.stroke();
    const rl = a0 + (7600 / maxR) * (a1 - a0);
    ctx.strokeStyle = '#d8331f'; ctx.beginPath(); ctx.arc(cx, cy, R - 4, rl, a1); ctx.stroke();
    const ra = a0 + clamp(v.rpm / maxR, 0, 1) * (a1 - a0);
    ctx.strokeStyle = v.rpm > 7000 ? '#ff5a12' : '#f0bf2c'; ctx.beginPath(); ctx.arc(cx, cy, R - 4, a0, ra); ctx.stroke();
    ctx.fillStyle = '#d9d6cc'; ctx.font = '600 13px "Saira Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let r = 0; r <= 8; r++) {
      const a = a0 + (r / 8) * (a1 - a0);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); ctx.lineTo(cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20)); ctx.stroke();
      ctx.fillText(String(r), cx + Math.cos(a) * (R - 31), cy + Math.sin(a) * (R - 31));
    }
    // needle
    ctx.strokeStyle = '#ff5a12'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(ra) * 10, cy - Math.sin(ra) * 10); ctx.lineTo(cx + Math.cos(ra) * (R - 10), cy + Math.sin(ra) * (R - 10)); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.fill();
    // speed + gear
    ctx.fillStyle = '#f5f2ea'; ctx.font = 'italic 800 46px "Saira Condensed", sans-serif';
    ctx.fillText(String(Math.round(v.kmh)), cx, cy + 36);
    ctx.fillStyle = '#9aa09a'; ctx.font = '600 12px "Saira Condensed", sans-serif';
    ctx.fillText('KM/H', cx, cy + 60);
    ctx.fillStyle = '#f0bf2c'; ctx.font = 'italic 800 30px "Saira Condensed", sans-serif';
    ctx.fillText(v.gear, cx, cy - 34);
    if (v.manual) { ctx.fillStyle = '#9aa09a'; ctx.font = '600 10px "Saira Condensed", sans-serif'; ctx.fillText('MANUAL', cx, cy - 15); }
    // turbo arc (inner)
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.arc(cx, cy, R - 46, PI * 1.15, PI * 1.85); ctx.stroke();
    ctx.strokeStyle = '#4fd1c5';
    ctx.beginPath(); ctx.arc(cx, cy, R - 46, PI * 1.15, PI * 1.15 + v.boost * PI * 0.7); ctx.stroke();
  };

  // ------------------------------------------------ pacenotes
  HUD.updateNotes = function (car) {
    const loop = WORLD.roads[0], n = loop.pts.length;
    let best = HUD.loopIdx, bd = 1e9;
    for (let k = -50; k <= 50; k++) {
      const q = ((HUD.loopIdx + k) % n + n) % n;
      const d = (loop.pts[q].x - car.pos.x) ** 2 + (loop.pts[q].z - car.pos.z) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    if (bd > 60 * 60) { // lost: global search occasionally
      const nr = WORLD.nearestRoad(car.pos.x, car.pos.z, true);
      best = nr.i; bd = nr.dist * nr.dist;
    }
    HUD.loopIdx = best;
    const el = $('notes');
    if (bd > 30 * 30 || car.speed < 2) { el.classList.add('dim'); if (bd > 30 * 30) { el.innerHTML = ''; return; } }
    else el.classList.remove('dim');
    const f = loop.fr[best];
    const fwdDir = car.vel.x * f.tx + car.vel.z * f.tz >= 0 || car.speed < 2 && (Math.sin(car.yaw) * f.tx + Math.cos(car.yaw) * f.tz) >= 0;
    const list = fwdDir ? HUD.notes.fwd : HUD.notes.rev;
    const cur = fwdDir ? best : n - 1 - best;
    const upcoming = [];
    for (const note of list) {
      let d = (note.i - cur + n) % n;
      if (d * 2 < 330) upcoming.push({ note, dist: d * 2 });
    }
    upcoming.sort((a, b) => a.dist - b.dist);
    const show = upcoming.slice(0, 3);
    el.innerHTML = show.map(({ note, dist }, k) => {
      const icon = note.dir ? arrowSVG(note.dir, note.grade) : `<span class="ni-tag">${note.short}</span>`;
      return `<div class="note${k === 0 ? ' first' : ''}${note.kind ? ' ' + note.kind : ''}">${icon}<span class="nt">${note.dir ? note.grade === 1 && note.short.endsWith('H') ? 'HAIRPIN' : note.grade : ''}${note.mod ? `<small>${note.mod}</small>` : ''}</span><span class="nd">${Math.round(dist / 10) * 10} m</span></div>`;
    }).join('');
    // co-driver voice
    if (show.length && HUD.voice && window.speechSynthesis) {
      const first = show[0];
      const speakAt = clamp(car.speed * 3.2, 60, 170);
      const key = (fwdDir ? 'f' : 'r') + first.note.i;
      if (first.dist < speakAt && HUD.lastSpoken !== key) {
        HUD.lastSpoken = key;
        let text = first.note.text;
        if (show[1] && show[1].dist - first.dist < 45) text += ', into ' + show[1].note.text.toLowerCase();
        try {
          if (speechSynthesis.speaking && speechSynthesis.pending) speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.rate = 1.25; u.pitch = 0.95; u.volume = 0.9;
          speechSynthesis.speak(u);
        } catch (e) { /* no voice */ }
      }
    }
  };
  function arrowSVG(dir, grade) {
    const bend = [0, 160, 125, 95, 70, 48, 30][grade] || 40;
    const flip = dir === 'L' ? -1 : 1;
    const ex = 22 + flip * Math.sin(bend * PI / 180) * 16, ey = 26 - Math.cos(bend * PI / 180) * 16 - 2;
    return `<svg class="ni" viewBox="0 0 44 44"><path d="M22 40 L22 26 Q22 18 ${22 + flip * 4} 14 L${ex} ${ey}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="${ex}" cy="${ey}" r="4" fill="currentColor"/></svg>`;
  }

  // ------------------------------------------------ text bits
  HUD.toast = function (text, kind = '', dur = 1.6) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, dur * 1000);
  };
  HUD.center = function (text, kind = '') {
    const el = $('center');
    el.textContent = text; el.className = 'center show ' + kind;
    clearTimeout(HUD._ct);
    HUD._ct = setTimeout(() => { el.className = 'center'; }, 900);
  };
  HUD.fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t % 1) * 10)}`;

  HUD.update = function (g) {
    const car = g.car;
    $('hTime').textContent = HUD.fmtTime(g.time);
    $('hDist').textContent = (g.distance / 1000).toFixed(2) + ' km';
    $('hCp').textContent = String(g.checkpoints);
    $('hScore').textContent = String(Math.floor(g.score));
    $('hHealth').style.setProperty('--v', clamp(car.health, 0, 100) / 100);
    $('hHealthTxt').textContent = Math.max(0, Math.round(car.health)) + '%';
    $('hNitro').style.setProperty('--v', car.nitro);
    $('hNitroWrap').classList.toggle('full', car.nitro > 0.99);
    $('hFlares').innerHTML = '<i></i>'.repeat(g.flares) + '<i class="e"></i>'.repeat(Math.max(0, 3 - g.flares));
    const bm = $('beastMeter');
    if (g.mode === 'escape' && BEAST.active) {
      bm.hidden = false;
      const d = BEAST.state === 'dormant' ? BEAST.dist : Math.min(BEAST.dist, BEAST.trailDist || BEAST.dist);
      $('bmDist').textContent = Math.round(d) + ' m';
      $('bmFill').style.setProperty('--v', clamp(1 - d / 300, 0, 1));
      bm.classList.toggle('hot', d < 60);
    } else bm.hidden = true;
    $('vignette').style.opacity = String(g.danger * 0.85 + g.hitFlash);
  };
})();
