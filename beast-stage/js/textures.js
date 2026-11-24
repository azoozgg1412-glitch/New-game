'use strict';
// ============================================================ procedural textures
const TEX = {};

function dataTex(size, data, opts = {}) {
  const t = new THREE.DataTexture(data, size, opts.h || size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso || 8;
  t.needsUpdate = true;
  return t;
}

// generic per-pixel generator. fn(u, v, out[4]) writes 0..255 rgba
function genTex(size, fn, opts) {
  const data = new Uint8Array(size * size * 4);
  const out = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[3] = 255;
      fn(x / size, y / size, out, x, y);
      const i = (y * size + x) * 4;
      data[i] = clamp(out[0], 0, 255); data[i + 1] = clamp(out[1], 0, 255);
      data[i + 2] = clamp(out[2], 0, 255); data[i + 3] = clamp(out[3], 0, 255);
    }
  }
  return dataTex(size, data, opts);
}

// periodic worley: returns {d1, d2, id, dx, dy}
function makeWorley(seed) {
  const r = mulberry32(seed);
  const pts = new Float32Array(256 * 256 * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  const res = { d1: 0, d2: 0, id: 0, dx: 0, dy: 0 };
  return function (u, v, P) {
    const x = u * P, y = v * P;
    const cx = Math.floor(x), cy = Math.floor(y);
    let d1 = 9, d2 = 9, id = 0, bdx = 0, bdy = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j;
        const wx = ((gx % P) + P) % P, wy = ((gy % P) + P) % P;
        const k = ((wy & 255) * 256 + (wx & 255)) * 3;
        const px = gx + pts[k], py = gy + pts[k + 1];
        const dx = x - px, dy = y - py;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; id = pts[k + 2]; bdx = dx; bdy = dy; } else if (d < d2) d2 = d;
      }
    }
    res.d1 = d1; res.d2 = d2; res.id = id; res.dx = bdx; res.dy = bdy;
    return res;
  };
}

function mixc(out, a, b, t) { out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); }

