'use strict';
// ============================================================ world generation
// Heightfield on a 2 m grid, rivers + lake carved in, a rally road network rasterised
// on top, plus surface masks used by both the renderer and the vehicle physics.
const WORLD = {
  SIZE: 2048, HALF: 1024, CELL: 2, N: 1025, WATER: 0, HW: 4.6, LIMIT: 985,
  roads: [], rivers: [], bridges: [], platforms: [], jumps: [], fords: [],
};

(function () {
  const N = WORLD.N, H = WORLD.HALF, C = WORLD.CELL;
  let NZ = {};

  function baseHeight(x, z) {
    let h = 24 + fbm(NZ.a, x / 650, z / 650, 4) * 34 + fbm(NZ.b, x / 190, z / 190, 4) * 9;
    const rg = ridged(NZ.c, x / 420, z / 420, 4);
    h += rg * rg * 26 * smoothstep(-0.1, 0.6, NZ.d(x / 1100, z / 1100));
    if (h < 5) h = 5 - (5 - h) * 0.25;
    const e = Math.max(Math.abs(x), Math.abs(z));
    const m = smoothstep(790, 1010, e);
    h += m * m * (150 + 70 * NZ.e(x / 160, z / 160));
    return h;
  }

  // iterate grid cells near each segment of a polyline
  function rasterSegments(pts, closed, range, fn) {
    const nseg = closed ? pts.length : pts.length - 1;
    for (let s = 0; s < nseg; s++) {
      const a = pts[s], b = pts[(s + 1) % pts.length];
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - range + H) / C));
      const i1 = Math.min(N - 1, Math.ceil((Math.max(a.x, b.x) + range + H) / C));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - range + H) / C));
      const j1 = Math.min(N - 1, Math.ceil((Math.max(a.z, b.z) + range + H) / C));
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
      for (let j = j0; j <= j1; j++) {
        const z = -H + j * C;
        for (let i = i0; i <= i1; i++) {
          const x = -H + i * C;
          let t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = a.x + dx * t - x, pz = a.z + dz * t - z;
          const d = Math.sqrt(px * px + pz * pz);
          if (d < range) fn(j * N + i, s, t, d);
        }
      }
    }
  }

  function bilinear(arr, x, z) {
    const fx = clamp((x + H) / C, 0, N - 1.001), fz = clamp((z + H) / C, 0, N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const k = j * N + i;
    return lerp(lerp(arr[k], arr[k + 1], u), lerp(arr[k + N], arr[k + N + 1], u), v);
  }
  WORLD.bilinear = bilinear;

  // ------------------------------------------------ curves
  function catmullClosed(ctrl, per) {
    const out = [], n = ctrl.length;
    for (let k = 0; k < n; k++) {
      const p0 = ctrl[(k - 1 + n) % n], p1 = ctrl[k], p2 = ctrl[(k + 1) % n], p3 = ctrl[(k + 2) % n];
      for (let s = 0; s < per; s++) out.push(crPoint(p0, p1, p2, p3, s / per));
    }
    return out;
  }
  function catmullOpen(ctrl, per) {
    const out = [], n = ctrl.length;
    for (let k = 0; k < n - 1; k++) {
      const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(n - 1, k + 2)];
      for (let s = 0; s < per; s++) out.push(crPoint(p0, p1, p2, p3, s / per));
    }
    out.push({ x: ctrl[n - 1].x, z: ctrl[n - 1].z });
    return out;
  }
  function crPoint(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return { x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) };
  }
  function resample(pts, step, closed) {
    const src = closed ? pts.concat([pts[0]]) : pts;
    const cum = [0];
    for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + Math.hypot(src[i].x - src[i - 1].x, src[i].z - src[i - 1].z));
    const L = cum[cum.length - 1];
    const n = closed ? Math.round(L / step) : Math.round(L / step) + 1;
    const st = closed ? L / n : L / (n - 1);
    const out = [];
    let k = 0;
    for (let q = 0; q < n; q++) {
      const s = q * st;
      while (k < cum.length - 2 && cum[k + 1] < s) k++;
      const t = (s - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
      out.push({ x: lerp(src[k].x, src[k + 1].x, t), z: lerp(src[k].z, src[k + 1].z, t) });
    }
    return out;
  }
  function frames(pts, closed) {
    const n = pts.length;
    return pts.map((p, i) => {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      return { tx: dx / L, tz: dz / L, nx: -dz / L, nz: dx / L };
    });
  }
  function wiggle(pts, closed, amp, fadeEnds, keepOut) {
    const fr = frames(pts, closed);
    let phase = 0, s = 0;
    const L = pts.length * 4;
    return pts.map((p, i) => {
      if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      const A = amp * smoothstep(-0.15, 0.45, NZ.f(s / 800, 3.3 + amp));
      const lam = 170 + 120 * (NZ.g(s / 600, 7.7 + amp) * 0.5 + 0.5);
      phase += (4 * TAU) / lam;
      let fade = smoothstep(0, fadeEnds, s) * smoothstep(L, L - fadeEnds, s);
      if (keepOut) fade *= smoothstep(keepOut.r, keepOut.r + 80, Math.hypot(p.x - keepOut.x, p.z - keepOut.z));
      const off = A * Math.sin(phase) * fade;
      return { x: p.x + fr[i].nx * off, z: p.z + fr[i].nz * off };
    });
  }

  function blurArr(a, radius, passes, closed) {
    const n = a.length;
    let src = Float32Array.from(a);
    for (let p = 0; p < passes; p++) {
      const dst = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0, c = 0;
        for (let k = -radius; k <= radius; k++) {
          let q = i + k;
          if (closed) q = (q + n) % n; else if (q < 0 || q >= n) continue;
          s += src[q]; c++;
        }
        dst[i] = s / c;
      }
      src = dst;
    }
    return src;
  }

  // ------------------------------------------------ rivers
  function buildRivers() {
    const rivers = [];
    { // main river, west -> east
      const pts = [], w = [], dep = [];
      for (let x = -1180; x <= 1180; x += 14) {
        pts.push({ x, z: -300 + 120 * Math.sin(x / 260 + 0.5) + 60 * NZ.h(x / 300, 1.7) });
        w.push(13 + 3 * NZ.h(x / 200, 9.1)); dep.push(3.2);
      }
      rivers.push({ name: 'main', pts, w, dep });
    }
    const lake = { x: 330, z: 240, r: 100 };
    { // tributary from north into lake
      const pts = [], w = [], dep = [];
      const a = { x: 240, z: 1180 }, b = { x: lake.x, z: lake.z };
      const n = 70;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const px = lerp(a.x, b.x, t), pz = lerp(a.z, b.z, t);
        const m = Math.sin(t * PI * 5) * 70 * (1 - t * 0.6) + NZ.h(t * 6, 4.2) * 40;
        pts.push({ x: px + m, z: pz });
        w.push(8.5 + 2 * NZ.h(t * 8, 2.2)); dep.push(2.4);
      }
      rivers.push({ name: 'trib', pts, w, dep });
    }
    { // outflow from lake down to main river
      const main = rivers[0].pts;
      let target = main[0];
      for (const p of main) if (Math.abs(p.x - 290) < Math.abs(target.x - 290)) target = p;
      const pts = [], w = [], dep = [];
      const a = { x: lake.x - 20, z: lake.z - 60 };
      const n = 40;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        pts.push({ x: lerp(a.x, target.x, t) + Math.sin(t * PI * 3) * 30, z: lerp(a.z, target.z, t) });
        w.push(8 + 1.5 * NZ.h(t * 5, 8.8)); dep.push(2.2);
      }
      rivers.push({ name: 'outflow', pts, w, dep });
    }
    WORLD.rivers = rivers;
    WORLD.lake = lake;
  }

  // ------------------------------------------------ roads
  function buildLoop() {
    const K = 16, ctrl = [];
    for (let k = 0; k < K; k++) {
      const th = (k / K) * TAU + rnd(-0.05, 0.05);
      const r = 680 + 110 * NZ.i(Math.cos(th) * 1.3, Math.sin(th) * 1.3);
      ctrl.push({ x: Math.cos(th) * r, z: Math.sin(th) * r });
    }
    let pts = resample(catmullClosed(ctrl, 40), 4, true);
    pts = wiggle(pts, true, 38, 160, null);
    pts = resample(pts, 2, true);
    return { name: 'loop', closed: true, pts };
  }
  function buildCross(loop, angle, name) {
    const near = (ang) => {
      let best = 0, bd = 1e9;
      loop.pts.forEach((p, i) => { const d = Math.abs(wrapAngle(Math.atan2(p.z, p.x) - ang)); if (d < bd) { bd = d; best = i; } });
      return loop.pts[best];
    };
    const A = near(angle), B = near(angle + PI);
    const perp = { x: -Math.sin(angle), z: Math.cos(angle) };
    const ctrl = [A,
      { x: A.x * 0.55 + perp.x * 40, z: A.z * 0.55 + perp.z * 40 },
      { x: A.x * 0.2, z: A.z * 0.2 },
      { x: 0, z: 0 },
      { x: B.x * 0.2, z: B.z * 0.2 },
      { x: B.x * 0.55 - perp.x * 50, z: B.z * 0.55 - perp.z * 50 }, B];
    let pts = resample(catmullOpen(ctrl, 30), 4, false);
    pts = wiggle(pts, false, 18, 120, { x: 0, z: 0, r: 150 });
    pts = resample(pts, 2, false);
    pts[0] = { x: A.x, z: A.z }; pts[pts.length - 1] = { x: B.x, z: B.z };
    return { name, closed: false, pts };
  }

  function finishRoad(road, hNat, wd, wW) {
    const pts = road.pts, n = pts.length;
    road.s = new Float32Array(n);
    for (let i = 1; i < n; i++) road.s[i] = road.s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    road.length = road.s[n - 1] + (road.closed ? Math.hypot(pts[0].x - pts[n - 1].x, pts[0].z - pts[n - 1].z) : 0);
    road.fr = frames(pts, road.closed);
    let h = new Float32Array(n);
    for (let i = 0; i < n; i++) h[i] = bilinear(hNat, pts[i].x, pts[i].z);
    h = blurArr(h, 14, 4, road.closed);
    road.mud = new Float32Array(n);
    road.bridge = new Uint8Array(n);
    road.noRaster = new Uint8Array(n);
    // water crossings
    const wet = new Uint8Array(n);
    for (let i = 0; i < n; i++) wet[i] = bilinear(wd, pts[i].x, pts[i].z) < 5 ? 1 : 0;
    const runs = [];
    for (let i = 0; i < n; i++) {
      if (wet[i] && !wet[(i - 1 + n) % n]) {
        let j = i; while (wet[(j + 1) % n] && j - i < n) j++;
        runs.push([i, j]);
      }
    }
    const idxw = (i) => (road.closed ? (i + n) % n : clamp(i, 0, n - 1));
    road.crossings = [];
    for (const [i0, i1] of runs) {
      const mid = pts[idxw((i0 + i1) >> 1)];
      const width = bilinear(wW, mid.x, mid.z);
      const big = width > 11.5;
      const isBridge = big && ((road.name === 'loop' && mid.x > 0) || road.name === 'crossB');
      if (isBridge) {
        const a = i0 - 12, b = i1 + 12;
        const D = Math.max(h[idxw(a - 4)], h[idxw(b + 4)], WORLD.WATER + 3.4);
        for (let k = a - 40; k <= b + 40; k++) {
          const q = idxw(k);
          const w = k < a ? smoothstep(a - 40, a, k) : k > b ? smoothstep(b + 40, b, k) : 1;
          h[q] = lerp(h[q], D, w);
        }
        for (let k = a; k <= b; k++) road.noRaster[idxw(k)] = 1;
        for (let k = a; k <= b; k++) road.bridge[idxw(k)] = 1;
        const pa = pts[idxw(a)], pb = pts[idxw(b)];
        WORLD.bridges.push({ a: { ...pa }, b: { ...pb }, top: D, road: road.name, i0: a, i1: b });
        road.crossings.push({ i: (i0 + i1) >> 1, type: 'bridge' });
      } else {
        const T = WORLD.WATER - 0.38;
        const a = i0 - 6, b = i1 + 6;
        for (let k = a - 28; k <= b + 28; k++) {
          const q = idxw(k);
          const w = k < a ? smoothstep(a - 28, a, k) : k > b ? smoothstep(b + 28, b, k) : 1;
          h[q] = lerp(h[q], T, w);
          road.mud[q] = Math.max(road.mud[q], w * 0.55);
        }
        WORLD.fords.push({ x: mid.x, z: mid.z, road: road.name });
        road.crossings.push({ i: (i0 + i1) >> 1, type: 'ford' });
      }
    }
    road.h = h;
  }

  function addJumps(road) {
    const n = road.pts.length, fr = road.fr;
    const heading = (i) => Math.atan2(fr[(i + n) % n].tz, fr[(i + n) % n].tx);
    const bad = new Uint8Array(n);
    for (const c of road.crossings) for (let k = -160; k <= 160; k++) bad[(c.i + k + n) % n] = 1;
    for (let k = 0; k < 180; k++) { bad[k] = 1; bad[n - 1 - k] = 1; }
    const cands = [];
    for (let i = 0; i < n; i += 9) {
      if (bad[i]) continue;
      const turn = Math.abs(wrapAngle(heading(i + 25) - heading(i - 45)));
      if (turn < 0.1) cands.push(i);
    }
    for (let k = cands.length - 1; k > 0; k--) { const j = Math.floor(RNG() * (k + 1)); [cands[k], cands[j]] = [cands[j], cands[k]]; }
    const chosen = [];
    for (const c of cands) {
      if (chosen.length >= 7) break;
      if (bad[c]) continue;
      chosen.push(c);
      for (let k = -230; k <= 230; k++) bad[(c + k + n) % n] = 1;
    }
    for (const c of chosen) {
      const Hj = rnd(1.15, 1.6);
      const rise = 28, drop = 16;
      for (let k = -rise / 2; k <= drop / 2; k++) {
        const q = (c + k + n) % n;
        const u = k * 2;
        let add;
        // smooth ramp that steepens toward the lip, then a rounded crest falling away
        if (u <= 0) { const t = (u + rise) / rise; add = Hj * (t * t * (1.6 - 0.6 * t)); } else add = Hj * (1 - smoothstep(0, drop, u));
        road.h[q] += add;
      }
      WORLD.jumps.push({ road: road.name, i: c, x: road.pts[c].x, z: road.pts[c].z, height: Hj });
    }
  }

  function addMud(road, count) {
    const n = road.pts.length;
    for (let m = 0; m < count; m++) {
      const c = Math.floor(rnd(0.1, 0.95) * n);
      const len = Math.floor(rnd(30, 60));
      for (let k = -len - 10; k <= len + 10; k++) {
        const q = road.closed ? (c + k + n) % n : clamp(c + k, 0, n - 1);
        const w = smoothstep(len + 10, len - 4, Math.abs(k));
        road.mud[q] = Math.max(road.mud[q], w);
      }
    }
  }

  // ------------------------------------------------ main generation
  WORLD.generate = async function (seed, progress) {
    seedRandom(seed);
    NZ = {
      a: makeNoise2D(seed + 1), b: makeNoise2D(seed + 2), c: makeNoise2D(seed + 3), d: makeNoise2D(seed + 4),
      e: makeNoise2D(seed + 5), f: makeNoise2D(seed + 6), g: makeNoise2D(seed + 7), h: makeNoise2D(seed + 8),
      i: makeNoise2D(seed + 9), j: makeNoise2D(seed + 10), k: makeNoise2D(seed + 11),
    };
    WORLD.noise = NZ;
    const NN = N * N;
    const hN = new Float32Array(NN);
    for (let j = 0; j < N; j++) {
      const z = -H + j * C;
      for (let i = 0; i < N; i++) hN[j * N + i] = baseHeight(-H + i * C, z);
      if (j % 128 === 0) { progress(0.05 + 0.2 * j / N, 'Raising the hills'); await nextFrame(); }
    }

    // rivers
    buildRivers();
    progress(0.27, 'Carving rivers');
    await nextFrame();
    const wd = new Float32Array(NN).fill(1e6), wW = new Float32Array(NN), wDep = new Float32Array(NN);
    for (const r of WORLD.rivers) {
      rasterSegments(r.pts, false, 200, (k, s, t, d) => {
        const w = lerp(r.w[s], r.w[s + 1], t), dn = d - w;
        if (dn < wd[k]) { wd[k] = dn; wW[k] = w; wDep[k] = lerp(r.dep[s], r.dep[s + 1], t); }
      });
    }
    { const L = WORLD.lake;
      const i0 = Math.floor((L.x - 400 + H) / C), i1 = Math.ceil((L.x + 400 + H) / C);
      const j0 = Math.floor((L.z - 400 + H) / C), j1 = Math.ceil((L.z + 400 + H) / C);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -H + i * C, z = -H + j * C;
        const ang = Math.atan2(z - L.z, x - L.x);
        const R = L.r + 22 * NZ.j(Math.cos(ang) * 1.2, Math.sin(ang) * 1.2);
        const dn = Math.hypot(x - L.x, z - L.z) - R;
        const k = j * N + i;
        if (dn < wd[k]) { wd[k] = dn; wW[k] = R; wDep[k] = 5; }
      }
    }
    for (let k = 0; k < NN; k++) {
      const dn = wd[k];
      if (dn > 1e5) continue;
      let h = hN[k];
      const a = WORLD.WATER + 1.0;
      if (h > a) h = a + (h - a) * Math.pow(smoothstep(0, 190, dn), 0.75);
      if (dn < 0) {
        const w = wW[k], q = (dn + w) / w;
        h = Math.min(h, WORLD.WATER - wDep[k] * (1 - q * q) - 0.05);
      } else if (dn < 6) h = Math.min(h, lerp(WORLD.WATER - 0.05, a, dn / 6));
      hN[k] = h;
    }
    WORLD.waterDist = wd;
    progress(0.38, 'Cutting the stage');
    await nextFrame();

    // roads
    const loop = buildLoop();
    const crossA = buildCross(loop, 0.0, 'crossA');
    const crossB = buildCross(loop, PI / 2, 'crossB');
    WORLD.roads = [loop, crossA, crossB];
    finishRoad(loop, hN, wd, wW);
    addJumps(loop);
    addMud(loop, 6);
    // plaza height and cross-road junctions
    const plazaH = bilinear(hN, 0, 0);
    WORLD.plaza = { x: 0, z: 0, r: 70, h: 0 };
    for (const road of [crossA, crossB]) {
      finishRoad(road, hN, wd, wW);
      addMud(road, 2);
      const n = road.pts.length;
      const endH = (p) => { let best = 0, bd = 1e9; loop.pts.forEach((q, i) => { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } }); return loop.h[best]; };
      const hA = endH(road.pts[0]), hB = endH(road.pts[n - 1]);
      for (let i = 0; i < n; i++) {
        const sA = road.s[i], sB = road.length - road.s[i];
        road.h[i] = lerp(hA, road.h[i], smoothstep(0, 90, sA));
        road.h[i] = lerp(hB, road.h[i], smoothstep(0, 90, sB));
      }
    }
    // plaza height = average of the two cross roads at centre
    let ph = 0, pc = 0;
    for (const road of [crossA, crossB]) road.pts.forEach((p, i) => { if (Math.hypot(p.x, p.z) < 8) { ph += road.h[i]; pc++; } });
    WORLD.plaza.h = pc ? ph / pc : plazaH;
    for (const road of [crossA, crossB]) road.pts.forEach((p, i) => {
      if (road.bridge[i]) return;
      const d = Math.hypot(p.x, p.z);
      road.h[i] = lerp(WORLD.plaza.h, road.h[i], smoothstep(WORLD.plaza.r - 10, WORLD.plaza.r + 90, d));
    });
    progress(0.46, 'Grading the road');
    await nextFrame();

    // rasterise roads
    const rd = new Float32Array(NN).fill(1e6), rh = new Float32Array(NN), rmud = new Float32Array(NN);
    const range = WORLD.HW + 14;
    for (const road of WORLD.roads) {
      const pts = road.pts, n = pts.length;
      rasterSegments(pts, road.closed, range, (k, s, t, d) => {
        const s2 = (s + 1) % n;
        if (road.noRaster[s] || road.noRaster[s2]) return;
        if (d < rd[k]) { rd[k] = d; rh[k] = lerp(road.h[s], road.h[s2], t); rmud[k] = lerp(road.mud[s], road.mud[s2], t); }
      });
    }
    const hgt = new Float32Array(NN);
    const HW = WORLD.HW;
    for (let k = 0; k < NN; k++) {
      let h = hN[k];
      const d = rd[k];
      if (d < range) {
        const hr = rh[k] + (d < HW ? -0.006 * d * d : -0.006 * HW * HW - Math.min(d - HW, 3) * 0.12);
        h = lerp(hr, h, smoothstep(HW, range, d));
      }
      hgt[k] = h;
    }
    // plaza flatten
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -H + i * C, z = -H + j * C;
      const d = Math.hypot(x, z);
      if (d > WORLD.plaza.r + 60) continue;
      const k = j * N + i;
      hgt[k] = lerp(WORLD.plaza.h - 0.05, hgt[k], smoothstep(WORLD.plaza.r, WORLD.plaza.r + 60, d));
    }
    WORLD.h = hgt;
    WORLD.rd = rd;
    progress(0.55, 'Mixing mud');
    await nextFrame();

    // masks
    const mud = new Float32Array(NN), forest = new Float32Array(NN);
    const mask = new Uint8Array(NN * 4);
    for (let j = 0; j < N; j++) {
      const z = -H + j * C;
      for (let i = 0; i < N; i++) {
        const x = -H + i * C, k = j * N + i;
        const h = hgt[k];
        let m = rd[k] < HW + 3 ? rmud[k] * (1 - smoothstep(HW, HW + 3, rd[k])) : 0;
        const low = 1 - smoothstep(8, 22, h);
        const jm = smoothstep(0.45, 0.7, fbm(NZ.k, x / 70, z / 70, 3)) * (0.35 + low * 0.65) * smoothstep(HW, HW + 8, rd[k]);
        m = Math.max(m, jm);
        if (wd[k] < 10 && wd[k] > -1) m = Math.max(m, 0.5 * (1 - wd[k] / 10));
        mud[k] = m;
        let f = smoothstep(-0.35, 0.3, fbm(NZ.d, x / 280 + 9, z / 280, 3));
        f *= 1 - smoothstep(60, 140, h);
        forest[k] = f;
        mask[k * 4] = clamp(rd[k] / 24 * 255, 0, 255);
        mask[k * 4 + 1] = clamp(m * 255, 0, 255);
        mask[k * 4 + 2] = clamp((WORLD.WATER + 1.2 - h) / 6 * 255, 0, 255);
        mask[k * 4 + 3] = clamp(f * 255, 0, 255);
      }
    }
    WORLD.mud = mud; WORLD.forest = forest; WORLD.mask = mask;

    // vertex normals
    const nx = new Float32Array(NN), ny = new Float32Array(NN), nz = new Float32Array(NN);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const hl = hgt[j * N + Math.max(0, i - 1)], hr2 = hgt[j * N + Math.min(N - 1, i + 1)];
      const hd = hgt[Math.max(0, j - 1) * N + i], hu = hgt[Math.min(N - 1, j + 1) * N + i];
      const ax = (hl - hr2), az = (hd - hu), ay = 2 * C;
      const L = Math.hypot(ax, ay, az);
      nx[k] = ax / L; ny[k] = ay / L; nz[k] = az / L;
    }
    WORLD.nx = nx; WORLD.ny = ny; WORLD.nz = nz;

    // bridge platforms
    for (const b of WORLD.bridges) {
      const dx = b.b.x - b.a.x, dz = b.b.z - b.a.z, L = Math.hypot(dx, dz);
      WORLD.platforms.push({ cx: (b.a.x + b.b.x) / 2, cz: (b.a.z + b.b.z) / 2, ux: dx / L, uz: dz / L, hl: L / 2 + 1, hw: 4.6, top: b.top + 0.18, bridge: b });
      b.len = L;
    }
    progress(0.6, 'Planting the jungle');
    await nextFrame();
  };

  // ------------------------------------------------ queries (hot path)
  const OUT = { h: 0, nx: 0, ny: 1, nz: 0, road: 0, mud: 0, water: 0, deck: 0 };
  WORLD.heightAt = function (x, z) {
    const fx = clamp((x + H) / C, 0, N - 1.0001), fz = clamp((z + H) / C, 0, N - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const k = j * N + i, h = WORLD.h;
    if (u + v < 1) return h[k] + (h[k + 1] - h[k]) * u + (h[k + N] - h[k]) * v;
    return h[k + N + 1] + (h[k + N] - h[k + N + 1]) * (1 - u) + (h[k + 1] - h[k + N + 1]) * (1 - v);
  };
  // full surface sample; yRef lets bridge decks count only when you're on top of them
  WORLD.sample = function (x, z, yRef, out = OUT) {
    const fx = clamp((x + H) / C, 0, N - 1.0001), fz = clamp((z + H) / C, 0, N - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const k = j * N + i, h = WORLD.h;
    let hh;
    if (u + v < 1) hh = h[k] + (h[k + 1] - h[k]) * u + (h[k + N] - h[k]) * v;
    else hh = h[k + N + 1] + (h[k + N] - h[k + N + 1]) * (1 - u) + (h[k + 1] - h[k + N + 1]) * (1 - v);
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    const bl = (a) => a[k] * w00 + a[k + 1] * w10 + a[k + N] * w01 + a[k + N + 1] * w11;
    let nx = bl(WORLD.nx), ny = bl(WORLD.ny), nz = bl(WORLD.nz);
    const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    out.h = hh; out.nx = nx; out.ny = ny; out.nz = nz;
    out.road = 1 - smoothstep(WORLD.HW - 0.4, WORLD.HW + 0.6, bl(WORLD.rd));
    out.mud = bl(WORLD.mud);
    out.water = Math.max(0, WORLD.WATER - hh);
    out.deck = 0;
    for (let p = 0; p < WORLD.platforms.length; p++) {
      const P = WORLD.platforms[p];
      const dx = x - P.cx, dz = z - P.cz;
      const a = dx * P.ux + dz * P.uz, b = -dx * P.uz + dz * P.ux;
      if (Math.abs(a) < P.hl && Math.abs(b) < P.hw && yRef > P.top - 1.6 && P.top > hh) {
        out.h = P.top; out.nx = 0; out.ny = 1; out.nz = 0; out.deck = 1; out.water = 0; out.road = 0; out.mud = 0;
      }
    }
    return out;
  };

  // nearest point on any road (coarse then fine)
  WORLD.nearestRoad = function (x, z, onlyLoop) {
    let best = null, bd = 1e12;
    for (const road of WORLD.roads) {
      if (onlyLoop && road.name !== 'loop') continue;
      const p = road.pts;
      for (let i = 0; i < p.length; i += 4) {
        const d = (p[i].x - x) ** 2 + (p[i].z - z) ** 2;
        if (d < bd) { bd = d; best = { road, i }; }
      }
    }
    const { road, i } = best;
    const n = road.pts.length;
    let bi = i;
    for (let k = -4; k <= 4; k++) {
      const q = road.closed ? (i + k + n) % n : clamp(i + k, 0, n - 1);
      const d = (road.pts[q].x - x) ** 2 + (road.pts[q].z - z) ** 2;
      if (d < bd) { bd = d; bi = q; }
    }
    return { road, i: bi, dist: Math.sqrt(bd) };
  };
  WORLD.roadPoint = function (road, i) {
    const n = road.pts.length;
    const q = road.closed ? ((i % n) + n) % n : clamp(i, 0, n - 1);
    return { x: road.pts[q].x, z: road.pts[q].z, h: road.h[q], tx: road.fr[q].tx, tz: road.fr[q].tz, i: q };
  };
})();
