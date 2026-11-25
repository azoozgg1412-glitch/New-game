'use strict';
// ============================================================ THE BEAST
const BEAST = {
  pos: new THREE.Vector3(), yaw: 0, speed: 0, state: 'dormant', stateT: 0,
  phase: 0, trailIdx: 0, cooldown: 0, active: false, roarT: 0, stunT: 0,
  events: [], lookYaw: 0, lookPitch: 0, jaw: 0, rear: 0, swipe: 0, pitch: 0, roll: 0,
  hitDone: false, lastStep: [0, 0, 0, 0], targetSpeed: 0, dist: 999, trailDist: 0,
};

(function () {
  const V3 = THREE.Vector3;
  function buildModel() {
    const skin = new THREE.MeshStandardMaterial({
      map: TEX.skin, emissiveMap: TEX.skinGlow, emissive: new THREE.Color(1, 0.42, 0.1), emissiveIntensity: 1.0,
      roughness: 0.82, metalness: 0.02,
    });
    TEX.skin.repeat.set(2, 2); TEX.skinGlow.repeat.set(2, 2);
    // limbs wrap the texture around a long thin shape: give them their own repeat
    const limbMap = TEX.skin.clone(), limbGlow = TEX.skinGlow.clone();
    limbMap.repeat.set(2, 3); limbGlow.repeat.set(2, 3); limbMap.needsUpdate = true; limbGlow.needsUpdate = true;
    const limbSkin = skin.clone(); limbSkin.map = limbMap; limbSkin.emissiveMap = limbGlow;
    const belly = new THREE.MeshStandardMaterial({ map: TEX.skin, color: 0x9a8a70, roughness: 0.9 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 0.45 });
    const darkBone = new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.6 });
    const mouth = new THREE.MeshStandardMaterial({ color: 0x4a0d0b, roughness: 0.6, emissive: 0x200000 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb030 });
    eyeMat.toneMapped = false;
    const vine = new THREE.MeshStandardMaterial({ color: 0x3d5a22, roughness: 0.9 });
    const glowTex = canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,210,120,1)'); g.addColorStop(0.25, 'rgba(255,140,40,0.6)'); g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    }, { clamp: true });
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

    const blob = (rx, ry, rz, mat, lump = 0.12, seg = 24) => {
      const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
      g.scale(rx, ry, rz);
      lumpify(g, lump * Math.min(rx, ry, rz), 1.4 / Math.min(rx, ry, rz), Math.floor(rx * 100 + rz * 10));
      const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
    };
    const capsule = (r, len, mat, lump = 0.1) => {
      const g = new THREE.CapsuleGeometry(r, len, 6, 14);
      g.translate(0, -len / 2, 0);
      lumpify(g, lump * r, 1.6 / r, Math.floor(r * 77 + len * 13));
      const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
    };
    // muscular limb segment: lathe profile that bulges near the top and tapers to the joint
    const limbSeg = (r, len, mat, bulge = 0.35, taper = 0.45) => {
      const prof = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const rr = r * (1 - taper * t) * (0.82 + bulge * Math.sin(PI * Math.pow(t, 0.7)));
        prof.push(new THREE.Vector2(Math.max(0.02, rr * (i === 0 || i === N ? 0.55 : 1)), -t * len));
      }
      prof.unshift(new THREE.Vector2(0.001, r * 0.35)); prof.push(new THREE.Vector2(0.001, -len - r * 0.25));
      const g = new THREE.LatheGeometry(prof, 18);
      lumpify(g, 0.1 * r, 1.5 / r, Math.floor(r * 91 + len * 7));
      const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
    };
    const cone = (r, h, mat) => { const g = new THREE.ConeGeometry(r, h, 8); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };

    const root = new THREE.Group();
    const body = new THREE.Group(); body.position.set(0, 5.0, 0); root.add(body);
    // torso
    const torso = blob(2.7, 2.5, 4.2, skin, 0.14); torso.position.set(0, 0.3, 0.2); body.add(torso);
    const chest = blob(3.2, 3.0, 2.7, skin, 0.12); chest.position.set(0, 0.7, 2.5); body.add(chest);
    const gut = blob(2.2, 1.9, 3.0, belly, 0.08); gut.position.set(0, -0.9, 0.6); body.add(gut);
    const haunch = blob(2.4, 2.2, 2.2, skin, 0.12); haunch.position.set(0, 0.1, -2.9); body.add(haunch);
    // spines along the back
    for (let k = 0; k < 11; k++) {
      const t = k / 10;
      const c = cone(0.42 - t * 0.22, 2.6 - t * 1.5, k % 3 === 0 ? darkBone : bone);
      c.position.set(0, 2.9 - t * 0.9 + Math.sin(t * PI) * 0.6, 3.0 - t * 6.4);
      c.rotation.x = -0.6 - t * 0.3;
      body.add(c);
      if (k % 3 === 0) for (const s of [-1, 1]) {
        const c2 = cone(0.18, 1.1, darkBone); c2.position.set(s * 1.1, 2.4 - t * 0.7, 2.6 - t * 6); c2.rotation.set(-0.7, 0, s * 0.6); body.add(c2);
      }
    }
    // hanging vines / moss strands
    for (let k = 0; k < 14; k++) {
      const x = rnd(-2.2, 2.2), z = rnd(-3, 3);
      const pts = [], radii = [];
      const len = rnd(1.5, 3.5);
      const topY = 2.2 - Math.abs(x) * 0.5;
      for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new V3(x * (1 + t * 0.15), topY - t * len, z + Math.sin(t * 3) * 0.2)); radii.push(0.07 * (1 - t * 0.6)); }
      const m = new THREE.Mesh(tubeGeometry(pts, radii, 4), vine); body.add(m);
    }
    // neck + head
    const neck = new THREE.Group(); neck.position.set(0, 1.4, 4.2); body.add(neck);
    const neckM = capsule(1.25, 1.4, skin); neckM.rotation.x = -PI / 2 + 0.4; neckM.position.set(0, 0, 0); neck.add(neckM);
    const head = new THREE.Group(); head.position.set(0, 0.2, 1.5); neck.add(head);
    const skull = blob(1.6, 1.35, 1.9, skin, 0.12); skull.position.set(0, 0.45, 0.6); head.add(skull);
    const brow = blob(1.7, 0.45, 0.7, skin, 0.2); brow.position.set(0, 1.25, 1.5); head.add(brow);
    const snout = blob(1.0, 0.58, 2.0, skin, 0.12); snout.position.set(0, 0.28, 2.5); head.add(snout);
    for (const s of [-1, 1]) { const nost = blob(0.16, 0.1, 0.12, mouth, 0.02, 8); nost.position.set(s * 0.35, 0.72, 4.15); head.add(nost); }
    const mouthIn = blob(1.0, 0.5, 1.4, mouth, 0.02, 16); mouthIn.position.set(0, -0.1, 2.0); head.add(mouthIn);
    for (const s of [-1, 1]) {
      // horns
      const hp = [], hr = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; hp.push(new V3(s * (1.1 + t * 1.6), 1.3 + Math.sin(t * 2.2) * 1.3, 0.6 - t * 2.4)); hr.push(0.32 * (1 - t * 0.9)); }
      const horn = new THREE.Mesh(tubeGeometry(hp, hr, 8), bone); horn.castShadow = true; head.add(horn);
      // eyes: two pairs
      for (const [ex, ey, ez, er] of [[0.95, 0.95, 1.8, 0.22], [1.15, 0.6, 1.45, 0.15]]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(er, 12, 8), eyeMat);
        eye.position.set(s * ex, ey, ez); head.add(eye);
        const glow = new THREE.Sprite(glowMat); glow.scale.set(er * 7, er * 7, 1); glow.position.copy(eye.position); glow.position.z += 0.1; head.add(glow);
      }
      // upper teeth
      for (let k = 0; k < 6; k++) {
        const t = cone(0.09, 0.55 - k * 0.04, bone); t.rotation.x = PI; t.position.set(s * (0.85 - k * 0.04), -0.2, 1.4 + k * 0.33); head.add(t);
      }
    }
    for (let k = 0; k < 3; k++) { const t = cone(0.1, 0.6, bone); t.rotation.x = PI; t.position.set((k - 1) * 0.35, -0.2, 3.7); head.add(t); }
    // jaw
    const jaw = new THREE.Group(); jaw.position.set(0, -0.15, 0.9); head.add(jaw);
    const jawM = blob(1.05, 0.42, 1.65, skin, 0.08); jawM.position.set(0, -0.3, 1.3); jaw.add(jawM);
    const tongue = blob(0.55, 0.2, 1.1, mouth, 0.05, 12); tongue.position.set(0, 0.0, 1.2); jaw.add(tongue);
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {
      const t = cone(0.09, 0.5 + (k === 5 ? 0.35 : 0), bone); t.position.set(s * (0.82 - k * 0.06), 0.1, 0.4 + k * 0.4); jaw.add(t);
    }
    // arms (front limbs)
    const limbs = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 2.75, 0.7, 2.6); body.add(sh);
      const shoulderM = blob(1.4, 1.3, 1.4, skin, 0.12); sh.add(shoulderM);
      const up = limbSeg(1.15, 3.1, limbSkin, 0.45, 0.4); up.rotation.z = s * 0.12; sh.add(up);
      const elbow = new THREE.Group(); elbow.position.set(s * 0.38, -3.2, 0); sh.add(elbow);
      const elbowM = blob(0.85, 0.8, 0.85, limbSkin, 0.15); elbow.add(elbowM);
      const fore = limbSeg(1.2, 3.1, limbSkin, 0.5, 0.5); elbow.add(fore);
      const hand = new THREE.Group(); hand.position.set(0, -3.3, 0); elbow.add(hand);
      const palm = blob(1.15, 0.65, 1.3, skin, 0.12); palm.position.set(0, 0.05, 0.35); hand.add(palm);
      for (let k = -1; k <= 1; k++) {
        const kn = blob(0.32, 0.3, 0.4, skin, 0.1, 10); kn.position.set(k * 0.55, 0.05, 1.3); hand.add(kn);
        const cl = cone(0.2, 1.4, darkBone); cl.rotation.x = PI / 2 + 0.75; cl.position.set(k * 0.55, -0.35, 1.75); hand.add(cl);
      }
      limbs.push({ kind: 'arm', s, root: sh, mid: elbow, end: hand });
    }
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 2.1, -0.2, -3.1); body.add(hip);
      const thigh = limbSeg(1.45, 2.8, limbSkin, 0.5, 0.45); hip.add(thigh);
      const knee = new THREE.Group(); knee.position.set(0, -2.8, 0); hip.add(knee);
      const kneeM = blob(0.75, 0.7, 0.8, limbSkin, 0.15); knee.add(kneeM);
      const shin = limbSeg(0.85, 2.5, limbSkin, 0.4, 0.5); knee.add(shin);
      const foot = new THREE.Group(); foot.position.set(0, -2.6, 0); knee.add(foot);
      const fm = blob(0.75, 0.42, 1.3, skin, 0.1); fm.position.set(0, 0, 0.6); foot.add(fm);
      for (let k = -1; k <= 1; k++) { const cl = cone(0.14, 0.9, darkBone); cl.rotation.x = PI / 2; cl.position.set(k * 0.35, -0.2, 1.8); foot.add(cl); }
      limbs.push({ kind: 'leg', s, root: hip, mid: knee, end: foot });
    }
    // tail
    const tail = [];
    let parent = body;
    let z0 = -4.3;
    for (let k = 0; k < 8; k++) {
      const seg = new THREE.Group();
      seg.position.set(0, k === 0 ? -0.2 : 0, k === 0 ? z0 : -1.3);
      parent.add(seg);
      const r = 1.1 * (1 - k / 9);
      const m = capsule(r, 1.2, limbSkin, 0.08); m.rotation.x = PI / 2; seg.add(m);
      if (k % 2 === 0) { const c = cone(r * 0.4, r * 1.4, darkBone); c.position.set(0, r * 0.9, -0.5); c.rotation.x = -0.7; seg.add(c); }
      tail.push(seg);
      parent = seg;
    }
    const light = new THREE.PointLight(0xff7a20, 14, 34, 1.6);
    light.position.set(0, 1.4, 5.2); head.add(light);
    return { root, body, neck, head, jaw, limbs, tail, skin, light };
  }

  BEAST.build = function (scene) {
    BEAST.model = buildModel();
    BEAST.model.root.scale.setScalar(1.0);
    scene.add(BEAST.model.root);
    BEAST.model.root.visible = false;
  };

  BEAST.reset = function (x, z, yaw, active) {
    BEAST.pos.set(x, WORLD.heightAt(x, z), z);
    BEAST.yaw = yaw; BEAST.speed = 0; BEAST.state = active ? 'dormant' : 'off';
    BEAST.stateT = 0; BEAST.cooldown = 2; BEAST.trailIdx = 0; BEAST.active = active;
    BEAST.model.root.visible = active; BEAST.stunT = 0; BEAST.rear = 0; BEAST.jaw = 0;
    BEAST.roarT = 8; BEAST.events.length = 0;
  };

  BEAST.roar = function (big = true) {
    BEAST.events.push({ type: 'roar', big });
    BEAST.jawTarget = 1; BEAST.roarAnim = 1.8;
  };

  BEAST.stun = function () {
    if (BEAST.state === 'stunned') return;
    BEAST.state = 'stunned'; BEAST.stateT = 0;
    BEAST.events.push({ type: 'roar', big: true, pain: true });
    BEAST.roarAnim = 2.2;
  };

  const tmp = new V3();
  BEAST.update = function (dt, car, game) {
    if (!BEAST.active) return;
    const m = BEAST.model;
    BEAST.stateT += dt;
    if (BEAST.cooldown > 0) BEAST.cooldown -= dt;
    const dx = car.pos.x - BEAST.pos.x, dz = car.pos.z - BEAST.pos.z;
    const dist = Math.hypot(dx, dz);
    BEAST.dist = dist;
    let target = null;
    let desired = 0;
    const diff = game.difficulty;
    const base = (diff === 'easy' ? 16 : diff === 'hard' ? 24 : 19.5) + Math.min(game.time * 0.011, diff === 'easy' ? 4 : 7);
    // distance along the player's trail between beast and car
    const trail = game.trail;
    if (game.over && BEAST.state !== 'feast' && BEAST.state !== 'attack') { BEAST.state = 'feast'; BEAST.stateT = 0; BEAST.roarT = 0.8; }
    switch (BEAST.state) {
      case 'dormant':
        if (BEAST.stateT > 0.2 && !BEAST.didIntroRoar) { BEAST.roar(true); BEAST.didIntroRoar = true; }
        desired = 0;
        if (game.started) { BEAST.state = 'chase'; BEAST.stateT = 0; BEAST.didIntroRoar = false; }
        break;
      case 'chase': {
        // follow trail; cut straight in when close
        while (BEAST.trailIdx < trail.length - 1 && Math.hypot(trail[BEAST.trailIdx].x - BEAST.pos.x, trail[BEAST.trailIdx].z - BEAST.pos.z) < 9) BEAST.trailIdx++;
        // skip ahead if a later trail point is closer (player looped back)
        for (let k = BEAST.trailIdx + 1; k < Math.min(trail.length, BEAST.trailIdx + 40); k++) {
          if (Math.hypot(trail[k].x - BEAST.pos.x, trail[k].z - BEAST.pos.z) < 7) BEAST.trailIdx = k;
        }
        const trailGap = trail.length ? (trail[trail.length - 1].s - (trail[BEAST.trailIdx] ? trail[BEAST.trailIdx].s : 0)) + Math.hypot(trail[BEAST.trailIdx].x - BEAST.pos.x, trail[BEAST.trailIdx].z - BEAST.pos.z) : dist;
        BEAST.trailDist = Math.max(dist, trailGap);
        if (dist < 60 || BEAST.trailIdx >= trail.length - 1) target = tmp.set(car.pos.x + car.vel.x * 0.6, 0, car.pos.z + car.vel.z * 0.6);
        else target = tmp.set(trail[BEAST.trailIdx].x, 0, trail[BEAST.trailIdx].z);
        const gap = BEAST.trailDist;
        desired = base;
        if (gap > 150) desired = base + Math.min(24, (gap - 150) * 0.09);
        else if (gap < 45) desired = base * 1.08;
        if (car.speed < 4) desired = Math.max(desired, base * 1.1);
        // way too far: relocate along the trail, out of sight
        if (gap > 480 && trail.length > 80) {
          const back = Math.max(0, trail.length - 1 - Math.floor(220 / 4));
          BEAST.pos.set(trail[back].x, 0, trail[back].z);
          BEAST.trailIdx = back;
          BEAST.events.push({ type: 'roar', big: false });
        }
        if (dist < 14 && BEAST.cooldown <= 0) { BEAST.state = 'attack'; BEAST.stateT = 0; BEAST.hitDone = false; BEAST.roar(false); }
        BEAST.roarT -= dt;
        if (BEAST.roarT <= 0) { BEAST.roar(dist < 120); BEAST.roarT = frand(12, 22); }
        break;
      }
      case 'attack': {
        target = tmp.set(car.pos.x, 0, car.pos.z);
        desired = Math.max(car.speed * 0.9, base * 0.8);
        const T = BEAST.stateT;
        BEAST.rear = smoothstep(0, 0.4, T) * (1 - smoothstep(0.55, 0.9, T));
        BEAST.swipe = smoothstep(0.35, 0.55, T) * (1 - smoothstep(0.7, 1.0, T));
        if (T > 0.5 && !BEAST.hitDone) {
          BEAST.hitDone = true;
          // strike zone in front of the beast
          const fx = Math.sin(BEAST.yaw), fz = Math.cos(BEAST.yaw);
          const sx = BEAST.pos.x + fx * 6, sz = BEAST.pos.z + fz * 6;
          const hd = Math.hypot(car.pos.x - sx, car.pos.z - sz);
          BEAST.events.push({ type: 'slam', x: sx, z: sz, hit: hd < 9 });
          if (hd < 9) game.beastHit(fx, fz);
        }
        if (T > 1.0) { BEAST.state = game.over ? 'feast' : 'chase'; BEAST.stateT = 0; BEAST.cooldown = 1.8; BEAST.rear = 0; BEAST.swipe = 0; }
        break;
      }
      case 'feast': {
        // the run is over: stalk up to the wreck and stand over it roaring
        const near = dist < 9;
        target = near ? null : tmp.set(car.pos.x, 0, car.pos.z);
        desired = near ? 0 : Math.min(12, dist);
        if (near) BEAST.yaw += clamp(wrapAngle(Math.atan2(dx, dz) - BEAST.yaw), -dt * 2, dt * 2);
        BEAST.rear = near ? 0.5 + 0.25 * Math.sin(BEAST.stateT * 2) : 0;
        BEAST.roarT -= dt;
        if (BEAST.roarT <= 0 && near) { BEAST.roar(true); BEAST.roarT = frand(3.5, 6); }
        break;
      }
      case 'stunned':
        desired = 0;
        BEAST.rear = Math.sin(Math.min(1, BEAST.stateT / 0.5) * PI / 2) * (1 - smoothstep(2.6, 3.4, BEAST.stateT));
        if (BEAST.stateT > 3.5) { BEAST.state = 'chase'; BEAST.cooldown = 1; BEAST.rear = 0; }
        break;
    }
    // locomotion
    BEAST.targetSpeed = desired;
    BEAST.speed = damp(BEAST.speed, desired, desired > BEAST.speed ? 1.6 : 3, dt);
    if (target) {
      const ty = Math.atan2(target.x - BEAST.pos.x, target.z - BEAST.pos.z);
      const turn = wrapAngle(ty - BEAST.yaw);
      const maxTurn = (2.4 - Math.min(1.2, BEAST.speed / 30)) * dt;
      BEAST.yaw += clamp(turn, -maxTurn, maxTurn);
      if (Math.abs(turn) > 1.2) BEAST.speed *= 1 - dt * 1.5;
    }
    const fx = Math.sin(BEAST.yaw), fz = Math.cos(BEAST.yaw);
    BEAST.pos.x += fx * BEAST.speed * dt;
    BEAST.pos.z += fz * BEAST.speed * dt;
    BEAST.pos.x = clamp(BEAST.pos.x, -WORLD.LIMIT, WORLD.LIMIT); BEAST.pos.z = clamp(BEAST.pos.z, -WORLD.LIMIT, WORLD.LIMIT);
    const gh = WORLD.heightAt(BEAST.pos.x, BEAST.pos.z);
    BEAST.pos.y = damp(BEAST.pos.y, Math.max(gh, WORLD.WATER - 1.6), 10, dt);
    const ahead = WORLD.heightAt(BEAST.pos.x + fx * 4, BEAST.pos.z + fz * 4), behind = WORLD.heightAt(BEAST.pos.x - fx * 4, BEAST.pos.z - fz * 4);
    BEAST.pitch = damp(BEAST.pitch, -Math.atan2(ahead - behind, 8) * 0.8, 4, dt);

    // smash trees in the way
    if (BEAST.speed > 3) {
      let n = 0;
      OBST.query(BEAST.pos.x + fx * 3, BEAST.pos.z + fz * 3, 7, (o) => {
        if (n > 3 || o.type !== 'tree') return;
        const d = Math.hypot(o.x - (BEAST.pos.x + fx * 3), o.z - (BEAST.pos.z + fz * 3));
        if (d < 5.4 + o.r) { if (FLORA.fell(o, BEAST.pos.x - fx * 2, BEAST.pos.z - fz * 2, 1 + BEAST.speed / 25)) n++; }
      });
    }

    // ---------------- animation
    const gait = BEAST.speed / 9; // strides per second scale
    BEAST.phase += dt * (0.8 + gait) * TAU * 0.42;
    const ph = BEAST.phase;
    const amp = clamp(BEAST.speed / 22, 0.15, 1.1);
    const root = m.root;
    root.position.copy(BEAST.pos);
    root.rotation.set(0, BEAST.yaw, 0);
    const bob = Math.abs(Math.sin(ph)) * 0.7 * amp;
    m.body.position.y = 5.0 + bob + BEAST.rear * 2.2;
    m.body.rotation.x = BEAST.pitch + Math.sin(ph * 2) * 0.05 * amp - BEAST.rear * 0.55 + 0.08;
    m.body.rotation.z = Math.sin(ph) * 0.05 * amp;
    const arms = m.limbs.filter((l) => l.kind === 'arm'), legs = m.limbs.filter((l) => l.kind === 'leg');
    arms.forEach((l, i) => {
      const p = ph + i * 0.5;
      const sw = Math.sin(p);
      l.root.rotation.x = -sw * 0.75 * amp - BEAST.rear * 1.6 - (i === 1 ? BEAST.swipe * 1.6 : 0);
      l.root.rotation.z = l.s * (0.15 + BEAST.rear * 0.25);
      l.mid.rotation.x = -(0.25 + Math.max(0, Math.cos(p)) * 0.9 * amp) - BEAST.rear * 0.6 + (i === 1 ? BEAST.swipe * 1.2 : 0);
      l.end.rotation.x = 0.4 + Math.max(0, -Math.cos(p)) * 0.5 * amp;
      // footfall when the swing passes through forward-most point
      const plant = Math.sin(p - 0.4);
      if (BEAST.lastStep[i] > 0 && plant <= 0 && BEAST.speed > 2) BEAST.events.push({ type: 'step', side: l.s, front: true });
      BEAST.lastStep[i] = plant;
    });
    legs.forEach((l, i) => {
      const p = ph + PI + i * 0.45;
      const sw = Math.sin(p);
      l.root.rotation.x = sw * 0.65 * amp + 0.25 + BEAST.rear * 0.9;
      l.mid.rotation.x = -(0.5 + Math.max(0, Math.cos(p)) * 0.8 * amp) - BEAST.rear * 0.3;
      l.end.rotation.x = 0.3 + Math.max(0, Math.sin(p + 1)) * 0.4 * amp;
      const plant = Math.sin(p - 0.4);
      if (BEAST.lastStep[2 + i] > 0 && plant <= 0 && BEAST.speed > 2) BEAST.events.push({ type: 'step', side: l.s, front: false });
      BEAST.lastStep[2 + i] = plant;
    });
    m.tail.forEach((s, k) => {
      s.rotation.y = Math.sin(ph * 0.5 - k * 0.55) * 0.12 * (0.5 + amp);
      s.rotation.x = 0.06 + Math.sin(ph - k * 0.4) * 0.05 * amp - (k === 0 ? 0.25 : 0);
    });
    // head tracks the car
    const toCar = Math.atan2(dx, dz);
    const ly = clamp(wrapAngle(toCar - BEAST.yaw), -0.7, 0.7);
    BEAST.lookYaw = damp(BEAST.lookYaw, ly, 5, dt);
    m.neck.rotation.y = BEAST.lookYaw * 0.5;
    m.head.rotation.y = BEAST.lookYaw * 0.5;
    m.head.rotation.x = Math.sin(ph * 2) * 0.06 * amp + BEAST.rear * 0.3;
    if (BEAST.roarAnim > 0) BEAST.roarAnim -= dt;
    const jawT = BEAST.roarAnim > 0 ? 0.75 + Math.sin(BEAST.roarAnim * 30) * 0.05 : 0.08 + Math.sin(ph * 0.5) * 0.06 + (BEAST.state === 'attack' ? 0.5 : 0);
    BEAST.jaw = damp(BEAST.jaw, jawT, 10, dt);
    m.jaw.rotation.x = BEAST.jaw * 0.75;
    if (BEAST.roarAnim > 0) m.head.rotation.x -= 0.35 * Math.min(1, BEAST.roarAnim);
    m.skin.emissiveIntensity = 0.9 + Math.sin(performance.now() * 0.003) * 0.35 + (BEAST.roarAnim > 0 ? 1.2 : 0) + (BEAST.state === 'attack' ? 1 : 0);
  };
})();