function buildTerrainTextures(quality) {
  const S = quality === 'low' ? 256 : 512;
  const pn = makePeriodicNoise(11), pn2 = makePeriodicNoise(23);
  const wor = makeWorley(5), wor2 = makeWorley(9);
  const c = [0, 0, 0];

  TEX.grass = genTex(S, (u, v, o) => {
    const g = periodicFbm(pn, u * 8, v * 8, 8, 5);
    const blades = pn2(u * 256, v * 64, 256) * 0.5 + pn2(u * 64 + 3, v * 256, 64) * 0.5;
    const patch = periodicFbm(pn2, u * 4, v * 4, 4, 3);
    mixc(c, [46, 78, 24], [92, 124, 40], g);
    mixc(o, c, [118, 120, 52], smoothstep(0.55, 0.8, patch) * 0.6);
    const k = 0.75 + blades * 0.5;
    o[0] *= k; o[1] *= k; o[2] *= k;
    o[3] = 30;
  });

  TEX.forest = genTex(S, (u, v, o) => {
    const base = periodicFbm(pn, u * 8, v * 8, 8, 4);
    mixc(o, [38, 29, 19], [66, 50, 32], base);
    // leaf litter: two worley layers
    for (let layer = 0; layer < 2; layer++) {
      const w = (layer ? wor2 : wor)(u, v, layer ? 22 : 30);
      const ang = w.id * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const lx = (w.dx * ca - w.dy * sa) / 0.42, ly = (w.dx * sa + w.dy * ca) / 0.2;
      const e = lx * lx + ly * ly;
      if (e < 1) {
        const pal = [[92, 62, 30], [120, 84, 40], [76, 44, 26], [110, 98, 44], [64, 70, 30]];
        const p = pal[Math.floor(w.id * 97) % pal.length];
        const shade = 0.75 + 0.25 * (1 - e) + (Math.abs(ly) < 0.08 ? -0.15 : 0);
        o[0] = p[0] * shade; o[1] = p[1] * shade; o[2] = p[2] * shade;
      }
    }
    const moss = periodicFbm(pn2, u * 6, v * 6, 6, 4);
    const m = smoothstep(0.58, 0.72, moss);
    mixc(o, o, [58, 84, 30], m * 0.85);
    o[3] = 20;
  });

  TEX.gravel = genTex(S, (u, v, o) => {
    const base = periodicFbm(pn, u * 16, v * 16, 16, 4);
    const fine = pn2(u * 200, v * 200, 200);
    mixc(o, [104, 84, 60], [146, 120, 88], base * 0.8 + fine * 0.2);
    // embedded stones: low contrast, varied greys and ochres
    const w = wor(u, v, 56);
    const rad = 0.2 + w.id * 0.2;
    if (w.d1 < rad) {
      const tone = 100 + w.id * 70;
      const sh = 1.0 - (w.dx + w.dy) * 0.35 - (w.d1 / rad) * 0.12;
      const warm = w.id > 0.5 ? 1.05 : 0.97;
      o[0] = lerp(o[0], tone * sh * warm, 0.75); o[1] = lerp(o[1], tone * sh * 0.95, 0.75); o[2] = lerp(o[2], tone * sh * 0.84, 0.75);
    } else if (w.d1 < rad + 0.05) { o[0] *= 0.8; o[1] *= 0.8; o[2] *= 0.8; }
    const w2 = wor2(u, v, 128);
    if (w2.d1 < 0.22) { const t = 95 + w2.id * 60; o[0] = lerp(o[0], t, 0.6); o[1] = lerp(o[1], t * 0.94, 0.6); o[2] = lerp(o[2], t * 0.82, 0.6); }
    o[3] = 15;
  });

  TEX.mud = genTex(S, (u, v, o) => {
    const b = periodicFbm(pn, u * 6, v * 6, 6, 5);
    const sw = periodicFbm(pn2, u * 12 + b, v * 12, 12, 3);
    mixc(o, [62, 46, 30], [104, 80, 54], sw);
    const wet = smoothstep(0.54, 0.66, b);
    mixc(o, o, [56, 44, 32], wet * 0.7);
    o[3] = 60 + wet * 195; // gloss
    const w = wor(u, v, 20);
    if (w.d1 < 0.12 && w.id > 0.6) { o[0] = 95; o[1] = 88; o[2] = 78; o[3] = 40; }
  });

  TEX.rock = genTex(S, (u, v, o) => {
    const b = periodicFbm(pn, u * 8, v * 8, 8, 6);
    const cr = periodicFbm(pn2, u * 10, v * 10, 10, 3);
    mixc(o, [78, 76, 70], [140, 136, 126], b);
    const crack = Math.abs(cr - 0.5) < 0.018 ? 0.5 : 1;
    o[0] *= crack; o[1] *= crack; o[2] *= crack;
    const lic = smoothstep(0.62, 0.7, periodicFbm(pn, u * 20 + 7, v * 20, 20, 3));
    mixc(o, o, [96, 112, 58], lic * 0.7);
    o[3] = 30;
  });

  TEX.sand = genTex(S, (u, v, o) => {
    const b = periodicFbm(pn, u * 16, v * 16, 16, 4);
    const grain = pn2(u * 256, v * 256, 256);
    mixc(o, [140, 120, 86], [184, 164, 122], b);
    const k = 0.9 + grain * 0.2;
    o[0] *= k; o[1] *= k; o[2] *= k;
    const w = wor(u, v, 30);
    if (w.d1 < 0.18 && w.id > 0.75) { const t = 110 + w.id * 40; o[0] = t; o[1] = t; o[2] = t * 0.92; }
    o[3] = 40;
  });

  for (const k of ['grass', 'forest', 'gravel', 'mud', 'rock', 'sand']) TEX[k].anisotropy = quality === 'low' ? 2 : 8;
}

