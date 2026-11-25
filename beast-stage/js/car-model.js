'use strict';
// ============================================================ the rally car (visual model)
// Model space: ground at y = 0, +Z forward, +X = car's left, wheelbase centred on z = 0.
const CARDIM = {
  wheelR: 0.33, wheelW: 0.21, track: 0.79, zF: 1.28, zR: -1.27,
  ZR: -2.04, ZF: 2.08,
};

function pchip(knots) {
  const n = knots.length, xs = knots.map((k) => k[0]), ys = knots.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (d[i - 1] + d[i])) / ((2 * d[i] + d[i - 1]) / d[i - 1] + (d[i] + 2 * d[i - 1]) / d[i]);
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const BODY = (function () {
  const fYT = pchip([[-2.04, 0.98], [-1.98, 1.05], [-1.88, 1.09], [-1.70, 1.21], [-1.45, 1.325], [-1.25, 1.375], [-0.6, 1.405], [0.0, 1.40], [0.25, 1.335], [0.55, 1.165], [0.85, 0.995], [1.0, 0.965], [1.5, 0.915], [1.85, 0.86], [2.0, 0.80], [2.08, 0.71]]);
  const fYB = pchip([[-2.04, 0.44], [-1.85, 0.31], [-1.6, 0.25], [1.65, 0.25], [1.95, 0.33], [2.08, 0.40]]);
  const fW = pchip([[-2.04, 0.80], [-1.95, 0.86], [-1.8, 0.885], [1.6, 0.885], [1.85, 0.862], [2.0, 0.805], [2.08, 0.73]]);
  const fYS = pchip([[-2.04, 0.93], [-1.9, 0.99], [-1.5, 1.0], [0.0, 0.985], [0.82, 0.965], [1.0, 0.905], [1.5, 0.855], [1.85, 0.80], [2.08, 0.65]]);
  const fWT = pchip([[-2.04, 0.70], [-1.88, 0.73], [-1.6, 0.685], [-1.2, 0.665], [0.0, 0.665], [0.25, 0.685], [0.85, 0.785], [1.0, 0.80], [1.6, 0.79], [2.08, 0.64]]);
  const Ra = 0.48, arch0 = 0.27;
  function flare(z) {
    let f = 0;
    for (const zw of [CARDIM.zF, CARDIM.zR]) { const d = (z - zw) / 0.64; if (Math.abs(d) < 1) f = Math.max(f, Math.cos(d * PI / 2) ** 2); }
    return f * 0.045;
  }
  function archY(z) {
    let a = arch0;
    for (const zw of [CARDIM.zF, CARDIM.zR]) { const dz = z - zw; if (Math.abs(dz) < Ra) a = Math.max(a, arch0 + Math.sqrt(Ra * Ra - dz * dz)); }
    return a;
  }
  function halfRing(z) {
    const yT = fYT(z), yB = fYB(z), W = fW(z), Wt = fWT(z);
    const yS = Math.min(fYS(z), yT - 0.05);
    const fl = flare(z);
    const yLow = archY(z);
    const yIn = Math.max(yB + 0.02, yLow - 0.03);
    const y9 = Math.max(yT - 0.085, yS + 0.015);
    return [
      [0, yB], [0.4, yB], [0.56, yIn], [W - 0.03, yLow], [W + fl, yLow + 0.06],
      [W + fl + 0.012, lerp(yLow + 0.06, yS, 0.35)], [W + fl * 0.6 + 0.006, lerp(yLow + 0.06, yS, 0.72)], [W, yS - 0.03],
      [W - 0.05, yS], [Wt + 0.03, y9], [Wt - 0.08, yT - 0.012], [Wt * 0.5, yT - 0.002], [0, yT],
    ];
  }
  return { fYT, fYB, fW, fYS, fWT, halfRing, archY, flare };
})();

