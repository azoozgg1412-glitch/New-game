'use strict';
// ============================================================ game orchestration
const GAME = {
  mode: 'menu', difficulty: safeStore('bs-diff') || 'normal', time: 0, distance: 0, score: 0, checkpoints: 0, flares: 0,
  started: false, over: false, paused: false, countdown: 0, trail: [], trailS: 0, danger: 0, hitFlash: 0,
  camMode: 0, shake: 0, flareList: [], cpPassed: new Map(), best: Number(safeStore('bs-best') || 0),
  stats: { topSpeed: 0, bestAir: 0, drifts: 0, hits: 0 }, assists: safeStore('bs-assist') || 'full',
};
const CAM_MODES = ['chase', 'far', 'hood', 'cockpit', 'bumper'];

(function () {
  const $ = (id) => document.getElementById(id);
  let renderer, scene, camera, lights, sky, water;
  let car, model;
  let quality = safeStore('bs-quality') || (matchMedia('(pointer: coarse)').matches ? 'low' : 'medium');
  let viewDist = quality === 'low' ? 520 : quality === 'high' ? 900 : 720;
  const H = 1 / 240;
  let acc = 0, last = 0;
  const prevPos = new THREE.Vector3(), prevQuat = new THREE.Quaternion();
  const rPos = new THREE.Vector3(), rQuat = new THREE.Quaternion();
  const cam = { pos: new THREE.Vector3(), yaw: 0, fov: 62, look: new THREE.Vector3(), q: new THREE.Quaternion(), orbit: 0 };
  let flareMesh, flareLight, emit = [], hudTick = 0, mapTick = 0, noteTick = 0;
  let pixelRatio, perf = { t: 0, frames: 0, slow: 0 };
  let upsideT = 0, stuckT = 0, caughtT = 0, overT = 0, driftT = 0, resetCooldown = 0;

  BS.GAME = GAME;

  function setLoad(p, text) {
    $('loadBar').style.setProperty('--v', p);
    if (text) $('loadText').textContent = text;
  }

  BS.boot = async function () {
    const canvas = $('view');
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
    } catch (e) {
      $('loadText').textContent = 'WebGL is not available in this browser, so the game cannot run.';
      throw e;
    }
    pixelRatio = Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(ENV.fogColor.clone(), quality === 'low' ? 0.0042 : 0.0031);
    camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1800);
    BS.renderer = renderer; BS.scene = scene; BS.camera = camera;

    setLoad(0.02, 'Painting textures');
    await nextFrame();
    buildTerrainTextures(quality);
    buildMaterialTextures(quality);
    buildFoliageAtlas(quality);
    await WORLD.generate(1337, setLoad);
    setLoad(0.6, 'Shaping the terrain');
    await nextFrame();
    buildTerrain(scene);
    water = buildWater(scene);
    sky = buildSky(scene, renderer);
    lights = buildLights(scene, quality);
    OBST.init();
    PROPS.build(scene);
    await FLORA.build(scene, quality, setLoad);
    setLoad(0.92, 'Building the car');
    await nextFrame();
    model = buildCarModel(quality);
    scene.add(model.root);
    car = new Vehicle();
    GAME.car = car;
    setAssists(GAME.assists);
    BEAST.build(scene);
    FX.init(scene, quality);
    HUD.init();
    INPUT.init();
    // flare prop + light (light exists from the start so shaders never recompile)
    flareMesh = new THREE.Group();
    flareLight = new THREE.PointLight(0xff3020, 0, 26, 1.8);
    scene.add(flareLight);
    setLoad(0.97, 'Waking something up');
    await nextFrame();
    setupMenu();
    placeAtStart(false);
    camera.position.set(car.pos.x + 8, car.pos.y + 3, car.pos.z + 8);
    cam.pos.copy(camera.position);
    updateCarVisual(0, 1);
    renderer.compile(scene, camera);
    window.addEventListener('resize', onResize);
    onResize();
    $('loading').classList.add('done');
    setTimeout(() => $('loading').remove(), 700);
    showMenu();
    last = performance.now();
    requestAnimationFrame(frame);
    window.__bs = { GAME, car, BEAST, WORLD, camera, scene, renderer, FX, OBST, FLORA, HUD, PROPS, model, start: BS.start, quality, INPUT,
      // test hooks: advance the simulation without rendering, then render once
      advance(sec, ctl) {
        const n = Math.round(sec * 60);
        for (let i = 0; i < n; i++) {
          let inp = INPUT.poll();
          if (ctl) inp = Object.assign({}, inp, typeof ctl === 'function' ? ctl(i / 60) : ctl);
          INPUT.state = Object.assign(INPUT.state, inp);
          simulate(1 / 60, inp);
        }
      },
      render() { renderer.render(scene, camera); },
      setCam(m) { GAME.camMode = CAM_MODES.indexOf(m); },
    };
  };

  function onResize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    const g = $('gauge'), m = $('minimap');
    const dpr = Math.min(2, devicePixelRatio || 1);
    g.width = g.height = Math.round(220 * dpr);
    m.width = m.height = Math.round(180 * dpr);
  }

  function setAssists(level) {
    GAME.assists = level;
    const a = car.assist;
    if (level === 'full') Object.assign(a, { abs: true, tc: true, countersteer: 0.75, stability: 1, esc: 1 });
    else if (level === 'light') Object.assign(a, { abs: true, tc: false, countersteer: 0.35, stability: 0.7, esc: 0.45 });
    else Object.assign(a, { abs: false, tc: false, countersteer: 0, stability: 0.35, esc: 0 });
  }

  // ------------------------------------------------ menu & flow
  function setupMenu() {
    document.querySelectorAll('[data-diff]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.diff === GAME.difficulty));
      b.addEventListener('click', () => { GAME.difficulty = b.dataset.diff; safeStore('bs-diff', GAME.difficulty); document.querySelectorAll('[data-diff]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    });
    document.querySelectorAll('[data-quality]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.quality === quality));
      b.addEventListener('click', () => { if (b.dataset.quality === quality) return; safeStore('bs-quality', b.dataset.quality); location.reload(); });
    });
    document.querySelectorAll('[data-assist]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.assist === GAME.assists));
      b.addEventListener('click', () => { setAssists(b.dataset.assist); safeStore('bs-assist', b.dataset.assist); document.querySelectorAll('[data-assist]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.assist === GAME.assists))); });
    });
    $('btnEscape').addEventListener('click', () => BS.start('escape'));
    $('btnFree').addEventListener('click', () => BS.start('free'));
    $('btnResume').addEventListener('click', () => setPause(false));
    $('btnRestart').addEventListener('click', () => { setPause(false); BS.start(GAME.mode); });
    $('btnMenu').addEventListener('click', () => { setPause(false); showMenu(); });
    $('btnAgain').addEventListener('click', () => BS.start(GAME.lastMode || 'escape'));
    $('btnOverMenu').addEventListener('click', showMenu);
    document.querySelectorAll('.js-full').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); toggleFull(); el.blur(); }));
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, syncFull);
    syncFull();
    $('btnSound').addEventListener('click', () => { userGesture(); AUDIO.setOn(!AUDIO.on); syncToggles(); });
    $('btnVoice').addEventListener('click', () => { HUD.voice = !HUD.voice; safeStore('bs-voice', HUD.voice ? '1' : '0'); if (!HUD.voice && window.speechSynthesis) speechSynthesis.cancel(); syncToggles(); });
    $('bestScore').textContent = GAME.best ? String(GAME.best) : '—';
    document.addEventListener('pointerdown', userGesture, { once: false });
    document.addEventListener('keydown', userGesture);
    syncToggles();
  }
  function syncToggles() {
    $('btnSound').textContent = AUDIO.on ? 'Sound: on' : 'Sound: off';
    $('btnVoice').textContent = HUD.voice ? 'Co-driver: on' : 'Co-driver: off';
  }
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fsSupported = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  function toggleFull() {
    userGesture();
    const de = document.documentElement;
    if (!fsSupported()) {
      HUD.toast(/iP(hone|od)/.test(navigator.userAgent) ? 'iPhone: tap Share, then Add to Home Screen to play full screen' : 'This browser does not allow full screen', 'info', 3.5);
      return;
    }
    if (!fsEl()) {
      const req = de.requestFullscreen ? de.requestFullscreen({ navigationUI: 'hide' }) : de.webkitRequestFullscreen();
      Promise.resolve(req).then(() => {
        // phones: stay sideways while playing
        try { if (screen.orientation && screen.orientation.lock && matchMedia('(pointer: coarse)').matches) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not allowed */ }
      }).catch(() => HUD.toast('Full screen was blocked by the browser', 'info', 2));
    } else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  function syncFull() {
    const on = !!fsEl();
    document.querySelectorAll('.js-full').forEach((el) => {
      const label = on ? 'Exit full screen' : 'Full screen';
      el.setAttribute('aria-label', label);
      const fl = el.querySelector('.fl');
      if (fl) fl.textContent = label; else el.textContent = (on ? '✕ ' : '⛶ ') + label;
      const fi = el.querySelector('.fi');
      if (fi) fi.textContent = on ? '✕' : '⛶';
    });
    setTimeout(onResize, 60);
  }
  BS.toggleFull = toggleFull;
  function userGesture() { AUDIO.init(); }
  BS.userGesture = userGesture;

  function showMenu() {
    GAME.mode = 'menu'; GAME.over = false; GAME.started = false; GAME.paused = false;
    $('menu').hidden = false; $('hud').hidden = true; $('over').hidden = true; $('pause').hidden = true;
    document.body.classList.remove('playing');
    placeAtStart(false);
    // the beast lurks behind the car on the title screen
    const loop = WORLD.roads[0];
    const p = WORLD.roadPoint(loop, PROPS.checkpoints[0].i - 30);
    BEAST.reset(p.x - p.tz * 6, p.z + p.tx * 6, Math.atan2(car.pos.x - p.x, car.pos.z - p.z), true);
    BEAST.state = 'menu';
    $('bestScore').textContent = GAME.best ? String(GAME.best) : '—';
  }

  function placeAtStart(withBeast) {
    const loop = WORLD.roads[0];
    const cp0 = PROPS.checkpoints[0];
    const p = WORLD.roadPoint(loop, cp0.i - 10);
    car.place(p.x, p.h + 0.62, p.z, Math.atan2(p.tx, p.tz));
    car.health = 100; car.nitro = 1;
    model.repair();
    if (withBeast) {
      const bi = cp0.i - 10 - 70;
      const b = WORLD.roadPoint(loop, bi);
      BEAST.reset(b.x, b.z, Math.atan2(p.x - b.x, p.z - b.z), true);
      GAME.trail = [];
      let s = 0;
      for (let k = bi; k <= cp0.i - 10; k += 2) {
        const q = WORLD.roadPoint(loop, k);
        if (GAME.trail.length) s += Math.hypot(q.x - GAME.trail[GAME.trail.length - 1].x, q.z - GAME.trail[GAME.trail.length - 1].z);
        GAME.trail.push({ x: q.x, z: q.z, s });
      }
      GAME.trailS = s;
    } else {
      GAME.trail = [{ x: car.pos.x, z: car.pos.z, s: 0 }]; GAME.trailS = 0;
    }
    prevPos.copy(car.pos); prevQuat.copy(car.quat);
    cam.yaw = car.yaw;
  }

  BS.start = function (mode) {
    userGesture();
    GAME.mode = mode; GAME.lastMode = mode;
    Object.assign(GAME, { time: 0, distance: 0, score: 0, checkpoints: 0, flares: mode === 'escape' ? 1 : 0, started: false, over: false, paused: false, countdown: mode === 'escape' ? 3.2 : 0, danger: 0, hitFlash: 0, shake: 0, graceT: 0 });
    if (mode !== 'escape') GAME.started = true;
    GAME.stats = { topSpeed: 0, bestAir: 0, drifts: 0, hits: 0 };
    GAME.cpPassed = new Map();
    for (const f of GAME.flareList) scene.remove(f.mesh);
    GAME.flareList = [];
    flareLight.intensity = 0;
    FX.clear();
    placeAtStart(mode === 'escape');
    if (mode !== 'escape') { BEAST.active = false; BEAST.model.root.visible = false; }
    GAME.cpPassed.set(0, 0);
    $('menu').hidden = true; $('hud').hidden = false; $('over').hidden = true; $('pause').hidden = true;
    document.body.classList.add('playing');
    $('hudMode').textContent = mode === 'escape' ? `ESCAPE · ${GAME.difficulty.toUpperCase()}` : 'FREE ROAM';
    upsideT = stuckT = caughtT = overT = driftT = 0;
    HUD.lastSpoken = -1;
    cam.pos.set(car.pos.x - Math.sin(car.yaw) * 7, car.pos.y + 2.4, car.pos.z - Math.cos(car.yaw) * 7);
    INPUT.clearActions();
  };

  function setPause(p) {
    if (GAME.mode === 'menu' || GAME.over) p = false;
    GAME.paused = p;
    $('pause').hidden = !p;
    if (p && window.speechSynthesis) speechSynthesis.cancel();
  }

  function gameOver(reason) {
    if (GAME.over) return;
    GAME.over = true; overT = 0;
    GAME.overReason = reason;
    const sc = Math.floor(GAME.score);
    const newBest = GAME.mode === 'escape' && sc > GAME.best;
    if (newBest) { GAME.best = sc; safeStore('bs-best', String(sc)); }
    $('overTitle').textContent = reason === 'wrecked' ? 'WRECKED' : 'THE BEAST GOT YOU';
    $('overSub').textContent = reason === 'wrecked' ? 'Your car gave up before you did. The jungle keeps what it catches.' : 'It was faster for a moment, and a moment was enough.';
    $('ovTime').textContent = HUD.fmtTime(GAME.time);
    $('ovDist').textContent = (GAME.distance / 1000).toFixed(2) + ' km';
    $('ovCp').textContent = String(GAME.checkpoints);
    $('ovTop').textContent = Math.round(GAME.stats.topSpeed * 3.6) + ' km/h';
    $('ovAir').textContent = GAME.stats.bestAir.toFixed(1) + ' s';
    $('ovScore').textContent = String(sc);
    $('ovBest').textContent = newBest ? 'New best!' : `Best ${GAME.best}`;
  }

  // ------------------------------------------------ beast interactions
  GAME.beastHit = function (fx, fz) {
    if (GAME.over || GAME.graceT > 0) return;
    GAME.graceT = 2.5; // a moment to get away before it can hurt you again
    const side = Math.random() < 0.5 ? -1 : 1;
    const J = new THREE.Vector3(fx * 8 - fz * side * 3, 7.5, fz * 8 + fx * side * 3).multiplyScalar(car.mass);
    const pt = car.pos.clone().add(new THREE.Vector3(frand(-0.6, 0.6), 0.4, frand(-1, 1)));
    car.applyImpulse(J, pt);
    car.angVel.y += side * 2.5;
    const dmg = frand(24, 32);
    car.health -= dmg;
    GAME.stats.hits++;
    GAME.shake = Math.max(GAME.shake, 1.4);
    GAME.hitFlash = 0.6;
    HUD.center('HIT!', 'bad');
    INPUT.rumble(1, 1, 450);
    AUDIO.play('impact', { vol: 1.3 });
    const local = car.pos.clone();
    dentAt(car.pos.clone().add(new THREE.Vector3(-fx, 0.5, -fz).multiplyScalar(1.2)), new THREE.Vector3(fx, 0, fz), 0.14);
    if (model.parts.wing.parent === model.root && Math.random() < 0.6) detachWing(J);
    void local;
  };

  function detachWing(J) {
    const w = model.parts.wing;
    const wp = new THREE.Vector3(); w.getWorldPosition(wp);
    const wq = new THREE.Quaternion(); model.root.getWorldQuaternion(wq);
    model.root.remove(w);
    // re-centre the wing group so it spins nicely
    const holder = new THREE.Group();
    holder.position.copy(rPos.clone().add(new THREE.Vector3(0, 1.4, -1.7).applyQuaternion(rQuat)));
    holder.quaternion.copy(wq);
    w.position.set(0, -1.45, 1.75);
    holder.add(w);
    scene.add(holder);
    const v = car.vel.clone().add(J.clone().multiplyScalar(0.3 / car.mass)).add(new THREE.Vector3(0, 4, 0));
    FX.addDebris(holder, holder.position, v, new THREE.Vector3(frand(-6, 6), frand(-4, 4), frand(-6, 6)), 30);
    holder.userData.isWing = true;
  }

  function dentAt(worldPt, worldDir, amount) {
    const inv = car.quat.clone().invert();
    const local = worldPt.clone().sub(car.pos).applyQuaternion(inv).add(car.com);
    const dir = worldDir.clone().applyQuaternion(inv).normalize();
    model.dent(local, dir, amount);
  }

  // ------------------------------------------------ flares
  function dropFlare() {
    if (GAME.mode !== 'escape' || !GAME.started || GAME.over || GAME.flares <= 0) return;
    GAME.flares--;
    const back = new THREE.Vector3(0, 0, -2.6).applyQuaternion(car.quat).add(car.pos);
    back.y = WORLD.heightAt(back.x, back.z) + 0.15;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2010, emissiveIntensity: 3 }));
    m.rotation.z = PI / 2; m.position.copy(back);
    scene.add(m);
    GAME.flareList.push({ pos: back.clone(), t: 25, mesh: m });
    AUDIO.play('flare');
    HUD.toast('FLARE DROPPED', 'info');
  }

  // ------------------------------------------------ main loop
  const TEST = /[?&]test/.test(location.search);
  function frame(now) {
    if (!TEST) requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    adaptQuality(dt);
    const inp = INPUT.poll();
    if (INPUT.consume('pause')) setPause(!GAME.paused);
    if (INPUT.consume('mute')) { AUDIO.setOn(!AUDIO.on); syncToggles(); }
    if (INPUT.consume('voice')) { HUD.voice = !HUD.voice; safeStore('bs-voice', HUD.voice ? '1' : '0'); syncToggles(); HUD.toast(HUD.voice ? 'CO-DRIVER ON' : 'CO-DRIVER OFF', 'info', 1); }
    if (INPUT.consume('camera')) { GAME.camMode = (GAME.camMode + 1) % CAM_MODES.length; HUD.toast('CAMERA: ' + CAM_MODES[GAME.camMode].toUpperCase(), 'info', 0.9); }
    if (GAME.mode === 'menu' && INPUT.consume('confirm')) BS.start('escape');
    if (GAME.over && overT > 1.5 && INPUT.consume('confirm')) BS.start(GAME.lastMode || 'escape');
    if (!GAME.paused) simulate(dt, inp);
    else AUDIO.update(dt, { paused: true });
    renderer.render(scene, camera);
  }

  function adaptQuality(dt) {
    perf.t += dt; perf.frames++;
    if (perf.t > 2) {
      const avg = perf.t / perf.frames;
      const maxPR = Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1);
      if (avg > 1 / 40 && pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio - 0.15); renderer.setPixelRatio(pixelRatio); onResize(); }
      else if (avg < 1 / 58 && pixelRatio < maxPR) { pixelRatio = Math.min(maxPR, pixelRatio + 0.1); renderer.setPixelRatio(pixelRatio); onResize(); }
      perf.t = 0; perf.frames = 0;
    }
  }

  function simulate(dt, inp) {
    ENV.time.value += dt;
    const playing = GAME.mode !== 'menu';
    // controls
    let ctl = inp;
    car.locked = !playing || GAME.countdown > 0;
    if (car.locked || GAME.over || car.health <= 0) ctl = { throttle: 0, brake: GAME.over ? 0.3 : 0, steer: 0, handbrake: car.locked ? 1 : 0, boost: 0, analogSteer: true };
    if (playing && GAME.countdown > 0) {
      const before = Math.ceil(GAME.countdown);
      GAME.countdown -= dt;
      const after = Math.ceil(GAME.countdown);
      if (after !== before || GAME.countdownShown === undefined) {
        if (after > 0) { HUD.center(String(after), 'count'); AUDIO.play('beep', { f: 520 }); }
        GAME.countdownShown = after;
      }
      if (GAME.countdown <= 0) { GAME.started = true; HUD.center('GO!', 'go'); AUDIO.play('beep', { f: 1040 }); GAME.countdownShown = undefined; }
    }
    if (playing && GAME.started && !GAME.over) GAME.time += dt;
    car.frame(dt, ctl);
    // reset to road
    if (resetCooldown > 0) resetCooldown -= dt;
    if (playing && !GAME.over && INPUT.consume('reset') && resetCooldown <= 0) resetToRoad();
    if (INPUT.consume('flare')) dropFlare();
    // physics
    acc += dt;
    let steps = 0;
    while (acc >= H && steps < 14) {
      prevPos.copy(car.pos); prevQuat.copy(car.quat);
      car.step(H);
      acc -= H; steps++;
    }
    if (steps >= 14) acc = 0;
    const alpha = acc / H;
    rPos.lerpVectors(prevPos, car.pos, alpha);
    rQuat.slerpQuaternions(prevQuat, car.quat, alpha);

    handleCarEvents(playing);
    if (BEAST.state === 'menu') menuBeast(dt);
    else BEAST.update(dt, car, GAME);
    handleBeastEvents();
    if (playing) gameLogic(dt);
    updateCarVisual(dt, alpha);
    wheelFx(dt);
    updateCamera(dt, inp);
    updateTerrain(camera.position, viewDist + 100, 3);
    FLORA.update(camera.position, viewDist, dt);
    updateSunShadow(lights, rPos);
    sky.position.copy(camera.position);
    water.material.uniforms.uTime.value = ENV.time.value;
    // temple braziers
    if (PROPS.temple && camera.position.distanceTo(PROPS.braziers[0]) < 260) {
      for (const b of PROPS.braziers) if (Math.random() < dt * 30) FX.spawn('fire', b.x + frand(-0.2, 0.2), b.y, b.z + frand(-0.2, 0.2), frand(-0.3, 0.3), frand(1, 2.5), frand(-0.3, 0.3), 0.8);
    }
    FX.update(dt, camera, renderer);
    // audio
    let slip = 0, gf = 0, surf = 'road', wet = false;
    for (const w of car.wheels) { if (w.contact) { gf += 0.25; slip = Math.max(slip, w.slip); if (w.water > 0.1) wet = true; surf = w.surf === SURF.mud ? 'mud' : w.surf === SURF.grass ? 'grass' : w.surf === SURF.wood ? 'wood' : surf; } }
    AUDIO.update(dt, {
      rpm: car.rpm, throttle: GAME.mode === 'menu' ? 0 : inp.throttle * (GAME.over ? 0 : 1), boost: car.boost, speed: car.speed, slip, groundFrac: gf, surface: surf, water: wet,
      danger: GAME.danger, drums: GAME.mode === 'escape' && GAME.started && !GAME.over ? 0.25 + GAME.danger * 0.75 : 0, engineOn: car.health > 0, paused: false,
    });
    // HUD
    if (playing) {
      HUD.drawGauge({ rpm: car.rpm, kmh: Math.abs(car.vLong) * 3.6, gear: car.gear === 0 ? 'R' : car.gear === 1 ? 'N' : String(car.gear - 1), boost: car.boost, manual: INPUT.manual });
      hudTick -= dt; mapTick -= dt; noteTick -= dt;
      if (hudTick <= 0) { HUD.update(GAME); hudTick = 0.1; }
      if (mapTick <= 0) { HUD.drawMap({ pos: rPos, yaw: car.yaw }, BEAST, GAME.flareList); mapTick = 1 / 30; }
      if (noteTick <= 0) { HUD.updateNotes(car); noteTick = 0.12; }
    }
    GAME.hitFlash = Math.max(0, GAME.hitFlash - dt * 1.5);
    if (GAME.graceT > 0) GAME.graceT -= dt;
    if (GAME.over) {
      overT += dt;
      if (overT > 2.2 && $('over').hidden) { $('over').hidden = false; $('hud').hidden = true; }
    }
  }

  function resetToRoad() {
    const nr = WORLD.nearestRoad(car.pos.x, car.pos.z, false);
    let i = nr.i;
    const p = WORLD.roadPoint(nr.road, i);
    let yaw = Math.atan2(p.tx, p.tz);
    if (Math.cos(wrapAngle(yaw - car.yaw)) < 0) yaw += PI;
    // avoid resetting right into the beast
    car.place(p.x, p.h + 0.75, p.z, yaw);
    car.nitro = Math.max(car.nitro, 0.2);
    prevPos.copy(car.pos); prevQuat.copy(car.quat);
    resetCooldown = 2;
    upsideT = 0; stuckT = 0;
    HUD.toast('BACK ON THE ROAD', 'info', 1);
  }

  // ------------------------------------------------ events
  function handleCarEvents(playing) {
    for (const e of car.events) {
      switch (e.type) {
        case 'shift':
          AUDIO.play('shift');
          if (e.up && car.boost > 0.5) AUDIO.play('blowoff', { vol: car.boost });
          break;
        case 'pop': {
          AUDIO.play('pop', { n: e.n, vol: 0.8 });
          GAME.popT = 0.09;
          const ex = model.parts.exhaustLocal.clone().applyQuaternion(rQuat).add(rPos.clone().sub(car.com.clone().applyQuaternion(rQuat)));
          FX.burst('spark', ex.x, ex.y, ex.z, 6, 1.2, 1.5, 1, car.vel.clone().multiplyScalar(0.8));
          break;
        }
        case 'land':
          if (e.air > 0.4) {
            AUDIO.play('land', { vol: clamp(e.v / 8, 0.2, 1.2) });
            INPUT.rumble(clamp(e.v / 10, 0.2, 1), 0.5, 180);
            GAME.shake = Math.max(GAME.shake, clamp(e.v / 14, 0, 0.6));
            for (const w of car.wheels) FX.burst(w.road > 0.5 ? 'dust' : 'dustDark', w.cp.x, w.cp.y, w.cp.z, 3, 2, 1.5, 1.2);
            if (playing && GAME.mode === 'escape' && e.air > 0.7 && !GAME.over && GAME.started) {
              const pts = Math.round(e.air * 180);
              GAME.score += pts;
              HUD.toast(`AIR ${e.air.toFixed(1)}s +${pts}`, 'good');
            }
            if (!GAME.over) GAME.stats.bestAir = Math.max(GAME.stats.bestAir, e.air);
          }
          break;
        case 'impact': {
          const v = e.v;
          if (v > 3.5) {
            AUDIO.play(e.kind === 'ground' ? 'land' : 'impact', { vol: clamp((v - 3) / 10, 0.15, 1.2) });
            INPUT.rumble(clamp(v / 15, 0.15, 1), clamp(v / 10, 0.2, 1), 160);
            if (e.kind !== 'ground') FX.burst('spark', e.point.x, e.point.y, e.point.z, Math.min(14, Math.floor(v)), 2, 2);
            if (e.obst && e.obst.type === 'tree') FX.burst('leaf', e.point.x, e.point.y + 4, e.point.z, Math.min(16, Math.floor(v)), 2, 1, 1);
            if (playing && !GAME.over && v > 5) {
              const dmg = Math.max(0, v - (e.kind === 'ground' ? 7 : 6)) * (e.kind === 'ground' ? 0.5 : 1.3);
              if (GAME.mode === 'escape') car.health -= dmg;
              dentAt(e.point, e.normal.clone(), Math.min(0.12, (v - 5) * 0.01));
              GAME.shake = Math.max(GAME.shake, clamp(v / 20, 0.1, 0.8));
              if (v > 16 && model.parts.wing.parent === model.root && Math.random() < 0.35) detachWing(e.normal.clone().multiplyScalar(car.mass * 4));
            }
          }
          break;
        }
        case 'smash': {
          AUDIO.play('crack', { vol: 1 });
          FX.burst('chip', e.point.x, e.point.y + 0.5, e.point.z, 12, 3, 4);
          FX.burst('leaf', e.point.x, e.point.y + 6, e.point.z, 20, 3, 1);
          GAME.shake = Math.max(GAME.shake, 0.4);
          if (playing && !GAME.over && GAME.mode === 'escape') { car.health -= 3; GAME.score += 50; HUD.toast('TIMBER! +50', 'good', 1); }
          break;
        }
      }
    }
    car.events.length = 0;
    if (car.health <= 0 && playing && !GAME.over) { car.health = 0; HUD.center('WRECKED', 'bad'); gameOver('wrecked'); }
  }

  BS.onTreeFall = function (o, dx, dz) {
    const d = camera.position.distanceTo(new THREE.Vector3(o.x, o.y, o.z));
    if (d > 260) return;
    const vol = clamp(1.2 - d / 200, 0.05, 1);
    AUDIO.play('crack', { vol, pan: panFor(o.x, o.z) });
    FX.burst('leaf', o.x + dx * 4, o.y + o.h * 0.7, o.z + dz * 4, 18, 3, 2);
    FX.burst('chip', o.x, o.y + 0.8, o.z, 8, 2.5, 3);
  };
  BS.onTreeLand = function (o, f) {
    const d = camera.position.distanceTo(new THREE.Vector3(o.x, o.y, o.z));
    if (d > 260) return;
    AUDIO.play('thud', { vol: clamp(1.1 - d / 180, 0.05, 1), pan: panFor(o.x, o.z) });
    const hx = o.x + f.dir.x * o.h * 0.6, hz = o.z + f.dir.z * o.h * 0.6;
    FX.burst('dustDark', hx, WORLD.heightAt(hx, hz) + 0.5, hz, 10, 3, 1.5, 2);
    FX.burst('leaf', hx, WORLD.heightAt(hx, hz) + 2, hz, 14, 4, 2);
    GAME.shake = Math.max(GAME.shake, clamp(0.5 - d / 150, 0, 0.4));
  };

  function panFor(x, z) {
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const dx = x - camera.position.x, dz = z - camera.position.z, L = Math.hypot(dx, dz) || 1;
    return clamp((dx * r.x + dz * r.z) / L, -1, 1) * 0.85;
  }

  function handleBeastEvents() {
    if (!BEAST.active) { BEAST.events.length = 0; return; }
    const d = camera.position.distanceTo(BEAST.pos);
    const vol = clamp(1.25 - d / 220, 0, 1.2);
    const pan = panFor(BEAST.pos.x, BEAST.pos.z);
    for (const e of BEAST.events) {
      if (e.type === 'step') {
        if (GAME.mode !== 'menu' || d < 80) AUDIO.play('step', { vol: vol * 0.9, pan });
        if (GAME.mode !== 'menu' && d < 70) INPUT.rumble(clamp(0.8 - d / 90, 0, 0.8), 0.1, 120);
        GAME.shake = Math.max(GAME.shake, clamp(0.55 - d / 90, 0, 0.55));
        const fx = Math.sin(BEAST.yaw), fz = Math.cos(BEAST.yaw);
        const off = e.front ? 4 : -2.5;
        const px = BEAST.pos.x + fx * off + fz * e.side * 2.4, pz = BEAST.pos.z + fz * off - fx * e.side * 2.4;
        const gy = WORLD.heightAt(px, pz);
        if (gy < WORLD.WATER) FX.burst('splash', px, WORLD.WATER, pz, 10, 3, 6, 2);
        else FX.burst('dustDark', px, gy + 0.3, pz, 5, 2.5, 1.2, 1.8);
      } else if (e.type === 'roar') {
        AUDIO.play('roar', { vol: clamp(1.4 - d / 400, 0.15, 1.3), pan, big: e.big, pain: e.pain });
        if (GAME.mode === 'escape' && d < 200) GAME.shake = Math.max(GAME.shake, 0.25);
      } else if (e.type === 'slam') {
        AUDIO.play('slam', { vol: clamp(1.3 - d / 150, 0.1, 1.3), pan });
        FX.burst('dustDark', e.x, WORLD.heightAt(e.x, e.z) + 0.5, e.z, 18, 5, 2.5, 2.4);
        GAME.shake = Math.max(GAME.shake, clamp(1.1 - d / 60, 0.2, 1));
        if (!e.hit && BEAST.dist < 17 && GAME.mode === 'escape' && !GAME.over) { GAME.score += 250; HUD.toast('CLOSE CALL +250', 'good'); }
      }
    }
    BEAST.events.length = 0;
  }

  function menuBeast(dt) {
    // idle breathing pose; occasional roar
    BEAST.speed = 0;
    BEAST.stateT += dt;
    BEAST.roarT -= dt;
    if (BEAST.roarT <= 0) { BEAST.roar(true); BEAST.roarT = frand(9, 15); }
    const save = BEAST.state;
    BEAST.state = 'stunned'; BEAST.stateT = 4; // re-use animation path with no movement
    BEAST.update(dt, car, { difficulty: 'normal', time: 0, trail: [{ x: car.pos.x, z: car.pos.z, s: 0 }], started: false, beastHit() {} });
    BEAST.state = save;
  }

  // ------------------------------------------------ rules: checkpoints, beast contact, trail, scoring
  function gameLogic(dt) {
    const sp = car.speed;
    if (!GAME.over && GAME.started) {
      GAME.distance += sp * dt;
      GAME.stats.topSpeed = Math.max(GAME.stats.topSpeed, sp);
      if (GAME.mode === 'escape') GAME.score += sp * dt * 1.0 + dt * 2;
    }
    // trail for the beast
    const lt = GAME.trail[GAME.trail.length - 1];
    const dl = lt ? Math.hypot(car.pos.x - lt.x, car.pos.z - lt.z) : 99;
    if (dl > 4) { GAME.trailS += dl; GAME.trail.push({ x: car.pos.x, z: car.pos.z, s: GAME.trailS }); }
    // checkpoints
    for (const cp of PROPS.checkpoints) {
      const d = Math.hypot(car.pos.x - cp.x, car.pos.z - cp.z);
      if (d < 9) {
        const lastT = GAME.cpPassed.get(cp.index);
        if (lastT === undefined || GAME.time - lastT > 45) {
          GAME.cpPassed.set(cp.index, GAME.time);
          if (GAME.started && !GAME.over) {
            GAME.checkpoints++;
            AUDIO.play('checkpoint');
            if (GAME.mode === 'escape') {
              GAME.score += 500;
              const gotFlare = GAME.flares < 3;
              GAME.flares = Math.min(3, GAME.flares + 1);
              car.nitro = Math.min(1, car.nitro + 0.35);
              HUD.center('CHECKPOINT', 'good');
              HUD.toast(gotFlare ? '+500 · FLARE +1 · NITRO' : '+500 · NITRO', 'good', 2);
            } else HUD.center('CHECKPOINT', 'good');
            car.health = Math.min(100, car.health + 8);
          }
        }
      }
    }
    // drifting score
    if (GAME.started && !GAME.over && car.grounded >= 3 && sp > 11 && Math.abs(car.slipAngleBody) > 0.28) driftT += dt;
    else {
      if (driftT > 1.0 && GAME.mode === 'escape' && !GAME.over) { const pts = Math.round(driftT * 120); GAME.score += pts; GAME.stats.drifts++; HUD.toast(`DRIFT +${pts}`, 'good', 1.2); }
      driftT = 0;
    }
    // flares on the ground
    for (let i = GAME.flareList.length - 1; i >= 0; i--) {
      const f = GAME.flareList[i];
      f.t -= dt;
      if (Math.random() < dt * 40) FX.spawn('flare', f.pos.x, f.pos.y + 0.1, f.pos.z, frand(-0.4, 0.4), frand(1, 2.5), frand(-0.4, 0.4));
      if (Math.random() < dt * 8) FX.spawn('smoke', f.pos.x, f.pos.y + 0.2, f.pos.z, frand(-0.3, 0.3), 1.5, frand(-0.3, 0.3), 1, [0.75, 0.35, 0.32]);
      if (BEAST.active && BEAST.state !== 'stunned' && Math.hypot(BEAST.pos.x - f.pos.x, BEAST.pos.z - f.pos.z) < 10) {
        BEAST.stun();
        HUD.toast('THE BEAST IS STUNNED', 'good', 2);
        GAME.score += 200;
        f.t = 0;
      }
      if (f.t <= 0) { scene.remove(f.mesh); GAME.flareList.splice(i, 1); }
    }
    const lf = GAME.flareList[GAME.flareList.length - 1];
    if (lf) { flareLight.position.set(lf.pos.x, lf.pos.y + 0.8, lf.pos.z); flareLight.intensity = 30 * (0.8 + Math.random() * 0.4) * Math.min(1, lf.t); }
    else flareLight.intensity = 0;
    // beast proximity, contact and capture
    if (GAME.mode === 'escape' && BEAST.active) {
      const d = BEAST.dist;
      const target = BEAST.state === 'dormant' ? 0 : clamp(1 - (d - 14) / 140, 0, 1);
      GAME.danger = damp(GAME.danger, target, 3, dt);
      // body contact: beast is a wall
      const bx = BEAST.pos.x + Math.sin(BEAST.yaw) * 1.5, bz = BEAST.pos.z + Math.cos(BEAST.yaw) * 1.5;
      const cdx = car.pos.x - bx, cdz = car.pos.z - bz, cd = Math.hypot(cdx, cdz);
      if (cd < 5.2 && car.pos.y < BEAST.pos.y + 7 && !GAME.over) {
        const n = new THREE.Vector3(cdx / cd, 0.15, cdz / cd).normalize();
        const bv = new THREE.Vector3(Math.sin(BEAST.yaw) * BEAST.speed, 0, Math.cos(BEAST.yaw) * BEAST.speed);
        const rel = car.vel.clone().sub(bv).dot(n);
        car.pos.addScaledVector(n, 5.2 - cd);
        if (rel < 0) {
          car.applyImpulse(n.clone().multiplyScalar(-rel * 1.4 * car.mass), car.pos);
          if (-rel > 6 && !GAME.over) {
            if (!(GAME.graceT > 0)) { car.health -= (-rel - 6) * 1.0; GAME.graceT = 1.2; }
            AUDIO.play('impact', { vol: 0.9 }); GAME.shake = Math.max(GAME.shake, 0.7);
          }
        }
      }
      if (GAME.started && !GAME.over) {
        const hunting = BEAST.state === 'chase' || BEAST.state === 'attack';
        if (d < 10 && sp < 6 && hunting) caughtT += dt; else caughtT = Math.max(0, caughtT - dt * 2);
        if (caughtT > 1.4) {
          HUD.center('CAUGHT', 'bad');
          BEAST.state = 'attack'; BEAST.stateT = 0; BEAST.hitDone = false;
          GAME.beastHit(Math.sin(BEAST.yaw), Math.cos(BEAST.yaw));
          car.health = Math.min(car.health, 0);
          gameOver('caught');
        }
      }
    } else GAME.danger = damp(GAME.danger, 0, 3, dt);
    // flipped / stuck helpers
    const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quat).y;
    if (upY < 0.3 && sp < 3) upsideT += dt; else upsideT = 0;
    if (upsideT > 1.2 && upsideT - dt <= 1.2) HUD.toast('FLIPPED — PRESS R (OR BACK) TO RECOVER', 'bad', 2.5);
    if (upsideT > 4.5 && !GAME.over) resetToRoad();
    if (car.grounded === 0 && sp < 0.5) stuckT += dt; else stuckT = 0;
    if (stuckT > 3 && !GAME.over) resetToRoad();
    // dirt accumulates
    let dirtRate = 0;
    for (const w of car.wheels) if (w.contact) dirtRate += (w.mud * 0.03 + (w.road > 0.5 ? 0.004 : 0.008) - (w.water > 0.1 ? 0.02 : 0)) * Math.min(1, sp / 15);
    model.dirt.value = clamp(model.dirt.value + dirtRate * dt, 0, 1);
    // smoke when damaged
    if (car.health < 55) {
      const rate = car.health < 25 ? 30 : 10;
      if (Math.random() < dt * rate) {
        const p = new THREE.Vector3(frand(-0.3, 0.3), 0.95, 1.5).sub(car.com).applyQuaternion(car.quat).add(car.pos);
        FX.spawn(car.health < 25 ? 'blackSmoke' : 'smoke', p.x, p.y, p.z, car.vel.x * 0.5, 1.5, car.vel.z * 0.5, 1);
      }
    }
  }

  // ------------------------------------------------ visuals
  function updateCarVisual(dt, alpha) {
    const root = model.root;
    root.quaternion.copy(rQuat);
    root.position.copy(car.com).negate().applyQuaternion(rQuat).add(rPos);
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      const hubY = CARDIM.wheelR + w.Lrest - w.L;
      model.setWheel(i, Math.min(hubY, CARDIM.wheelR + 0.075), w.delta, w.angle);
      model.setBrakeGlow(i, w.heat);
    }
    model.setSteeringWheel(car.steerAngle);
    const brk = GAME.mode === 'menu' ? 0 : (car.gear === 0 ? INPUT.state.throttle : INPUT.state.brake);
    model.setLights(brk, car.gear === 0, car.boosting);
    const sp = car.speed;
    model.parts.flaps.forEach((f, i) => { f.rotation.x = -clamp(sp * 0.012, 0, 0.55) + Math.sin(ENV.time.value * 18 + i * 1.7) * 0.06 * Math.min(1, sp / 15); });
    // exhaust flame for pops and nitro
    const fl = model.parts.flame;
    if (GAME.popT > 0) GAME.popT -= dt;
    if (car.boosting || GAME.popT > 0) {
      fl.visible = true;
      fl.scale.set(1, 1, car.boosting ? frand(1.2, 1.8) : frand(0.6, 1.1));
      model.M.flame.color.setHex(car.boosting ? 0x6ab8ff : 0xffa040);
    } else fl.visible = false;
    if (car.boosting) {
      const ex = model.parts.exhaustLocal.clone().applyQuaternion(rQuat).add(root.position);
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(rQuat);
      FX.spawn('nitro', ex.x, ex.y, ex.z, back.x * 6 + car.vel.x, back.y * 6 + car.vel.y, back.z * 6 + car.vel.z);
      if (!GAME.nitroSnd) { AUDIO.play('nitro', { vol: 0.8 }); GAME.nitroSnd = true; }
    } else GAME.nitroSnd = false;
    // idle exhaust puffs
    if (sp < 8 && Math.random() < dt * 4) {
      const ex = model.parts.exhaustLocal.clone().applyQuaternion(rQuat).add(root.position);
      FX.spawn('smoke', ex.x, ex.y, ex.z, frand(-0.2, 0.2), 0.3, -0.8, 0.5);
    }
    model.setCockpit(CAM_MODES[GAME.camMode] === 'cockpit' && GAME.mode !== 'menu' && !INPUT.state.lookBack);
  }

  const fxAcc = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  function wheelFx(dt) {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rQuat);
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      if (!w.contact) { FX.skidmark(i, w.cp, w.n, 0, 0, 0); continue; }
      const sp = w.groundSpeed, slip = w.slip;
      const a = fxAcc[i];
      const cp = w.cp;
      const vx = car.vel.x, vz = car.vel.z;
      const spinV = w.omega * w.radius;
      const dirx = fwd.x, dirz = fwd.z;
      if (w.water > 0.08) {
        a[0] += dt * (sp * 2.2 + slip * 2);
        while (a[0] > 1) { a[0]--; FX.spawn('splash', cp.x, WORLD.WATER + 0.05, cp.z, vx * 0.5 + frand(-2, 2), frand(2, 5) + sp * 0.08, vz * 0.5 + frand(-2, 2), 1); }
        a[1] += dt * sp * 0.6;
        while (a[1] > 1) { a[1]--; FX.spawn('spray', cp.x, WORLD.WATER + 0.3, cp.z, vx * 0.6 + frand(-1, 1), frand(1, 2.5), vz * 0.6 + frand(-1, 1), 1); }
        FX.skidmark(i, cp, w.n, 0, 0, 0);
        continue;
      }
      if (w.deck) { FX.skidmark(i, cp, w.n, 0, 0, 0); continue; }
      const muddy = w.mud > 0.4;
      const onRoad = w.road > 0.5;
      // dust plume (gravel), dark dust off-road
      const dustRate = onRoad && !muddy ? (sp > 6 ? (sp - 6) * 0.55 + slip * 1.4 : slip * 0.8) : (slip > 3 ? slip * 0.5 : 0);
      a[0] += dt * dustRate * (FX.quality === 'low' ? 0.5 : 1);
      while (a[0] > 1) { a[0]--; FX.spawn(onRoad ? 'dust' : 'dustDark', cp.x + frand(-0.2, 0.2), cp.y + 0.2, cp.z + frand(-0.2, 0.2), vx * 0.25 + frand(-1, 1), frand(0.5, 1.6), vz * 0.25 + frand(-1, 1), 1); }
      // thrown debris from spinning/sliding tyres
      const throwRate = (muddy ? 1 : 0.35) * (Math.max(0, Math.abs(spinV - w.vLong) - 1) * 3 + (muddy ? sp * 0.5 : 0) + Math.max(0, slip - 3));
      a[1] += dt * throwRate;
      while (a[1] > 1) {
        a[1]--;
        const back = -Math.sign(spinV || 1) * frand(2, 5);
        FX.spawn(muddy ? 'mud' : onRoad ? 'chip' : 'grassBits', cp.x, cp.y + 0.15, cp.z, vx * 0.4 + dirx * back + frand(-1, 1), frand(1.5, 4.5), vz * 0.4 + dirz * back + frand(-1, 1), 1, muddy ? null : onRoad ? [0.42, 0.35, 0.26] : null);
      }
      // skid marks
      const s = Math.max(0, slip - 1.6);
      const alpha = clamp(s * 0.09, 0, 0.55) + (muddy ? 0.3 : 0);
      const col = muddy ? [0.08, 0.06, 0.04] : onRoad ? [0.18, 0.14, 0.1] : [0.12, 0.14, 0.06];
      FX.skidmark(i, cp, w.n, dirx, dirz, sp > 1 ? alpha : 0, col);
    }
  }

  // ------------------------------------------------ camera
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  function updateCamera(dt, inp) {
    const mode = GAME.mode === 'menu' ? 'menu' : CAM_MODES[GAME.camMode];
    const carPos = rPos;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rQuat);
    const carYaw = Math.atan2(fwd.x, fwd.z);
    const sp = car.speed;
    GAME.shake = Math.max(0, GAME.shake - dt * 1.8);
    let fovT = 62;
    const look = inp.lookBack && GAME.mode !== 'menu';
    if (mode === 'menu') {
      cam.orbit += dt * 0.12;
      const r = 8.5;
      const tgt = tmpV.set(carPos.x + Math.sin(cam.orbit) * r, 0, carPos.z + Math.cos(cam.orbit) * r);
      tgt.y = Math.max(WORLD.heightAt(tgt.x, tgt.z) + 1.2, carPos.y + 1.6);
      cam.pos.lerp(tgt, 1 - Math.exp(-3 * dt));
      camera.position.copy(cam.pos);
      camera.lookAt(carPos.x, carPos.y + 0.4, carPos.z);
      fovT = 50;
    } else if (mode === 'chase' || mode === 'far' || look) {
      const far = mode === 'far';
      let targetYaw = carYaw;
      if (sp > 4 && car.vLong > 1) {
        const vy = Math.atan2(car.vel.x, car.vel.z);
        targetYaw = carYaw + wrapAngle(vy - carYaw) * 0.45;
      }
      if (look) targetYaw += PI;
      const lambda = look ? 30 : car.grounded ? 5.5 : 2.5;
      cam.yaw += wrapAngle(targetYaw - cam.yaw) * (1 - Math.exp(-lambda * dt));
      const dist = (far ? 9.5 : 6.3) + clamp(sp * 0.03, 0, 1.8);
      const height = (far ? 3.4 : 2.15) + sp * 0.006;
      const dx = Math.sin(cam.yaw), dz = Math.cos(cam.yaw);
      const desired = tmpV.set(carPos.x - dx * dist, carPos.y + height, carPos.z - dz * dist);
      if (look) cam.pos.copy(desired);
      else {
        const kxz = 1 - Math.exp(-14 * dt), ky = 1 - Math.exp(-7 * dt);
        cam.pos.x += (desired.x - cam.pos.x) * kxz;
        cam.pos.z += (desired.z - cam.pos.z) * kxz;
        cam.pos.y += (desired.y - cam.pos.y) * ky;
      }
      const gy = WORLD.heightAt(cam.pos.x, cam.pos.z) + 0.7;
      if (cam.pos.y < gy) cam.pos.y = gy;
      camera.position.copy(cam.pos);
      cam.look.set(carPos.x + dx * 3, carPos.y + (far ? 1.2 : 1.0), carPos.z + dz * 3);
      camera.up.set(0, 1, 0);
      camera.lookAt(cam.look);
      fovT = (far ? 58 : 63) + Math.min(sp * 0.22, 16) + (car.boosting ? 7 : 0);
    } else {
      // mounted cameras
      const mount = mode === 'hood' ? tmpV.set(0, 1.12, 0.95) : mode === 'bumper' ? tmpV.set(0, 0.6, 2.2) : tmpV.set(0.36, 1.18, -0.3);
      if (mode === 'cockpit') {
        // head sways with g-forces
        const lat = car.vel.clone().applyQuaternion(rQuat.clone().invert());
        GAME.headX = damp(GAME.headX || 0, clamp(-car.angVel.y * lat.z * 0.004, -0.06, 0.06), 6, dt);
        mount.x += GAME.headX;
      }
      const p = mount.sub(car.com).applyQuaternion(rQuat).add(carPos);
      camera.position.copy(p);
      tmpQ.copy(rQuat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PI));
      cam.q.slerp(tmpQ, 1 - Math.exp(-(mode === 'cockpit' ? 18 : 30) * dt));
      camera.quaternion.copy(cam.q);
      if (mode === 'cockpit') camera.rotateX(-0.1);
      fovT = mode === 'cockpit' ? 76 : 66 + Math.min(sp * 0.2, 14);
      cam.pos.copy(camera.position);
      cam.yaw = carYaw;
    }
    if (mode !== 'hood' && mode !== 'cockpit' && mode !== 'bumper') cam.q.copy(camera.quaternion);
    // shake: impacts, beast footsteps, rough ground, boost
    let rough = 0;
    for (const w of car.wheels) if (w.contact) rough += Math.abs(w.L - w.Lprev) * 240;
    const sh = GAME.shake + clamp(rough * 0.012, 0, 0.12) * (mode === 'menu' ? 0 : 1) + (car.boosting ? 0.05 : 0);
    if (sh > 0.001) {
      const t = ENV.time.value;
      camera.rotateX((Math.sin(t * 37) + Math.sin(t * 61) * 0.5) * 0.008 * sh);
      camera.rotateY((Math.sin(t * 43 + 1) + Math.sin(t * 71) * 0.5) * 0.008 * sh);
      camera.rotateZ(Math.sin(t * 29 + 2) * 0.006 * sh);
    }
    cam.fov = damp(cam.fov, fovT, 3, dt);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  }
})();