function buildMaterialTextures(quality) {
  const S = quality === 'low' ? 256 : 512;
  const pn = makePeriodicNoise(77), pn2 = makePeriodicNoise(78);
  const wor = makeWorley(31);

  // bark: vertical fibres + moss
  TEX.bark = genTex(256, (u, v, o) => {
    const f = pn(u * 24, v * 3, 24) * 0.6 + pn2(u * 48, v * 6, 48) * 0.4;
    const furrow = smoothstep(0.35, 0.15, f);
    mixc(o, [104, 90, 72], [62, 52, 42], furrow);
    const moss = smoothstep(0.55, 0.7, periodicFbm(pn, u * 4, v * 4, 4, 4));
    mixc(o, o, [70, 92, 40], moss * 0.8);
    const k = 0.85 + pn2(u * 128, v * 16, 128) * 0.3;
    o[0] *= k; o[1] *= k; o[2] *= k;
  });

  // palm trunk: rings
  TEX.palmBark = genTex(256, (u, v, o) => {
    const ring = Math.abs(Math.sin(v * PI * 18 + pn(u * 8, v * 8, 8) * 1.5));
    const f = pn2(u * 32, v * 4, 32);
    mixc(o, [86, 74, 58], [150, 132, 104], smoothstep(0.1, 0.6, ring) * 0.8 + f * 0.2);
  });

  // temple stone blocks with moss
  TEX.stone = genTex(S, (u, v, o) => {
    const rows = 8, cols = 4;
    const row = Math.floor(v * rows);
    const off = (row % 2) * 0.5;
    const cu = (u * cols + off) % 1, cv = (v * rows) % 1;
    const mortar = Math.min(cu, 1 - cu) < 0.03 || Math.min(cv, 1 - cv) < 0.06;
    const b = periodicFbm(pn, u * 8, v * 8, 8, 5);
    const blockTone = pn2(Math.floor(u * cols + off) * 7.3, row * 3.1, 64);
    mixc(o, [96, 92, 80], [150, 144, 124], b * 0.6 + blockTone * 0.4);
    if (mortar) { o[0] *= 0.45; o[1] *= 0.45; o[2] *= 0.42; }
    const moss = smoothstep(0.5, 0.68, periodicFbm(pn2, u * 5, v * 5, 5, 4) + (mortar ? 0.12 : 0));
    mixc(o, o, [62, 88, 36], moss * 0.85);
  });

  // wooden planks
  TEX.wood = genTex(256, (u, v, o) => {
    const plank = Math.floor(u * 6);
    const pu = (u * 6) % 1;
    const grain = pn(u * 6 * 4 + plank * 13, v * 2, 24) * 0.5 + pn2(u * 60, v * 8, 60) * 0.5;
    mixc(o, [92, 64, 38], [146, 106, 66], grain * 0.8 + pn(plank * 5.1, 1, 64) * 0.3);
    if (pu < 0.04 || pu > 0.96) { o[0] *= 0.4; o[1] *= 0.4; o[2] *= 0.4; }
    const weather = smoothstep(0.5, 0.7, periodicFbm(pn2, u * 3, v * 3, 3, 3));
    mixc(o, o, [100, 98, 90], weather * 0.5);
  });

  // thatch
  TEX.thatch = genTex(256, (u, v, o) => {
    const s = pn(u * 96, v * 6, 96) * 0.6 + pn2(u * 200, v * 10, 200) * 0.4;
    mixc(o, [96, 76, 42], [178, 148, 92], s);
    const band = (v * 8) % 1 < 0.1 ? 0.7 : 1;
    o[0] *= band; o[1] *= band; o[2] *= band;
  });

  // monster skin: scales + crevices
  const skinGlow = new Uint8Array(S * S * 4);
  TEX.skin = genTex(S, (u, v, o, x, y) => {
    const w = wor(u, v, 36);
    const edge = smoothstep(0.0, 0.18, w.d2 - w.d1);
    const b = periodicFbm(pn, u * 6, v * 6, 6, 4);
    mixc(o, [30, 34, 26], [76, 80, 58], b * 0.7 + w.id * 0.3);
    const k = 0.35 + 0.65 * edge;
    o[0] *= k; o[1] *= k; o[2] *= k;
    const moss = smoothstep(0.6, 0.75, periodicFbm(pn2, u * 4, v * 4, 4, 4));
    mixc(o, o, [58, 82, 34], moss * 0.7);
    // glowing fissures: thin cracks, only in some patches, brightest deep in the crevices
    const vein = Math.abs(periodicFbm(pn2, u * 4 + 11, v * 4, 4, 4) - 0.5);
    const patch = smoothstep(0.45, 0.65, periodicFbm(pn, u * 3 + 5, v * 3 + 9, 3, 3));
    const g = (smoothstep(0.014, 0.0, vein) * patch + smoothstep(0.05, 0.0, w.d2 - w.d1) * 0.35 * patch) * (1 - edge * 0.3);
    const i = (y * S + x) * 4;
    skinGlow[i] = 255 * g; skinGlow[i + 1] = 110 * g; skinGlow[i + 2] = 20 * g; skinGlow[i + 3] = 255;
  });
  TEX.skinGlow = dataTex(S, skinGlow);
}