function buildCarModel(quality) {
  const V3 = THREE.Vector3;
  const root = new THREE.Group();
  root.name = 'car';
  const parts = {};
  const SUB = 3, HALF_SEG = 12, HP = HALF_SEG * SUB + 1, RING = (HP - 1) * 2;

  // ------------------------------------------------ livery atlas
  const AT = 2048, ATH = 2560;
  // ends: front face in the left half, rear face in the right half of the bottom strip
  const endXY = (x, y, front) => [front ? ((x + 1) / 2) * 1024 : 1024 + (1 - (x + 1) / 2) * 1024, 2048 + ((1.5 - y) / 1.4) * 512];
  const sideXY = (z, y, side) => [((side > 0 ? 2.1 - z : z + 2.1) / 4.2) * AT, ((1.55 - y) / 1.5) * 512 + (side > 0 ? 0 : 512)];
  const topXY = (z, x) => [((z + 2.1) / 4.2) * AT, 1024 + (1 - (x + 1.0) / 2.0) * 1024];
  const livery = canvasTexture(AT, ATH, (ctx) => {
    const ORANGE = '#ff5a12', TEAL = '#14b8a6', BLACK = '#141414', WHITE = '#f2f1ec';
    ctx.fillStyle = WHITE; ctx.fillRect(0, 0, AT, ATH);
    const poly = (pts, side, fill) => { ctx.beginPath(); pts.forEach(([z, y], i) => { const [cx, cy] = sideXY(z, y, side); i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); }); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    const line = (pts, side, color, w) => { ctx.beginPath(); pts.forEach(([z, y], i) => { const [cx, cy] = sideXY(z, y, side); i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); }); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); };
    const text = (str, z, y, side, size, color, font = 'italic 800', rot = 0, align = 'center') => {
      const [cx, cy] = sideXY(z, y, side);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.font = `${font} ${size}px "Saira Condensed", "Arial Narrow", sans-serif`;
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.fillText(str, 0, 0); ctx.restore();
    };
    for (const side of [1, -1]) {
      poly([[2.2, 0.38], [2.2, 0.66], [0.5, 0.70], [-0.9, 0.97], [-2.2, 1.16], [-2.2, 0.80], [-0.7, 0.60], [0.6, 0.40], [1.2, 0.38]], side, ORANGE);
      line([[2.2, 0.695], [0.5, 0.735], [-0.9, 1.005], [-2.2, 1.195]], side, TEAL, 9);
      line([[2.2, 0.365], [1.2, 0.365], [0.6, 0.385], [-0.7, 0.585], [-2.2, 0.785]], side, BLACK, 5);
      poly([[2.2, 0.0], [2.2, 0.355], [-2.2, 0.355], [-2.2, 0.0]], side, BLACK);
      // panel gaps: doors, fuel flap, bonnet line
      const gap = 'rgba(20,20,20,0.75)';
      line([[0.86, 0.33], [0.86, 0.975], [0.3, 0.99], [-0.46, 0.995], [-0.46, 0.33], [0.86, 0.33]], side, gap, 3);
      line([[-0.48, 0.33], [-0.48, 0.995], [-1.12, 1.0], [-1.14, 0.83], [-0.97, 0.66], [-0.82, 0.5], [-0.79, 0.33]], side, gap, 3);
      line([[1.75, 0.80], [1.0, 0.86], [0.88, 0.9]], side, gap, 2);
      // door handles
      poly([[0.66, 0.905], [0.5, 0.905], [0.5, 0.88], [0.66, 0.88]], side, '#222');
      poly([[-0.64, 0.915], [-0.8, 0.915], [-0.8, 0.89], [-0.64, 0.89]], side, '#222');
      // number panel on front door
      { const [cx, cy] = sideXY(0.2, 0.66, side);
        ctx.fillStyle = WHITE; ctx.strokeStyle = BLACK; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.roundRect(cx - 105, cy - 70, 210, 140, 22); ctx.fill(); ctx.stroke();
        text('27', 0.2, 0.655, side, 128, BLACK); }
      text('MOSSBACK', -0.78, 0.69, side, 50, WHITE);
      text('TYRES', -0.78, 0.62, side, 28, BLACK, '700');
      text('TALONWORKS', 1.5, 0.56, side, 30, WHITE);
      text('KRAKATOA FUELS', -1.62, 0.93, side, 26, BLACK, '700');
      text('BEAST STAGE RALLY TEAM', 0.0, 0.30, side, 30, '#cfcfcf', '600');
      text('A. RIVERA', 0.2, 0.935, side, 22, BLACK, '700');
      text('M. OKAFOR', -0.8, 0.94, side, 22, BLACK, '700');
      // small decal row
      ['GRIP+', 'NOCTA', 'ZEPHYRA'].forEach((s, i) => text(s, 1.55 - i * 0.32, 0.46, side, 20, BLACK, '700'));
      if (side < 0) { // fuel filler
        const [cx, cy] = sideXY(-1.55, 0.92, side);
        ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.stroke();
      }
      // side window glass
      ctx.save(); ctx.globalCompositeOperation = 'copy';
      ctx.restore();
    }
    // side glass: replace pixels (alpha) for window areas
    ctx.save();
    for (const side of [1, -1]) {
      const [x0] = sideXY(side > 0 ? 0.84 : -1.27, 1.6, side), [x1] = sideXY(side > 0 ? -1.27 : 0.84, 1.6, side);
      const [, y0] = sideXY(0, 1.6, side), [, y1] = sideXY(0, 1.005, side);
      ctx.clearRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
      ctx.fillStyle = 'rgba(14,20,26,0.5)';
      ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
    }
    ctx.restore();
    // ---- top view
    const tpoly = (pts, fill) => { ctx.beginPath(); pts.forEach(([z, x], i) => { const [cx, cy] = topXY(z, x); i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); }); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    tpoly([[-1.32, 1], [0.26, 1], [0.26, -1], [-1.32, -1]], ORANGE); // roof
    tpoly([[-1.32, 0.5], [0.26, 0.5], [0.26, 0.47], [-1.32, 0.47]], TEAL);
    tpoly([[-1.32, -0.5], [0.26, -0.5], [0.26, -0.47], [-1.32, -0.47]], TEAL);
    tpoly([[0.84, 1], [1.18, 1], [1.12, -1], [0.84, -1]], '#262626'); // matte anti-glare
    tpoly([[1.18, 0.18], [2.1, 0.34], [2.1, -0.34], [1.18, -0.18]], ORANGE); // bonnet stripe
    tpoly([[1.18, 0.21], [2.1, 0.37], [2.1, 0.34], [1.18, 0.18]], TEAL);
    tpoly([[1.18, -0.21], [2.1, -0.37], [2.1, -0.34], [1.18, -0.18]], TEAL);
    // roof number (reads from above with the nose pointing "up")
    { const [cx, cy] = topXY(-0.55, 0);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(PI / 2);
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.roundRect(-150, -110, 300, 220, 24); ctx.fill();
      ctx.fillStyle = BLACK; ctx.font = 'italic 800 200px "Saira Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('27', 0, 8); ctx.restore(); }
    // bonnet pins, vents drawn
    for (const s of [1, -1]) { const [cx, cy] = topXY(1.9, 0.5 * s); ctx.fillStyle = '#b0b0b0'; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, TAU); ctx.fill(); }
    // windshield & rear window glass (top projection)
    for (const [za, zb] of [[0.26, 0.85], [-1.86, -1.31]]) {
      const [xa, ya] = topXY(za, 1.1), [xb, yb] = topXY(zb, -1.1);
      ctx.clearRect(xa, ya, xb - xa, yb - ya);
      ctx.fillStyle = 'rgba(14,20,26,0.42)';
      ctx.fillRect(xa, ya, xb - xa, yb - ya);
    }
    // windshield banner
    { const [xa, ya] = topXY(0.27, 1.1), [xb, yb] = topXY(0.39, -1.1);
      ctx.fillStyle = 'rgba(10,10,12,0.96)'; ctx.fillRect(xa, ya, xb - xa, yb - ya);
      const [cx, cy] = topXY(0.335, 0);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-PI / 2);
      ctx.fillStyle = ORANGE; ctx.font = 'italic 800 76px "Saira Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BEAST STAGE', 0, 4); ctx.restore(); }
    // rear window number
    { const [cx, cy] = topXY(-1.6, 0);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(PI / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = 'italic 800 90px "Saira Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('27', 0, 4); ctx.restore(); }
    // ---- front & rear faces
    const erect = (x0, y0, x1, y1, front, fill, r = 0) => {
      const [ax, ay] = endXY(x0, y1, front), [bx, by] = endXY(x1, y0, front);
      ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), r); ctx.fill();
    };
    const etext = (str, x, y, front, size, color, font = 'italic 800') => {
      const [cx, cy] = endXY(x, y, front);
      ctx.font = `${font} ${size}px "Saira Condensed", "Arial Narrow", sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(str, cx, cy);
    };
    // front
    erect(-1, 0, 1, 0.58, true, ORANGE);
    erect(-1, 0.575, 1, 0.595, true, TEAL);
    erect(-1, 0, 1, 0.43, true, BLACK);
    erect(-0.43, 0.445, 0.43, 0.65, true, '#0c0c0c', 18);
    { // honeycomb grille
      const [gx0, gy0] = endXY(-0.41, 0.635, true), [gx1, gy1] = endXY(0.41, 0.46, true);
      ctx.save(); ctx.beginPath(); ctx.rect(gx0, gy0, gx1 - gx0, gy1 - gy0); ctx.clip();
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2.2;
      for (let yy = gy0; yy < gy1 + 14; yy += 13) for (let xx = gx0 + ((yy - gy0) / 13 % 2) * 7.5; xx < gx1 + 15; xx += 15) {
        ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * PI / 3 + PI / 6; ctx.lineTo(xx + Math.cos(a) * 7, yy + Math.sin(a) * 7); } ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
    }
    for (const sx of [-1, 1]) { // headlight housings
      const [hx, hy] = endXY(sx * 0.56, 0.665, true);
      ctx.fillStyle = '#1b1d20'; ctx.beginPath(); ctx.ellipse(hx, hy, 86, 36, 0, 0, TAU); ctx.fill();
    }
    erect(-0.2, 0.355, 0.2, 0.425, true, '#f4f4f0', 6);
    etext('BST · 27', 0, 0.39, true, 34, BLACK, '700');
    // rear
    erect(-1, 0, 1, 0.82, false, ORANGE);
    erect(-1, 0.80, 1, 0.82, false, TEAL);
    erect(-1, 0, 1, 0.52, false, BLACK);
    erect(-0.23, 0.6, 0.23, 0.72, false, '#f4f4f0', 6);
    etext('BST · 27', 0, 0.66, false, 46, BLACK, '700');
    etext('BEAST STAGE', 0, 0.95, false, 52, BLACK);
    for (const sx of [-1, 1]) { const [hx, hy] = endXY(sx * 0.64, 0.9, false); ctx.fillStyle = '#1b1b1b'; ctx.fillRect(hx - 66, hy - 34, 132, 68); }
  }, { aniso: 8 });

  // ------------------------------------------------ body loft
  const stations = [];
  for (let z = CARDIM.ZR; z <= CARDIM.ZF + 1e-6; z += 0.025) stations.push(z);
  if (stations[stations.length - 1] < CARDIM.ZF - 0.005) stations.push(CARDIM.ZF);
  const rings = stations.map((z) => {
    const h = BODY.halfRing(z);
    // catmull-rom subdivide half ring
    const out = [];
    for (let k = 0; k < h.length - 1; k++) {
      const p0 = h[Math.max(0, k - 1)], p1 = h[k], p2 = h[k + 1], p3 = h[Math.min(h.length - 1, k + 2)];
      for (let s = 0; s < SUB; s++) {
        const t = s / SUB, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(h[h.length - 1]);
    const ring = [];
    for (let i = 0; i < HP; i++) ring.push(new V3(out[i][0], out[i][1], z));
    for (let i = HP - 2; i >= 1; i--) ring.push(new V3(-out[i][0], out[i][1], z));
    return ring;
  });
  // rounded end caps: extra shrinking stations
  const capRings = (ring, dz, scales) => scales.map((s, k) => {
    let cy = 0; ring.forEach((p) => (cy += p.y)); cy /= ring.length;
    return ring.map((p) => new V3(p.x * s, cy + (p.y - cy) * s, p.z + dz[k]));
  });
  const front = capRings(rings[rings.length - 1], [0.012, 0.02, 0.025], [0.95, 0.82, 0.55]);
  const rear = capRings(rings[0], [-0.012, -0.02, -0.025], [0.95, 0.82, 0.55]);
  const grid = rear.reverse().concat(rings, front);
  const S = grid.length;
  const G_PAINT = 0, G_GLASS = 1, G_TRIM = 2, G_UNDER = 3;
  function classify(seg, zc) {
    if (seg <= 2) return [G_UNDER, 0];
    if (seg === 3) return [G_TRIM, 0];
    if (zc > CARDIM.ZF - 0.02 || zc < CARDIM.ZR + 0.02) return [seg >= 9 ? G_PAINT : G_PAINT, seg >= 9 ? 1 : 0];
    if (seg <= 7) return [G_PAINT, 0];
    if (seg === 8) {
      if ((zc > -0.40 && zc < 0.80) || (zc > -1.24 && zc < -0.53)) return [G_GLASS, 0];
      if (zc >= -0.53 && zc <= -0.40) return [G_TRIM, 0];
      return [G_PAINT, 0];
    }
    if (seg >= 10 && ((zc > 0.27 && zc < 0.84) || (zc > -1.85 && zc < -1.32))) return [G_GLASS, 1];
    return [G_PAINT, 1];
  }
  // normals from the shared grid
  const nrm = [];
  for (let s = 0; s < S; s++) {
    const row = [];
    for (let r = 0; r < RING; r++) {
      const a = grid[Math.max(0, s - 1)][r], b = grid[Math.min(S - 1, s + 1)][r];
      const c = grid[s][(r - 1 + RING) % RING], d = grid[s][(r + 1) % RING];
      const ds = new V3().subVectors(b, a), dr = new V3().subVectors(d, c);
      const n = new V3().crossVectors(dr, ds);
      if (n.lengthSq() < 1e-12) n.set(0, 0, s > S / 2 ? 1 : -1);
      row.push(n.normalize());
    }
    nrm.push(row);
  }
  const bgb = new GeoBuilder(4);
  const vmap = new Map();
  const getV = (s, r, uvMode) => {
    const key = (s * RING + r) * 3 + uvMode;
    let v = vmap.get(key);
    if (v !== undefined) return v;
    const p = grid[s][r], n = nrm[s][r];
    let u, vv;
    if (uvMode === 0) { const side = p.x >= 0 ? 1 : -1; const [cx, cy] = sideXY(p.z, p.y, side); u = cx / AT; vv = 1 - cy / ATH; }
    else if (uvMode === 1) { const [cx, cy] = topXY(p.z, p.x); u = cx / AT; vv = 1 - cy / ATH; }
    else { const [cx, cy] = endXY(clamp(p.x, -1, 1), p.y, p.z > 0); u = cx / AT; vv = 1 - cy / ATH; }
    v = bgb.vert(p.x, p.y, p.z, n.x, n.y, n.z, u, vv);
    vmap.set(key, v);
    return v;
  };
  for (let s = 0; s < S - 1; s++) {
    const zc = (grid[s][0].z + grid[s + 1][0].z) / 2;
    for (let r = 0; r < RING; r++) {
      const r2 = (r + 1) % RING;
      const halfIdx = r < RING / 2 ? r : RING - 1 - r;
      const seg = Math.floor(halfIdx / SUB);
      let [g, uvMode] = classify(seg, zc);
      if (zc > CARDIM.ZF - 0.07 || zc < CARDIM.ZR + 0.07) {
        const nz = nrm[s][r].z + nrm[s + 1][r].z + nrm[s][r2].z + nrm[s + 1][r2].z;
        if (Math.abs(nz) > 2.2 && g !== G_UNDER) { g = G_PAINT; uvMode = 2; }
      }
      const A = getV(s, r, uvMode), B = getV(s, r2, uvMode), C = getV(s + 1, r, uvMode), D = getV(s + 1, r2, uvMode);
      bgb.tri(g, A, B, C); bgb.tri(g, B, D, C);
    }
  }
  // caps
  for (const [s, dir] of [[0, -1], [S - 1, 1]]) {
    let cx = 0, cy = 0; grid[s].forEach((p) => { cx += p.x; cy += p.y; }); cx /= RING; cy /= RING;
    const z = grid[s][0].z + dir * 0.004;
    const [u, v] = endXY(cx, cy, dir > 0);
    const c = bgb.vert(cx, cy, z, 0, 0, dir, u / AT, 1 - v / ATH);
    for (let r = 0; r < RING; r++) {
      const a = getV(s, r, 2), b = getV(s, (r + 1) % RING, 2);
      if (dir > 0) bgb.tri(G_PAINT, a, b, c); else bgb.tri(G_PAINT, b, a, c);
    }
  }
  const bodyGeo = bgb.build();
  bodyGeo.userData.basePos = Float32Array.from(bodyGeo.attributes.position.array);

  // ------------------------------------------------ materials
  const dirtU = { value: 0 };
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ map: livery, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 }),
    glass: new THREE.MeshPhysicalMaterial({ map: livery, color: 0xffffff, roughness: 0.04, metalness: 0.1, transparent: true, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.55, metalness: 0.1 }),
    under: new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.08, metalness: 1 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb5b8bc, roughness: 0.35, metalness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb99a52, roughness: 0.28, metalness: 0.85 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x6d6d6d, roughness: 0.45, metalness: 0.85, emissive: 0xff3300, emissiveIntensity: 0 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xe02a1a, roughness: 0.35, metalness: 0.3 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xff5a12, roughness: 0.4, metalness: 0.05 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf2f1ec, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
    cage: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.35, metalness: 0.6 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.85 }),
    harness: new THREE.MeshStandardMaterial({ color: 0xd61f1f, roughness: 0.7 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.8 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xff5a12, roughness: 0.25, clearcoat: 1 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.6 }),
    headLens: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dc, emissiveIntensity: 2.2, roughness: 0.1 }),
    podLens: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.2, roughness: 0.1 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5a0505, emissive: 0xff1a10, emissiveIntensity: 0.5, roughness: 0.2 }),
    reverse: new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0xff8a00, emissiveIntensity: 0.25, roughness: 0.2 }),
    lensGlass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 0, transparent: true, opacity: 0.25, envMapIntensity: 2 }),
    reflector: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 1 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, metalness: 1 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x33ccff, emissiveIntensity: 0.6 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  // dirt build-up on paint (more near the bottom and behind wheels)
  M.paint.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = dirtU;
    sh.uniforms.tDirtN = { value: TEX.mud };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nuniform float uDirt;\nuniform sampler2D tDirtN;\nfloat gDirt;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dn = texture2D(tDirtN, vObjPos.zy * 0.9 + vObjPos.x * 0.3).r * 1.6 + texture2D(tDirtN, vObjPos.zx * 2.3).g * 0.8;
        float low = smoothstep(1.05, 0.25, vObjPos.y);
        float wheelZone = max(smoothstep(0.75, 0.2, abs(vObjPos.z - 0.75)), smoothstep(0.75, 0.2, abs(vObjPos.z + 1.8)));
        float top = smoothstep(1.2, 1.42, vObjPos.y) * 0.35;
        gDirt = clamp(uDirt * (low * 1.25 + wheelZone * low * 0.6 + top) * (0.55 + dn * 0.55) - (1.0 - uDirt) * 0.25, 0.0, 0.95);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.15, 0.10) * (0.8 + dn * 0.3), gDirt);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, gDirt);')
      .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>');
  };
  M.paint.customProgramCacheKey = () => 'paint-dirt';

  const body = new THREE.Mesh(bodyGeo, [M.paint, M.glass, M.trim, M.under]);
  body.castShadow = true; body.receiveShadow = true;
  root.add(body);
  parts.body = body;

  // ------------------------------------------------ static detail meshes (merged per material)
  const B = {};
  const gb = (k) => (B[k] = B[k] || new GeoBuilder(1));
  const mt = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new V3(sx, sy, sz));
  const add = (k, geo, m) => gb(k).addGeometry(geo, m);
  const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r1, r2, h, s = 16, open = false) => new THREE.CylinderGeometry(r1, r2, h, s, 1, open);
  const sph = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
  const tube = (pts, r, rad = 8) => tubeGeometry(pts.map((p) => new V3(p[0], p[1], p[2])), pts.map(() => r), rad, false);
  const XP = (fn) => { fn(1); fn(-1); };

  // front: splitter, grille, skid plate, tow hook, plates, fog lamps
  add('trim', boxG(1.62, 0.03, 0.2), mt(0, 0.33, 2.04));
  add('under', boxG(0.8, 0.17, 0.04), mt(0, 0.545, 2.065));
  XP((s) => {
    add('trim', cyl(0.05, 0.05, 0.04, 16), mt(s * 0.62, 0.40, 2.085, PI / 2));
    add('podLens', cyl(0.04, 0.04, 0.012, 16), mt(s * 0.62, 0.40, 2.105, PI / 2));
  });
  add('harness', boxG(0.06, 0.04, 0.1), mt(-0.42, 0.33, 2.12));
  // headlights: recessed reflector + projector + clear cover on the nose corners
  XP((s) => {
    const base = mt(s * 0.56, 0.665, 2.07, 0, s * 0.3, 0);
    const sc = (x, y, z) => new THREE.Matrix4().makeScale(x, y, z);
    add('reflector', sph(1, 20, 12), base.clone().multiply(sc(0.135, 0.055, 0.03)));
    add('headLens', sph(1, 14, 10), base.clone().multiply(new THREE.Matrix4().makeTranslation(s * -0.04, 0, 0.012)).multiply(sc(0.04, 0.04, 0.03)));
    add('headLens', sph(1, 14, 10), base.clone().multiply(new THREE.Matrix4().makeTranslation(s * 0.06, 0, 0.008)).multiply(sc(0.032, 0.032, 0.025)));
    add('lensGlass', sph(1, 20, 12), base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.005)).multiply(sc(0.15, 0.064, 0.045)));
    add('amber', boxG(0.07, 0.03, 0.03), mt(s * 0.66, 0.6, 2.06, 0, s * 0.5, 0));
  });
  // rally light pod: bar + 4 lamps
  add('trim', boxG(1.25, 0.05, 0.06), mt(0, 0.78, 2.07));
  for (const lx of [-0.45, -0.15, 0.15, 0.45]) {
    add('trim', cyl(0.085, 0.075, 0.1, 20), mt(lx, 0.84, 2.11, PI / 2));
    add('chrome', new THREE.TorusGeometry(0.083, 0.008, 6, 20), mt(lx, 0.84, 2.162));
    add('reflector', cyl(0.074, 0.03, 0.02, 20), mt(lx, 0.84, 2.145, PI / 2));
    add('podLens', cyl(0.074, 0.074, 0.008, 20), mt(lx, 0.84, 2.158, PI / 2));
  }
  // bonnet vents and pins
  XP((s) => {
    for (let k = 0; k < 5; k++) add('trim', boxG(0.2, 0.012, 0.025), mt(s * 0.42, BODY.fYT(1.35 + k * 0.05) - 0.01, 1.35 + k * 0.05, -0.05));
    add('chrome', cyl(0.02, 0.02, 0.012, 10), mt(s * 0.5, BODY.fYT(1.9) + 0.003, 1.9));
  });
  // wipers
  XP((s) => add('trim', boxG(0.62, 0.012, 0.02), mt(s * 0.22, 1.01, 0.79, -0.55, s * 0.22, s * -0.04)));
  // mirrors: carbon aero housings on short stalks
  XP((s) => {
    const x = s * 0.95, y = 1.05, z = 0.68;
    add('trim', boxG(0.09, 0.025, 0.05), mt(s * 0.89, y - 0.03, z + 0.02, 0, 0, s * 0.3));
    add('trim', sph(1, 16, 10), mt(x, y, z, 0, s * -0.15, 0, 0.1, 0.055, 0.06));
    add('mirror', boxG(0.15, 0.075, 0.004), mt(x - s * 0.005, y, z - 0.055, 0, s * -0.15, 0));
  });
  // roof scoop, antenna, rear wing
  add('trim', boxG(0.26, 0.07, 0.32), mt(0, 1.43, -0.05, 0.08));
  add('under', boxG(0.2, 0.045, 0.02), mt(0, 1.43, 0.115));
  add('trim', cyl(0.004, 0.006, 0.45, 6), mt(0.15, 1.62, -1.15, -0.25));
  add('trim', cyl(0.025, 0.03, 0.02, 10), mt(0.15, 1.405, -1.1));
  // exhaust
  add('chrome', cyl(0.06, 0.06, 0.32, 18, true), mt(-0.48, 0.32, -1.95, PI / 2));
  add('under', cyl(0.045, 0.045, 0.01, 14), mt(-0.48, 0.32, -2.0, PI / 2));
  add('chrome', new THREE.TorusGeometry(0.06, 0.008, 6, 18), mt(-0.48, 0.32, -2.11));
  // rear: diffuser, tow strap, tail lights, plate, fog light
  add('trim', boxG(1.4, 0.05, 0.22), mt(0, 0.4, -2.02));
  for (let k = -3; k <= 3; k++) add('trim', boxG(0.02, 0.1, 0.24), mt(k * 0.18, 0.37, -2.03));
  add('harness', boxG(0.07, 0.04, 0.12), mt(0.45, 0.42, -2.12));
  XP((s) => {
    add('tail', boxG(0.26, 0.12, 0.05), mt(s * 0.63, 0.9, -2.055, 0, s * -0.3, 0));
    add('lensGlass', boxG(0.27, 0.13, 0.056), mt(s * 0.63, 0.9, -2.06, 0, s * -0.3, 0));
    add('amber', boxG(0.07, 0.045, 0.04), mt(s * 0.66, 0.815, -2.05, 0, s * -0.3, 0));
  });
  add('reverse', boxG(0.08, 0.05, 0.03), mt(-0.38, 0.5, -2.07));
  add('tail', boxG(0.08, 0.05, 0.03), mt(0.38, 0.5, -2.07));
  // interior: dashboard, seats, cage, crew
  add('seat', boxG(1.4, 0.14, 0.34), mt(0, 0.83, 0.62, 0.25));
  // dash top meets the windshield base so you can't see into the engine bay
  add('seat', boxG(1.56, 0.05, 0.5), mt(0, 0.94, 0.64, -0.19));
  add('seat', boxG(1.5, 0.2, 0.04), mt(0, 0.83, 0.4));
  // door cards, headliner, rear bulkhead (the body shell is single-sided from inside)
  XP((s) => {
    add('seat', boxG(0.03, 0.55, 2.05), mt(s * 0.81, 0.72, -0.25));
    add('harness', boxG(0.035, 0.04, 1.2), mt(s * 0.805, 0.86, -0.05));
  });
  add('seat', boxG(1.32, 0.02, 1.6), mt(0, 1.372, -0.5));
  add('seat', boxG(1.45, 0.6, 0.03), mt(0, 0.75, -1.25));
  add('seat', boxG(0.34, 0.1, 0.12), mt(0.36, 0.9, 0.44, -0.3));
  add('screen', boxG(0.16, 0.09, 0.01), mt(0.02, 0.93, 0.47, -0.7));
  for (const sx of [0.36, -0.36]) {
    add('seat', boxG(0.48, 0.12, 0.5), mt(sx, 0.48, -0.32));
    add('seat', boxG(0.48, 0.7, 0.12), mt(sx, 0.85, -0.6, -0.12));
    XP((s) => add('seat', boxG(0.08, 0.6, 0.35), mt(sx + s * 0.22, 0.75, -0.45, -0.1)));
    XP((s) => add('harness', boxG(0.05, 0.5, 0.01), mt(sx + s * 0.1, 0.92, -0.42, -0.5)));
  }
  // roll cage: main hoop, A-pillar bars, diagonals, roof X
  const cg = 0.022;
  XP((s) => {
    add('cage', tube([[s * 0.62, 0.45, -0.75], [s * 0.6, 1.0, -0.72], [s * 0.55, 1.32, -0.62]], cg), new THREE.Matrix4());
    add('cage', tube([[s * 0.66, 0.6, 0.78], [s * 0.66, 0.98, 0.72], [s * 0.56, 1.32, 0.18], [s * 0.55, 1.33, -0.62]], cg), new THREE.Matrix4());
    add('cage', tube([[s * 0.6, 1.0, -0.72], [s * 0.55, 1.28, -1.6]], cg), new THREE.Matrix4());
    add('cage', tube([[s * 0.65, 0.65, 0.2], [s * 0.64, 0.68, -0.72]], cg), new THREE.Matrix4());
  });
  add('cage', tube([[0.55, 1.32, -0.62], [-0.55, 1.32, -0.62]], cg), new THREE.Matrix4());
  add('cage', tube([[0.56, 1.32, 0.18], [-0.56, 1.32, 0.18]], cg), new THREE.Matrix4());
  add('cage', tube([[0.6, 1.0, -0.72], [-0.55, 1.32, -0.62]], cg), new THREE.Matrix4());
  add('cage', tube([[0.55, 1.33, -0.62], [-0.56, 1.32, 0.18]], cg), new THREE.Matrix4());
  // crew
  for (const [sx, isDriver] of [[0.36, true], [-0.36, false]]) {
    add('suit', boxG(0.36, 0.42, 0.22), mt(sx, 0.78, -0.42, -0.15));
    add('suit', boxG(0.3, 0.14, 0.42), mt(sx, 0.56, -0.12));
    XP((s) => add('suit', boxG(0.11, 0.42, 0.11), mt(sx + s * 0.09, 0.42, 0.14)));
    add('helmet', sph(0.13, 18, 14), mt(sx, 1.12, -0.42, 0, 0, 0, 1, 1.05, 1.1));
    add('visor', sph(0.131, 18, 14, 0), mt(sx, 1.11, -0.38, 0, 0, 0, 0.9, 0.55, 0.9));
    if (isDriver) {
      XP((s) => add('suit', tube([[sx + s * 0.17, 0.95, -0.38], [sx + s * 0.2, 0.86, -0.15], [sx + s * 0.13, 0.92, 0.06]], 0.045, 6), new THREE.Matrix4()));
    } else {
      XP((s) => add('suit', tube([[sx + s * 0.17, 0.95, -0.38], [sx + s * 0.18, 0.78, -0.2], [sx + s * 0.06, 0.74, -0.05]], 0.045, 6), new THREE.Matrix4()));
      add('white', boxG(0.24, 0.02, 0.17), mt(sx, 0.76, -0.04, -0.6));
    }
  }
  // mudflap mounts and the floor/firewall to hide gaps
  add('under', boxG(1.2, 0.02, 2.6), mt(0, 0.38, -0.3));
  add('under', boxG(1.25, 0.5, 0.02), mt(0, 0.62, 0.78));
  add('under', boxG(1.3, 0.45, 0.02), mt(0, 0.7, -1.7));

  const staticMats = { trim: M.trim, alu: M.alu, chrome: M.chrome, podLens: M.podLens, headLens: M.headLens, reflector: M.reflector, lensGlass: M.lensGlass, amber: M.amber, white: M.white, mirror: M.mirror, under: M.under, harness: M.harness, tail: M.tail, reverse: M.reverse, seat: M.seat, screen: M.screen, cage: M.cage, suit: M.suit, helmet: M.helmet, visor: M.visor };
  parts.detail = {};
  for (const [k, b] of Object.entries(B)) {
    const mesh = new THREE.Mesh(b.build(), staticMats[k]);
    mesh.castShadow = !['lensGlass', 'headLens', 'podLens', 'screen', 'visor'].includes(k);
    mesh.receiveShadow = true;
    if (k === 'lensGlass') mesh.renderOrder = 3;
    root.add(mesh);
    parts.detail[k] = mesh;
  }
  // crew heads are separate so cockpit cam can hide the driver
  // (helmets are inside the 'helmet' merged mesh: hide whole mesh in cockpit view)
  parts.helmets = parts.detail.helmet; parts.visors = parts.detail.visor;

  // steering wheel
  {
    const sw = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 28), M.trim);
    sw.add(wheel);
    const spoke = new THREE.Mesh(boxG(0.32, 0.025, 0.02), M.trim); sw.add(spoke);
    const spoke2 = new THREE.Mesh(boxG(0.025, 0.16, 0.02), M.trim); spoke2.position.y = -0.08; sw.add(spoke2);
    const mark = new THREE.Mesh(boxG(0.02, 0.03, 0.025), M.orange); mark.position.y = 0.17; sw.add(mark);
    const column = new THREE.Mesh(cyl(0.025, 0.03, 0.35, 8), M.trim); column.rotation.x = PI / 2; column.position.z = 0.17; sw.add(column);
    sw.position.set(0.36, 0.93, 0.12);
    sw.rotation.x = -0.45;
    const pivot = new THREE.Group(); pivot.position.copy(sw.position); pivot.rotation.x = -0.45;
    sw.position.set(0, 0, 0); sw.rotation.x = 0;
    pivot.add(sw);
    root.add(pivot);
    parts.steeringWheel = sw;
  }

  // rear wing (detachable)
  {
    const wing = new THREE.Group();
    const af = new THREE.Shape();
    af.moveTo(0, 0); af.bezierCurveTo(0.05, 0.06, 0.2, 0.05, 0.34, 0.01); af.lineTo(0.34, -0.005); af.bezierCurveTo(0.2, 0.012, 0.06, -0.025, 0, 0);
    const eg = new THREE.ExtrudeGeometry(af, { depth: 1.5, bevelEnabled: false, curveSegments: 10 });
    eg.translate(0, 0, -0.75);
    const main = new THREE.Mesh(eg, M.white);
    main.rotation.y = PI / 2; main.rotation.order = 'YXZ'; main.rotation.x = 0;
    main.position.set(0, 1.52, -1.66);
    main.castShadow = true;
    wing.add(main);
    const gurney = new THREE.Mesh(boxG(1.5, 0.035, 0.008), M.trim); gurney.position.set(0, 1.535, -2.0); wing.add(gurney);
    XP((s) => {
      const ep = new THREE.Mesh(boxG(0.012, 0.15, 0.36), M.orange); ep.position.set(s * 0.755, 1.52, -1.83); ep.castShadow = true; wing.add(ep);
      const py = new THREE.Mesh(boxG(0.02, 0.2, 0.12), M.trim); py.position.set(s * 0.42, 1.42, -1.78); py.rotation.x = 0.35; wing.add(py);
    });
    const hbl = new THREE.Mesh(boxG(0.3, 0.025, 0.02), M.tail); hbl.position.set(0, 1.555, -1.73); wing.add(hbl);
    root.add(wing);
    parts.wing = wing;
  }

  // mudflaps
  parts.flaps = [];
  {
    const flapTex = canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = '#121212'; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#ff5a12'; ctx.font = 'italic 800 34px "Saira Condensed", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('BEAST', 64, 72);
      ctx.fillStyle = '#14b8a6'; ctx.fillRect(10, 96, 108, 6);
    }, { clamp: true });
    const flapMat = new THREE.MeshStandardMaterial({ map: flapTex, roughness: 0.9, side: THREE.DoubleSide });
    for (const zw of [CARDIM.zF, CARDIM.zR]) XP((s) => {
      const piv = new THREE.Group();
      piv.position.set(s * 0.8, 0.44, zw - 0.5);
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flapMat);
      flap.position.y = -0.15;
      flap.rotation.y = PI;
      piv.add(flap);
      root.add(piv);
      parts.flaps.push(piv);
    });
  }

  // exhaust flame
  {
    const fg = new THREE.ConeGeometry(0.07, 0.5, 12, 1, true);
    fg.rotateX(-PI / 2); fg.translate(0, 0, -0.25);
    const flame = new THREE.Mesh(fg, M.flame);
    flame.position.set(-0.48, 0.32, -2.12);
    flame.visible = false;
    root.add(flame);
    parts.flame = flame;
    parts.exhaustLocal = new V3(-0.48, 0.32, -2.15);
  }

  // ------------------------------------------------ wheels
  const tireTex = canvasTexture(1024, 128, (ctx) => {
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#101010'; ctx.fillRect(0, 40, 1024, 48);
    ctx.fillStyle = '#5a5a5a'; ctx.font = '700 22px "Saira Condensed", sans-serif'; ctx.textAlign = 'center';
    for (const y of [20, 110]) for (let k = 0; k < 2; k++) { ctx.fillText('MOSSBACK  GRAVEL  R7', 256 + k * 512, y + 7); }
  }, { aniso: 4 });
  M.tire = new THREE.MeshStandardMaterial({ map: tireTex, roughness: 0.9 });

  function wheelGeometry() {
    const R = CARDIM.wheelR, Wd = CARDIM.wheelW;
    const out = {};
    // tyre carcass (lathe around Y then rotated to X axis)
    const prof = [[0.205, -Wd / 2 + 0.005], [0.29, -Wd / 2 - 0.004], [0.315, -Wd / 2 + 0.006], [R - 0.012, -Wd / 2 + 0.02], [R - 0.012, Wd / 2 - 0.02], [0.315, Wd / 2 - 0.006], [0.29, Wd / 2 + 0.004], [0.205, Wd / 2 - 0.005]];
    const lathe = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 56);
    lathe.rotateZ(PI / 2);
    out.tire = lathe;
    // tread blocks
    const tb = new GeoBuilder(1);
    const blk = new THREE.BoxGeometry(0.045, 0.022, 0.055);
    const nAround = 30;
    for (let i = 0; i < nAround; i++) {
      for (let j = 0; j < 4; j++) {
        const a = ((i + (j % 2) * 0.5) / nAround) * TAU;
        const x = (j - 1.5) * 0.048;
        const m = new THREE.Matrix4().makeRotationX(a).multiply(new THREE.Matrix4().makeTranslation(x, R - 0.004, 0)).multiply(new THREE.Matrix4().makeRotationY((j % 2 ? 1 : -1) * 0.3));
        tb.addGeometry(blk, m, null, 0);
      }
    }
    out.tread = tb.build();
    // rim: dish with 6 spoke windows (face toward +X)
    const face = new THREE.Shape();
    face.absarc(0, 0, 0.19, 0, TAU, false);
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * TAU + 0.17, a1 = ((k + 1) / 6) * TAU - 0.17;
      const h = new THREE.Path();
      h.absarc(0, 0, 0.165, a0, a1, false);
      h.absarc(0, 0, 0.075, a1 - 0.08, a0 + 0.08, true);
      h.closePath();
      face.holes.push(h);
    }
    const dish = new THREE.ExtrudeGeometry(face, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 40 });
    dish.rotateY(PI / 2);
    dish.translate(0.035, 0, 0);
    const rg = new GeoBuilder(1);
    rg.addGeometry(dish, new THREE.Matrix4());
    const barrel = new THREE.CylinderGeometry(0.2, 0.2, 0.17, 40, 1, true);
    barrel.rotateZ(PI / 2);
    rg.addGeometry(barrel, new THREE.Matrix4());
    const lip = new THREE.TorusGeometry(0.2, 0.009, 6, 40);
    lip.rotateY(PI / 2);
    rg.addGeometry(lip, new THREE.Matrix4().makeTranslation(0.085, 0, 0));
    const cap = new THREE.CylinderGeometry(0.045, 0.05, 0.03, 16);
    cap.rotateZ(PI / 2);
    rg.addGeometry(cap, new THREE.Matrix4().makeTranslation(0.06, 0, 0));
    const nut = new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6);
    nut.rotateZ(PI / 2);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; rg.addGeometry(nut, new THREE.Matrix4().makeTranslation(0.06, Math.cos(a) * 0.065, Math.sin(a) * 0.065)); }
    out.rim = rg.build();
    // brake disc + hat
    const dg = new GeoBuilder(1);
    const disc = new THREE.CylinderGeometry(0.16, 0.16, 0.026, 36);
    disc.rotateZ(PI / 2);
    dg.addGeometry(disc, new THREE.Matrix4().makeTranslation(-0.02, 0, 0));
    const hat = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 20);
    hat.rotateZ(PI / 2);
    dg.addGeometry(hat, new THREE.Matrix4().makeTranslation(0.01, 0, 0));
    // cross drilling (small dark dots)
    out.disc = dg.build();
    // caliper: a block hugging the disc edge with a bridge over the rotor
    const cb = new GeoBuilder(1);
    cb.addGeometry(new THREE.BoxGeometry(0.075, 0.065, 0.15), new THREE.Matrix4().makeTranslation(-0.02, 0.135, 0));
    cb.addGeometry(new THREE.BoxGeometry(0.03, 0.03, 0.1), new THREE.Matrix4().makeTranslation(-0.02, 0.175, 0));
    out.caliper = cb.build();
    return out;
  }
  const WG = wheelGeometry();
  // suspension pieces
  const springPts = [];
  for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * TAU * 7; springPts.push(new V3(Math.cos(a) * 0.055, t, Math.sin(a) * 0.055)); }
  const springGeo = tubeGeometry(springPts, springPts.map(() => 0.009), 5, false);
  const damperGeo = cyl(0.022, 0.022, 1, 10); damperGeo.translate(0, 0.5, 0);
  const armGeo = boxG(1, 0.03, 0.05); armGeo.translate(0.5, 0, 0);
  const springMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.4, metalness: 0.5 });

  parts.wheels = [];
  const wheelDefs = [[1, CARDIM.zF], [-1, CARDIM.zF], [1, CARDIM.zR], [-1, CARDIM.zR]];
  for (const [s, zw] of wheelDefs) {
    const corner = new THREE.Group();
    corner.position.set(s * CARDIM.track, CARDIM.wheelR, zw);
    const steer = new THREE.Group();
    corner.add(steer);
    const mirrorG = new THREE.Group();
    mirrorG.scale.x = s;
    steer.add(mirrorG);
    const spin = new THREE.Group();
    mirrorG.add(spin);
    const tire = new THREE.Mesh(WG.tire, M.tire); tire.castShadow = true; tire.receiveShadow = true;
    const tread = new THREE.Mesh(WG.tread, M.rubber); tread.castShadow = true;
    const rim = new THREE.Mesh(WG.rim, M.rim); rim.castShadow = true;
    const disc = new THREE.Mesh(WG.disc, M.disc.clone());
    spin.add(tire, tread, rim, disc);
    const cal = new THREE.Mesh(WG.caliper, M.caliper);
    cal.rotation.x = zw > 0 ? -0.6 : 0.6;
    mirrorG.add(cal);
    root.add(corner);
    // coilover from body to hub
    const strut = new THREE.Group();
    const spring = new THREE.Mesh(springGeo, springMat);
    const damper = new THREE.Mesh(damperGeo, M.alu);
    strut.add(spring, damper);
    root.add(strut);
    const arm = new THREE.Mesh(armGeo, M.trim);
    root.add(arm);
    parts.wheels.push({ s, zw, corner, steer, spin, disc, strut, spring, arm, top: new V3(s * 0.57, 0.86, zw - 0.04 * Math.sign(zw)), armIn: new V3(s * 0.32, 0.32, zw) });
  }

  // ------------------------------------------------ runtime API
  const tmpA = new V3(), tmpB = new V3(), qy = new THREE.Quaternion(), UPV = new V3(0, 1, 0);
  const model = {
    root, parts, M, dirt: dirtU, bodyGeo,
    setWheel(i, hubY, steerAngle, spinAngle) {
      const w = parts.wheels[i];
      w.corner.position.y = hubY;
      w.steer.rotation.y = steerAngle;
      w.spin.rotation.x = spinAngle;
      // coilover
      tmpA.copy(w.top);
      tmpB.set(w.s * (CARDIM.track - 0.13), hubY + 0.06, w.zw);
      const len = tmpA.distanceTo(tmpB);
      w.strut.position.copy(tmpB);
      qy.setFromUnitVectors(UPV, tmpA.sub(tmpB).normalize());
      w.strut.quaternion.copy(qy);
      w.strut.scale.set(1, len, 1);
      // lower arm
      tmpA.set(w.s * (CARDIM.track - 0.1), hubY - 0.07, w.zw);
      tmpB.copy(w.armIn);
      const al = tmpA.distanceTo(tmpB);
      w.arm.position.copy(tmpB);
      w.arm.scale.set(al, 1, 1);
      w.arm.rotation.set(0, w.s > 0 ? 0 : PI, Math.atan2(tmpA.y - tmpB.y, Math.abs(tmpA.x - tmpB.x)) * (w.s > 0 ? 1 : 1));
    },
    setLights(brake, reverse, boost) {
      M.tail.emissiveIntensity = 0.6 + brake * 3.5;
      M.reverse.emissiveIntensity = reverse ? 2.5 : 0;
    },
    setBrakeGlow(i, heat) {
      const d = parts.wheels[i].disc.material;
      d.emissiveIntensity = Math.max(0, heat - 0.35) * 3;
    },
    setSteeringWheel(a) { parts.steeringWheel.rotation.z = -a * 2.6; },
    setCockpit(on) { parts.helmets.visible = !on; parts.visors.visible = !on; },
    // push body vertices inward around a local point (dents)
    dent(local, dirLocal, amount, radius = 0.45) {
      const pa = bodyGeo.attributes.position;
      const arr = pa.array;
      const r2 = radius * radius;
      let touched = false;
      for (let i = 0; i < arr.length; i += 3) {
        const dx = arr[i] - local.x, dy = arr[i + 1] - local.y, dz = arr[i + 2] - local.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const f = (1 - d2 / r2) ** 2 * amount;
        arr[i] += dirLocal.x * f; arr[i + 1] += dirLocal.y * f; arr[i + 2] += dirLocal.z * f;
        touched = true;
      }
      if (touched) { pa.needsUpdate = true; bodyGeo.computeVertexNormals(); }
    },
    repair() {
      bodyGeo.attributes.position.array.set(bodyGeo.userData.basePos);
      bodyGeo.attributes.position.needsUpdate = true;
      bodyGeo.computeVertexNormals();
      if (parts.wing.parent !== root) { root.add(parts.wing); parts.wing.position.set(0, 0, 0); parts.wing.rotation.set(0, 0, 0); }
      dirtU.value = 0;
    },
  };
  // the loft normals are better than computeVertexNormals at seams; keep them unless dented
  return model;
}
