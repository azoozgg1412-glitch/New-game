'use strict';
// ============================================================ jungle vegetation
const OBST = {
  // collision obstacles: trees (vertical cylinders), rocks (spheres), boxes
  list: [], grid: null, GC: 32, GN: 64,
  add(o) {
    o.id = this.list.length; o.alive = true;
    this.list.push(o);
    const r = o.r + (o.hx || 0) + (o.hz || 0);
    const g0 = Math.max(0, Math.floor((o.x - r + WORLD.HALF) / this.GC)), g1 = Math.min(this.GN - 1, Math.floor((o.x + r + WORLD.HALF) / this.GC));
    const k0 = Math.max(0, Math.floor((o.z - r + WORLD.HALF) / this.GC)), k1 = Math.min(this.GN - 1, Math.floor((o.z + r + WORLD.HALF) / this.GC));
    for (let k = k0; k <= k1; k++) for (let g = g0; g <= g1; g++) this.grid[k * this.GN + g].push(o.id);
    return o;
  },
  query(x, z, rad, fn) {
    const g0 = Math.max(0, Math.floor((x - rad + WORLD.HALF) / this.GC)), g1 = Math.min(this.GN - 1, Math.floor((x + rad + WORLD.HALF) / this.GC));
    const k0 = Math.max(0, Math.floor((z - rad + WORLD.HALF) / this.GC)), k1 = Math.min(this.GN - 1, Math.floor((z + rad + WORLD.HALF) / this.GC));
    const stamp = ++this.stamp;
    for (let k = k0; k <= k1; k++) for (let g = g0; g <= g1; g++) {
      const cell = this.grid[k * this.GN + g];
      for (let q = 0; q < cell.length; q++) {
        const o = this.list[cell[q]];
        if (!o.alive || o.stamp === stamp) continue;
        o.stamp = stamp;
        fn(o);
      }
    }
  },
  stamp: 0,
  init() { this.grid = []; for (let i = 0; i < this.GN * this.GN; i++) this.grid.push([]); this.list = []; },
};

const FLORA = { cells: [], CS: 256, falling: [], types: {}, mats: {} };

