// Browser preview of the galaxy with real vault data (made by tools/export-vault.mjs).
import { createGalaxy } from '../src/scene.js';
import { buildGalaxyData } from '../src/data.js';
import raw from './vault.json';

const data = buildGalaxyData(raw);
const g = createGalaxy(document.getElementById('app'), data, {
  onOpen: (id) => console.log('open', id),
  getExcerpt: async (id) => raw.excerpts[id] || { text: '', words: 0 },
});
const sel = new URLSearchParams(location.search).get('select');
if (sel) setTimeout(() => g.select(sel), 200);
window.galaxy = g;
