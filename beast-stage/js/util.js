'use strict';
// ============================================================ shared helpers
window.BS = window.BS || {};

const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sign = (v) => (v < 0 ? -1 : 1);
function wrapAngle(a) { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
function damp(cur, target, lambda, dt) { return lerp(cur, target, 1 - Math.exp(-lambda * dt)); }
function approach(cur, target, step) { return cur < target ? Math.min(cur + step, target) : Math.max(cur - step, target); }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = mulberry32(90210);
function seedRandom(s) { RNG = mulberry32(s); }
const rnd = (a = 0, b = 1) => a + RNG() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(RNG() * arr.length)];
const frand = (a = 0, b = 1) => a + Math.random() * (b - a);

// ---------------------------------------------------------- simplex noise 2D
function makeNoise2D(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = grad[perm[ii + perm[jj]] & 7]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = grad[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = grad[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}
function fbm(n, x, y, oct = 4, lac = 2, gain = 0.5) {
  let a = 1, f = 1, s = 0, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= gain; f *= lac; }
  return s / norm;
}
function ridged(n, x, y, oct = 4) {
  let a = 1, f = 1, s = 0, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(n(x * f, y * f))); norm += a; a *= 0.5; f *= 2; }
  return s / norm;
}

// periodic value noise for tileable canvas textures
function makePeriodicNoise(seed) {
  const r = mulberry32(seed);
  const tab = new Float32Array(256 * 256);
  for (let i = 0; i < tab.length; i++) tab[i] = r();
  return function (x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = tab[(y0 & 255) * 256 + (x0 & 255)], b = tab[(y0 & 255) * 256 + (x1 & 255)];
    const c = tab[(y1 & 255) * 256 + (x0 & 255)], d = tab[(y1 & 255) * 256 + (x1 & 255)];
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
  };
}
function periodicFbm(pn, x, y, basePeriod, oct) {
  let s = 0, a = 0.5, norm = 0, p = basePeriod, f = 1;
  for (let i = 0; i < oct; i++) { s += a * pn(x * f, y * f, p); norm += a; a *= 0.5; f *= 2; p *= 2; }
  return s / norm;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------------------------------------------------------- geometry builder
// Collects triangles into groups (one per material) with position/normal/uv/color.
class GeoBuilder {
  constructor(groups = 1) {
    this.pos = []; this.nor = []; this.uv = []; this.col = [];
    this.groups = []; for (let i = 0; i < groups; i++) this.groups.push([]);
  }
  get count() { return this.pos.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v);
    this.col.push(c ? c.r : 1, c ? c.g : 1, c ? c.b : 1);
    return this.pos.length / 3 - 1;
  }
  tri(g, a, b, c) { this.groups[g].push(a, b, c); }
  // add a THREE.BufferGeometry, transformed by matrix (Matrix4)
  addGeometry(geom, matrix, color, group = 0, uvRect = null) {
    const p = geom.attributes.position, n = geom.attributes.normal, uv = geom.attributes.uv;
    const gc = geom.attributes.color;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    const base = this.count;
    const tmpc = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      if (n) w.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); else w.set(0, 1, 0);
      let u = uv ? uv.getX(i) : 0, vv = uv ? uv.getY(i) : 0;
      if (uvRect) { u = uvRect[0] + u * uvRect[2]; vv = uvRect[1] + vv * uvRect[3]; }
      let c = color;
      if (gc) { tmpc.setRGB(gc.getX(i), gc.getY(i), gc.getZ(i)); if (color) tmpc.multiply(color); c = tmpc; }
      this.vert(v.x, v.y, v.z, w.x, w.y, w.z, u, vv, c);
    }
    const det = matrix.determinant();
    const flip = det < 0;
    if (geom.index) {
      const idx = geom.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        if (flip) this.tri(group, base + idx[i], base + idx[i + 2], base + idx[i + 1]);
        else this.tri(group, base + idx[i], base + idx[i + 1], base + idx[i + 2]);
      }
    } else {
      for (let i = 0; i < p.count; i += 3) {
        if (flip) this.tri(group, base + i, base + i + 2, base + i + 1);
        else this.tri(group, base + i, base + i + 1, base + i + 2);
      }
    }
  }
  // a double-sided-friendly flat card (quad) with uv rect
  card(group, center, right, up, uvRect, color, normal) {
    const nx = normal ? normal.x : 0, ny = normal ? normal.y : 1, nz = normal ? normal.z : 0;
    const [u0, v0, uw, vh] = uvRect;
    const a = this.vert(center.x - right.x, center.y - right.y, center.z - right.z, nx, ny, nz, u0, v0, color);
    const b = this.vert(center.x + right.x, center.y + right.y, center.z + right.z, nx, ny, nz, u0 + uw, v0, color);
    const c = this.vert(center.x + right.x + up.x * 2, center.y + right.y + up.y * 2, center.z + right.z + up.z * 2, nx, ny, nz, u0 + uw, v0 + vh, color);
    const d = this.vert(center.x - right.x + up.x * 2, center.y - right.y + up.y * 2, center.z - right.z + up.z * 2, nx, ny, nz, u0, v0 + vh, color);
    this.tri(group, a, b, c); this.tri(group, a, c, d);
  }
  build(computeNormals = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const all = [];
    let start = 0;
    this.groups.forEach((arr, gi) => {
      for (let i = 0; i < arr.length; i++) all.push(arr[i]);
      if (arr.length) g.addGroup(start, arr.length, gi);
      start += arr.length;
    });
    g.setIndex(all);
    if (computeNormals) g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// a tube along a list of points with per-point radius
function tubeGeometry(points, radii, radial = 8, capEnd = true) {
  const gb = new GeoBuilder(1);
  const up = new THREE.Vector3(0, 1, 0);
  const frames = [];
  for (let i = 0; i < points.length; i++) {
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(points[1], points[0]);
    else if (i === points.length - 1) t.subVectors(points[i], points[i - 1]);
    else t.subVectors(points[i + 1], points[i - 1]);
    t.normalize();
    let ref = Math.abs(t.dot(up)) > 0.95 ? new THREE.Vector3(1, 0, 0) : up;
    if (frames.length) ref = frames[frames.length - 1].n;
    const b = new THREE.Vector3().crossVectors(t, ref).normalize();
    const n = new THREE.Vector3().crossVectors(b, t).normalize();
    frames.push({ t, n, b });
  }
  const rings = [];
  for (let i = 0; i < points.length; i++) {
    const ring = [];
    const { n, b } = frames[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const dx = Math.cos(a), dy = Math.sin(a);
      const nx = n.x * dx + b.x * dy, ny = n.y * dx + b.y * dy, nz = n.z * dx + b.z * dy;
      const r = radii[i];
      ring.push(gb.vert(points[i].x + nx * r, points[i].y + ny * r, points[i].z + nz * r, nx, ny, nz, j / radial, i / (points.length - 1)));
    }
    rings.push(ring);
  }
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = rings[i][j], b = rings[i][j + 1], c = rings[i + 1][j], d = rings[i + 1][j + 1];
      gb.tri(0, a, c, b); gb.tri(0, b, c, d);
    }
  }
  if (capEnd) {
    const last = points[points.length - 1], t = frames[frames.length - 1].t;
    const ci = gb.vert(last.x, last.y, last.z, t.x, t.y, t.z, 0.5, 1);
    const ring = rings[rings.length - 1];
    for (let j = 0; j < radial; j++) gb.tri(0, ring[j], ring[j + 1], ci);
  }
  return gb.build();
}

// displace geometry vertices along normals by 3D-ish noise (for organic shapes)
function lumpify(geom, amount, scale, seed = 1) {
  const n = makeNoise2D(seed);
  const p = geom.attributes.position;
  geom.computeVertexNormals();
  const nr = geom.attributes.normal;
  const radial = !geom.index; // non-indexed: move along radius so shared corners stay welded
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = (n(x * scale + z * 0.37 * scale, y * scale) + 0.5 * n(z * scale * 2.1, x * scale * 2.1 + y)) * amount;
    let ax = nr.getX(i), ay = nr.getY(i), az = nr.getZ(i);
    if (radial) { const L = Math.hypot(x, y, z) || 1; ax = x / L; ay = y / L; az = z / L; }
    p.setXYZ(i, x + ax * d, y + ay * d, z + az * d);
  }
  geom.computeVertexNormals();
  return geom;
}

function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = opts.aniso || 4;
  if (opts.flipY === false) t.flipY = false;
  return t;
}

function safeStore(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch (e) { return null; }
  return null;
}

Object.assign(BS, { clamp, lerp, smoothstep });
