'use strict';
// ============================================================ terrain, water, sky
const ENV = {
  sunDir: new THREE.Vector3(-0.55, 0.62, -0.56).normalize(),
  sunColor: new THREE.Color(1.0, 0.92, 0.78),
  fogColor: new THREE.Color(0.66, 0.74, 0.72),
  zenith: new THREE.Color(0.24, 0.44, 0.74),
  time: { value: 0 },
};

const TERRAIN = { chunks: [], CH: 64, material: null, maskTex: null, pending: [] };

function buildMaskTexture() {
  const t = new THREE.DataTexture(WORLD.mask, WORLD.N, WORLD.N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  TERRAIN.maskTex = t;
  return t;
}

function terrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const uniforms = {
    tGrass: { value: TEX.grass }, tForest: { value: TEX.forest }, tGravel: { value: TEX.gravel },
    tMud: { value: TEX.mud }, tRock: { value: TEX.rock }, tSand: { value: TEX.sand },
    tMask: { value: TERRAIN.maskTex }, uHalf: { value: WORLD.HALF }, uCell: { value: WORLD.CELL }, uN: { value: WORLD.N },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWN;
uniform sampler2D tGrass, tForest, tGravel, tMud, tRock, tSand, tMask;
uniform float uHalf, uCell, uN;
float tRough;`)
      .replace('#include <map_fragment>', `
vec2 muv = ((vWPos.xz + uHalf) / uCell + 0.5) / uN;
vec4 mk = texture2D(tMask, muv);
float rdist = mk.r * 24.0;
float mudM = mk.g;
float wet = mk.b;
float forest = mk.a;
vec3 wn = normalize(vWN);
float slope = 1.0 - wn.y;
vec2 uv = vWPos.xz;
float macro = texture2D(tGrass, uv * 0.0037).g * 2.2;
float macro2 = texture2D(tMud, uv * 0.0071 + 0.3).r * 2.5;
vec3 grass = mix(texture2D(tGrass, uv * 0.23).rgb, texture2D(tGrass, uv * 0.057 + 0.31).rgb, 0.45);
grass *= mix(vec3(0.85, 0.95, 0.8), vec3(1.12, 1.05, 0.9), macro2);
vec3 forestC = mix(texture2D(tForest, uv * 0.19).rgb, texture2D(tForest, uv * 0.047 + 0.7).rgb, 0.35);
vec3 gravel = mix(texture2D(tGravel, uv * 0.31).rgb, texture2D(tGravel, uv * 0.083 + 0.5).rgb, 0.4);
vec4 mudT = texture2D(tMud, uv * 0.17);
vec3 sand = texture2D(tSand, uv * 0.25).rgb;
vec3 rx = texture2D(tRock, vWPos.zy * 0.07).rgb, rz = texture2D(tRock, vWPos.xy * 0.07).rgb, ry = texture2D(tRock, uv * 0.07).rgb;
vec3 aw = abs(wn); aw = aw / (aw.x + aw.y + aw.z);
vec3 rock = rx * aw.x + ry * aw.y + rz * aw.z;
vec3 col = mix(grass, forestC, smoothstep(0.3, 0.8, forest + (macro - 0.5) * 0.5));
col = mix(col, sand, smoothstep(0.02, 0.14, wet));
col = mix(col, rock, smoothstep(0.28, 0.46, slope + (macro - 0.5) * 0.08));
float edgeN = (texture2D(tGravel, uv * 0.05).r - 0.4) * 1.6;
float roadW = 1.0 - smoothstep(3.9 + edgeN * 0.5, 5.0 + edgeN, rdist);
float rut = smoothstep(0.42, 0.0, abs(rdist - 0.85));
float loose = smoothstep(2.4, 4.2, rdist);
vec3 road = gravel * (1.0 - rut * 0.28);
road = mix(road, gravel * vec3(1.12, 1.08, 1.02), loose * 0.45);
road = mix(road, road * vec3(0.8, 0.85, 0.7), smoothstep(0.2, 0.0, rdist) * 0.0);
col = mix(col, road, roadW);
float mudW = smoothstep(0.12, 0.55, mudM + (mudT.a / 1.0 - 0.45) * 0.25);
vec3 mudC = mudT.rgb * (1.0 - rut * 0.25 * roadW);
col = mix(col, mudC, mudW);
float wetDark = smoothstep(0.1, 0.22, wet);
col *= 1.0 - wetDark * 0.4;
tRough = mix(0.95, 0.88, roadW);
tRough = mix(tRough, 1.0 - mudT.a * 0.9, mudW);
tRough = mix(tRough, 0.4, wetDark);
diffuseColor.rgb *= col;
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;');
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  return mat;
}

function buildChunkGeometry(ci, cj, step) {
  const N = WORLD.N, C = WORLD.CELL, H = WORLD.HALF, CH = TERRAIN.CH;
  const cells = CH / step, vn = cells + 1;
  const i0 = ci * CH, j0 = cj * CH;
  const count = vn * vn + 4 * vn;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  const h = WORLD.h, nx = WORLD.nx, ny = WORLD.ny, nz = WORLD.nz;
  let v = 0;
  const put = (i, j, drop) => {
    const k = j * N + i;
    pos[v * 3] = -H + i * C; pos[v * 3 + 1] = h[k] - drop; pos[v * 3 + 2] = -H + j * C;
    nor[v * 3] = nx[k]; nor[v * 3 + 1] = ny[k]; nor[v * 3 + 2] = nz[k];
    return v++;
  };
  for (let b = 0; b < vn; b++) for (let a = 0; a < vn; a++) put(Math.min(N - 1, i0 + a * step), Math.min(N - 1, j0 + b * step), 0);
  const idx = [];
  for (let b = 0; b < cells; b++) for (let a = 0; a < cells; a++) {
    const A = b * vn + a, B = A + 1, Cc = A + vn, D = Cc + 1;
    idx.push(A, Cc, B, B, Cc, D);
  }
  // skirts
  const drop = 2 + step * 1.5;
  const edges = [
    (t) => [t, 0], (t) => [t, cells], (t) => [0, t], (t) => [cells, t],
  ];
  for (const e of edges) {
    const base = v;
    for (let t = 0; t < vn; t++) { const [a, b] = e(t); put(Math.min(N - 1, i0 + a * step), Math.min(N - 1, j0 + b * step), drop); }
    for (let t = 0; t < cells; t++) {
      const [a0, b0] = e(t), [a1, b1] = e(t + 1);
      const top0 = b0 * vn + a0, top1 = b1 * vn + a1, bot0 = base + t, bot1 = base + t + 1;
      idx.push(top0, bot0, top1, top1, bot0, bot1, top0, top1, bot0, top1, bot1, bot0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function buildTerrain(scene) {
  buildMaskTexture();
  TERRAIN.material = terrainMaterial();
  const NC = (WORLD.N - 1) / TERRAIN.CH;
  TERRAIN.NC = NC;
  for (let cj = 0; cj < NC; cj++) for (let ci = 0; ci < NC; ci++) {
    const mesh = new THREE.Mesh(buildChunkGeometry(ci, cj, 8), TERRAIN.material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
    const cx = -WORLD.HALF + (ci + 0.5) * TERRAIN.CH * WORLD.CELL, cz = -WORLD.HALF + (cj + 0.5) * TERRAIN.CH * WORLD.CELL;
    TERRAIN.chunks.push({ ci, cj, cx, cz, mesh, lod: 8, geos: { 8: mesh.geometry } });
  }
}

function updateTerrain(cam, viewDist, budget = 2) {
  let built = 0;
  for (const c of TERRAIN.chunks) {
    const d = Math.max(0, Math.hypot(c.cx - cam.x, c.cz - cam.z) - 90);
    c.mesh.visible = d < viewDist;
    if (!c.mesh.visible) continue;
    const want = d < 170 ? 1 : d < 380 ? 2 : d < 650 ? 4 : 8;
    if (want !== c.lod) {
      if (!c.geos[want]) {
        if (built >= budget) continue;
        c.geos[want] = buildChunkGeometry(c.ci, c.cj, want);
        built++;
      }
      c.mesh.geometry = c.geos[want];
      c.lod = want;
    }
  }
}

// ---------------------------------------------------------- water
function buildWaterNormalTex() {
  const S = 256, pn = makePeriodicNoise(321);
  const hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) hgt[y * S + x] = periodicFbm(pn, x / S * 8, y / S * 8, 8, 4);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
    const hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
    const nx = -hx * 6, ny = -hy * 6, nz = 1, L = Math.hypot(nx, ny, nz);
    const i = (y * S + x) * 4;
    data[i] = (nx / L * 0.5 + 0.5) * 255; data[i + 1] = (ny / L * 0.5 + 0.5) * 255; data[i + 2] = (nz / L * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  return dataTex(S, data, { linear: true });
}

function buildWater(scene) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, tMask: { value: null }, tNorm: { value: null },
    uSun: { value: ENV.sunDir.clone() }, uSunCol: { value: ENV.sunColor.clone() },
    uHorizon: { value: ENV.fogColor.clone() }, uZenith: { value: ENV.zenith.clone() },
    uHalf: { value: WORLD.HALF }, uCell: { value: WORLD.CELL }, uN: { value: WORLD.N },
  }]);
  uniforms.tMask.value = TERRAIN.maskTex;
  uniforms.tNorm.value = buildWaterNormalTex();
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, fog: true, depthWrite: false,
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWPos;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uHalf, uCell, uN;
      uniform sampler2D tMask, tNorm;
      uniform vec3 uSun, uSunCol, uHorizon, uZenith;
      varying vec3 vWPos;
      void main(){
        vec2 muv = ((vWPos.xz + uHalf) / uCell + 0.5) / uN;
        float depth = texture2D(tMask, muv).b * 6.0 - 1.2;
        if (depth < -0.05) discard;
        vec2 uv = vWPos.xz;
        vec3 n1 = texture2D(tNorm, uv * 0.045 + vec2(uTime * 0.012, uTime * 0.008)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(tNorm, uv * 0.11 - vec2(uTime * 0.017, -uTime * 0.011)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(tNorm, uv * 0.31 + vec2(-uTime * 0.03, uTime * 0.025)).xyz * 2.0 - 1.0;
        vec3 nn = normalize(vec3(n1.x + n2.x + n3.x * 0.5, 3.2, n1.y + n2.y + n3.y * 0.5));
        vec3 V = normalize(cameraPosition - vWPos);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nn, V), 0.0), 5.0);
        vec3 R = reflect(-V, nn);
        vec3 sky = mix(uHorizon, uZenith, clamp(R.y * 1.6, 0.0, 1.0));
        float spec = pow(max(dot(R, uSun), 0.0), 380.0) * 6.0 + pow(max(dot(R, uSun), 0.0), 40.0) * 0.25;
        vec3 deep = vec3(0.03, 0.075, 0.06), shallow = vec3(0.2, 0.24, 0.15);
        float dt = clamp(depth / 2.6, 0.0, 1.0);
        vec3 body = mix(shallow, deep, dt);
        float diff = max(dot(nn, uSun), 0.0) * 0.5 + 0.5;
        vec3 col = mix(body * diff * uSunCol, sky, fres) + uSunCol * spec;
        float foamN = texture2D(tNorm, uv * 0.5 + uTime * 0.04).x;
        float foam = smoothstep(0.35, 0.0, depth) * smoothstep(0.45, 0.65, foamN + 0.15 * sin(uTime * 1.5 + uv.x * 0.3));
        col = mix(col, vec3(0.85, 0.88, 0.82), foam * 0.7);
        float alpha = clamp(0.35 + dt * 0.75 + fres * 0.5, 0.0, 0.96);
        alpha *= smoothstep(-0.05, 0.12, depth);
        gl_FragColor = vec4(col, max(alpha, foam * 0.8));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(WORLD.SIZE, WORLD.SIZE, 64, 64);
  geo.rotateX(-PI / 2);
  const water = new THREE.Mesh(geo, mat);
  water.position.y = WORLD.WATER;
  water.renderOrder = 2;
  scene.add(water);
  return water;
}

// ---------------------------------------------------------- sky
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uSun: { value: ENV.sunDir }, uHorizon: { value: ENV.fogColor }, uZenith: { value: ENV.zenith },
      uSunCol: { value: ENV.sunColor }, uTime: ENV.time,
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uSun, uHorizon, uZenith, uSunCol; uniform float uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5;} return s; }
      #include <common>
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
        if (d.y < 0.0) col = uHorizon * 0.95;
        float sd = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 64.0) * 0.4);
        col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 18.0;
        if (d.y > 0.0) {
          vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
          float c = fbm(cp);
          float cov = smoothstep(0.48, 0.78, c) * smoothstep(0.0, 0.18, d.y);
          vec3 cc = mix(vec3(1.0, 0.97, 0.92), uHorizon * 0.9, smoothstep(0.6, 0.95, c));
          cc += uSunCol * pow(sd, 8.0) * 0.6;
          col = mix(col, cc, cov * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function buildSky(scene, renderer) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), skyMaterial());
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  // environment map for reflections (paint, glass, chrome)
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial());
  envScene.add(envSky);
  // a dark jungle ring around the horizon so reflections read as "under trees"
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 18, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x1d2a14, side: THREE.BackSide }));
  ring.position.y = 2;
  envScene.add(ring);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(45, 24), new THREE.MeshBasicMaterial({ color: 0x3a3424 }));
  ground.rotation.x = -PI / 2; ground.position.y = -3;
  envScene.add(ground);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();
  scene.environment = env;
  return sky;
}

function buildLights(scene, quality) {
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x4d5a30, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(ENV.sunColor, 3.0);
  sun.position.copy(ENV.sunDir).multiplyScalar(200);
  sun.castShadow = quality !== 'low';
  const sz = quality === 'high' ? 4096 : 2048;
  sun.shadow.mapSize.set(sz, sz);
  const ext = 75;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 500 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun, ext };
}

function updateSunShadow(lights, focus) {
  const sun = lights.sun;
  const texel = (lights.ext * 2) / sun.shadow.mapSize.x;
  // snap the shadow box to texels to stop shimmering
  const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
  sun.target.position.set(fx, focus.y, fz);
  sun.position.set(fx + ENV.sunDir.x * 220, focus.y + ENV.sunDir.y * 220, fz + ENV.sunDir.z * 220);
}
