'use strict';
// ============================================================ landmarks and stage furniture
const PROPS = { checkpoints: [], start: null, braziers: [] };

(function () {
  const V3 = THREE.Vector3;
  const M4 = THREE.Matrix4;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const mat = (x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) => new M4().compose(new V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yaw), new V3(sx, sy, sz));

  function addBoxObstacle(x, z, hx, hz, yaw, y0, y1) {
    OBST.add({ type: 'box', x, z, hx, hz, r: 0, c: Math.cos(yaw), s: Math.sin(yaw), y0, y1, y: y0 });
  }

  function bannerTexture(text, bg, fg, w = 1024, h = 160) {
    return canvasTexture(w, h, (ctx) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      // checker edges
      const sq = h / 4;
      for (let i = 0; i < w / sq; i++) for (let j = 0; j < 4; j++) {
        if ((i + j) % 2 && (i < 4 || i > w / sq - 5)) { ctx.fillStyle = fg; ctx.fillRect(i * sq, j * sq, sq, sq); }
      }
      ctx.fillStyle = fg;
      ctx.font = `italic 800 ${Math.round(h * 0.62)}px "Saira Condensed", "Arial Narrow", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h * 0.54);
    }, { clamp: true });
  }

  function chevronTexture() {
    return canvasTexture(256, 128, (ctx) => {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#f2c01e';
      for (let k = 0; k < 3; k++) {
        const x = 30 + k * 72;
        ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x + 40, 64); ctx.lineTo(x, 114); ctx.lineTo(x + 24, 114); ctx.lineTo(x + 64, 64); ctx.lineTo(x + 24, 14); ctx.fill();
      }
    }, { clamp: true });
  }

  PROPS.build = function (scene) {
    const stoneMat = new THREE.MeshStandardMaterial({ map: TEX.stone, roughness: 0.92, vertexColors: true });
    const woodMat = new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.85, vertexColors: true });
    const thatchMat = new THREE.MeshStandardMaterial({ map: TEX.thatch, roughness: 1, vertexColors: true });
    const stone = new GeoBuilder(1), wood = new GeoBuilder(1), thatch = new GeoBuilder(1);
    const white = new THREE.Color(1, 1, 1);
    const P = WORLD.plaza;

    // ------------------------------------------------ temple
    {
      const tx = 52, tz = 52, base = WORLD.heightAt(tx, tz) - 0.6;
      const tiers = 5, th = 3.4;
      for (let i = 0; i < tiers; i++) {
        const s = 32 - i * 5.5;
        stone.addGeometry(box(s, th, s), mat(tx, base + th * (i + 0.5), tz), new THREE.Color(1, 1, 1).multiplyScalar(0.9 + i * 0.03), 0, [0, 0, s / 8, th / 8]);
        addBoxObstacle(tx, tz, s / 2, s / 2, 0, base, base + th * (i + 1));
        // overhang lip
        stone.addGeometry(box(s + 0.6, 0.35, s + 0.6), mat(tx, base + th * (i + 1) - 0.18, tz), white.clone().multiplyScalar(0.8), 0, [0, 0, s / 8, 0.05]);
      }
      // stairs on the -x face, climbing to the top tier
      const top = base + th * tiers;
      const steps = 34, x0 = tx - 22, run = 17 / steps;
      for (let k = 0; k < steps; k++) {
        const hgt = (k + 1) * (top - base) / steps;
        stone.addGeometry(box(run, hgt, 6.5), mat(x0 + (k + 0.5) * run, base + hgt / 2, tz), white.clone().multiplyScalar(0.95), 0, [0, 0, 0.1, hgt / 8]);
      }
      addBoxObstacle(tx - 19, tz, 3, 3.3, 0, base, top);
      // shrine
      stone.addGeometry(box(8, 5.5, 8), mat(tx, top + 2.75, tz), white, 0, [0, 0, 1, 0.7]);
      stone.addGeometry(box(9.5, 0.7, 9.5), mat(tx, top + 5.85, tz), white.clone().multiplyScalar(0.8), 0, [0, 0, 1.2, 0.1]);
      stone.addGeometry(box(6, 2.2, 6), mat(tx, top + 7.3, tz), white.clone().multiplyScalar(0.85), 0, [0, 0, 0.8, 0.3]);
      stone.addGeometry(box(0.4, 3.4, 2.6), mat(tx - 4.05, top + 1.7, tz), new THREE.Color(0.05, 0.05, 0.05), 0, [0, 0, 0.1, 0.1]);
      for (const s of [-1, 1]) {
        stone.addGeometry(box(0.7, 1.4, 0.7), mat(tx - 4.55, top + 0.7, tz + s * 2.6), white, 0, [0, 0, 0.2, 0.2]);
        PROPS.braziers.push(new V3(tx - 4.55, top + 1.6, tz + s * 2.6));
      }
      PROPS_KEEPOUT.push({ x: tx, z: tz, r: 30 }, { x: tx - 19, z: tz, r: 8 });
      PROPS.temple = { x: tx, z: tz, top };
    }
    // ------------------------------------------------ giant stone head
    {
      const hx = -46, hz = -40, b = WORLD.heightAt(hx, hz) - 0.4, yaw = Math.atan2(-hx, -hz);
      const T = (x, y, z, ry = 0) => { const m = new M4().makeRotationY(yaw); m.setPosition(hx, b, hz); return m.multiply(mat(x, y, z, ry)); };
      const g = white.clone().multiplyScalar(0.95);
      stone.addGeometry(box(7, 2, 7), T(0, 1, 0), g, 0, [0, 0, 1, 0.3]);
      stone.addGeometry(box(5.4, 7, 5), T(0, 5.5, 0), g, 0, [0, 0, 0.8, 1]);
      stone.addGeometry(box(5.8, 1.1, 1.2), T(0, 7.0, 2.5), g, 0, [0, 0, 0.7, 0.15]);
      stone.addGeometry(box(1.3, 2.6, 1.4), T(0, 5.4, 3.0), g, 0, [0, 0, 0.2, 0.3]);
      for (const s of [-1, 1]) {
        stone.addGeometry(box(1.4, 0.8, 0.4), T(s * 1.3, 6.3, 2.45), new THREE.Color(0.12, 0.12, 0.1), 0, [0, 0, 0.1, 0.1]);
        stone.addGeometry(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 12), T(s * 3.0, 5.5, 0).multiply(new M4().makeRotationZ(PI / 2)), g, 0, [0, 0, 0.3, 0.3]);
      }
      stone.addGeometry(box(3, 0.5, 0.5), T(0, 3.4, 2.4), new THREE.Color(0.15, 0.14, 0.12), 0, [0, 0, 0.3, 0.1]);
      stone.addGeometry(box(6.4, 1.6, 5.6), T(0, 9.8, -0.2), g, 0, [0, 0, 0.8, 0.2]);
      for (let k = -2; k <= 2; k++) stone.addGeometry(box(0.7, 2.4, 0.7), T(k * 1.3, 11.6, 1.6), g, 0, [0, 0, 0.1, 0.3]);
      addBoxObstacle(hx, hz, 3.6, 3.6, yaw, b, b + 12);
      PROPS_KEEPOUT.push({ x: hx, z: hz, r: 9 });
    }
    // ------------------------------------------------ plaza pillars
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + 0.12;
      const near = [0, PI / 2, PI, -PI / 2].some((r) => Math.abs(wrapAngle(a - r)) < 0.3);
      if (near) continue;
      const R = P.r - 8 + (k % 2) * 6;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      if (Math.hypot(x - 52, z - 52) < 26 || Math.hypot(x + 46, z + 40) < 9) continue;
      const b = WORLD.heightAt(x, z) - 0.3;
      const hgt = k % 3 === 0 ? rnd(1.5, 3) : rnd(5, 8);
      stone.addGeometry(box(1.8, 0.6, 1.8), mat(x, b + 0.3, z), white, 0, [0, 0, 0.25, 0.08]);
      stone.addGeometry(new THREE.CylinderGeometry(0.7, 0.8, hgt, 10), mat(x, b + 0.6 + hgt / 2, z), white, 0, [0, 0, 1, hgt / 6]);
      if (hgt > 4) stone.addGeometry(box(2, 0.6, 2), mat(x, b + 0.9 + hgt, z, rnd(0, 1)), white, 0, [0, 0, 0.25, 0.08]);
      OBST.add({ type: 'post', x, z, y: b, r: 0.9, h: hgt + 1 });
      PROPS_KEEPOUT.push({ x, z, r: 3 });
    }
    // ------------------------------------------------ stone arch over the stage
    const loop = WORLD.roads[0];
    {
      const n = loop.pts.length;
      let i = Math.floor(n * 0.3);
      // avoid jumps/bridges
      for (let tries = 0; tries < 50; tries++) {
        const p = loop.pts[i];
        const bad = WORLD.jumps.some((j) => Math.hypot(j.x - p.x, j.z - p.z) < 80) || loop.bridge[i];
        if (!bad) break;
        i = (i + 20) % n;
      }
      const p = WORLD.roadPoint(loop, i);
      const nx = -p.tz, nz = p.tx, yaw = Math.atan2(p.tx, p.tz);
      const off = WORLD.HW + 2.6;
      for (const s of [-1, 1]) {
        const x = p.x + nx * off * s, z = p.z + nz * off * s, b = WORLD.heightAt(x, z) - 0.5;
        stone.addGeometry(box(2.2, 9.5, 2.6), mat(x, b + 4.75, z, yaw), white, 0, [0, 0, 0.3, 1.2]);
        stone.addGeometry(box(2.8, 0.8, 3.2), mat(x, b + 0.4, z, yaw), white.clone().multiplyScalar(0.8), 0, [0, 0, 0.3, 0.1]);
        addBoxObstacle(x, z, 1.1, 1.3, yaw, b, b + 9.5);
        PROPS_KEEPOUT.push({ x, z, r: 4 });
      }
      const top = p.h + 9.2;
      stone.addGeometry(box(off * 2 + 3.4, 2.0, 3.0), mat(p.x, top, p.z, yaw), white, 0, [0, 0, 2, 0.25]);
      stone.addGeometry(box(off * 2 + 4.4, 0.6, 3.6), mat(p.x, top + 1.3, p.z, yaw), white.clone().multiplyScalar(0.85), 0, [0, 0, 2, 0.08]);
      PROPS.arch = { i, x: p.x, z: p.z };
    }
    // ------------------------------------------------ bridges
    for (const b of WORLD.bridges) {
      const dx = b.b.x - b.a.x, dz = b.b.z - b.a.z, L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L, yaw = Math.atan2(ux, uz);
      const cx = (b.a.x + b.b.x) / 2, cz = (b.a.z + b.b.z) / 2;
      const top = b.top + 0.18;
      wood.addGeometry(box(9.4, 0.45, L + 2), mat(cx, top - 0.225, cz, yaw), white, 0, [0, 0, 1.6, (L + 2) / 6]);
      for (const s of [-1, 1]) {
        const ox = uz * 3.2 * s, oz = -ux * 3.2 * s;
        wood.addGeometry(box(0.6, 0.8, L + 2), mat(cx + ox, top - 0.85, cz + oz, yaw), white.clone().multiplyScalar(0.7), 0, [0, 0, 0.1, (L + 2) / 6]);
        // rails
        const rx = uz * 4.75 * s, rz = -ux * 4.75 * s;
        wood.addGeometry(box(0.22, 0.25, L + 2), mat(cx + rx, top + 1.05, cz + rz, yaw), white, 0, [0, 0, 0.05, (L + 2) / 6]);
        wood.addGeometry(box(0.18, 0.2, L + 2), mat(cx + rx, top + 0.55, cz + rz, yaw), white.clone().multiplyScalar(0.85), 0, [0, 0, 0.05, (L + 2) / 6]);
        for (let t = -L / 2; t <= L / 2; t += 2.4) {
          const px = cx + ux * t + rx, pz = cz + uz * t + rz;
          wood.addGeometry(box(0.3, 1.3, 0.3), mat(px, top + 0.55, pz, yaw), white.clone().multiplyScalar(0.8), 0, [0, 0, 0.05, 0.2]);
          OBST.add({ type: 'post', x: px, z: pz, y: top - 0.2, r: 0.32, h: 1.6 });
        }
      }
      for (let t = -L / 2 + 6; t < L / 2 - 4; t += 9) {
        for (const s of [-1, 1]) {
          const px = cx + ux * t + uz * 3.4 * s, pz = cz + uz * t - ux * 3.4 * s;
          const gh = WORLD.heightAt(px, pz);
          if (gh > top - 1) continue;
          const hh = top - 0.6 - gh + 1;
          stone.addGeometry(box(1.4, hh, 1.4), mat(px, gh - 1 + hh / 2, pz, yaw), white.clone().multiplyScalar(0.75), 0, [0, 0, 0.2, hh / 6]);
        }
      }
    }
    // ------------------------------------------------ stilt village by the west ford
    {
      const ford = WORLD.fords.find((f) => f.road === 'loop' && f.x < 0) || WORLD.fords[0];
      if (ford) {
        const near = WORLD.nearestRoad(ford.x, ford.z, true);
        let made = 0;
        for (let k = -90; k <= 90 && made < 7; k += 12) {
          const p = WORLD.roadPoint(loop, near.i + k);
          for (const s of [-1, 1]) {
            if (made >= 7) break;
            const off = rnd(16, 26) * s;
            const x = p.x - p.tz * off, z = p.z + p.tx * off;
            const g = WORLD.sample(x, z, -999);
            if (g.h < WORLD.WATER + 0.6 || g.ny < 0.9) continue;
            if (WORLD.bilinear(WORLD.rd, x, z) < WORLD.HW + 6) continue;
            if (PROPS_KEEPOUT.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 4)) continue;
            const yaw = Math.atan2(p.tx, p.tz) + (s > 0 ? 0 : PI) + rnd(-0.3, 0.3);
            const b = g.h;
            const H = (x2, y2, z2, ry = 0) => { const m = new M4().makeRotationY(yaw); m.setPosition(x, b, z); return m.multiply(mat(x2, y2, z2, ry)); };
            for (const a of [-1.8, 1.8]) for (const c of [-1.8, 1.8]) wood.addGeometry(box(0.25, 2.2, 0.25), H(a, 1.1, c), white.clone().multiplyScalar(0.6), 0, [0, 0, 0.05, 0.3]);
            wood.addGeometry(box(4.6, 0.25, 4.6), H(0, 2.2, 0), white, 0, [0, 0, 0.8, 0.8]);
            wood.addGeometry(box(4.2, 2.2, 4.2), H(0, 3.4, 0), white.clone().multiplyScalar(0.9), 0, [0, 0, 0.7, 0.4]);
            wood.addGeometry(box(1.0, 1.6, 0.1), H(0, 3.1, 2.13), new THREE.Color(0.12, 0.08, 0.05), 0, [0, 0, 0.1, 0.1]);
            for (let r = 0; r < 6; r++) wood.addGeometry(box(1.2, 0.08, 0.3), H(0, 0.2 + r * 0.35, 2.6 + (5 - r) * 0.12), white.clone().multiplyScalar(0.7), 0, [0, 0, 0.1, 0.02]);
            const roof = new THREE.ConeGeometry(4.3, 3.0, 4, 1, true);
            thatch.addGeometry(roof, H(0, 6.0, 0, PI / 4), white, 0, [0, 0, 3, 1]);
            addBoxObstacle(x, z, 2.4, 2.4, yaw, b, b + 7);
            PROPS_KEEPOUT.push({ x, z, r: 6 });
            made++;
          }
        }
      }
    }
    // ------------------------------------------------ checkpoints on the loop
    {
      const n = loop.pts.length;
      const spacing = 560;
      const count = Math.floor(loop.length / spacing);
      const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTexture('CHECKPOINT', '#f0bf2c', '#141414'), roughness: 0.6 });
      const startMat = new THREE.MeshStandardMaterial({ map: bannerTexture('BEAST STAGE · START', '#141414', '#f0bf2c'), roughness: 0.6 });
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0xe8611a, roughness: 0.55 });
      const group = new THREE.Group();
      for (let c = 0; c <= count - 1; c++) {
        let i = Math.round((c * spacing) / loop.length * n) % n;
        let tries = 0;
        while (tries++ < 40 && (loop.bridge[i] || WORLD.jumps.some((j) => Math.hypot(j.x - loop.pts[i].x, j.z - loop.pts[i].z) < 50))) i = (i + 6) % n;
        const p = WORLD.roadPoint(loop, i);
        const nx = -p.tz, nz = p.tx, yaw = Math.atan2(p.tx, p.tz);
        const off = WORLD.HW + 1.6;
        const g = new THREE.Group();
        for (const s of [-1, 1]) {
          const x = p.x + nx * off * s, z = p.z + nz * off * s, b = WORLD.heightAt(x, z);
          const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 6.4, 12), pillarMat);
          pil.position.set(x, b + 3.2, z); pil.castShadow = true;
          g.add(pil);
          OBST.add({ type: 'post', x, z, y: b, r: 0.5, h: 6.5 });
          PROPS_KEEPOUT.push({ x, z, r: 2.5 });
        }
        // two single-sided faces so the text reads correctly from both directions
        const ban = new THREE.Group();
        for (const face of [0, PI]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(off * 2, 1.25), c === 0 ? startMat : bannerMat);
          m.rotation.y = face; m.position.z = face ? -0.02 : 0.02;
          ban.add(m);
        }
        ban.position.set(p.x, p.h + 5.6, p.z);
        ban.rotation.y = yaw;
        g.add(ban);
        group.add(g);
        PROPS.checkpoints.push({ i, x: p.x, z: p.z, h: p.h, tx: p.tx, tz: p.tz, group: g, banner: ban, index: c });
      }
      scene.add(group);
    }
    // ------------------------------------------------ chevron warning signs at tight corners
    {
      const signMat = new THREE.MeshStandardMaterial({ map: chevronTexture(), roughness: 0.5 });
      const sg = new GeoBuilder(2);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
      const n = loop.pts.length;
      let last = -999;
      const heading = (i) => Math.atan2(loop.fr[(i + n) % n].tz, loop.fr[(i + n) % n].tx);
      for (let i = 0; i < n; i += 3) {
        const turn = wrapAngle(heading(i + 10) - heading(i - 10));
        const R = 40 / Math.max(1e-3, Math.abs(turn));
        if (R > 48 || i - last < 35 || loop.bridge[i]) continue;
        last = i;
        const p = WORLD.roadPoint(loop, i);
        const outer = turn > 0 ? -1 : 1; // heading angle increasing = right-hand corner; sign goes on the outside
        const off = (WORLD.HW + 2.2) * outer;
        const x = p.x - p.tz * off, z = p.z + p.tx * off;
        if (PROPS_KEEPOUT.some((q) => Math.hypot(q.x - x, q.z - z) < q.r)) continue;
        const b = WORLD.heightAt(x, z);
        const yaw = Math.atan2(p.tx, p.tz);
        // board faces oncoming traffic both ways; flip texture so arrows point into the corner
        for (const face of [0, PI]) {
          const m = mat(x, b + 1.4, z, yaw + face);
          const flip = (turn > 0) === (face === 0);
          const plane = new THREE.PlaneGeometry(1.6, 0.8);
          if (flip) { const uv = plane.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setX(q, 1 - uv.getX(q)); }
          m.multiply(new M4().makeTranslation(0, 0, 0.05));
          sg.addGeometry(plane, m, white, 1);
        }
        sg.addGeometry(box(0.1, 1.9, 0.1), mat(x, b + 0.95, z), white, 0);
      }
      const signs = new THREE.Mesh(sg.build(), [postMat, signMat]);
      signs.castShadow = true;
      scene.add(signs);
    }

    for (const [g, m] of [[stone, stoneMat], [wood, woodMat], [thatch, thatchMat]]) {
      if (!g.count) continue;
      const mesh = new THREE.Mesh(g.build(), m);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    }
  };
})();
