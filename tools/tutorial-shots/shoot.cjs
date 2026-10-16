// Takes the labelled tutorial pictures in docs/tutorial/ from the made-up demo vault (test/demo-vault.json),
// never from a real vault. Run from the repo folder with any Electron:
//   node tools/tutorial-shots/make-demo-vault.mjs        (only if you change the demo notes)
//   <electron.exe> tools/tutorial-shots/shoot.cjs [shot names...] [--explore]
// --explore saves unlabelled pictures to tools/tutorial-shots/build/ and prints where the notes are on screen.
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = path.join(__dirname, 'build');
const OUT = path.join(ROOT, 'docs', 'tutorial');
const W = 1280, H = 800;
const EXPLORE = process.argv.includes('--explore');
const ONLY = process.argv.filter((a) => /^\d+-[a-z-]+$/.test(a));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// The preview bundle, with a small hook added to the scene so the labels can find notes on screen
// and the orbits can be stopped at a nice spot. Only this tutorial build has it; src/ is unchanged.
async function bundle() {
  const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
  const hook = {
    name: 'tutorial-hook',
    setup(b) {
      b.onLoad({ filter: /src[\\/]scene\.js$/ }, (args) => {
        let src = fs.readFileSync(args.path, 'utf8');
        const at = '  return {\n    setData(d) {';
        const nl = src.includes('\r\n') ? '\r\n' : '\n';
        const atN = at.replace(/\n/g, nl);
        if (!src.includes(atN)) throw new Error('scene.js changed; update the tutorial hook in shoot.cjs');
        src = src.replace(atN, `  const tutorialHook = {
    freeze(t) { paused = true; if (t != null) tOrbit = t; controls.autoRotate = false; },
    screen(id) {
      const n = byId.get(id) || (id === '__core' ? nodes[0] : null);
      if (!n) return null;
      const s = toScreen(n.pos), d = camera.position.distanceTo(n.pos);
      const r = ((n.kind === 'moon' ? n.baseSize * 0.45 : n.kind === 'core' ? 9 : n.pickR) * uScale) / d;
      return { x: s.x, y: s.y, r, behind: s.behind };
    },
    ids: () => nodes.map((n) => ({ id: n.id, kind: n.kind, project: n.project ? n.project.name : null })),
    links: () => linkPairs.map(([a, b]) => [a.id, b.id]),
    view(id, dist, dir) {
      const n = byId.get(id) || nodes[0];
      fly = null; followPrev = null;
      controls.target.copy(n.pos);
      camera.position.set(dir[0], dir[1], dir[2]).normalize().multiplyScalar(dist).add(n.pos);
      controls.update();
    },
    at(t) { tOrbit = t; updatePositions(); },
    camera, controls,
  };
  return {
    _tut: tutorialHook,
    setData(d) {`.replace(/\n/g, nl));
        return { contents: src, loader: 'js' };
      });
    },
  };
  fs.mkdirSync(BUILD, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'demo-harness.js')],
    bundle: true,
    format: 'iife',
    outfile: path.join(BUILD, 'demo.bundle.js'),
    plugins: [hook],
    logLevel: 'warning',
  });
}

const MOUSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/></svg>';

// The demo system is frozen at this orbit time and seen from this camera: planets spread out to the right
// of the sun, clear of the left panel (picked by trying orbit times with galaxy._tut.at(t) for the widest spacing on screen).
const T = 260;
const HOME_VIEW = `galaxy._tut.freeze(${T}); galaxy._tut.view('Home.md', galaxy._tut.camera.position.length() * 0.6, [0, 0.5, 1]);`;
const P = (name) => {
  const proj = { Home: '', GP: 'Projects/Garden Planner/', RC: 'Projects/Recipes/', SG: 'Projects/Space Game/', SN: 'Projects/Study Notes/', TR: 'Projects/Travel 2026/' };
  const [k, n] = name.split(':');
  return proj[k] + n + '.md';
};

