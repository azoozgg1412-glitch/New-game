'use strict';
// ============================================================ particles, skid marks, debris
const FX = { pools: {}, debris: [], skid: null };

(function () {
  const PRESETS = {
    dust: { col: [0.62, 0.52, 0.38], a: 0.42, s0: 0.7, s1: 4.2, life: [1.4, 2.4], g: -0.25, drag: 1.6, pool: 'soft' },
    dustDark: { col: [0.36, 0.3, 0.22], a: 0.45, s0: 0.6, s1: 3.2, life: [1.0, 1.8], g: -0.15, drag: 1.8, pool: 'soft' },
    mud: { col: [0.2, 0.14, 0.09], a: 1, s0: 0.22, s1: 0.16, life: [0.8, 1.4], g: 13, drag: 0.4, pool: 'soft', hard: true },
    grassBits: { col: [0.3, 0.42, 0.16], a: 1, s0: 0.16, s1: 0.12, life: [0.6, 1.1], g: 9, drag: 1.0, pool: 'soft', hard: true },
    splash: { col: [0.82, 0.88, 0.86], a: 0.75, s0: 0.35, s1: 1.6, life: [0.6, 1.1], g: 10, drag: 0.6, pool: 'soft' },
    spray: { col: [0.9, 0.94, 0.95], a: 0.35, s0: 0.8, s1: 3.5, life: [0.8, 1.4], g: 2, drag: 1.2, pool: 'soft' },
    smoke: { col: [0.42, 0.42, 0.42], a: 0.35, s0: 0.3, s1: 2.4, life: [1.2, 2.2], g: -0.8, drag: 1.4, pool: 'soft' },
    blackSmoke: { col: [0.1, 0.1, 0.1], a: 0.5, s0: 0.5, s1: 3.5, life: [1.5, 2.5], g: -1.5, drag: 1.0, pool: 'soft' },
    tireSmoke: { col: [0.85, 0.83, 0.8], a: 0.28, s0: 0.8, s1: 4.5, life: [1.8, 3.0], g: -0.3, drag: 2.0, pool: 'soft' },
    leaf: { col: [0.25, 0.45, 0.14], a: 1, s0: 0.28, s1: 0.24, life: [2.5, 4], g: 1.6, drag: 2.5, pool: 'soft', hard: true, flutter: true },
    chip: { col: [0.45, 0.33, 0.2], a: 1, s0: 0.18, s1: 0.14, life: [1, 1.8], g: 10, drag: 0.5, pool: 'soft', hard: true },
    spark: { col: [1.6, 0.9, 0.35], a: 1, s0: 0.14, s1: 0.04, life: [0.25, 0.6], g: 9, drag: 0.8, pool: 'add' },
    fire: { col: [1.6, 0.6, 0.15], a: 0.9, s0: 0.9, s1: 0.2, life: [0.35, 0.7], g: -4, drag: 2.0, pool: 'add' },
    flare: { col: [2.2, 0.25, 0.12], a: 1, s0: 1.4, s1: 0.4, life: [0.4, 0.8], g: -2, drag: 1.5, pool: 'add' },
    nitro: { col: [0.5, 0.8, 2.2], a: 0.9, s0: 0.5, s1: 0.1, life: [0.12, 0.25], g: 0, drag: 0, pool: 'add' },
  };
  FX.PRESETS = PRESETS;

  function puffTexture() {
    return canvasTexture(64, 64, (ctx) => {
      const img = ctx.createImageData(64, 64);
      const n = makeNoise2D(7);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const dx = (x - 31.5) / 32, dy = (y - 31.5) / 32, d = Math.hypot(dx, dy);
        const v = Math.max(0, 1 - d) ** 1.4 * (0.75 + 0.25 * n(x / 9, y / 9));
        const i = (y * 64 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(clamp(v * 1.3, 0, 1) * 255);
      }
      ctx.putImageData(img, 0, 0);
    }, { clamp: true });
  }

  function makePool(scene, max, additive) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tPuff: { value: null }, uScale: { value: 800 }, uHard: { value: 0 } }]),
      transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        attribute vec4 pcol; attribute float psize; varying vec4 vCol; uniform float uScale;
        void main(){
          vCol = pcol;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(psize * uScale / -mvPosition.z, 1.0, 512.0);
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D tPuff; varying vec4 vCol;
        void main(){
          float a = texture2D(tPuff, gl_PointCoord).a;
          if (vCol.a > 0.98) a = smoothstep(0.15, 0.45, a);
          gl_FragColor = vec4(vCol.rgb, vCol.a * a);
          if (gl_FragColor.a < 0.01) discard;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    mat.uniforms.tPuff.value = FX.puff;
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = additive ? 6 : 5;
    scene.add(pts);
    const P = [];
    return { geo, mat, pts, pos, col, size, P, max };
  }

  FX.init = function (scene, quality) {
    FX.puff = puffTexture();
    FX.quality = quality;
    const m = quality === 'low' ? 1500 : 4000;
    FX.pools.soft = makePool(scene, m, false);
    FX.pools.add = makePool(scene, 1200, true);
    // skid marks
    const N = quality === 'low' ? 1500 : 4000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 4 * 3), col = new Float32Array(N * 4 * 4);
    const idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) { const b = i * 4; idx.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], i * 6); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    FX.skid = { geo, pos, col, N, head: 0, count: 0, last: [null, null, null, null], mesh };
  };

  FX.clear = function () {
    for (const p of Object.values(FX.pools)) { p.P.length = 0; p.geo.setDrawRange(0, 0); }
    const s = FX.skid; s.col.fill(0); s.geo.attributes.color.needsUpdate = true; s.last = [null, null, null, null];
    for (const d of FX.debris) d.mesh.parent && d.mesh.parent.remove(d.mesh);
    FX.debris.length = 0;
  };

  FX.spawn = function (type, x, y, z, vx = 0, vy = 0, vz = 0, scale = 1, tint) {
    const pr = PRESETS[type];
    const pool = FX.pools[pr.pool];
    if (pool.P.length >= pool.max) pool.P.shift();
    const life = frand(pr.life[0], pr.life[1]);
    const c = tint || pr.col;
    const k = frand(0.85, 1.1);
    pool.P.push({ x, y, z, vx, vy, vz, t: 0, life, pr, sc: scale, r: c[0] * k, g: c[1] * k, b: c[2] * k, ph: Math.random() * 6 });
  };

  FX.burst = function (type, x, y, z, n, spread, up, scale = 1, base) {
    for (let i = 0; i < n; i++) {
      FX.spawn(type, x + frand(-0.3, 0.3), y + frand(0, 0.3), z + frand(-0.3, 0.3),
        (base ? base.x : 0) + frand(-spread, spread), (base ? base.y : 0) + frand(up * 0.4, up), (base ? base.z : 0) + frand(-spread, spread), scale);
    }
  };

  FX.skidmark = function (i, p, n, dirx, dirz, alpha, rgb) {
    const s = FX.skid;
    const last = s.last[i];
    const cur = { x: p.x + n.x * 0.03, y: p.y + n.y * 0.03, z: p.z + n.z * 0.03 };
    if (!last || alpha <= 0.02) { s.last[i] = alpha > 0.02 ? { ...cur, dx: dirx, dz: dirz } : null; return; }
    const d = Math.hypot(cur.x - last.x, cur.z - last.z);
    if (d < 0.3) return;
    if (d > 3) { s.last[i] = { ...cur, dx: dirx, dz: dirz }; return; }
    const w = 0.12;
    const q = s.head;
    const b = q * 4;
    const sx = -dirz * w, sz = dirx * w, lx = -last.dz * w, lz = last.dx * w;
    const P = s.pos, C = s.col;
    const put = (k, x, y, z, a) => { P[(b + k) * 3] = x; P[(b + k) * 3 + 1] = y; P[(b + k) * 3 + 2] = z; C[(b + k) * 4] = rgb[0]; C[(b + k) * 4 + 1] = rgb[1]; C[(b + k) * 4 + 2] = rgb[2]; C[(b + k) * 4 + 3] = a; };
    put(0, last.x + lx, last.y, last.z + lz, alpha);
    put(1, last.x - lx, last.y, last.z - lz, alpha);
    put(2, cur.x + sx, cur.y, cur.z + sz, alpha);
    put(3, cur.x - sx, cur.y, cur.z - sz, alpha);
    s.head = (s.head + 1) % s.N;
    s.count = Math.min(s.N, s.count + 1);
    s.dirty = true;
    s.last[i] = { ...cur, dx: dirx, dz: dirz };
  };

  // simple rigid debris (detached parts, chunks)
  FX.addDebris = function (mesh, pos, vel, spin, life = 12) {
    FX.debris.push({ mesh, pos: pos.clone(), vel: vel.clone(), spin: spin.clone(), life, rest: false });
  };

  FX.update = function (dt, camera, renderer) {
    const scale = renderer.domElement.height / (2 * Math.tan((camera.fov * PI) / 360));
    for (const pool of Object.values(FX.pools)) {
      pool.mat.uniforms.uScale.value = scale;
      const P = pool.P;
      let n = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        p.t += dt;
        if (p.t >= p.life) continue;
        const pr = p.pr;
        const dr = Math.exp(-pr.drag * dt);
        p.vx *= dr; p.vy *= dr; p.vz *= dr;
        p.vy -= pr.g * dt;
        if (pr.flutter) { p.vx += Math.sin(p.t * 5 + p.ph) * dt * 4; p.vz += Math.cos(p.t * 4 + p.ph) * dt * 4; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (pr.hard) {
          const gh = WORLD.heightAt(p.x, p.z);
          if (p.y < gh) { p.y = gh; p.vy *= -0.2; p.vx *= 0.5; p.vz *= 0.5; }
        }
        const t = p.t / p.life;
        P[n++] = p;
        const j = n - 1;
        pool.pos[j * 3] = p.x; pool.pos[j * 3 + 1] = p.y; pool.pos[j * 3 + 2] = p.z;
        const fade = pr.hard ? 1 - smoothstep(0.75, 1, t) : Math.sin(Math.min(1, t * 4) * PI / 2) * (1 - t);
        pool.col[j * 4] = p.r; pool.col[j * 4 + 1] = p.g; pool.col[j * 4 + 2] = p.b; pool.col[j * 4 + 3] = pr.a * fade;
        pool.size[j] = lerp(pr.s0, pr.s1, Math.sqrt(t)) * p.sc;
      }
      P.length = n;
      pool.geo.setDrawRange(0, n);
      pool.geo.attributes.position.needsUpdate = true;
      pool.geo.attributes.pcol.needsUpdate = true;
      pool.geo.attributes.psize.needsUpdate = true;
    }
    const s = FX.skid;
    if (s.dirty) { s.geo.attributes.position.needsUpdate = true; s.geo.attributes.color.needsUpdate = true; s.dirty = false; }
    // debris
    for (let i = FX.debris.length - 1; i >= 0; i--) {
      const d = FX.debris[i];
      d.life -= dt;
      if (!d.rest) {
        d.vel.y -= 9.81 * dt;
        d.pos.addScaledVector(d.vel, dt);
        const gh = WORLD.heightAt(d.pos.x, d.pos.z) + 0.1;
        if (d.pos.y < gh) {
          d.pos.y = gh;
          if (Math.abs(d.vel.y) < 1.2 && d.vel.length() < 2) { d.rest = true; }
          d.vel.y = Math.abs(d.vel.y) * 0.3; d.vel.x *= 0.6; d.vel.z *= 0.6; d.spin.multiplyScalar(0.6);
        }
        d.mesh.position.copy(d.pos);
        d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
      }
      if (d.life <= 0) { d.mesh.parent && d.mesh.parent.remove(d.mesh); FX.debris.splice(i, 1); }
    }
  };
})();
