'use strict';
// ============================================================ vehicle physics
// Rigid body + 4 raycast suspension corners + combined-slip tyre model + AWD drivetrain
// with a turbo engine, sequential gearbox, handbrake, and driver assists.
// Car frame: +X left, +Y up, +Z forward. Runs at a fixed 240 Hz.

const SURF = {
  road: { mu: 1.02, roll: 0.016, name: 'gravel' },
  grass: { mu: 0.80, roll: 0.035, name: 'grass' },
  mud: { mu: 0.56, roll: 0.085, name: 'mud' },
  water: { mu: 0.62, roll: 0.05, name: 'water' },
  wood: { mu: 1.05, roll: 0.012, name: 'wood' },
};

class Vehicle {
  constructor() {
    const V3 = THREE.Vector3;
    this.mass = 1230;
    this.inertia = new V3(1550, 1850, 470); // pitch (x), yaw (y), roll (z)
    this.com = new V3(0, 0.5, 0.06); // centre of mass in model space
    this.pos = new V3();
    this.quat = new THREE.Quaternion();
    this.vel = new V3();
    this.angVel = new V3();
    this.R = new THREE.Matrix3();
    this.Rm = new THREE.Matrix4();
    this.invIw = new THREE.Matrix3();
    // drivetrain
    this.gears = [-3.3, 0, 3.45, 2.38, 1.8, 1.43, 1.17, 0.98];
    this.finalDrive = 4.6;
    this.gear = 2; // index into gears (2 = 1st)
    this.rpm = 1000;
    this.idle = 950; this.redline = 7600;
    this.boost = 0; // turbo pressure 0..1
    this.shiftTimer = 0;
    this.autoShift = true;
    this.revTimer = 0;
    this.nitro = 1; // boost reservoir 0..1
    this.boosting = false;
    this.health = 100;
    this.assist = { keyboard: true, abs: true, tc: true, countersteer: 0.75, stability: 1, esc: 1 };
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0, boost: 0 };
    this.steerAngle = 0; this.steerInput = 0;
    this.airTime = 0; this.grounded = 0;
    this.slipAngleBody = 0;
    this.speed = 0; this.vLong = 0;
    this.events = []; // collision/impact events for fx/audio
    this.limiter = 0; this.backfire = 0; this.lastThrottle = 0;
    this.parked = false;
    this.obstacles = [];
    this.wheels = [];
    const R = CARDIM.wheelR, Lrest = 0.25;
    const zCom = this.com.z;
    const frontShare = (zCom - CARDIM.zR) / (CARDIM.zF - CARDIM.zR);
    const defs = [[1, CARDIM.zF, true], [-1, CARDIM.zF, true], [1, CARDIM.zR, false], [-1, CARDIM.zR, false]];
    for (const [s, zw, front] of defs) {
      const k = front ? 43000 : 37000;
      const load = this.mass * 9.81 * (front ? frontShare : 1 - frontShare) / 2;
      this.wheels.push({
        side: s, front, steer: front, radius: R,
        mount: new V3(s * CARDIM.track, R + Lrest, zw).sub(this.com),
        k, cBump: front ? 2300 : 2100, cReb: front ? 3900 : 3500,
        Lrest, Lfree: Lrest + load / k, Lmin: Lrest - 0.155, Lmax: Lrest + 0.13,
        L: Lrest, Lprev: Lrest, contact: false, Fz: 0, omega: 0, angle: 0,
        brakeMax: front ? 2600 : 1600, inertia: 1.15,
        slipRatio: 0, slipAngle: 0, slip: 0, Fx: 0, Fy: 0,
        cp: new V3(), n: new V3(0, 1, 0), surf: SURF.grass, water: 0, mud: 0, road: 0, deck: 0,
        heat: 0, delta: 0, vLong: 0, vLat: 0, groundSpeed: 0,
      });
    }
    this._v = [new V3(), new V3(), new V3(), new V3(), new V3(), new V3(), new V3(), new V3()];
    this._s = { h: 0, nx: 0, ny: 1, nz: 0, road: 0, mud: 0, water: 0, deck: 0 };
    // hull probe points (model space -> COM relative)
    const hp = [];
    for (const z of [-2.0, -1.1, 0.0, 1.1, 2.03]) for (const x of [-0.86, 0.86]) hp.push([x, 0.3, z]);
    for (const z of [-1.3, 0.1]) for (const x of [-0.62, 0.62]) hp.push([x, 1.4, z]);
    for (const z of [-1.95, 1.75]) for (const x of [-0.8, 0.8]) hp.push([x, 0.98, z]);
    for (const z of [-0.7, 0.5]) for (const x of [-0.88, 0.88]) hp.push([x, 1.0, z]);
    hp.push([0, 0.4, 2.1], [0, 0.45, -2.08]);
    this.hull = hp.map(([x, y, z]) => new V3(x, y, z).sub(this.com));
    this.halfExt = { x: 0.89, yLo: 0.24 - this.com.y, yHi: 1.42 - this.com.y, zLo: -2.06 - this.com.z, zHi: 2.12 - this.com.z };
  }

  torqueCurve(rpm) {
    const pts = [[800, 150], [1500, 210], [2500, 300], [3200, 400], [4000, 455], [5000, 465], [6000, 445], [7000, 395], [7600, 345], [8200, 250]];
    if (rpm <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) if (rpm < pts[i + 1][0]) { const t = (rpm - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return lerp(pts[i][1], pts[i + 1][1], t); }
    return pts[pts.length - 1][1];
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    for (const w of this.wheels) { w.omega = 0; w.L = w.Lrest; w.Lprev = w.Lrest; w.contact = false; }
    this.gear = 2; this.rpm = this.idle; this.boost = 0; this.parked = false;
    this.steerAngle = 0; this.steerInput = 0;
  }

  get yaw() { const f = this._v[7].set(0, 0, 1).applyQuaternion(this.quat); return Math.atan2(f.x, f.z); }

  // --- per frame: controls smoothing, obstacles gather
  frame(dt, input) {
    const c = this.controls;
    // gather nearby obstacles once per frame
    this.obstacles.length = 0;
    OBST.query(this.pos.x, this.pos.z, 6 + this.vel.length() * dt * 2, (o) => this.obstacles.push(o));
    // steering: speed-sensitive with smoothing for digital input
    const v = this.speed;
    const target = clamp(input.steer, -1, 1);
    this.analogInput = !!input.analogSteer;
    if (input.analogSteer) this.steerInput = damp(this.steerInput, target, 22, dt);
    else {
      const returning = Math.sign(target) !== Math.sign(this.steerInput) || Math.abs(target) < Math.abs(this.steerInput);
      const rate = (returning ? 6.5 : 3.6) / (1 + v / 40);
      this.steerInput = approach(this.steerInput, target, rate * dt);
    }
    c.throttle = input.throttle; c.brake = input.brake; c.handbrake = input.handbrake; c.boost = input.boost;
    if (input.shiftUp) this.shift(1);
    if (input.shiftDown) this.shift(-1);
    this.autoShift = !input.manual;
  }

  shift(d) {
    const g = this.gear + d;
    if (g < 2 || g >= this.gears.length) return;
    this.gear = g; this.shiftTimer = 0.11;
    this.events.push({ type: 'shift', up: d > 0 });
  }

  step(h) {
    const V = this._v;
    const c = this.controls;
    const R = this.R.setFromMatrix4(this.Rm.makeRotationFromQuaternion(this.quat));
    const e = R.elements; // column-major
    const right = V[0].set(e[0], e[1], e[2]); // local +X (left side of car)
    const up = V[1].set(e[3], e[4], e[5]);
    const fwd = V[2].set(e[6], e[7], e[8]);
    // world inverse inertia
    const ix = 1 / this.inertia.x, iy = 1 / this.inertia.y, iz = 1 / this.inertia.z;
    const ie = this.invIw.elements;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      ie[b * 3 + a] = e[a] * ix * e[b] + e[3 + a] * iy * e[3 + b] + e[6 + a] * iz * e[6 + b];
    }
    const F = V[3].set(0, -9.81 * this.mass, 0);
    const T = V[4].set(0, 0, 0);
    const vel = this.vel, w = this.angVel, pos = this.pos;
    const vLongCar = vel.dot(fwd), vLatCar = vel.dot(right);
    this.vLong = vLongCar;
    this.speed = vel.length();
    this.slipAngleBody = this.speed > 3 ? Math.atan2(vLatCar, Math.abs(vLongCar)) : 0;

    // ---------- reverse / drive logic
    const movingFwd = vLongCar > 0.8, movingBack = vLongCar < -0.8;
    let throttle = c.throttle, brake = c.brake;
    if (this.locked) { throttle = 0; brake = 1; this.revTimer = 0; if (this.gear === 0) this.gear = 2; c.handbrake = 1; }
    if (this.gear === 0) { // reverse
      if (c.throttle > 0.1 && !movingBack) { this.gear = 2; }
      else { throttle = c.brake; brake = c.throttle; }
    } else if (c.brake > 0.5 && !movingFwd && c.throttle < 0.1 && !this.locked) {
      this.revTimer += h;
      if (this.revTimer > 0.25) { this.gear = 0; this.revTimer = 0; throttle = c.brake; brake = 0; }
    } else this.revTimer = 0;
    if (this.gear === 0 && c.throttle < 0.1 && c.brake < 0.1) { throttle = 0; brake = 0; }
    // hill hold: no pedals near standstill -> hold the brakes so the car doesn't creep downhill
    if (throttle < 0.05 && brake < 0.05 && Math.abs(vLongCar) < 1.2 && c.handbrake < 0.5) brake = 1;

    // ---------- steering with Ackermann and counter-steer assist
    const v = this.speed;
    // speed-sensitive lock: digital input gets less lock at speed than an analog stick
    let maxSteer = 0.6 / (1 + Math.max(0, v - 3) * (this.analogInput ? 0.05 : 0.075));
    let steer = this.steerInput * maxSteer;
    if (this.assist.countersteer > 0 && v > 5 && vLongCar > 0) {
      const beta = Math.atan2(vLatCar, vLongCar);
      const k = this.assist.countersteer * smoothstep(5, 12, v);
      const bEff = Math.sign(beta) * Math.max(0, Math.abs(beta) - 0.05);
      steer += clamp(bEff, -0.5, 0.5) * k * (1 - Math.abs(this.steerInput) * 0.35);
    }
    steer = clamp(steer, -0.62, 0.62);
    this.steerAngle = steer;
    const WB = CARDIM.zF - CARDIM.zR, TR = CARDIM.track * 2;
    let dl = steer, dr = steer;
    if (Math.abs(steer) > 1e-4) {
      const Rt = WB / Math.tan(Math.abs(steer));
      const inner = Math.atan(WB / (Rt - TR / 2)), outer = Math.atan(WB / (Rt + TR / 2));
      if (steer > 0) { dl = inner; dr = outer; } else { dl = -outer; dr = -inner; }
    }

    // ---------- engine & gearbox
    const ratio = this.gears[this.gear] * this.finalDrive;
    if (this.shiftTimer > 0) this.shiftTimer -= h;
    const shifting = this.shiftTimer > 0;
    const driven = this.wheels;
    let wAvg = 0;
    if (c.handbrake > 0.5) wAvg = (driven[0].omega + driven[1].omega) / 2;
    else { for (const wh of driven) wAvg += wh.omega; wAvg /= 4; }
    const wheelRpm = Math.abs(wAvg * ratio) * 60 / TAU;
    const launchRpm = this.idle + throttle * 3300;
    let engineRpm;
    if (shifting) engineRpm = this.rpm - 9000 * h * (1 - throttle * 0.5);
    else if (this.gear === 0) engineRpm = Math.max(wheelRpm, this.idle + throttle * 2000);
    else if (this.gear === 2) engineRpm = Math.max(wheelRpm, launchRpm); // clutch slips only when launching in 1st
    else engineRpm = wheelRpm;
    engineRpm = Math.max(this.idle, engineRpm);
    this.rpm = clamp(lerp(this.rpm, engineRpm, 0.35), this.idle * 0.9, 8300);
    // turbo with a little lag; anti-lag keeps it partially spooled off-throttle
    const boostTarget = throttle * smoothstep(2000, 4300, this.rpm);
    this.boost += (boostTarget - this.boost) * h * (boostTarget > this.boost ? 2.6 : 1.2);
    this.boost = Math.max(this.boost, throttle < 0.1 ? 0.3 * smoothstep(3500, 6000, this.rpm) : 0);
    // traction control (assist) based on previous step slip
    let tcCut = 0;
    if (this.assist.tc) {
      let s = 0; for (const wh of driven) s = Math.max(s, wh.contact ? wh.slipRatio : 0);
      tcCut = smoothstep(0.22, 0.55, s) * 0.55;
      // full assists: ease off when the car is sliding wide, so held throttle doesn't become a donut
      if (this.assist.esc >= 1 && this.speed > 5) tcCut = Math.max(tcCut, smoothstep(0.32, 0.75, Math.abs(this.slipAngleBody)) * 0.75);
    }
    let engTorque = 0;
    const limiter = this.rpm > (this.gear === 0 ? 5200 : this.redline);
    if (limiter) this.limiter = 0.06;
    if (this.limiter > 0) this.limiter -= h;
    if (!shifting && this.gear !== 1) {
      if (throttle > 0.01 && this.limiter <= 0) engTorque = this.torqueCurve(this.rpm) * (0.62 + 0.38 * this.boost) * throttle * (1 - tcCut);
      else engTorque = -(25 + this.rpm * 0.009) * (this.gear === 0 ? 0.3 : 1) * smoothstep(300, 1500, wheelRpm);
      if (this.health < 30) engTorque *= 0.6 + this.health / 75;
    }
    const totalWheelTorque = engTorque * ratio * 0.9;
    // overrun pops
    if (this.lastThrottle > 0.6 && throttle < 0.2 && this.rpm > 4500) this.events.push({ type: 'pop', n: 2 + Math.floor(Math.random() * 4) });
    this.lastThrottle = throttle;
    // auto gearbox
    if (this.autoShift && !shifting && this.gear >= 2) {
      const upAt = 6900 - (1 - throttle) * 2200;
      if (this.rpm > upAt && this.gear < this.gears.length - 1 && throttle > 0.05) this.shift(1);
      else if (this.gear > 2) {
        const lowerRpm = wheelRpm * this.gears[this.gear - 1] / this.gears[this.gear];
        const downAt = throttle > 0.5 ? 3900 : brake > 0.3 ? 4300 : 2600;
        if (Math.abs(vLongCar) < 2.5) { this.gear = 2; this.shiftTimer = 0.08; }
        else if (wheelRpm < downAt && lowerRpm < 6800) this.shift(-1);
      }
    }
    // drivetrain inertia reflected to each wheel when the clutch is in
    const drvI = shifting || this.gear === 1 ? 0 : (0.16 * ratio * ratio) / 4;
    const hb = c.handbrake > 0.5;
    const split = hb ? [0.5, 0.5, 0, 0] : [0.225, 0.225, 0.275, 0.275];

    // ---------- wheels
    let grounded = 0;
    const s = this._s;
    const mw = V[5], cv = V[6];
    for (let i = 0; i < 4; i++) {
      const wh = this.wheels[i];
      // mount point in world
      mw.copy(wh.mount).applyMatrix3(R).add(pos);
      // find suspension length where wheel touches ground (Newton on gap)
      let L = wh.Lmax;
      let contact = false;
      for (let it = 0; it < 3 && up.y > 0.1; it++) {
        const cx = mw.x - up.x * L, cy = mw.y - up.y * L, cz = mw.z - up.z * L;
        WORLD.sample(cx, cz, cy + 0.5, s);
        const gap = (cy - s.h) * s.ny - wh.radius;
        const dgap = -(up.y - (s.nx * up.x + s.nz * up.z) / Math.max(0.2, s.ny) * 0) * s.ny;
        L = L - gap / Math.min(-0.2, dgap);
        if (L > wh.Lmax + 0.05) break;
      }
      wh.water = s.water; wh.mud = s.mud; wh.road = s.road; wh.deck = s.deck;
      let Fs = 0;
      if (L < wh.Lmax && up.y > 0.1) {
        contact = true;
        const Lc = Math.max(L, wh.Lmin - 0.06);
        const vComp = (wh.L - Lc) / h; // positive = compressing
        wh.Lprev = wh.L; wh.L = Math.max(Lc, wh.Lmin);
        const x = wh.Lfree - wh.L;
        const damp = vComp > 0 ? wh.cBump : wh.cReb;
        Fs = wh.k * x + damp * clamp(vComp, -3, 3);
        if (Lc < wh.Lmin) Fs += 180000 * (wh.Lmin - Lc) + 8000 * Math.max(0, vComp);
        if (Fs < 0) Fs = 0;
        wh.n.set(s.nx, s.ny, s.nz);
      } else {
        wh.Lprev = wh.L;
        wh.L = Math.min(wh.Lmax, wh.L + h * 3);
      }
      wh.contact = contact;
      wh.Fz = Fs;
      if (contact) grounded++;
    }
    // anti-roll bars
    for (const [a, b, k] of [[0, 1, 17000], [2, 3, 10000]]) {
      const A = this.wheels[a], Bw = this.wheels[b];
      if (A.contact || Bw.contact) {
        const f = (Bw.L - A.L) * k;
        if (A.contact) A.Fz = Math.max(0, A.Fz + f);
        if (Bw.contact) Bw.Fz = Math.max(0, Bw.Fz - f);
      }
    }
    // tyre forces
    const absOn = this.assist.abs;
    for (let i = 0; i < 4; i++) {
      const wh = this.wheels[i];
      const delta = i === 0 ? dl : i === 1 ? dr : 0;
      wh.delta = delta;
      const I = wh.inertia + drvI;
      // drive torque (+ simple viscous LSD towards axle mate)
      const mate = this.wheels[i ^ 1];
      let Td = totalWheelTorque * split[i] + (mate.omega - wh.omega) * 35;
      if (this.gear === 1 || shifting) Td = (mate.omega - wh.omega) * 35;
      // brake torque
      let Tb = brake * wh.brakeMax;
      if (hb && !wh.front) Tb = Math.max(Tb, 4200);
      if (absOn && brake > 0 && wh.slipRatio < -0.18 && Math.abs(wh.vLong) > 3 && !(hb && !wh.front)) Tb *= 0.35;
      wh.heat = Math.max(0, wh.heat + (Tb * Math.abs(wh.omega) * 2.2e-6 - wh.heat * 0.25) * h);
      if (!wh.contact) {
        wh.omega += (Td / I) * h;
        const dB = (Tb + 15) / I * h;
        wh.omega = Math.abs(wh.omega) <= dB ? 0 : wh.omega - Math.sign(wh.omega) * dB;
        wh.Fx = wh.Fy = 0; wh.slip = 0; wh.slipRatio = 0; wh.slipAngle = 0;
        continue;
      }
      // contact frame
      const n = wh.n;
      const cpw = cv.copy(wh.mount).applyMatrix3(R).add(pos).addScaledVector(up, -wh.L).addScaledVector(n, -wh.radius);
      wh.cp.copy(cpw);
      const sd = Math.sin(delta), cd = Math.cos(delta);
      // wheel heading = fwd rotated about up by delta (positive = left)
      let fx = fwd.x * cd + right.x * sd, fy = fwd.y * cd + right.y * sd, fz = fwd.z * cd + right.z * sd;
      const dn = fx * n.x + fy * n.y + fz * n.z;
      fx -= n.x * dn; fy -= n.y * dn; fz -= n.z * dn;
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      // side = n x f  (points to the car's left)
      const sx = n.y * fz - n.z * fy, sy = n.z * fx - n.x * fz, sz = n.x * fy - n.y * fx;
      // contact point velocity
      const rx = cpw.x - pos.x, ry = cpw.y - pos.y, rz = cpw.z - pos.z;
      const pvx = vel.x + (w.y * rz - w.z * ry), pvy = vel.y + (w.z * rx - w.x * rz), pvz = vel.z + (w.x * ry - w.y * rx);
      const vL = pvx * fx + pvy * fy + pvz * fz;
      const vS = pvx * sx + pvy * sy + pvz * sz;
      wh.vLong = vL; wh.vLat = vS;
      // surface
      let mu, roll;
      if (wh.deck) { mu = SURF.wood.mu; roll = SURF.wood.roll; }
      else {
        mu = lerp(SURF.grass.mu, SURF.road.mu, wh.road); roll = lerp(SURF.grass.roll, SURF.road.roll, wh.road);
        const m = smoothstep(0.15, 0.7, wh.mud);
        mu = lerp(mu, SURF.mud.mu, m); roll = lerp(roll, SURF.mud.roll, m);
        if (wh.water > 0.05) { const wt = smoothstep(0.05, 0.4, wh.water); mu = lerp(mu, SURF.water.mu, wt); roll += wt * 0.06; }
      }
      wh.surf = wh.deck ? SURF.wood : wh.water > 0.1 ? SURF.water : wh.mud > 0.4 ? SURF.mud : wh.road > 0.5 ? SURF.road : SURF.grass;
      const Fz = Math.min(wh.Fz, 14000);
      const muEff = mu * (1.04 - 0.07 * (Fz / 3200 - 1));
      const D = muEff * Fz;
      // apply drive & brake torques first
      let om = wh.omega + (Td / I) * h;
      const rr = roll * Fz * wh.radius;
      const dB = (Tb + rr) / I * h;
      om = Math.abs(om) <= dB ? 0 : om - Math.sign(om) * dB;
      // combined slip
      const denom = Math.max(Math.abs(vL), 3.5);
      const slipV = om * wh.radius - vL;
      const kappa = slipV / denom;
      const alpha = Math.atan2(vS, denom);
      const kp = 0.12, ap = 0.15;
      const sxn = kappa / kp, syn = alpha / ap;
      const sMag = Math.hypot(sxn, syn);
      let Fx = 0, Fy = 0;
      if (sMag > 1e-6) {
        const Bf = 2.07, Cf = 1.4, Ef = -0.1;
        const bs = Bf * sMag;
        const f = Math.sin(Cf * Math.atan(bs - Ef * (bs - Math.atan(bs))));
        Fx = D * f * (sxn / sMag);
        Fy = -D * f * (syn / sMag) * (wh.front ? 1.0 : 0.97);
      }
      // longitudinal: never push the wheel past synchronising with the ground in one step
      const cap = Math.abs(slipV) * I / (wh.radius * wh.radius * h);
      if (Math.abs(Fx) > cap) Fx = Math.sign(Fx) * cap;
      om -= (Fx * wh.radius / I) * h;
      wh.omega = om;
      // lateral: don't overshoot the sideways velocity of this corner
      const capY = Math.abs(vS) * this.mass * 0.25 / h * 0.9;
      if (Math.abs(Fy) > capY) Fy = Math.sign(Fy) * capY;
      wh.Fx = Fx; wh.Fy = Fy;
      wh.slipRatio = kappa; wh.slipAngle = alpha;
      wh.slip = Math.hypot(slipV, vS);
      wh.groundSpeed = Math.abs(vL);
      // water drag on the wheel
      let wdrag = 0;
      if (wh.water > 0.05) wdrag = -vL * Math.min(wh.water, 0.6) * 130;
      // total contact force: suspension along body-up, tyre in ground plane
      const fsx = up.x * wh.Fz + fx * (Fx + wdrag) + sx * Fy;
      const fsy = up.y * wh.Fz + fy * (Fx + wdrag) + sy * Fy;
      const fsz = up.z * wh.Fz + fz * (Fx + wdrag) + sz * Fy;
      F.x += fsx; F.y += fsy; F.z += fsz;
      // apply at contact point lifted toward the roll centre
      const lift = 0.22;
      const ax = rx + up.x * lift, ay = ry + up.y * lift, az = rz + up.z * lift;
      // suspension force acts at the mount line, tyre forces at lifted contact
      const tfx = fx * (Fx + wdrag) + sx * Fy, tfy = fy * (Fx + wdrag) + sy * Fy, tfz = fz * (Fx + wdrag) + sz * Fy;
      T.x += ay * tfz - az * tfy; T.y += az * tfx - ax * tfz; T.z += ax * tfy - ay * tfx;
      const mx = rx, my = ry, mz = rz;
      const ufx = up.x * wh.Fz, ufy = up.y * wh.Fz, ufz = up.z * wh.Fz;
      T.x += my * ufz - mz * ufy; T.y += mz * ufx - mx * ufz; T.z += mx * ufy - my * ufx;
    }
    for (const wh of this.wheels) wh.angle += wh.omega * h;
    this.grounded = grounded;

    // ---------- aero, boost, water, air control, stability
    const sp = this.speed;
    if (sp > 0.1) {
      const drag = 0.45 * sp;
      F.x -= vel.x * drag; F.y -= vel.y * drag; F.z -= vel.z * drag;
      const down = 0.32 * sp * sp;
      F.x -= up.x * down; F.y -= up.y * down; F.z -= up.z * down;
    }
    this.boosting = c.boost > 0.5 && this.nitro > 0.01 && this.gear >= 2 && this.health > 0;
    if (this.boosting) {
      const bf = grounded >= 2 ? 5200 : 1800;
      F.addScaledVector(fwd, bf);
      this.nitro = Math.max(0, this.nitro - h * 0.22);
    }
    // body in water: buoyancy and drag
    {
      const gy = WORLD.WATER - (pos.y - 0.25);
      if (gy > 0 && WORLD.heightAt(pos.x, pos.z) < WORLD.WATER) {
        const sub = Math.min(gy, 1.2);
        F.y += sub * 9000;
        F.x -= vel.x * sub * 320; F.y -= vel.y * sub * 1400; F.z -= vel.z * sub * 320;
        T.x -= w.x * 900 * sub; T.y -= w.y * 900 * sub; T.z -= w.z * 900 * sub;
      }
    }
    if (grounded === 0) {
      // air control: pitch with throttle/brake, yaw/roll with steering, gentle self-levelling
      const ac = 2600;
      const pitchIn = (c.throttle - c.brake) * 0.55;
      T.addScaledVector(right, -pitchIn * ac * 0.9);
      T.addScaledVector(up, this.steerInput * ac * 0.7);
      // level toward world up
      const lv = V[7].crossVectors(up, new THREE.Vector3(0, 1, 0));
      T.addScaledVector(lv, 1500);
      T.addScaledVector(w, -400);
    } else {
      // tyre-like yaw damping and roll limiting
      const yawRate = w.dot(up);
      T.addScaledVector(up, -yawRate * 260 * this.assist.stability);
      // stability control: allow drifts, catch spins. A steady slide can't yaw faster than mu*g/v.
      if (sp > 4 && grounded >= 2 && this.assist.esc > 0) {
        const rmax = (0.95 * 9.81) / sp * 1.2 + 0.3;
        const excess = Math.abs(yawRate) - rmax;
        if (excess > 0) T.addScaledVector(up, -Math.sign(yawRate) * Math.min(excess, 2) * 9000 * this.assist.esc);
      }
      if (up.y < 0.75 && grounded >= 2) {
        const lv = V[7].crossVectors(up, new THREE.Vector3(0, 1, 0));
        T.addScaledVector(lv, 5200 * (0.75 - up.y));
      }
    }

    // ---------- park: kill creep when stopped with no input
    const noInput = c.throttle < 0.05 && Math.abs(c.steer || 0) < 2;
    if (grounded >= 3 && sp < 0.25 && w.length() < 0.15 && throttle < 0.05 && !this.boosting) {
      this.parked = true;
    } else if (throttle > 0.05 || sp > 0.6 || grounded < 3) this.parked = false;

    // ---------- integrate
    if (this.parked) {
      vel.set(0, 0, 0); w.set(0, 0, 0);
      for (const wh of this.wheels) wh.omega = 0;
    } else {
      vel.addScaledVector(F, h / this.mass);
      // gyroscopic term
      const Iw = V[5].copy(w).applyMatrix3(R.clone().transpose());
      Iw.set(Iw.x * this.inertia.x, Iw.y * this.inertia.y, Iw.z * this.inertia.z).applyMatrix3(R);
      const gyro = V[6].crossVectors(w, Iw);
      T.sub(gyro);
      const dw = V[7].copy(T).applyMatrix3(this.invIw).multiplyScalar(h);
      w.add(dw);
    }
    this.collide(h, fwd, right, up);
    pos.addScaledVector(vel, h);
    // quaternion integration
    const q = this.quat;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const hx = w.x * h * 0.5, hy = w.y * h * 0.5, hz = w.z * h * 0.5;
    q.x += hx * qw + hy * qz - hz * qy;
    q.y += hy * qw + hz * qx - hx * qz;
    q.z += hz * qw + hx * qy - hy * qx;
    q.w += -hx * qx - hy * qy - hz * qz;
    q.normalize();
    // map boundary
    const LIM = WORLD.LIMIT;
    for (const ax of ['x', 'z']) {
      if (pos[ax] > LIM) { pos[ax] = LIM; if (vel[ax] > 0) vel[ax] *= -0.3; }
      if (pos[ax] < -LIM) { pos[ax] = -LIM; if (vel[ax] < 0) vel[ax] *= -0.3; }
    }
    // airtime / nitro gain
    if (grounded === 0) this.airTime += h; else {
      if (this.airTime > 0.5) this.events.push({ type: 'land', air: this.airTime, v: -vel.y });
      this.airTime = 0;
    }
    if (grounded === 0 && this.airTime > 0.25) this.nitro = Math.min(1, this.nitro + h * 0.12);
    if (grounded >= 2 && sp > 12 && Math.abs(this.slipAngleBody) > 0.22) this.nitro = Math.min(1, this.nitro + h * 0.09 * Math.min(2, Math.abs(this.slipAngleBody) / 0.3));
  }

  applyImpulse(J, point) {
    const r = this._v[5].subVectors(point, this.pos);
    this.vel.addScaledVector(J, 1 / this.mass);
    const t = this._v[6].crossVectors(r, J).applyMatrix3(this.invIw);
    this.angVel.add(t);
    this.parked = false;
  }

  // effective mass denominator along n at r
  _kn(r, n) {
    const t = this._v[6].crossVectors(r, n).applyMatrix3(this.invIw);
    const u = this._v[7].crossVectors(t, r);
    return 1 / this.mass + n.dot(u);
  }

  _resolve(pt, n, pen, e, muF, kind, obst) {
    const r = new THREE.Vector3().subVectors(pt, this.pos);
    const w = this.angVel;
    const pv = new THREE.Vector3(this.vel.x + w.y * r.z - w.z * r.y, this.vel.y + w.z * r.x - w.x * r.z, this.vel.z + w.x * r.y - w.y * r.x);
    const vn = pv.dot(n);
    if (pen > 0) this.pos.addScaledVector(n, Math.min(pen, 0.5) * 0.85);
    if (vn >= 0) return 0;
    const jn = -(1 + e) * vn / this._kn(r, n);
    const J = n.clone().multiplyScalar(jn);
    // friction
    const vt = pv.addScaledVector(n, -vn);
    const vtl = vt.length();
    if (vtl > 1e-4) {
      const tdir = vt.multiplyScalar(-1 / vtl);
      const jt = Math.min(vtl / this._kn(r, tdir), muF * jn);
      J.addScaledVector(tdir, jt);
    }
    this.applyImpulse(J, pt);
    if (-vn > 2.5) this.events.push({ type: 'impact', v: -vn, kind, point: pt.clone(), normal: n.clone(), obst });
    return -vn;
  }

  collide(h, fwd, right, up) {
    const R = this.R;
    const p = new THREE.Vector3(), s = this._s;
    // hull vs ground
    for (const hp of this.hull) {
      p.copy(hp).applyMatrix3(R).add(this.pos);
      WORLD.sample(p.x, p.z, p.y + 0.6, s);
      const pen = (s.h - p.y) * s.ny;
      if (pen > 0) {
        const n = new THREE.Vector3(s.nx, s.ny, s.nz);
        this._resolve(p, n, pen, 0.15, 0.5, 'ground');
      }
    }
    // obstacles
    const he = this.halfExt;
    const loc = new THREE.Vector3();
    const Rt = R.clone().transpose();
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      if (o.type === 'tree' || o.type === 'post') {
        if (this.pos.y + he.yLo > o.y + o.h || this.pos.y + he.yHi < o.y) continue;
        loc.set(o.x - this.pos.x, 0, o.z - this.pos.z);
        loc.y = 0;
        const lx = loc.x * R.elements[0] + loc.z * R.elements[2];
        const lz = loc.x * R.elements[6] + loc.z * R.elements[8];
        const cx = clamp(lx, -he.x, he.x), cz = clamp(lz, he.zLo, he.zHi);
        let dx = cx - lx, dz = cz - lz;
        let d = Math.hypot(dx, dz);
        if (d >= o.r) continue;
        let nlx, nlz, pen;
        if (d < 1e-4) { // centre inside the footprint: push out the short way
          const ex = he.x - Math.abs(lx), ez = Math.min(he.zHi - lz, lz - he.zLo);
          if (ex < ez) { nlx = -Math.sign(lx); nlz = 0; pen = ex + o.r; } else { nlx = 0; nlz = lz > 0 ? -1 : 1; pen = ez + o.r; }
        } else { nlx = dx / d; nlz = dz / d; pen = o.r - d; }
        // normal in world (horizontal), pointing from obstacle into car
        const n = new THREE.Vector3(right.x * nlx + fwd.x * nlz, 0, right.z * nlx + fwd.z * nlz).normalize();
        const pt = new THREE.Vector3(o.x, this.pos.y, o.z).addScaledVector(n, o.r);
        const rel = this.vel.dot(n);
        if (o.type === 'tree' && o.breakable && -rel > 11 && FLORA.fell(o, this.pos.x, this.pos.z, 1.5)) {
          // smash through: lose some speed
          this.vel.multiplyScalar(0.82);
          this.events.push({ type: 'smash', v: -rel, point: pt, obst: o });
          continue;
        }
        this._resolve(pt, n, pen, 0.2, 0.25, o.type, o);
      } else if (o.type === 'rock') {
        loc.set(o.x - this.pos.x, o.y - this.pos.y, o.z - this.pos.z).applyMatrix3(Rt);
        const cx = clamp(loc.x, -he.x, he.x), cy = clamp(loc.y, he.yLo, he.yHi), cz = clamp(loc.z, he.zLo, he.zHi);
        const dl = new THREE.Vector3(cx - loc.x, cy - loc.y, cz - loc.z);
        const d = dl.length();
        if (d >= o.r || d < 1e-5) continue;
        const n = dl.multiplyScalar(1 / d).applyMatrix3(R);
        const pt = new THREE.Vector3(o.x, o.y, o.z).addScaledVector(n, o.r);
        this._resolve(pt, n, o.r - d, 0.2, 0.4, 'rock', o);
      } else if (o.type === 'box') {
        for (const hp of this.hull) {
          p.copy(hp).applyMatrix3(R).add(this.pos);
          if (p.y < o.y0 || p.y > o.y1) continue;
          const dx = p.x - o.x, dz = p.z - o.z;
          const bx = dx * o.c - dz * o.s, bz = dx * o.s + dz * o.c;
          const ox = o.hx - Math.abs(bx), oz = o.hz - Math.abs(bz);
          if (ox <= 0 || oz <= 0) continue;
          const oy = o.y1 - p.y;
          let n;
          if (oy < Math.min(ox, oz) && oy < 0.6) n = new THREE.Vector3(0, 1, 0);
          else if (ox < oz) { const sg = Math.sign(bx); n = new THREE.Vector3(sg * o.c, 0, -sg * o.s); }
          else { const sg = Math.sign(bz); n = new THREE.Vector3(sg * o.s, 0, sg * o.c); }
          this._resolve(p, n, Math.min(ox, oz, oy), 0.15, 0.3, 'wall', o);
        }
      }
    }
  }
}