(function () {
  const V3 = THREE.Vector3;
  const UP = new V3(0, 1, 0);

  // foliage cards are double sided: keep the same (upward-ish) normal on both faces so
  // the back of a leaf isn't lit as if it faced the ground
  const FOLIAGE_NORMAL = THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0');
  function windify(mat, strength) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = ENV.time;
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', FOLIAGE_NORMAL);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hh = max(position.y - 0.4, 0.0);
        float sway = sin(uTime * 1.1 + ip.x * 0.05 + ip.z * 0.04) + 0.5 * sin(uTime * 2.3 + ip.z * 0.11);
        float flutter = sin(uTime * 5.0 + position.x * 1.7 + position.z * 1.3 + ip.x) * 0.5;
        float amt = ${strength.toFixed(3)} * pow(hh, 1.25);
        transformed.x += (sway * 0.6 + flutter * 0.25) * amt;
        transformed.z += (sway * 0.4 - flutter * 0.2) * amt;
        transformed.y += flutter * amt * 0.25;`);
    };
    mat.customProgramCacheKey = () => 'wind' + strength;
  }

  function makeMaterials() {
    const M = FLORA.mats;
    M.bark = new THREE.MeshStandardMaterial({ map: TEX.bark, vertexColors: true, roughness: 0.95 });
    M.palmBark = new THREE.MeshStandardMaterial({ map: TEX.palmBark, vertexColors: true, roughness: 0.9 });
    M.leaf = new THREE.MeshStandardMaterial({ map: TEX.foliage, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.75 });
    windify(M.leaf, 0.012);
    M.leafLow = new THREE.MeshStandardMaterial({ map: TEX.foliage, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8 });
    windify(M.leafLow, 0.05);
    M.rock = new THREE.MeshStandardMaterial({ map: TEX.rock, vertexColors: true, roughness: 0.92, flatShading: true });
  }

  // a drooping leaf strip (palm frond / banana leaf / fern frond)
  function leafStrip(gb, base, dir0, elev0, droop, segs, segLen, halfW, uv, alongU, color, fold = 0.15, twist = 0) {
    const pts = [], dirs = [];
    let e = elev0;
    const p = base.clone();
    const yaw = Math.atan2(dir0.z, dir0.x);
    for (let s = 0; s <= segs; s++) {
      pts.push(p.clone());
      const d = new V3(Math.cos(yaw) * Math.cos(e), Math.sin(e), Math.sin(yaw) * Math.cos(e));
      dirs.push(d);
      p.addScaledVector(d, segLen);
      e -= droop;
    }
    const side = new V3(-Math.sin(yaw), 0, Math.cos(yaw));
    const rows = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const w = halfW * Math.pow(Math.sin(PI * (0.1 + 0.9 * t)), 0.6) * (1 - 0.25 * t);
      const tw = twist * t;
      const sd = side.clone().applyAxisAngle(dirs[s], tw);
      const n = new V3().crossVectors(dirs[s], sd).normalize();
      if (n.y < 0) n.negate();
      const nn = n.clone().lerp(UP, 0.5).normalize();
      const c = pts[s];
      const L = c.clone().addScaledVector(sd, w).addScaledVector(n, -fold * w);
      const R = c.clone().addScaledVector(sd, -w).addScaledVector(n, -fold * w);
      let uA, vA, uC, vC, uB, vB;
      if (alongU) { uA = uv[0] + t * uv[2]; uC = uA; uB = uA; vA = uv[1] + uv[3]; vC = uv[1] + uv[3] * 0.5; vB = uv[1]; }
      else { vA = uv[1] + t * uv[3]; vC = vA; vB = vA; uA = uv[0]; uC = uv[0] + uv[2] * 0.5; uB = uv[0] + uv[2]; }
      rows.push([
        gb.vert(L.x, L.y, L.z, nn.x, nn.y, nn.z, uA, vA, color),
        gb.vert(c.x, c.y, c.z, nn.x, nn.y, nn.z, uC, vC, color),
        gb.vert(R.x, R.y, R.z, nn.x, nn.y, nn.z, uB, vB, color),
      ]);
    }
    for (let s = 0; s < segs; s++) {
      const a = rows[s], b = rows[s + 1];
      gb.tri(1, a[0], b[0], a[1]); gb.tri(1, a[1], b[0], b[1]);
      gb.tri(1, a[1], b[1], a[2]); gb.tri(1, a[2], b[1], b[2]);
    }
    return pts[pts.length - 1];
  }

  // canopy cluster: several crossed cards with radial normals
  function cluster(gb, center, radius, cards, color, canopyCenter, uv = ATLAS.broad) {
    for (let k = 0; k < cards; k++) {
      const n = new V3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize();
      const right = new V3().crossVectors(n, Math.abs(n.y) > 0.9 ? new V3(1, 0, 0) : UP).normalize();
      const up = new V3().crossVectors(right, n).normalize();
      const sz = radius * rnd(0.75, 1.1);
      const c = center.clone().add(new V3(rnd(-1, 1), rnd(-0.5, 0.6), rnd(-1, 1)).multiplyScalar(radius * 0.45));
      const nrm = c.clone().sub(canopyCenter).normalize().lerp(UP, 0.35).normalize();
      const p0 = c.clone().addScaledVector(right, -sz).addScaledVector(up, -sz);
      const p1 = c.clone().addScaledVector(right, sz).addScaledVector(up, -sz);
      const p2 = c.clone().addScaledVector(right, sz).addScaledVector(up, sz);
      const p3 = c.clone().addScaledVector(right, -sz).addScaledVector(up, sz);
      const col = color.clone().multiplyScalar(rnd(0.8, 1.15));
      const a = gb.vert(p0.x, p0.y, p0.z, nrm.x, nrm.y, nrm.z, uv[0], uv[1], col);
      const b = gb.vert(p1.x, p1.y, p1.z, nrm.x, nrm.y, nrm.z, uv[0] + uv[2], uv[1], col);
      const cc = gb.vert(p2.x, p2.y, p2.z, nrm.x, nrm.y, nrm.z, uv[0] + uv[2], uv[1] + uv[3], col);
      const d = gb.vert(p3.x, p3.y, p3.z, nrm.x, nrm.y, nrm.z, uv[0], uv[1] + uv[3], col);
      gb.tri(1, a, b, cc); gb.tri(1, a, cc, d);
    }
  }

  function trunk(gb, pts, radii, radial, color, uvRepeat) {
    const g = tubeGeometry(pts, radii, radial, false);
    gb.addGeometry(g, new THREE.Matrix4(), color, 0, [0, 0, 2, uvRepeat]);
  }

  // ------------------------------------------------ models
  function palmModel(detail) {
    const gb = new GeoBuilder(2);
    const H = 11, bend = rnd(0.8, 1.8);
    const segs = detail ? 10 : 5;
    const pts = [], radii = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new V3(Math.sin(t * 1.3) * bend, t * H, 0));
      radii.push(lerp(0.3, 0.17, t) + (t < 0.08 ? (0.08 - t) * 2.2 : 0));
    }
    trunk(gb, pts, radii, detail ? 8 : 5, new THREE.Color(1, 1, 1), 5);
    const top = pts[pts.length - 1];
    const fronds = detail ? 11 : 7;
    for (let k = 0; k < fronds; k++) {
      const a = (k / fronds) * TAU + rnd(-0.2, 0.2);
      const dir = new V3(Math.cos(a), 0, Math.sin(a));
      const col = new THREE.Color(1, 1, 1).multiplyScalar(rnd(0.8, 1.1));
      leafStrip(gb, top.clone().add(new V3(0, 0.1, 0)), dir, rnd(0.35, 0.8), rnd(0.18, 0.28), detail ? 8 : 4, 4.6 / (detail ? 8 : 4), 0.95, ATLAS.palm, true, col, 0.25);
    }
    if (detail) {
      const nut = new THREE.SphereGeometry(0.16, 6, 5);
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Matrix4().makeTranslation(top.x + Math.cos(k * 1.7) * 0.28, top.y - 0.35, top.z + Math.sin(k * 1.7) * 0.28);
        gb.addGeometry(nut, m, new THREE.Color(0.45, 0.38, 0.2), 0);
      }
    }
    return gb.build();
  }

  function canopyModel(detail) {
    const gb = new GeoBuilder(2);
    const H = 24;
    const lean = new V3(rnd(-1, 1), 0, rnd(-1, 1)).multiplyScalar(0.8);
    const segs = detail ? 10 : 5;
    const pts = [], radii = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new V3(lean.x * t * t, t * H, lean.z * t * t));
      radii.push(lerp(0.95, 0.42, Math.sqrt(t)));
    }
    trunk(gb, pts, radii, detail ? 9 : 5, new THREE.Color(0.95, 0.93, 0.9), 6);
    if (detail) { // buttress roots
      const fins = 5;
      for (let k = 0; k < fins; k++) {
        const a = (k / fins) * TAU + rnd(-0.3, 0.3);
        const d = new V3(Math.cos(a), 0, Math.sin(a)), s = new V3(-d.z, 0, d.x).multiplyScalar(0.14);
        const inA = d.clone().multiplyScalar(0.6), out = d.clone().multiplyScalar(rnd(2.6, 3.6));
        const topP = d.clone().multiplyScalar(0.6).setY(rnd(3, 4.2));
        const P = [inA.clone().add(s), out.clone().add(s), topP.clone().add(s), inA.clone().sub(s), out.clone().sub(s), topP.clone().sub(s)];
        const nrm = s.clone().normalize();
        const col = new THREE.Color(0.9, 0.88, 0.85);
        const f1 = [0, 1, 2].map((q) => gb.vert(P[q].x, P[q].y - 0.2, P[q].z, nrm.x, nrm.y, nrm.z, q * 0.4, P[q].y * 0.3, col));
        const f2 = [3, 4, 5].map((q) => gb.vert(P[q].x, P[q].y - 0.2, P[q].z, -nrm.x, -nrm.y, -nrm.z, q * 0.4, P[q].y * 0.3, col));
        gb.tri(0, f1[0], f1[2], f1[1]); gb.tri(0, f2[0], f2[1], f2[2]);
        const top = [gb.vert(P[1].x, P[1].y - 0.2, P[1].z, d.x, 0.7, d.z, 0, 0, col), gb.vert(P[2].x, P[2].y - 0.2, P[2].z, d.x, 0.7, d.z, 0, 1, col),
          gb.vert(P[4].x, P[4].y - 0.2, P[4].z, d.x, 0.7, d.z, 0.2, 0, col), gb.vert(P[5].x, P[5].y - 0.2, P[5].z, d.x, 0.7, d.z, 0.2, 1, col)];
        gb.tri(0, top[0], top[1], top[2]); gb.tri(0, top[2], top[1], top[3]);
      }
    }
    // branches + crown clusters
    const crown = new V3(lean.x, H + 2, lean.z);
    const leafCol = new THREE.Color(0.85, 0.95, 0.8);
    const nb = detail ? 5 : 4;
    const ends = [];
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * TAU + rnd(-0.3, 0.3);
      const y0 = H * rnd(0.7, 0.85);
      const start = new V3(lean.x * 0.6, y0, lean.z * 0.6);
      const end = start.clone().add(new V3(Math.cos(a) * rnd(5, 7.5), rnd(3, 5.5), Math.sin(a) * rnd(5, 7.5)));
      const mid = start.clone().lerp(end, 0.5).add(new V3(0, 0.8, 0));
      trunk(gb, [start, mid, end], [0.38, 0.25, 0.12], detail ? 5 : 3, new THREE.Color(0.9, 0.9, 0.88), 2);
      ends.push(end);
    }
    ends.push(new V3(lean.x, H + 1.5, lean.z));
    for (const e of ends) cluster(gb, e, rnd(3.6, 4.8), detail ? 6 : 3, leafCol, crown);
    if (detail) { // lianas
      for (let k = 0; k < 3; k++) {
        const e = ends[k];
        const len = rnd(9, 15);
        const vp = [], vr = [];
        for (let s = 0; s <= 5; s++) { const t = s / 5; vp.push(new V3(e.x * 0.9 + Math.sin(t * 3) * 0.4, e.y - t * len, e.z * 0.9 + Math.cos(t * 2) * 0.4)); vr.push(0.06); }
        const g = tubeGeometry(vp, vr, 3, false);
        gb.addGeometry(g, new THREE.Matrix4(), new THREE.Color(0.35, 0.45, 0.25), 0, [0, 0, 1, 3]);
        // little leaves along the vine
        for (let s = 1; s < 5; s++) cluster(gb, vp[s], 0.6, 1, leafCol, vp[s].clone().add(new V3(0, 1, 0)));
      }
    }
    return gb.build();
  }

  function midTreeModel(detail) {
    const gb = new GeoBuilder(2);
    const H = rnd(9, 12);
    const segs = detail ? 7 : 4;
    const pts = [], radii = [];
    const wob = rnd(0, TAU);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new V3(Math.sin(t * 3 + wob) * 0.5, t * H, Math.cos(t * 2.4 + wob) * 0.4));
      radii.push(lerp(0.38, 0.16, t));
    }
    trunk(gb, pts, radii, detail ? 7 : 4, new THREE.Color(1, 1, 1), 4);
    const top = pts[pts.length - 1];
    const crown = top.clone().add(new V3(0, 1, 0));
    const leafCol = new THREE.Color(1, 1, 1);
    const ends = [top.clone().add(new V3(0, 1.2, 0))];
    const nb = detail ? 3 : 2;
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * TAU + rnd(-0.4, 0.4);
      const st = pts[Math.floor(segs * 0.65)];
      const end = st.clone().add(new V3(Math.cos(a) * 3, rnd(1.5, 3), Math.sin(a) * 3));
      trunk(gb, [st, st.clone().lerp(end, 0.5).add(new V3(0, 0.4, 0)), end], [0.15, 0.1, 0.05], detail ? 4 : 3, new THREE.Color(1, 1, 1), 1);
      ends.push(end);
    }
    for (const e of ends) cluster(gb, e, rnd(2.4, 3.2), detail ? 5 : 3, leafCol, crown);
    return gb.build();
  }

  function bananaModel() {
    const gb = new GeoBuilder(2);
    const h = rnd(1.4, 2.0);
    trunk(gb, [new V3(0, 0, 0), new V3(0, h * 0.5, 0), new V3(0, h, 0)], [0.14, 0.12, 0.09], 6, new THREE.Color(0.55, 0.75, 0.35), 1);
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rnd(-0.3, 0.3);
      leafStrip(gb, new V3(0, h - rnd(0, 0.3), 0), new V3(Math.cos(a), 0, Math.sin(a)), rnd(0.7, 1.1), rnd(0.18, 0.3), 5, 0.5, 0.42, ATLAS.banana, true, new THREE.Color(1, 1, 1), 0.1, rnd(-0.5, 0.5));
    }
    return gb.build();
  }

  function fernModel() {
    const gb = new GeoBuilder(2);
    const n = 11;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rnd(-0.25, 0.25);
      leafStrip(gb, new V3(0, 0.05, 0), new V3(Math.cos(a), 0, Math.sin(a)), rnd(0.7, 1.1), rnd(0.25, 0.4), 4, 0.36, 0.28, ATLAS.fern, false, new THREE.Color(1, 1, 1).multiplyScalar(rnd(0.85, 1.1)), 0.05);
    }
    return gb.build();
  }

  function bushModel() {
    const gb = new GeoBuilder(2);
    const c = new V3(0, 1.0, 0);
    cluster(gb, c, 1.25, 7, new THREE.Color(0.9, 1, 0.85), new V3(0, 0.2, 0));
    cluster(gb, new V3(0.6, 0.7, 0.3), 0.9, 3, new THREE.Color(0.8, 0.95, 0.8), new V3(0, 0.2, 0));
    return gb.build();
  }

  function grassModel() {
    const gb = new GeoBuilder(2);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * PI + rnd(-0.2, 0.2);
      const r = new V3(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      gb.card(1, new V3(0, -0.05, 0), r, new V3(0, rnd(0.3, 0.45), 0), ATLAS.grass, new THREE.Color(0.72, 0.78, 0.62), UP);
    }
    return gb.build();
  }

  function rockModel() {
    const g = new THREE.IcosahedronGeometry(1, 1);
    lumpify(g, 0.22, 1.3, rndi(1, 999));
    const p = g.attributes.position;
    const col = [];
    for (let i = 0; i < p.count; i++) {
      p.setY(i, p.getY(i) * 0.62);
      const top = smoothstep(0.1, 0.6, p.getY(i));
      col.push(lerp(0.62, 0.42, top), lerp(0.6, 0.55, top), lerp(0.55, 0.3, top));
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  // ------------------------------------------------ placement
  function okGround(x, z, minRoad, minWater = 0.8, maxSlope = 0.45) {
    if (Math.abs(x) > 1000 || Math.abs(z) > 1000) return null;
    const s = WORLD.sample(x, z, -999);
    if (s.h < WORLD.WATER + minWater) return null;
    if (1 - s.ny > maxSlope) return null;
    const rd = WORLD.bilinear(WORLD.rd, x, z);
    if (rd < minRoad) return null;
    if (Math.hypot(x - WORLD.plaza.x, z - WORLD.plaza.z) < WORLD.plaza.r + 4) return null;
    for (const P of WORLD.platforms) {
      const dx = x - P.cx, dz = z - P.cz;
      if (Math.abs(dx * P.ux + dz * P.uz) < P.hl + 8 && Math.abs(-dx * P.uz + dz * P.ux) < P.hw + 6) return null;
    }
    for (const k of PROPS_KEEPOUT) if (Math.hypot(x - k.x, z - k.z) < k.r) return null;
    return { h: s.h, rd, forest: WORLD.bilinear(WORLD.forest, x, z), wd: WORLD.bilinear(WORLD.waterDist, x, z) };
  }

  function samplePos(nearRoadBias) {
    if (RNG() < nearRoadBias) {
      const road = WORLD.roads[RNG() < 0.7 ? 0 : rndi(1, 2)];
      const i = Math.floor(RNG() * road.pts.length);
      const p = road.pts[i], f = road.fr[i];
      const off = (RNG() < 0.5 ? -1 : 1) * (WORLD.HW + Math.pow(RNG(), 1.6) * 110);
      return { x: p.x + f.nx * off + rnd(-2, 2), z: p.z + f.nz * off + rnd(-2, 2) };
    }
    return { x: rnd(-1000, 1000), z: rnd(-1000, 1000) };
  }

  FLORA.build = async function (scene, quality, progress) {
    makeMaterials();
    const Q = quality === 'low' ? 0.45 : quality === 'high' ? 1.35 : 1;
    const M = FLORA.mats;
    const V = quality === 'low' ? 1 : quality === 'high' ? 3 : 2; // model variants per type
    const types = {
      palm: { lod: true, make: palmModel, mats: [M.palmBark, M.leaf], count: 5200, bias: 0.65, rmin: WORLD.HW + 2.2, r: 0.3, breakable: true, h: 11, shadow: true },
      canopy: { lod: true, make: canopyModel, mats: [M.bark, M.leaf], count: 1500, bias: 0.45, rmin: WORLD.HW + 9, r: 1.25, breakable: false, h: 24, shadow: true },
      mid: { lod: true, make: midTreeModel, mats: [M.bark, M.leaf], count: 7200, bias: 0.6, rmin: WORLD.HW + 2.8, r: 0.36, breakable: true, h: 10, shadow: true },
      banana: { make: bananaModel, mats: [M.bark, M.leafLow], count: 5200, bias: 0.8, rmin: WORLD.HW + 1.6, small: true },
      bush: { make: bushModel, mats: [M.bark, M.leafLow], count: 6500, bias: 0.8, rmin: WORLD.HW + 1.2, small: true },
      fern: { make: fernModel, mats: [M.bark, M.leafLow], count: 9000, bias: 0.8, rmin: WORLD.HW + 0.8, small: true },
      grass: { make: grassModel, mats: [M.bark, M.leafLow], count: 22000, bias: 0.97, rmin: WORLD.HW + 0.5, small: true, tiny: true },
      rock: { make: rockModel, mats: M.rock, count: 1400, bias: 0.5, rmin: WORLD.HW + 1.5, r: 1, rock: true, shadow: true },
    };
    FLORA.types = types;
    for (const [name, T] of Object.entries(types)) {
      T.name = name;
      T.geos = []; T.geosLow = [];
      for (let v = 0; v < V; v++) {
        T.geos.push(name === 'rock' ? rockModel() : T.make(true));
        if (T.lod) T.geosLow.push(T.make(false));
      }
    }
    // cells
    const NC = WORLD.SIZE / FLORA.CS;
    FLORA.NC = NC;
    FLORA.cells = [];
    for (let k = 0; k < NC; k++) for (let g = 0; g < NC; g++) {
      FLORA.cells.push({ minx: -WORLD.HALF + g * FLORA.CS, minz: -WORLD.HALF + k * FLORA.CS, items: {}, meshes: [] });
    }
    const cellOf = (x, z) => FLORA.cells[clamp(Math.floor((z + WORLD.HALF) / FLORA.CS), 0, NC - 1) * NC + clamp(Math.floor((x + WORLD.HALF) / FLORA.CS), 0, NC - 1)];

    let done = 0;
    const total = Object.values(types).reduce((s, t) => s + t.count, 0);
    for (const [name, T] of Object.entries(types)) {
      const want = Math.floor(T.count * Q);
      let placed = 0, tries = 0;
      while (placed < want && tries < want * 12) {
        tries++;
        const p = samplePos(T.bias);
        const g = okGround(p.x, p.z, T.rmin, name === 'grass' ? 0.4 : 0.8, T.rock ? 0.7 : name === 'canopy' ? 0.3 : 0.45);
        if (!g) continue;
        let dens;
        const near = smoothstep(90, 8, g.rd);
        const waterNear = g.wd > 3 && g.wd < 90 ? smoothstep(90, 10, g.wd) : 0;
        switch (name) {
          case 'palm': dens = 0.25 + 0.4 * near + 0.7 * waterNear - 0.2 * g.forest; break;
          case 'canopy': dens = 0.1 + g.forest * 0.8; break;
          case 'mid': dens = 0.3 + g.forest * 0.5 + near * 0.3; break;
          case 'banana': dens = 0.2 + near * 0.6 + waterNear * 0.3; break;
          case 'bush': dens = 0.3 + near * 0.5; break;
          case 'fern': dens = 0.35 + g.forest * 0.5; break;
          case 'grass': dens = smoothstep(32, 5, g.rd) * (1 - g.forest * 0.5); break;
          default: dens = 0.5;
        }
        if (RNG() > dens) continue;
        const scale = name === 'canopy' ? rnd(0.85, 1.2) : name === 'grass' ? rnd(0.8, 1.5) : name === 'rock' ? rnd(0.5, 2.6) : rnd(0.75, 1.25);
        const yaw = rnd(0, TAU);
        const variant = Math.floor(RNG() * V);
        const cell = cellOf(p.x, p.z);
        (cell.items[name] = cell.items[name] || []).push({ x: p.x, y: g.h - (T.rock ? 0.3 * scale : 0.05), z: p.z, yaw, s: scale, v: variant });
        placed++;
      }
      done += T.count;
      progress(0.6 + 0.3 * (done / total), 'Planting the jungle');
      await nextFrame();
    }

    // instanced meshes per cell / type / variant
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), pos = new V3();
    const col = new THREE.Color();
    for (const cell of FLORA.cells) {
      for (const [name, items] of Object.entries(cell.items)) {
        const T = types[name];
        for (let v = 0; v < V; v++) {
          const list = items.filter((it) => it.v === v);
          if (!list.length) continue;
          const lods = T.lod ? [T.geos[v], T.geosLow[v]] : [T.geos[v]];
          const meshes = lods.map((geo, li) => {
            const mesh = new THREE.InstancedMesh(geo, T.mats, list.length);
            mesh.castShadow = !!T.shadow;
            mesh.receiveShadow = !T.tiny;
            mesh.matrixAutoUpdate = false;
            list.forEach((it, idx) => {
              q.setFromAxisAngle(UP, it.yaw);
              if (T.rock) sc.set(it.s * rnd(0.8, 1.3), it.s, it.s * rnd(0.8, 1.3)); else sc.set(it.s, it.s, it.s);
              pos.set(it.x, it.y, it.z);
              m4.compose(pos, q, sc);
              mesh.setMatrixAt(idx, m4);
              if (li === 0) it.tint = [rnd(0.82, 1.1), rnd(0.85, 1.1), rnd(0.8, 1.05)];
              col.setRGB(it.tint[0], it.tint[1], it.tint[2]);
              mesh.setColorAt(idx, col);
            });
            mesh.computeBoundingSphere();
            scene.add(mesh);
            const rec = { mesh, kind: T.small ? (T.tiny ? 'tiny' : 'small') : 'tree', lod: T.lod ? li : -1 };
            cell.meshes.push(rec);
            return mesh;
          });
          // collision obstacles
          if (T.r) {
            list.forEach((it, idx) => {
              const o = OBST.add({
                type: T.rock ? 'rock' : 'tree', x: it.x, y: it.y, z: it.z, r: T.r * it.s * (T.rock ? 1.15 : 1), h: (T.h || 2) * it.s,
                breakable: !!T.breakable, inst: { meshes, idx, it, T },
              });
              if (T.rock) o.y = it.y + 0.2 * it.s;
            });
          }
        }
      }
      cell.cx = cell.minx + FLORA.CS / 2; cell.cz = cell.minz + FLORA.CS / 2;
    }
  };

  FLORA.update = function (cam, viewDist, dt) {
    for (const cell of FLORA.cells) {
      const dx = Math.max(cell.minx - cam.x, 0, cam.x - (cell.minx + FLORA.CS));
      const dz = Math.max(cell.minz - cam.z, 0, cam.z - (cell.minz + FLORA.CS));
      const d = Math.hypot(dx, dz);
      for (const r of cell.meshes) {
        let vis;
        if (r.kind === 'tiny') vis = d < 90;
        else if (r.kind === 'small') vis = d < 170;
        else if (r.lod === 0) vis = d < 140;
        else if (r.lod === 1) vis = d >= 140 && d < viewDist;
        else vis = d < viewDist;
        r.mesh.visible = vis;
      }
    }
    // falling trees
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), sc = new V3(), pos = new V3();
    for (let i = FLORA.falling.length - 1; i >= 0; i--) {
      const f = FLORA.falling[i];
      f.vel += (2.2 + Math.sin(f.ang) * 6) * dt;
      f.ang = Math.min(f.maxAng, f.ang + f.vel * dt);
      const it = f.o.inst.it;
      q.setFromAxisAngle(f.axis, f.ang);
      q2.setFromAxisAngle(UP, it.yaw);
      q.multiply(q2);
      sc.set(it.s, it.s, it.s);
      pos.set(it.x, it.y - f.sink, it.z);
      if (f.ang >= f.maxAng) { f.sink += dt * 0.0; }
      m4.compose(pos, q, sc);
      for (const mesh of f.o.inst.meshes) { mesh.setMatrixAt(f.o.inst.idx, m4); mesh.instanceMatrix.needsUpdate = true; }
      if (f.ang >= f.maxAng && !f.landed) { f.landed = true; if (BS.onTreeLand) BS.onTreeLand(f.o, f); }
      if (f.landed) FLORA.falling.splice(i, 1);
    }
  };

  // knock a tree over, falling away from (fromX, fromZ)
  FLORA.fell = function (o, fromX, fromZ, power = 1) {
    if (!o.alive || o.type !== 'tree') return false;
    o.alive = false;
    let dx = o.x - fromX, dz = o.z - fromZ;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    // axis perpendicular to fall direction (rotate "up" toward (dx, dz))
    const axis = new V3(dz, 0, -dx).normalize();
    FLORA.falling.push({ o, axis, ang: 0.02, vel: 0.6 * power, maxAng: rnd(1.35, 1.52), sink: 0, landed: false, dir: { x: dx, z: dz } });
    if (BS.onTreeFall) BS.onTreeFall(o, dx, dz);
    return true;
  };
})();

const PROPS_KEEPOUT = [];
