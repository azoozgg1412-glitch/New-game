'use strict';
// ============================================================ synthesized audio
const AUDIO = { ctx: null, on: true, ready: false, volume: 0.8 };

(function () {
  let ctx, master, noiseBuf, eng, roll, skid, wind, water, insects, drumGain, sfx;
  let nextDrum = 0, drumStep = 0, nextBird = 0, nextHeart = 0;

  function noiseBuffer(sec = 2) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random() * 1.5); return s; }
  function shaper(amount) {
    const ws = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
    ws.curve = curve; ws.oversample = '2x';
    return ws;
  }
  function loopNoise(type, freq, q) {
    const src = noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    return { src, f, g };
  }

  AUDIO.init = function () {
    if (AUDIO.ctx) { if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = AUDIO.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = AUDIO.on ? AUDIO.volume : 0;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = noiseBuffer(2);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);

    // ---- engine
    eng = {};
    eng.o1 = ctx.createOscillator(); eng.o1.type = 'sawtooth';
    eng.o2 = ctx.createOscillator(); eng.o2.type = 'sawtooth';
    eng.o3 = ctx.createOscillator(); eng.o3.type = 'square';
    eng.g1 = ctx.createGain(); eng.g1.gain.value = 0.32;
    eng.g2 = ctx.createGain(); eng.g2.gain.value = 0.22;
    eng.g3 = ctx.createGain(); eng.g3.gain.value = 0.18;
    eng.mix = ctx.createGain(); eng.mix.gain.value = 1;
    eng.o1.connect(eng.g1); eng.o2.connect(eng.g2); eng.o3.connect(eng.g3);
    eng.g1.connect(eng.mix); eng.g2.connect(eng.mix); eng.g3.connect(eng.mix);
    eng.rasp = loopNoise('bandpass', 400, 2.5); eng.rasp.g.disconnect(); eng.rasp.g.connect(eng.mix);
    eng.ws = shaper(6);
    eng.lp = ctx.createBiquadFilter(); eng.lp.type = 'lowpass'; eng.lp.Q.value = 3;
    eng.peak = ctx.createBiquadFilter(); eng.peak.type = 'peaking'; eng.peak.frequency.value = 180; eng.peak.gain.value = 6; eng.peak.Q.value = 1.2;
    eng.out = ctx.createGain(); eng.out.gain.value = 0;
    eng.mix.connect(eng.ws); eng.ws.connect(eng.lp); eng.lp.connect(eng.peak); eng.peak.connect(eng.out); eng.out.connect(master);
    eng.o1.start(); eng.o2.start(); eng.o3.start();
    // turbo whistle
    eng.turbo = ctx.createOscillator(); eng.turbo.type = 'sine';
    eng.tg = ctx.createGain(); eng.tg.gain.value = 0;
    eng.turbo.connect(eng.tg); eng.tg.connect(master); eng.turbo.start();

    roll = loopNoise('bandpass', 700, 0.7);
    skid = loopNoise('bandpass', 1800, 1.5);
    wind = loopNoise('lowpass', 380, 0.5);
    water = loopNoise('bandpass', 1100, 0.6);
    insects = loopNoise('bandpass', 5200, 8);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.012;
    lfo.connect(lfoG); lfoG.connect(insects.g.gain); lfo.start();
    insects.g.gain.value = 0.014;
    drumGain = ctx.createGain(); drumGain.gain.value = 0; drumGain.connect(master);
    AUDIO.ready = true;
  };

  AUDIO.setOn = function (on) {
    AUDIO.on = on;
    if (master) master.gain.setTargetAtTime(on ? AUDIO.volume : 0, ctx.currentTime, 0.05);
  };

  // ------------------------------------------------ one-shots
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function burst(freq, type, q, peak, dur, dest = sfx, pan = 0, delay = 0) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    s.connect(f); f.connect(g); g.connect(p); p.connect(dest);
    env(g, t, 0.004, peak, dur);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return f;
  }
  function tone(f0, f1, type, peak, dur, dest = sfx, pan = 0, delay = 0, attack = 0.005) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    o.connect(g); g.connect(p); p.connect(dest);
    env(g, t, attack, peak, dur);
    o.start(t); o.stop(t + dur + attack + 0.05);
  }

  AUDIO.play = function (name, opt = {}) {
    if (!AUDIO.ready || !AUDIO.on) return;
    const v = opt.vol == null ? 1 : opt.vol;
    const pan = opt.pan || 0;
    switch (name) {
      case 'pop': {
        const n = opt.n || 3;
        for (let i = 0; i < n; i++) {
          const d = i * frand(0.04, 0.11);
          burst(frand(700, 1600), 'lowpass', 0.7, 0.5 * v * frand(0.5, 1), 0.05, sfx, 0, d);
          tone(frand(70, 110), 40, 'sine', 0.35 * v, 0.08, sfx, 0, d);
        }
        break;
      }
      case 'shift': burst(2500, 'bandpass', 3, 0.12 * v, 0.03); tone(120, 60, 'square', 0.05 * v, 0.04); break;
      case 'blowoff': {
        const f = burst(3200, 'bandpass', 2, 0.16 * v, 0.35);
        f.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.35);
        break;
      }
      case 'impact': {
        const s = clamp(v, 0.1, 1.5);
        burst(300 + s * 400, 'lowpass', 0.8, 0.7 * s, 0.25 + s * 0.2);
        burst(2800, 'bandpass', 4, 0.25 * s, 0.15 + s * 0.15);
        tone(90, 40, 'sine', 0.6 * s, 0.25);
        break;
      }
      case 'scrape': burst(1500, 'bandpass', 1.5, 0.12 * v, 0.2); break;
      case 'land': burst(250, 'lowpass', 0.7, 0.6 * v, 0.3); tone(70, 35, 'sine', 0.5 * v, 0.3); break;
      case 'splash': burst(900, 'bandpass', 0.8, 0.5 * v, 0.6); burst(3000, 'highpass', 0.5, 0.2 * v, 0.4); break;
      case 'crack': {
        for (let i = 0; i < 5; i++) burst(frand(1500, 4000), 'bandpass', 2, 0.35 * v, 0.03, sfx, pan, i * frand(0.02, 0.06));
        tone(220, 90, 'sawtooth', 0.08 * v, 0.6, sfx, pan, 0.05, 0.05);
        break;
      }
      case 'thud': burst(180, 'lowpass', 0.8, 0.6 * v, 0.6, sfx, pan); tone(55, 30, 'sine', 0.6 * v, 0.5, sfx, pan); break;
      case 'step': {
        tone(52, 28, 'sine', 0.9 * v, 0.35, sfx, pan);
        burst(160, 'lowpass', 0.8, 0.45 * v, 0.3, sfx, pan);
        break;
      }
      case 'slam': {
        tone(60, 25, 'sine', 1.2 * v, 0.7, sfx, pan);
        burst(400, 'lowpass', 0.7, 1.0 * v, 0.6, sfx, pan);
        burst(2500, 'bandpass', 3, 0.4 * v, 0.4, sfx, pan);
        break;
      }
      case 'roar': {
        const t = ctx.currentTime;
        const dur = opt.big ? 2.4 : 1.3;
        const out = ctx.createGain(); out.gain.value = 0;
        const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
        const ws = shaper(18);
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 3;
        const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 4;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        const base = opt.pain ? 120 : 68;
        const oscs = [];
        for (const [mul, type, gv] of [[1, 'sawtooth', 0.5], [1.49, 'sawtooth', 0.3], [0.5, 'square', 0.35], [2.02, 'sawtooth', 0.18]]) {
          const o = ctx.createOscillator(); o.type = type;
          o.frequency.setValueAtTime(base * mul * 0.8, t);
          o.frequency.linearRampToValueAtTime(base * mul * 1.15, t + dur * 0.3);
          o.frequency.linearRampToValueAtTime(base * mul * 0.7, t + dur);
          const g = ctx.createGain(); g.gain.value = gv;
          const vib = ctx.createOscillator(); vib.frequency.value = frand(6, 11);
          const vg = ctx.createGain(); vg.gain.value = base * mul * 0.06;
          vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + dur + 0.1);
          o.connect(g); g.connect(ws); o.start(t); o.stop(t + dur + 0.1);
          oscs.push(o);
        }
        const ns = ctx.createBufferSource(); ns.buffer = noiseBuf;
        const ng = ctx.createGain(); ng.gain.value = 0.6;
        ns.connect(ng); ng.connect(ws); ns.start(t); ns.stop(t + dur + 0.1);
        ws.connect(f1); ws.connect(f2);
        f1.frequency.setValueAtTime(350, t); f1.frequency.linearRampToValueAtTime(700, t + dur * 0.4); f1.frequency.linearRampToValueAtTime(300, t + dur);
        f2.frequency.setValueAtTime(900, t); f2.frequency.linearRampToValueAtTime(1500, t + dur * 0.35); f2.frequency.linearRampToValueAtTime(800, t + dur);
        f1.connect(lp); f2.connect(lp); lp.connect(out); out.connect(p); p.connect(sfx);
        const peak = 0.9 * v;
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(peak, t + 0.15);
        out.gain.setValueAtTime(peak, t + dur * 0.6);
        out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        tone(45, 30, 'sine', 0.7 * v, dur * 0.8, sfx, pan, 0, 0.1);
        break;
      }
      case 'checkpoint': tone(880, 880, 'sine', 0.25, 0.18); tone(1320, 1320, 'sine', 0.22, 0.3, sfx, 0, 0.12); break;
      case 'flare': burst(2000, 'highpass', 0.5, 0.3, 1.2); tone(600, 200, 'triangle', 0.15, 0.4); break;
      case 'nitro': burst(800, 'bandpass', 0.6, 0.4 * v, 0.5); tone(200, 900, 'sawtooth', 0.06 * v, 0.4); break;
      case 'heart': tone(60, 40, 'sine', 0.55 * v, 0.12); tone(55, 38, 'sine', 0.42 * v, 0.12, sfx, 0, 0.22); break;
      case 'beep': tone(opt.f || 660, opt.f || 660, 'square', 0.12, 0.15); break;
      case 'bird': {
        const f = frand(1800, 3800);
        for (let i = 0; i < 3; i++) tone(f, f * frand(0.6, 1.5), 'sine', 0.03, 0.08, sfx, pan, i * 0.11);
        break;
      }
    }
  };

  // ------------------------------------------------ continuous layers
  AUDIO.update = function (dt, s) {
    if (!AUDIO.ready) return;
    const t = ctx.currentTime;
    const k = 0.04;
    if (s.paused) {
      eng.out.gain.setTargetAtTime(0, t, 0.05);
      for (const l of [roll, skid, wind, water]) l.g.gain.setTargetAtTime(0, t, 0.05);
      drumGain.gain.setTargetAtTime(0, t, 0.1);
      eng.tg.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    const f = (s.rpm / 60) * 2; // firing frequency, 4 cylinders
    eng.o1.frequency.setTargetAtTime(f, t, 0.012);
    eng.o2.frequency.setTargetAtTime(f * 1.007, t, 0.012);
    eng.o3.frequency.setTargetAtTime(f * 0.5, t, 0.012);
    eng.rasp.f.frequency.setTargetAtTime(f * 3.2, t, 0.02);
    eng.rasp.g.gain.setTargetAtTime(0.25 + s.throttle * 0.6, t, k);
    eng.lp.frequency.setTargetAtTime(380 + s.rpm * 0.18 + s.throttle * 1600, t, 0.03);
    const load = 0.22 + s.throttle * 0.35 + (s.rpm / 7600) * 0.18;
    eng.out.gain.setTargetAtTime(s.engineOn ? load * 0.42 : 0, t, 0.03);
    eng.turbo.frequency.setTargetAtTime(1800 + s.boost * 4200, t, 0.05);
    eng.tg.gain.setTargetAtTime(s.boost * s.throttle * 0.018, t, 0.08);
    // tyres
    const sp = s.speed;
    roll.f.frequency.setTargetAtTime(s.surface === 'grass' ? 380 : s.surface === 'mud' ? 260 : 700, t, 0.1);
    roll.g.gain.setTargetAtTime(Math.min(0.35, sp * 0.012) * s.groundFrac, t, k);
    skid.f.frequency.setTargetAtTime(s.surface === 'road' || s.surface === 'wood' ? 1500 : 700, t, 0.1);
    skid.g.gain.setTargetAtTime(clamp((s.slip - 2.5) * 0.03, 0, 0.28) * s.groundFrac, t, 0.03);
    wind.g.gain.setTargetAtTime(Math.min(0.3, sp * sp * 0.00012), t, 0.1);
    wind.f.frequency.setTargetAtTime(300 + sp * 12, t, 0.1);
    water.g.gain.setTargetAtTime(s.water ? Math.min(0.5, sp * 0.04) : 0, t, 0.05);
    insects.g.gain.setTargetAtTime(0.012 * (1 - s.danger * 0.8), t, 0.5);
    // tension drums
    drumGain.gain.setTargetAtTime(s.drums * 0.55, t, 0.3);
    if (s.drums > 0.02) {
      const bpm = 92 + s.danger * 70;
      const stepT = 60 / bpm / 2;
      if (nextDrum < t) nextDrum = t + 0.05;
      while (nextDrum < t + 0.15) {
        const pat = [1, 0, 0.4, 0, 0.8, 0.3, 0.5, 0, 1, 0, 0.4, 0.3, 0.8, 0, 0.6, 0.4];
        const a = pat[drumStep % 16];
        if (a > 0) {
          const o = ctx.createOscillator(); o.type = 'sine';
          const g = ctx.createGain();
          const lowTom = drumStep % 4 === 0;
          o.frequency.setValueAtTime(lowTom ? 95 : 150, nextDrum);
          o.frequency.exponentialRampToValueAtTime(lowTom ? 45 : 80, nextDrum + 0.25);
          g.gain.setValueAtTime(0.0001, nextDrum);
          g.gain.exponentialRampToValueAtTime(a * 0.5, nextDrum + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, nextDrum + 0.3);
          o.connect(g); g.connect(drumGain); o.start(nextDrum); o.stop(nextDrum + 0.35);
          if (drumStep % 8 === 4) {
            const ns = ctx.createBufferSource(); ns.buffer = noiseBuf;
            const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2200;
            const ng = ctx.createGain();
            ng.gain.setValueAtTime(0.0001, nextDrum); ng.gain.exponentialRampToValueAtTime(0.18, nextDrum + 0.004); ng.gain.exponentialRampToValueAtTime(0.0001, nextDrum + 0.12);
            ns.connect(nf); nf.connect(ng); ng.connect(drumGain); ns.start(nextDrum, Math.random()); ns.stop(nextDrum + 0.15);
          }
        }
        drumStep++;
        nextDrum += stepT;
      }
    }
    // birds
    if (t > nextBird) { nextBird = t + frand(2, 7); if (s.danger < 0.5) AUDIO.play('bird', { pan: frand(-0.8, 0.8) }); }
    // heartbeat
    if (s.danger > 0.55 && t > nextHeart) { nextHeart = t + lerp(0.95, 0.45, (s.danger - 0.55) / 0.45); AUDIO.play('heart', { vol: s.danger }); }
  };
})();