// ---------------------------------------------------------- foliage atlas
// regions (uv rects [u0, v0, w, h]):
const ATLAS = {
  palm: [0, 0.5, 0.5, 0.5],
  broad: [0.5, 0.5, 0.5, 0.5],
  banana: [0, 0, 0.5, 0.5],
  fern: [0.5, 0, 0.25, 0.5],
  grass: [0.75, 0, 0.25, 0.5],
};

function buildFoliageAtlas(quality) {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const r = mulberry32(4242);
  const R = (a, b) => a + r() * (b - a);
  const green = (l, s = 1) => `rgb(${Math.round((30 + 40 * l) * s)},${Math.round((70 + 70 * l) * s)},${Math.round((18 + 24 * l) * s)})`;
  // region helper: canvas rect for uv rect
  const reg = (u) => ({ x: u[0] * S, y: (1 - u[1] - u[3]) * S, w: u[2] * S, h: u[3] * S });

  // palm frond: base at left, tip right, rib through middle
  {
    const g = reg(ATLAS.palm);
    const cy = g.y + g.h / 2;
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const x = g.x + 12 + t * (g.w - 30);
      const len = (g.h * 0.47) * Math.sin(PI * (0.08 + 0.92 * t)) ** 0.6 * (1 - t * 0.35);
      for (const s of [-1, 1]) {
        const ex = x + len * 0.55, ey = cy + s * len;
        ctx.strokeStyle = green(R(0.25, 0.75));
        ctx.lineWidth = 7 - t * 3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, cy); ctx.quadraticCurveTo(x + len * 0.15, cy + s * len * 0.6, ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(160,190,90,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, cy); ctx.quadraticCurveTo(x + len * 0.15, cy + s * len * 0.6, ex, ey); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#8a8a4a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(g.x, cy); ctx.lineTo(g.x + g.w - 12, cy); ctx.stroke();
  }
  // broadleaf cluster: disc of overlapping leaves
  {
    const g = reg(ATLAS.broad);
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    for (let i = 0; i < 220; i++) {
      const a = R(0, TAU), d = Math.sqrt(r()) * g.w * 0.43;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const L = R(26, 48), W = L * R(0.38, 0.5);
      const rot = a + R(-0.7, 0.7);
      const lum = 0.15 + (d / (g.w * 0.43)) * 0.55 + R(-0.12, 0.12);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = green(lum);
      ctx.beginPath(); ctx.moveTo(-L / 2, 0);
      ctx.quadraticCurveTo(0, -W, L / 2, 0); ctx.quadraticCurveTo(0, W, -L / 2, 0); ctx.fill();
      ctx.strokeStyle = `rgba(190,220,120,${0.25 + lum * 0.2})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
      ctx.restore();
    }
  }
  // banana leaf: big paddle with tears
  {
    const g = reg(ATLAS.banana);
    const cy = g.y + g.h / 2;
    const grd = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
    grd.addColorStop(0, '#3c7a22'); grd.addColorStop(0.5, '#5f9c34'); grd.addColorStop(1, '#3a7020');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(g.x + 4, cy);
    ctx.bezierCurveTo(g.x + g.w * 0.25, g.y + 20, g.x + g.w * 0.8, g.y + 30, g.x + g.w - 6, cy);
    ctx.bezierCurveTo(g.x + g.w * 0.8, g.y + g.h - 30, g.x + g.w * 0.25, g.y + g.h - 20, g.x + 4, cy);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,60,15,0.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 60; i++) {
      const x = g.x + 20 + i * (g.w - 40) / 60;
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + 30, g.y + 8); ctx.moveTo(x, cy); ctx.lineTo(x + 30, g.y + g.h - 8); ctx.stroke();
    }
    // tears
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const x = g.x + R(60, g.w - 60); const top = r() < 0.5;
      ctx.beginPath(); ctx.moveTo(x, top ? g.y : g.y + g.h); ctx.lineTo(x + 18, top ? g.y : g.y + g.h); ctx.lineTo(x + 30, cy + (top ? -R(10, 60) : R(10, 60))); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#b8c27a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(g.x, cy); ctx.lineTo(g.x + g.w - 8, cy); ctx.stroke();
  }
  // fern frond: base at bottom, tip top
  {
    const g = reg(ATLAS.fern);
    const cx = g.x + g.w / 2;
    for (let i = 0; i < 46; i++) {
      const t = i / 46;
      const y = g.y + g.h - 8 - t * (g.h - 20);
      const len = g.w * 0.46 * Math.sin(PI * (0.1 + 0.9 * t)) ** 0.7 * (1 - t * 0.5);
      for (const s of [-1, 1]) {
        ctx.fillStyle = green(R(0.3, 0.8), 0.95);
        ctx.save(); ctx.translate(cx, y); ctx.rotate(s * -0.35);
        ctx.beginPath(); ctx.ellipse(s * len / 2, 0, len / 2, 6 - t * 2, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    ctx.strokeStyle = '#6a7a30'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, g.y + g.h); ctx.lineTo(cx, g.y + 10); ctx.stroke();
  }
  // grass blades: base at bottom
  {
    const g = reg(ATLAS.grass);
    for (let i = 0; i < 110; i++) {
      const x = g.x + R(10, g.w - 10);
      const h = R(0.45, 0.98) * g.h;
      const lean = R(-30, 30);
      const lum = R(0.1, 0.8);
      ctx.strokeStyle = `rgb(${Math.round(44 + 60 * lum)},${Math.round(78 + 64 * lum)},${Math.round(22 + 24 * lum)})`;
      ctx.lineWidth = R(2, 4);
      ctx.beginPath(); ctx.moveTo(x, g.y + g.h); ctx.quadraticCurveTo(x + lean * 0.3, g.y + g.h - h * 0.6, x + lean, g.y + g.h - h); ctx.stroke();
    }
  }

  // dilate colours into transparent texels so mipmaps don't get dark fringes
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  const out = new Uint8Array(S * S * 4);
  // flip vertically (DataTexture has no flipY) so uv layout matches canvas layout
  for (let y = 0; y < S; y++) {
    const src = (S - 1 - y) * S * 4;
    out.set(d.subarray(src, src + S * 4), y * S * 4);
  }
  for (let pass = 0; pass < 6; pass++) {
    const copy = out.slice();
    for (let y = 1; y < S - 1; y++) {
      for (let x = 1; x < S - 1; x++) {
        const i = (y * S + x) * 4;
        if (copy[i + 3] > 8 || copy[i] + copy[i + 1] > 0) continue;
        let rr = 0, gg = 0, bb = 0, n = 0;
        for (const o of [-4, 4, -S * 4, S * 4]) {
          const j = i + o;
          if (copy[j + 3] > 8 || copy[j] + copy[j + 1] > 0) { rr += copy[j]; gg += copy[j + 1]; bb += copy[j + 2]; n++; }
        }
        if (n) { out[i] = rr / n; out[i + 1] = gg / n; out[i + 2] = bb / n; }
      }
    }
  }
  for (let i = 0; i < out.length; i += 4) if (out[i + 3] <= 8 && out[i] + out[i + 1] === 0) { out[i] = 50; out[i + 1] = 90; out[i + 2] = 28; }
  TEX.foliage = dataTex(S, out, { aniso: 4 });
}
