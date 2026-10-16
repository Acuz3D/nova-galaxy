// The galaxy itself: a three.js scene plus the glass HUD around it.
// createGalaxy(container, data, { onOpen(id), getExcerpt(id) }) -> { setData, select, destroy }

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const CYAN = new THREE.Color('#8be9ff');
const WHITE = new THREE.Color('#ffffff');
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const MAX_MOON_LABELS = 36;

/* ---------- small helpers ---------- */

function h(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// "Nova Grid - Features" -> "Features" when it's already shown as a moon of Nova Grid
function shortName(m) {
  const name = m.note.name, p = m.project && m.project.name;
  if (p && name.startsWith(p + ' ') && name.length > p.length + 3) return name.slice(p.length).replace(/^\s*-\s*/, '');
  return name;
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

function fibDir(k, n, out) {
  const y = n === 1 ? 0 : 1 - (2 * (k + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = k * GOLDEN;
  return out.set(Math.cos(phi) * r, y, Math.sin(phi) * r);
}

/* ---------- textures: the Nova ✦ sparkle and a soft dot ---------- */

function sparkTexture() {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const m = s / 2, r = s * 0.47, k = r * 0.14;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, 'rgba(255,255,255,0.5)');
  glow.addColorStop(0.22, 'rgba(255,255,255,0.12)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(m, m - r);
  g.quadraticCurveTo(m + k, m - k, m + r, m);
  g.quadraticCurveTo(m + k, m + k, m, m + r);
  g.quadraticCurveTo(m - k, m + k, m - r, m);
  g.quadraticCurveTo(m - k, m - k, m, m - r);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture() {
  const s = 64, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.42, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- materials ---------- */

const POINT_VERT = /* glsl */ `
  attribute float size; attribute vec3 aColor; attribute float alpha; attribute float phase; attribute float twinkle;
  uniform float uTime; uniform float uPR; uniform float uAtten; uniform float uScale;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float speed = 0.5 + fract(phase * 7.31) * 1.3;
    float tw = mix(1.0, 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * speed + phase * 6.2831)), twinkle);
    float px = size * uPR * (uAtten > 0.5 ? uScale / max(-mv.z, 0.1) : 1.0);
    vAlpha = alpha * tw * clamp(px / (1.5 * uPR), 0.0, 1.0);
    vColor = aColor;
    gl_PointSize = max(px, 1.5 * uPR);
  }`;
const POINT_FRAG = /* glsl */ `
  uniform sampler2D uMap; varying vec3 vColor; varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    float a = t.a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * t.rgb, a);
  }`;

const GLASS_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const GLASS_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uAlpha; uniform float uBody;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
    float rim = pow(f, 2.4);
    float inner = pow(1.0 - f, 3.0) * 0.35;
    vec3 c = mix(uColor, vec3(1.0), rim * 0.55 + inner * 0.4);
    gl_FragColor = vec4(c * (uBody + inner + rim * 1.1), uAlpha * (uBody + inner + rim));
  }`;

/* ---------- the galaxy ---------- */

export function createGalaxy(container, initialData, opts = {}) {
  const root = h('div', 'ng-root', container);
  root.tabIndex = 0;

  const pr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.className = 'ng-canvas';
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#040406');
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 8000);
  camera.position.set(0, 170, 360);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.9;
  controls.minDistance = 6;
  controls.maxDistance = 2400;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.22;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pr);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.28);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const sparkTex = sparkTexture();
  const dotTex = dotTexture();
  const pointMats = [];

  function pointsMaterial(map, atten) {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uTime: { value: 0 },
        uPR: { value: pr },
        uAtten: { value: atten ? 1 : 0 },
        uScale: { value: 500 },
      },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    pointMats.push(m);
    return m;
  }

  function pointCloud(n, map, atten) {
    const g = new THREE.BufferGeometry();
    const attr = (name, size) => {
      const a = new THREE.BufferAttribute(new Float32Array(n * size), size);
      g.setAttribute(name, a);
      return a;
    };
    const cloud = {
      geo: g,
      pos: attr('position', 3),
      size: attr('size', 1),
      color: attr('aColor', 3),
      alpha: attr('alpha', 1),
      phase: attr('phase', 1),
      twinkle: attr('twinkle', 1),
    };
    cloud.points = new THREE.Points(g, pointsMaterial(map, atten));
    cloud.points.frustumCulled = false;
    return cloud;
  }

  /* ----- background: star dust, ✦ sparkles, fog ----- */

  const bg = new THREE.Group();
  scene.add(bg);
  {
    const r = rng(11);
    const dir = new THREE.Vector3();
    const shell = (n, map, rMin, rMax, sMin, sMax, aMin, aMax, tw, atten) => {
      const c = pointCloud(n, map, atten);
      for (let i = 0; i < n; i++) {
        dir.set(r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1).normalize().multiplyScalar(rMin + r() * (rMax - rMin));
        c.pos.setXYZ(i, dir.x, dir.y, dir.z);
        c.size.setX(i, sMin + Math.pow(r(), 2.2) * (sMax - sMin));
        const tint = r();
        const col = tint < 0.12 ? CYAN : tint < 0.2 ? new THREE.Color('#ffe9c4') : WHITE;
        c.color.setXYZ(i, col.r, col.g, col.b);
        c.alpha.setX(i, aMin + r() * (aMax - aMin));
        c.phase.setX(i, r());
        c.twinkle.setX(i, tw);
      }
      bg.add(c.points);
    };
    shell(2600, dotTex, 1200, 2200, 1.2, 4.2, 0.18, 0.75, 0.35, false); // far star dust
    shell(80, sparkTex, 1100, 2000, 12, 30, 0.55, 0.95, 1, false); // far ✦ sparkles
    shell(26, sparkTex, 220, 800, 3.5, 7, 0.3, 0.6, 1, true); // near ✦ sparkles that drift past as you move
    shell(500, dotTex, 120, 900, 0.5, 1.4, 0.1, 0.35, 0.4, true); // near dust

    // faint fog, like the haze on the Nova Studios site
    const fogCols = ['#ffffff', '#9fdcff', '#ffffff', '#c9d6ff', '#ffffff'];
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: dotTex, color: fogCols[i % fogCols.length], transparent: true, opacity: 0.008 + r() * 0.008, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      dir.set(r() * 2 - 1, (r() * 2 - 1) * 0.5, r() * 2 - 1).normalize().multiplyScalar(900 + r() * 500);
      sp.position.copy(dir);
      sp.scale.setScalar(1100 + r() * 900);
      bg.add(sp);
    }
  }

  /* ----- HUD ----- */

  const labelLayer = h('div', 'ng-labels', root);
  const tip = h('div', 'ng-tip', root);

  const top = h('div', 'ng-top', root);
  const left = h('div', 'ng-left ng-glass', root);
  const panel = h('div', 'ng-panel ng-glass', root);
  const bottom = h('div', 'ng-bottom', root);
  const results = h('div', 'ng-results ng-glass', bottom);
  const bar = h('div', 'ng-bar ng-glass', bottom);
  bar.innerHTML = `
    <span class="ng-bar-star">✦</span>
    <input class="ng-search" type="text" placeholder="Search the galaxy…" spellcheck="false" />
    <button class="ng-btn" data-act="home" title="Back to the whole system">Recenter</button>
    <button class="ng-btn" data-act="pause" title="Stop or start the planets moving">Pause</button>
    <button class="ng-btn" data-act="lonely" title="Light up notes with no links">Lonely</button>`;
  const search = bar.querySelector('.ng-search');
  const pauseBtn = bar.querySelector('[data-act="pause"]');
  const lonelyBtn = bar.querySelector('[data-act="lonely"]');
  const empty = h('div', 'ng-empty', root, '<span>✦</span>No notes yet. Write one and it appears here.');

  /* ----- system state ----- */

  let data = null;
  let sys = null; // THREE.Group with everything built from the data
  let nodes = []; // {id, note, kind, pos, color, pickR, parent, offset, project, labelEl, moonIdx}
  let byId = new Map();
  let projectsInfo = [];
  let moons = null; // point cloud for every moon
  let moonNodes = [];
  let links = null, spokes = null, hiLines = null;
  let linkPairs = [], spokePairs = [], hiPairs = [];
  let planetObjs = []; // {node, mesh, halo, ring}
  let coreObj = null;
  let systemR = 300;
  let labelPool = [];

  let selected = null, hovered = null, focus = null;
  let lonelyMode = false, paused = false;
  let tOrbit = 0, last = performance.now(), start = last;
  let fly = null; // {node, t0, dur, fromT, fromOff, toOff}
  let followPrev = null;
  let pointer = { x: 0, y: 0, inside: false, moved: false, downX: 0, downY: 0, down: false };
  let width = 1, height = 1, uScale = 500;
  let raf = 0, destroyed = false;

  function disposeSystem() {
    if (!sys) return;
    sys.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const i = pointMats.indexOf(o.material);
        if (i >= 0) pointMats.splice(i, 1);
        o.material.dispose();
      }
    });
    scene.remove(sys);
    labelLayer.innerHTML = '';
    labelPool = [];
    sys = null;
  }

  function lineSet(n, opacity) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(n, 1) * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(n, 1) * 6), 3));
    g.setDrawRange(0, n * 2);
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const l = new THREE.LineSegments(g, m);
    l.frustumCulled = false;
    return l;
  }

  function circle(radius, segs, opacity, color = WHITE) {
    const pts = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  function glassMaterial(color, body = 0.1) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 }, uBody: { value: body } },
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  function makeLabel(text, sub, color, cls) {
    const e = h('div', 'ng-label ' + cls, labelLayer);
    e.innerHTML = `${color ? `<i style="background:${color};box-shadow:0 0 8px ${color}"></i>` : ''}<span>${esc(text)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    return e;
  }

  function buildSystem(d) {
    disposeSystem();
    data = d;
    sys = new THREE.Group();
    scene.add(sys);
    nodes = [];
    byId = new Map();
    planetObjs = [];
    moonNodes = [];
    projectsInfo = [];
    empty.style.display = d.notes.length ? 'none' : 'flex';

    const noteById = new Map(d.notes.map((n) => [n.id, n]));
    const addNode = (o) => {
      o.pos = new THREE.Vector3();
      nodes.push(o);
      byId.set(o.id, o);
      return o;
    };

    // core
    const coreNote = d.core ? noteById.get(d.core) : null;
    const core = addNode({ id: coreNote ? coreNote.id : '__core', note: coreNote, kind: 'core', color: new THREE.Color(coreNote ? coreNote.color : '#fff6e6'), pickR: 6 });
    {
      const g = new THREE.Group();
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: '#fff1d6', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(70);
      const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: '#ffffff', transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
      star.scale.setScalar(46);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(4.2, 48, 32), glassMaterial('#fff4e0', 0.35));
      const rings = [10, 13.5, 17.5].map((r, i) => {
        const ring = circle(r, 160, 0.32 - i * 0.07, i === 1 ? CYAN : WHITE);
        ring.rotation.set(0.35 + i * 0.5, i * 1.1, 0.2 * i);
        g.add(ring);
        return ring;
      });
      g.add(glow, star, ball);
      sys.add(g);
      coreObj = { group: g, star, glow, ball, rings };
      core.labelEl = makeLabel(coreNote ? coreNote.name : 'Vault', `${d.stats.notes} notes`, null, 'ng-label-core');
    }

    // free notes (not in a project) orbit the core closely
    const free = d.notes.filter((n) => n.role !== 'core' && !n.project);
    const coreMoonR = 22 + Math.sqrt(free.length) * 3;

    // planets
    const r = rng(hash(d.projects.map((p) => p.name).join('|')) || 1);
    let R = Math.max(62, coreMoonR + 34);
    let prevExt = 0;
    const tmp = new THREE.Vector3();
    d.projects.forEach((p, i) => {
      const list = p.notes.map((id) => noteById.get(id)).filter(Boolean);
      const planetNote = p.planet ? noteById.get(p.planet) : null;
      const moonNotes = list.filter((n) => n !== planetNote);
      const planetR = 5 + Math.sqrt(list.length) * 1.7;
      const shell = planetR * 1.7 + 6 + Math.sqrt(moonNotes.length) * 2.8;
      const hasLogs = moonNotes.some((n) => n.log);
      const ext = hasLogs ? shell * 1.45 : shell;
      if (i > 0) R += Math.max(prevExt, ext) * 1.25 + 12;
      prevExt = ext;

      const info = {
        name: p.name,
        color: p.color,
        R,
        planetR,
        ext,
        euler: new THREE.Euler((r() - 0.5) * 0.42, r() * Math.PI * 2, (r() - 0.5) * 0.3),
        theta0: i * 2.39996 + r() * 0.6,
        omega: 0.03 * Math.pow(70 / R, 1.5),
        spin: (r() < 0.5 ? -1 : 1) * (0.04 + r() * 0.04),
        count: list.length,
        last: p.last,
      };
      projectsInfo.push(info);

      const pn = addNode({
        id: planetNote ? planetNote.id : `__project:${p.name}`,
        note: planetNote,
        kind: 'planet',
        color: new THREE.Color(p.color),
        pickR: planetR,
        project: info,
      });
      info.node = pn;

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), glassMaterial(p.color, 0.08));
      mesh.scale.setScalar(planetR);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: p.color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(planetR * 4.2);
      const ringHolder = new THREE.Group();
      ringHolder.rotation.copy(info.euler);
      const ring = circle(R, 256, 0.075);
      ringHolder.add(ring);
      sys.add(mesh, halo, ringHolder);
      planetObjs.push({ node: pn, mesh, halo, ring, info });
      pn.labelEl = makeLabel(p.name, `${list.length} ${list.length === 1 ? 'note' : 'notes'}`, p.color, 'ng-label-planet');

      // moons around the planet: a starburst, with work logs on an outer shell
      const inner = moonNotes.filter((n) => !n.log);
      const logs = moonNotes.filter((n) => n.log);
      const place = (arr, radius) =>
        arr.forEach((n, k) => {
          const jitter = 0.82 + r() * 0.36;
          const off = fibDir(k, arr.length, tmp).clone().multiplyScalar(radius * jitter);
          off.y *= 0.75;
          moonNodes.push(addNode({ id: n.id, note: n, kind: 'moon', color: new THREE.Color(n.color), parent: pn, offset: off, pickR: 1, project: info }));
        });
      place(inner, shell);
      place(logs, shell * 1.45);
    });

    free.forEach((n, k) => {
      const off = fibDir(k, free.length, tmp).clone().multiplyScalar(coreMoonR * (0.85 + r() * 0.3));
      off.y *= 0.6;
      moonNodes.push(addNode({ id: n.id, note: n, kind: 'moon', color: new THREE.Color(n.color), parent: core, offset: off, pickR: 1, project: null }));
    });

    const lastInfo = projectsInfo[projectsInfo.length - 1];
    systemR = lastInfo ? lastInfo.R + lastInfo.ext : coreMoonR + 20;

    // moons as one glowing point cloud
    moons = pointCloud(moonNodes.length, dotTex, true);
    moonNodes.forEach((m, i) => {
      m.moonIdx = i;
      const deg = m.note.out.length + m.note.in.length;
      m.baseSize = (m.note.log ? 3.2 : 4.2) + Math.min(deg, 14) * 0.28;
      m.baseAlpha = m.note.log ? 0.7 : 0.95;
      m.pickR = m.baseSize * 0.35;
      moons.size.setX(i, m.baseSize);
      const c = m.color.clone().lerp(WHITE, 0.45);
      m.drawColor = c;
      moons.color.setXYZ(i, c.r, c.g, c.b);
      moons.alpha.setX(i, m.baseAlpha);
      moons.phase.setX(i, (i * 0.618) % 1);
      moons.twinkle.setX(i, 0.12);
    });
    sys.add(moons.points);

    // lines: spokes (moon to its planet) and real links between notes
    spokePairs = moonNodes.map((m) => [m, m.parent]);
    const spokeKey = new Set(spokePairs.map(([a, b]) => a.id + '\n' + b.id));
    const seen = new Set();
    linkPairs = [];
    for (const n of nodes) {
      if (!n.note) continue;
      for (const id of n.note.out) {
        const b = byId.get(id);
        if (!b) continue;
        const k = n.id < b.id ? n.id + '\n' + b.id : b.id + '\n' + n.id;
        if (seen.has(k) || spokeKey.has(n.id + '\n' + b.id) || spokeKey.has(b.id + '\n' + n.id)) continue;
        seen.add(k);
        linkPairs.push([n, b]);
      }
    }
    // virtual planets still connect to the core so every planet hangs on the sun
    for (const p of planetObjs) if (!p.node.note) linkPairs.push([p.node, core]);

    spokes = lineSet(spokePairs.length, 0.2);
    links = lineSet(linkPairs.length, 0.16);
    hiLines = lineSet(64, 0.95);
    const paint = (set, pairs, mix) => {
      const col = set.geometry.attributes.color;
      pairs.forEach(([a, b], i) => {
        const ca = a.color.clone().lerp(WHITE, mix), cb = b.color.clone().lerp(WHITE, mix);
        col.setXYZ(i * 2, ca.r, ca.g, ca.b);
        col.setXYZ(i * 2 + 1, cb.r, cb.g, cb.b);
      });
      col.needsUpdate = true;
    };
    paint(spokes, spokePairs, 0.3);
    paint(links, linkPairs, 0.5);
    sys.add(spokes, links, hiLines);

    // a faint globe of latitude/longitude lines around the whole system, with a bright equator
    {
      const G = systemR * 1.18;
      const pts = [];
      for (let lat = -60; lat <= 60; lat += 20) {
        const y = Math.sin((lat * Math.PI) / 180) * G, rr = Math.cos((lat * Math.PI) / 180) * G;
        for (let i = 0; i < 128; i++) {
          const a0 = (i / 128) * Math.PI * 2, a1 = ((i + 1) / 128) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a0) * rr, y, Math.sin(a0) * rr), new THREE.Vector3(Math.cos(a1) * rr, y, Math.sin(a1) * rr));
        }
      }
      for (let lon = 0; lon < 180; lon += 20) {
        const a = (lon * Math.PI) / 180;
        for (let i = 0; i < 128; i++) {
          const b0 = (i / 128) * Math.PI * 2, b1 = ((i + 1) / 128) * Math.PI * 2;
          const p0 = new THREE.Vector3(Math.cos(b0) * G, Math.sin(b0) * G, 0).applyAxisAngle(Y_AXIS, a);
          const p1 = new THREE.Vector3(Math.cos(b1) * G, Math.sin(b1) * G, 0).applyAxisAngle(Y_AXIS, a);
          pts.push(p0, p1);
        }
      }
      const globe = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.018, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      const eq = circle(G, 320, 0.22, new THREE.Color('#bfeeff'));
      const eq2 = circle(G * 1.02, 320, 0.07);
      eq2.rotation.set(0.08, 0, 0.05);
      sys.add(globe, eq, eq2);
    }

    // label pool for moon names when you fly in close
    for (let i = 0; i < MAX_MOON_LABELS; i++) {
      const e = h('div', 'ng-label ng-label-moon', labelLayer);
      e.style.display = 'none';
      labelPool.push(e);
    }

    renderDashboard();
    updatePositions(0);
    applyFocus(true);
  }

  /* ----- per-frame positions ----- */

  const tv = new THREE.Vector3();
  function updatePositions() {
    for (const p of planetObjs) {
      const i = p.info, th = i.theta0 + i.omega * tOrbit;
      p.node.pos.set(Math.cos(th) * i.R, 0, Math.sin(th) * i.R).applyEuler(i.euler);
      p.mesh.position.copy(p.node.pos);
      p.halo.position.copy(p.node.pos);
    }
    for (const m of moonNodes) {
      const spin = m.project ? m.project.spin : 0.03;
      m.pos.copy(m.offset).applyAxisAngle(Y_AXIS, spin * tOrbit).add(m.parent.pos);
      moons.pos.setXYZ(m.moonIdx, m.pos.x, m.pos.y, m.pos.z);
    }
    moons.pos.needsUpdate = true;
    const write = (set, pairs) => {
      const a = set.geometry.attributes.position;
      pairs.forEach(([p, q], i) => {
        a.setXYZ(i * 2, p.pos.x, p.pos.y, p.pos.z);
        a.setXYZ(i * 2 + 1, q.pos.x, q.pos.y, q.pos.z);
      });
      a.needsUpdate = true;
    };
    write(spokes, spokePairs);
    write(links, linkPairs);
    write(hiLines, hiPairs);
  }

  /* ----- focus / highlight ----- */

  function neighbours(n) {
    const s = new Set([n.id]);
    if (n.note) {
      n.note.out.forEach((id) => s.add(id));
      n.note.in.forEach((id) => s.add(id));
    }
    if (n.parent) s.add(n.parent.id);
    if (n.kind === 'planet') moonNodes.forEach((m) => m.parent === n && s.add(m.id));
    if (n.kind === 'core') moonNodes.forEach((m) => m.parent === n && s.add(m.id));
    return s;
  }

  function applyFocus(force) {
    const f = selected || hovered;
    if (!force && f === focus) return;
    focus = f;
    const near = f ? neighbours(f) : null;
    const lonely = (m) => m.note && m.kind !== 'core' && m.note.out.length + m.note.in.length === 0;

    moonNodes.forEach((m) => {
      let a = m.baseAlpha, c = m.drawColor, s = m.baseSize;
      if (lonelyMode) {
        if (lonely(m)) { a = 1; c = CYAN; s = m.baseSize * 1.5; } else a = 0.1;
      } else if (near) {
        if (m === f) { a = 1; c = WHITE; s = m.baseSize * 1.35; } else if (near.has(m.id)) a = 1; else a = 0.1;
      }
      moons.alpha.setX(m.moonIdx, a);
      moons.color.setXYZ(m.moonIdx, c.r, c.g, c.b);
      moons.size.setX(m.moonIdx, s);
    });
    moons.alpha.needsUpdate = moons.color.needsUpdate = moons.size.needsUpdate = true;

    for (const p of planetObjs) {
      const on = lonelyMode ? lonely(p.node) : !near || near.has(p.node.id);
      p.mesh.material.uniforms.uAlpha.value = on ? 1 : 0.22;
      p.halo.material.opacity = on ? (p.node === f ? 0.42 : 0.22) : 0.05;
      p.ring.material.opacity = p.node === f || (f && f.parent === p.node) ? 0.3 : near || lonelyMode ? 0.03 : 0.075;
      if (p.node.labelEl) p.node.labelEl.classList.toggle('is-dim', !on);
    }
    if (nodes[0] && nodes[0].labelEl) nodes[0].labelEl.classList.toggle('is-dim', !!near && !near.has(nodes[0].id));
    links.material.opacity = near || lonelyMode ? 0.04 : 0.16;
    spokes.material.opacity = near || lonelyMode ? 0.05 : 0.2;

    hiPairs = [];
    if (f && !lonelyMode) {
      const pushIf = (a, b) => b && hiPairs.length < 64 && hiPairs.push([a, b]);
      if (f.note) [...new Set([...f.note.out, ...f.note.in])].forEach((id) => pushIf(f, byId.get(id)));
      if (f.parent) pushIf(f, f.parent);
      if (f.kind === 'planet' && !f.note) pushIf(f, nodes[0]);
    }
    const col = hiLines.geometry.attributes.color;
    hiPairs.forEach(([a, b], i) => {
      col.setXYZ(i * 2, 1, 1, 1);
      const cb = b.color.clone().lerp(CYAN, 0.6);
      col.setXYZ(i * 2 + 1, cb.r, cb.g, cb.b);
    });
    col.needsUpdate = true;
    hiLines.geometry.setDrawRange(0, hiPairs.length * 2);
    root.classList.toggle('is-focus', !!near);
  }

  /* ----- picking ----- */

  const proj = new THREE.Vector3();
  function toScreen(v) {
    proj.copy(v).project(camera);
    return { x: (proj.x * 0.5 + 0.5) * width, y: (-proj.y * 0.5 + 0.5) * height, behind: proj.z > 1 };
  }

  function pick() {
    if (!pointer.inside) return null;
    let best = null, bestScore = Infinity;
    for (const n of nodes) {
      const s = toScreen(n.pos);
      if (s.behind) continue;
      const dist = camera.position.distanceTo(n.pos);
      const rpx = (n.pickR * uScale) / dist;
      const reach = Math.max(9, rpx);
      const d = Math.hypot(s.x - pointer.x, s.y - pointer.y);
      if (d > reach) continue;
      const score = d / reach + (n.kind === 'moon' ? 0 : 0.35);
      if (score < bestScore) { bestScore = score; best = n; }
    }
    return best;
  }

  /* ----- camera flights ----- */

  function viewDistance(n) {
    if (n.kind === 'core') return systemR * 1.35;
    if (n.kind === 'planet') return n.project.ext * 3.4 + 20;
    return Math.max(55, (n.project ? n.project.ext : 30) * 2.2);
  }

  function flyTo(n, dist = viewDistance(n), dur = 1300) {
    const off = camera.position.clone().sub(controls.target);
    const dir = n.kind === 'core' && dist > 100 ? new THREE.Vector3(0, 0.46, 1).normalize() : off.clone().normalize();
    fly = { node: n, t0: performance.now(), dur, fromT: controls.target.clone(), fromOff: off, toOff: dir.multiplyScalar(dist) };
    followPrev = null;
  }

  /* ----- selection + side panel ----- */

  function select(id, doFly = true) {
    const n = typeof id === 'string' ? byId.get(id) : id;
    if (!n) return;
    selected = n;
    controls.autoRotate = false;
    applyFocus(true);
    renderPanel(n);
    if (doFly) flyTo(n);
  }

  function deselect() {
    selected = null;
    followPrev = null;
    controls.autoRotate = true;
    panel.classList.remove('is-open');
    applyFocus(true);
  }

  function noteLink(id) {
    const n = byId.get(id);
    if (!n) return '';
    return `<button class="ng-item" data-id="${esc(id)}"><i style="background:#${n.color.getHexString()}"></i>${esc(n.note ? n.note.name : id)}</button>`;
  }

  function renderPanel(n) {
    const note = n.note;
    const proj = n.project;
    const kind = n.kind === 'core' ? 'The sun' : n.kind === 'planet' ? 'Planet' : proj ? 'Moon of ' + proj.name : 'Free note';
    const color = '#' + n.color.getHexString();
    const out = note ? note.out : [];
    const inn = note ? note.in : [];
    const connected = new Set([...out, ...inn]).size;
    const moonsOf = moonNodes.filter((m) => m.parent === n);
    panel.innerHTML = `
      <button class="ng-close" title="Close (Esc)">✕</button>
      <div class="ng-kicker"><i style="background:${color};box-shadow:0 0 8px ${color}"></i>${esc(kind)}</div>
      <h2 class="ng-title">${esc(note ? note.name : proj ? proj.name : 'Vault')}</h2>
      ${note ? `<div class="ng-path">${esc(note.id)}</div>` : ''}
      <div class="ng-grid">
        <div><small>Links out</small><b>${out.length}</b></div>
        <div><small>Linked from</small><b>${inn.length}</b></div>
        <div><small>Connected</small><b>${connected}</b></div>
        <div><small>${note ? 'Words' : 'Notes'}</small><b class="ng-words">${note ? '…' : moonsOf.length + 1}</b></div>
      </div>
      ${note ? `<div class="ng-sec">Summary</div><p class="ng-summary">…</p>` : ''}
      ${note && note.tags.length ? `<div class="ng-sec">Tags</div><div class="ng-tags">${note.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      ${note ? `<div class="ng-meta">Edited ${ago(note.mtime)} · made ${new Date(note.ctime).toLocaleDateString()}</div>` : ''}
      ${moonsOf.length ? `<div class="ng-sec">${n.kind === 'core' ? 'Close by' : 'Moons'} <em>${moonsOf.length}</em></div><div class="ng-list">${moonsOf.map((m) => noteLink(m.id)).join('')}</div>` : ''}
      ${out.length ? `<div class="ng-sec">Links out <em>${out.length}</em></div><div class="ng-list">${out.map(noteLink).join('')}</div>` : ''}
      ${inn.length ? `<div class="ng-sec">Linked from <em>${inn.length}</em></div><div class="ng-list">${inn.map(noteLink).join('')}</div>` : ''}
      ${note && opts.onOpen ? `<button class="ng-open">Open note <span>↗</span></button>` : ''}`;
    panel.classList.add('is-open');
    panel.scrollTop = 0;
    if (note && opts.getExcerpt) {
      Promise.resolve(opts.getExcerpt(note.id)).then((ex) => {
        if (selected !== n || !ex) return;
        const s = panel.querySelector('.ng-summary');
        if (s) s.textContent = ex.text || 'Nothing written yet.';
        const w = panel.querySelector('.ng-words');
        if (w) w.textContent = ex.words;
      });
    }
  }

  panel.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.classList.contains('ng-close')) deselect();
    else if (t.classList.contains('ng-open') && selected) opts.onOpen(selected.id);
    else if (t.dataset.id) select(t.dataset.id);
  });

  /* ----- dashboard (left) and stats (top) ----- */

  function renderDashboard() {
    const s = data.stats;
    const max = Math.max(1, ...s.activity.map((a) => a.count));
    const bw = 200 / s.activity.length;
    const bars = s.activity
      .map((a, i) => {
        const hgt = Math.max(1.5, (a.count / max) * 34);
        const today = i === s.activity.length - 1;
        return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(38 - hgt).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${hgt.toFixed(1)}" rx="1.5" class="${today ? 'is-today' : ''}"><title>${a.day}: ${a.count}</title></rect>`;
      })
      .join('');
    const planets = projectsInfo
      .slice()
      .sort((a, b) => b.last - a.last)
      .map(
        (p) => `<button class="ng-planet" data-id="${esc(p.node.id)}">
          <i style="background:${p.color};box-shadow:0 0 8px ${p.color}"></i>
          <span>${esc(p.name)}<small>${p.count} notes · ${ago(p.last)}</small></span></button>`
      )
      .join('');
    left.innerHTML = `
      <div class="ng-brand"><span class="ng-brand-star">✦</span>Nova Galaxy<small>ノヴァ · your vault as a solar system</small></div>
      <div class="ng-big">
        <div><b>${s.notes}</b><small>Notes</small></div>
        <div><b>${s.links}</b><small>Links</small></div>
      </div>
      <div class="ng-mini">
        <div><b class="${s.streak ? 'is-on' : ''}">${s.streak}</b><small>Day streak</small></div>
        <div><b>${s.today}</b><small>Today</small></div>
        <div><b>${s.lonely}</b><small>Lonely</small></div>
      </div>
      <div class="ng-sec">Activity <em>3 weeks</em></div>
      <svg class="ng-chart" viewBox="0 0 200 40" preserveAspectRatio="none">${bars}</svg>
      <div class="ng-sec">Planets <em>${projectsInfo.length}</em></div>
      <div class="ng-planets">${planets}</div>`;

    top.innerHTML = [
      ['Notes', s.notes],
      ['Links', s.links],
      ['Planets', s.planets],
      ['This week', s.week],
    ]
      .map(([k, v]) => `<div class="ng-pill ng-glass"><span>✦</span><small>${k}</small><b>${v}</b></div>`)
      .join('');
  }

  left.addEventListener('click', (e) => {
    const t = e.target.closest('[data-id]');
    if (t) select(t.dataset.id);
  });

  /* ----- search + buttons ----- */

  let hits = [];
  function runSearch() {
    const q = search.value.trim().toLowerCase();
    hits = !q
      ? []
      : nodes
          .filter((n) => (n.note ? n.note.name : n.project ? n.project.name : '').toLowerCase().includes(q))
          .sort((a, b) => {
            const an = (a.note ? a.note.name : a.project.name).toLowerCase(), bn = (b.note ? b.note.name : b.project.name).toLowerCase();
            return (bn.startsWith(q) ? 1 : 0) - (an.startsWith(q) ? 1 : 0) || an.length - bn.length;
          })
          .slice(0, 7);
    results.innerHTML = hits.map((n) => noteLink(n.id) || `<button class="ng-item" data-id="${esc(n.id)}">${esc(n.project.name)}</button>`).join('');
    results.classList.toggle('is-open', hits.length > 0);
  }
  search.addEventListener('input', runSearch);
  search.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && hits[0]) { select(hits[0]); search.blur(); results.classList.remove('is-open'); }
    if (e.key === 'Escape') { search.value = ''; runSearch(); search.blur(); }
  });
  search.addEventListener('blur', () => setTimeout(() => results.classList.remove('is-open'), 150));
  search.addEventListener('focus', runSearch);
  results.addEventListener('mousedown', (e) => {
    const t = e.target.closest('[data-id]');
    if (t) { e.preventDefault(); select(t.dataset.id); search.blur(); results.classList.remove('is-open'); }
  });

  bar.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'home') { deselect(); flyTo(nodes[0], systemR * 1.35); }
    if (act === 'pause') { paused = !paused; pauseBtn.textContent = paused ? 'Play' : 'Pause'; pauseBtn.classList.toggle('is-on', paused); }
    if (act === 'lonely') { lonelyMode = !lonelyMode; lonelyBtn.classList.toggle('is-on', lonelyMode); applyFocus(true); }
  });

  /* ----- pointer ----- */

  const canvas = renderer.domElement;
  const onMove = (e) => {
    const r = root.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.inside = true;
    pointer.moved = true;
  };
  const onLeave = () => { pointer.inside = false; pointer.moved = true; };
  const onDown = (e) => { pointer.down = true; pointer.downX = e.clientX; pointer.downY = e.clientY; };
  const onUp = (e) => {
    if (!pointer.down) return;
    pointer.down = false;
    if (Math.hypot(e.clientX - pointer.downX, e.clientY - pointer.downY) > 5) return;
    const n = pick();
    if (n) select(n);
    else if (selected) deselect();
  };
  const onDbl = () => { const n = pick(); if (n && n.note && opts.onOpen) opts.onOpen(n.id); };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('dblclick', onDbl);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) deselect(); });
  controls.addEventListener('start', () => { fly = null; });

  /* ----- resize ----- */

  function resize() {
    const w = Math.max(1, root.clientWidth), hh = Math.max(1, root.clientHeight);
    if (w === width && hh === height) return;
    width = w;
    height = hh;
    renderer.setSize(w, hh);
    composer.setSize(w, hh);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
    uScale = hh / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);

  /* ----- labels ----- */

  let taken = [];
  function placeLabel(el, n, extraY) {
    const s = toScreen(n.pos);
    if (s.behind || s.x < -100 || s.x > width + 100 || s.y < -50 || s.y > height + 50) { el.style.display = 'none'; return; }
    if (el._w == null) { el.style.display = ''; el._w = el.offsetWidth; el._h = el.offsetHeight; }
    const box = { x: s.x - el._w / 2 - 3, y: s.y + extraY - 1, w: el._w + 6, h: el._h + 2 };
    if (taken.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h)) { el.style.display = 'none'; return; }
    taken.push(box);
    el.style.display = '';
    el.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y + extraY).toFixed(1)}px) translate(-50%, 0)`;
  }

  function updateLabels() {
    taken = [];
    if (selected && selected.labelEl) placeLabel(selected.labelEl, selected, ((selected.kind === 'core' ? 20 : selected.pickR) * uScale) / camera.position.distanceTo(selected.pos) + 6);
    for (const n of nodes) {
      if (n === selected) continue;
      if (!n.labelEl) continue;
      const dist = camera.position.distanceTo(n.pos);
      const rpx = ((n.kind === 'core' ? 20 : n.pickR) * uScale) / dist;
      placeLabel(n.labelEl, n, rpx + 6);
    }
    // moon names: the selected/hovered note's neighbours, and any moon you're close to
    const want = [];
    const near = focus ? neighbours(focus) : null;
    for (const m of moonNodes) {
      const d = camera.position.distanceTo(m.pos);
      const show = m === hovered || m === selected || (near && near.has(m.id) && d < 260) || (!lonelyMode && !near && d < 70);
      if (show) want.push([d, m]);
    }
    want.sort((a, b) => (a[1] === selected ? -1e9 : a[1] === hovered ? -1e8 : a[0]) - (b[1] === selected ? -1e9 : b[1] === hovered ? -1e8 : b[0]));
    labelPool.forEach((el, i) => {
      const w = want[i];
      if (!w) { el.style.display = 'none'; return; }
      const m = w[1];
      if (el._id !== m.id) { el.textContent = shortName(m); el._id = m.id; el._w = null; }
      el.classList.toggle('is-sel', m === selected);
      placeLabel(el, m, (m.baseSize * 0.4 * uScale) / w[0] + 4);
    });
  }

  /* ----- loop ----- */

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!root.isConnected || root.offsetWidth === 0 || document.hidden) { last = now; return; }
    resize();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - start) / 1000;
    if (!paused) tOrbit += dt;

    if (sys) {
      updatePositions();
      if (coreObj) {
        coreObj.star.material.rotation = Math.sin(t * 0.25) * 0.12;
        const pulse = 1 + Math.sin(t * 1.3) * 0.04;
        const cd = camera.position.length();
        coreObj.star.scale.setScalar(Math.min(46, cd * 0.11) * pulse);
        coreObj.glow.scale.setScalar(Math.min(70, cd * 0.2));
        coreObj.rings.forEach((r, i) => (r.rotation.y += dt * (0.12 + i * 0.07) * (i % 2 ? -1 : 1)));
      }
    }
    bg.rotation.y = t * 0.0035;
    for (const m of pointMats) {
      m.uniforms.uTime.value = t;
      m.uniforms.uScale.value = uScale;
    }

    // flights and following a moving planet
    if (fly) {
      const k = ease(Math.min(1, (now - fly.t0) / fly.dur));
      const target = fly.fromT.clone().lerp(fly.node.pos, k);
      const off = fly.fromOff.clone().lerp(fly.toOff, k);
      controls.target.copy(target);
      camera.position.copy(target).add(off);
      if (k >= 1) { fly = null; followPrev = selected ? selected.pos.clone() : null; }
    } else if (selected) {
      if (followPrev) {
        tv.copy(selected.pos).sub(followPrev);
        controls.target.add(tv);
        camera.position.add(tv);
      }
      followPrev = selected.pos.clone();
    }
    controls.update();

    if (sys) {
      const n = pick();
      if (n !== hovered) {
        hovered = n;
        applyFocus();
        root.classList.toggle('is-hover', !!n);
      }
      if (hovered && pointer.inside) {
        tip.style.display = '';
        tip.innerHTML = `${esc(hovered.note ? hovered.note.name : hovered.project ? hovered.project.name : 'Vault')}<small>${hovered.kind === 'moon' ? (hovered.project ? hovered.project.name : 'Free note') : hovered.kind === 'planet' ? 'Planet' : 'The sun'}</small>`;
        tip.style.transform = `translate(${pointer.x + 14}px, ${pointer.y + 12}px)`;
      } else tip.style.display = 'none';
      updateLabels();
    }
    composer.render();
  }

  resize();
  buildSystem(initialData);
  camera.position.set(0, systemR * 0.55, systemR * 1.2);
  raf = requestAnimationFrame(frame);

  return {
    setData(d) {
      const keep = selected ? selected.id : null;
      selected = hovered = focus = null;
      buildSystem(d);
      if (keep && byId.has(keep)) select(keep, false);
      else { panel.classList.remove('is-open'); controls.autoRotate = true; }
    },
    select: (id, doFly = true) => select(id, doFly),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeSystem();
      bg.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      sparkTex.dispose();
      dotTex.dispose();
      bloom.dispose();
      composer.dispose?.();
      renderer.dispose();
      root.remove();
    },
  };
}
