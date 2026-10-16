// The browser preview, but with the made-up demo vault (test/demo-vault.json), for the tutorial pictures.
import { createGalaxy } from '../../src/scene.js';
import { buildGalaxyData } from '../../src/data.js';
import raw from '../../test/demo-vault.json';

// move the demo's dates up to now, so the streak and activity chart look the same whenever it's shot
const shift = Date.now() - 30 * 60000 - Math.max(...raw.files.map((f) => f.mtime));
for (const f of raw.files) { f.ctime += shift; f.mtime += shift; }

const data = buildGalaxyData(raw);
const g = createGalaxy(document.getElementById('app'), data, {
  onOpen: (id) => console.log('open', id),
  getExcerpt: async (id) => raw.excerpts[id] || { text: '', words: 0 },
});
window.galaxy = g;