const SHOTS = [
  {
    name: '1-install',
    page: 'install.html',
    marks: [
      { sel: '#files .file', label: 'Download these 3 files', pos: 'below', dx: -10, dy: 228, pad: 8 },
      { sel: '#path', label: 'Put them in this folder', pos: 'below', dx: 20, dy: 96, pad: 6 },
      { sel: '#toggle-row', label: 'Settings → Community plugins → enable Nova Galaxy', pos: 'below', dx: -330, dy: 228, pad: 6 },
    ],
  },
  {
    name: '2-open',
    page: 'demo.html',
    query: 'chrome=1',
    setup: HOME_VIEW,
    marks: [
      { sel: '#rib-galaxy', label: 'Click ✦ in the left ribbon', at: { x: 70, y: 300 }, pad: 5 },
      { sel: '#palette .pal-row.on', label: 'or Ctrl+P → Open Nova Galaxy', pos: 'right', dx: -10, dy: 90, pad: 4 },
      { sel: '#tab-galaxy', label: 'It opens in its own tab', pos: 'right', dx: 20, pad: 3, size: 17 },
    ],
  },
  {
    name: '3-overview',
    page: 'demo.html',
    setup: HOME_VIEW,
    marks: [
      { node: 'Home.md', minR: 34, label: 'The sun is your Home note', pos: 'below', dx: -40, dy: 150 },
      { node: P('RC:Recipes - Overview'), pad: 10, label: 'Each project is a planet', pos: 'below', dx: 30, dy: 150 },
      { node: P('RC:Tomato sauce'), minR: 12, pad: 6, label: 'Its notes are moons', pos: 'right', dx: 30, dy: -110 },
      { link: ['Home.md', P('TR:Travel 2026 - Overview')], at01: 0.33, minR: 12, label: 'Lines are links between notes', pos: 'left', dx: -90, dy: -150 },
    ],
  },
  {
    name: '4-fly',
    page: 'demo.html',
    setup: HOME_VIEW + ` setTimeout(() => galaxy.select(${JSON.stringify(P('SG:Game design'))}), 300);`,
    settle: 3200,
    marks: [
      { node: P('SG:Game design'), minR: 16, label: 'Click to fly to a note', pos: 'below', dx: -60, dy: 140 },
      { node: P('SG:Enemies'), minR: 14, label: 'Double-click opens it', at: { x: 300, y: 250 } },
      { link: [P('SG:Game design'), P('SG:Controls')], at01: 0.75, minR: 12, label: 'Its links light up', at: { x: 262, y: 505 } },
      { label: 'Drag to turn · scroll to zoom', icon: MOUSE, num: false, at: { x: 340, y: 700 } },
    ],
  },
  {
    name: '5-panels',
    page: 'demo.html',
    setup: HOME_VIEW + ` setTimeout(() => galaxy.select(${JSON.stringify(P('GP:Tomatoes'))}), 300);`,
    settle: 3200,
    marks: [
      { sel: '.ng-left', label: 'Stats, activity and every planet', pos: 'right', dx: 20, dy: 60, pad: 4 },
      { sel: '.ng-panel', label: 'The picked note: links, words, summary', pos: 'left', dx: -10, dy: -150, pad: 4 },
      { sel: '.ng-search', label: 'Search', sub: 'Enter flies there', at: { x: 380, y: 680 }, pad: 4 },
      { sel: '[data-act="home"]', label: 'Recenter', at: { x: 540, y: 610 }, pad: 2 },
      { sel: '[data-act="pause"]', label: 'Pause', sub: 'stops the orbits', at: { x: 700, y: 676 }, pad: 2 },
      { sel: '[data-act="lonely"]', label: 'Lonely', sub: 'notes with no links', at: { x: 966, y: 700 }, pad: 2 },
    ],
  },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function load(win, shot) {
  await win.loadFile(path.join(__dirname, shot.page), shot.query ? { search: shot.query } : undefined);
  await wait(3500); // fonts, first frames, bloom
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'overlay.js'), 'utf8') + ';0');
}

app.whenReady().then(async () => {
  try {
    await bundle();
    const win = new BrowserWindow({
      width: W, height: H, useContentSize: true, show: false, resizable: false, backgroundColor: '#040406',
      title: 'Nova Galaxy tutorial', webPreferences: { backgroundThrottling: false },
    });
    win.webContents.on('console-message', (e) => { const m = e.message || e; if (/error/i.test(String(m))) console.log('page:', m); });
    win.showInactive();
    win.setContentSize(W, H);
    win.setIgnoreMouseEvents(true); // the real mouse can't hover anything while shooting
    await wait(300);
    fs.mkdirSync(OUT, { recursive: true });

    for (const shot of SHOTS.filter((s) => !ONLY.length || ONLY.includes(s.name))) {
      await load(win, shot);
      const wc = win.webContents;
      if (shot.setup) await wc.executeJavaScript(`(async () => { ${shot.setup} })(); 0`);
      await wait(shot.settle || 2200);
      if (shot.after) { await wc.executeJavaScript(`(async () => { ${shot.after} })(); 0`); await wait(900); }
      if (EXPLORE) {
        console.log('size', await wc.executeJavaScript('innerWidth + "x" + innerHeight + " tip:" + document.querySelector(".ng-tip").style.cssText + document.querySelector(".ng-tip").textContent'));
        const info = await wc.executeJavaScript(`window.galaxy ? galaxy._tut.ids().map((n) => ({ ...n, s: __tut.node(n.id) })).filter((n) => n.s && n.kind !== 'moon' || /Recipes|Garden Planner/.test(n.project || '')) : []`);
        for (const n of info) console.log(n.kind.padEnd(7), (n.project || '').padEnd(15), n.s ? `${n.s.x.toFixed(0)},${n.s.y.toFixed(0)} r${n.s.r.toFixed(1)}` : '-', n.id);
      } else {
        await wc.executeJavaScript(`__tut.draw(${JSON.stringify(shot.marks)}); 0`);
        await wait(300);
      }
      const img = await wc.capturePage();
      const file = EXPLORE ? path.join(BUILD, shot.name + '.png') : path.join(OUT, shot.name + '.png');
      fs.writeFileSync(file, img.toPNG());
      console.log('saved', path.relative(ROOT, file), JSON.stringify(img.getSize()));
    }
  } catch (e) {
    console.error(e);
  }
  app.exit(0);
});
