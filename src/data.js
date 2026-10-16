// Turns a vault (files + resolved links) into the galaxy: a core (Home), planets (projects) and moons (notes).
// Shared by the Obsidian plugin and the browser preview, so both draw the same thing.

export const PALETTE = ['#8be9ff', '#5f84ff', '#6fd8a4', '#a99bff', '#e8795a', '#d9a066', '#eadcae', '#b9bcc6', '#ff9fb8', '#c58bff'];
const CORE_COLOR = '#fff6e6';
const FREE_COLOR = '#e6e8ee';
const DAY = 86400000;

// "Projects/Nova Grid/x.md" -> "Nova Grid"; "Ideas/x.md" -> "Ideas"; "Home.md" -> null
export function projectOf(path) {
  const parts = path.split('/');
  if (parts[0] === 'Projects') return parts.length > 2 ? parts[1] : null;
  return parts.length > 1 ? parts[0] : null;
}

// colour groups from Obsidian's graph settings, e.g. path:"Projects/LowLine"
function groupColor(path, groups) {
  for (const g of groups) {
    const m = /path:\s*"([^"]+)"/.exec(g.query) || /path:\s*(\S+)/.exec(g.query);
    if (m && path.startsWith(m[1])) return '#' + (g.rgb >>> 0).toString(16).padStart(6, '0').slice(-6);
  }
  return null;
}

export const dayKey = (t) => new Date(t).toLocaleDateString('en-CA');

/**
 * files:  [{ path, name, ctime, mtime, tags }]
 * links:  { "a.md": { "b.md": 1 } }  (Obsidian's metadataCache.resolvedLinks)
 * groups: [{ query, rgb }]           (graph.json colour groups)
 */
export function buildGalaxyData({ files, links, groups = [] }) {
  const notes = files
    .filter((f) => f.path.endsWith('.md'))
    .map((f) => ({
      id: f.path,
      name: f.name,
      project: projectOf(f.path),
      tags: f.tags || [],
      ctime: f.ctime || 0,
      mtime: f.mtime || 0,
      out: new Set(),
      in: new Set(),
      log: /(^|\/)work log\//i.test(f.path) || /\bwork log\b/i.test(f.name),
      role: 'moon',
      color: FREE_COLOR,
    }));
  const byId = new Map(notes.map((n) => [n.id, n]));

  let linkCount = 0;
  const seen = new Set();
  for (const [src, dsts] of Object.entries(links || {})) {
    const a = byId.get(src);
    if (!a) continue;
    for (const dst of Object.keys(dsts)) {
      const b = byId.get(dst);
      if (!b || a === b) continue;
      a.out.add(b.id);
      b.in.add(a.id);
      const key = a.id < b.id ? a.id + '\n' + b.id : b.id + '\n' + a.id;
      if (!seen.has(key)) { seen.add(key); linkCount++; }
    }
  }

  // the sun: Home, or else the best-connected note at the top of the vault
  const degree = (n) => n.out.size + n.in.size;
  let core = byId.get('Home.md') || notes.filter((n) => !n.project).sort((a, b) => degree(b) - degree(a))[0] || null;
  if (core) { core.role = 'core'; core.color = CORE_COLOR; }

  // planets
  const projMap = new Map();
  for (const n of notes) {
    if (!n.project || n === core) continue;
    if (!projMap.has(n.project)) projMap.set(n.project, []);
    projMap.get(n.project).push(n);
  }
  const names = [...projMap.keys()].sort((a, b) => a.localeCompare(b));
  const projects = names.map((name, i) => {
    const list = projMap.get(name);
    const planet =
      list.find((n) => n.name === `${name} - Overview`) ||
      list.find((n) => n.name === name) ||
      list.find((n) => /overview|index|home/i.test(n.name)) ||
      null;
    if (planet) planet.role = 'planet';
    const color = groupColor(list[0].id, groups) || PALETTE[i % PALETTE.length];
    for (const n of list) n.color = color;
    return {
      name,
      color,
      planet: planet ? planet.id : null,
      notes: list.map((n) => n.id),
      first: Math.min(...list.map((n) => n.ctime || Infinity)),
      last: Math.max(...list.map((n) => n.mtime)),
    };
  });
  // older projects orbit closest to the sun, so new ones join on the outside and nothing jumps around
  projects.sort((a, b) => a.first - b.first || a.name.localeCompare(b.name));

  // activity: a day counts if a note was made or changed then, or a note is named after it (work logs)
  const now = Date.now();
  const days = new Map();
  const bump = (k) => days.set(k, (days.get(k) || 0) + 1);
  for (const n of notes) {
    const ks = new Set();
    if (n.ctime) ks.add(dayKey(n.ctime));
    if (n.mtime) ks.add(dayKey(n.mtime));
    const m = /(\d{4}-\d{2}-\d{2})/.exec(n.name);
    if (m) ks.add(m[1]);
    ks.forEach(bump);
  }
  const activity = [];
  for (let i = 20; i >= 0; i--) {
    const k = dayKey(now - i * DAY);
    activity.push({ day: k, count: days.get(k) || 0 });
  }
  let streak = 0;
  let start = days.has(dayKey(now)) ? 0 : 1;
  while (days.has(dayKey(now - (start + streak) * DAY))) streak++;

  const out = notes.map((n) => ({ ...n, out: [...n.out], in: [...n.in] }));
  return {
    notes: out,
    projects,
    core: core ? core.id : null,
    stats: {
      notes: notes.length,
      links: linkCount,
      planets: projects.length,
      week: notes.filter((n) => n.mtime > now - 7 * DAY).length,
      today: notes.filter((n) => dayKey(n.mtime) === dayKey(now)).length,
      lonely: notes.filter((n) => n !== core && degree(n) === 0).length,
      streak,
      activity,
    },
  };
}

// a short plain-text summary of a note, and its word count
export function excerptOf(raw) {
  let s = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  s = s.replace(/^\s*#\s+.*$/m, ''); // the title heading
  const clean = s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[\[[^\]]*\]\]/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_, t) => t.split('#')[0])
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+>]\s+/gm, '')
    .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, ' ')
    .replace(/[|*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = clean ? clean.split(' ').length : 0;
  let text = clean;
  if (text.length > 280) text = text.slice(0, 280).replace(/\s+\S*$/, '') + '…';
  return { text, words };
}
