// Labels drawn on top of the page for the tutorial pictures (same look as the Nova Grid tutorial:
// thin cyan boxes at the control, numbered white-on-dark-glass tags, a line from tag to control).
// Injected into the page by shoot.cjs. A mark points at one of:
//   sel: CSS selector(s) (+ i: which match)   box: {x, y, w, h}   circle: {x, y, r}
//   node: a note id in the galaxy (circle round it)   link: [idA, idB] (circle on the line between them)
//   none of these: a free tag at `at: {x, y}`
// and is placed with pos: below | above | left | right | inside (+ dx, dy), or at: {x, y} for the tag's top-left.
window.__tut = {
  CY: '#22d3ee',
  clear() { document.getElementById('tut-overlay')?.remove(); },
  els(sel, i) {
    const list = [];
    for (const s of [].concat(sel)) {
      const all = [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length);
      if (i != null) all[i] && list.push(all[i]); else list.push(...all);
    }
    return list;
  },
  rect(sel, i, pad = 6) {
    const rs = this.els(sel, i).map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.left)) - pad, y = Math.min(...rs.map((r) => r.top)) - pad;
    return { x, y, w: Math.max(...rs.map((r) => r.right)) + pad - x, h: Math.max(...rs.map((r) => r.bottom)) + pad - y };
  },
  // a note's spot on screen, in page coordinates
  node(id) {
    const t = window.galaxy && window.galaxy._tut;
    const s = t && t.screen(id);
    if (!s || s.behind) return null;
    const o = document.querySelector('.ng-root').getBoundingClientRect();
    return { x: s.x + o.left, y: s.y + o.top, r: s.r };
  },
  target(m) {
    if (m.sel) return this.rect(m.sel, m.i, m.pad ?? 6);
    if (m.box) return { ...m.box };
    let c = m.circle;
    if (m.node) { const n = this.node(m.node); if (n) c = { x: n.x, y: n.y, r: Math.max(m.minR || 14, n.r + (m.pad ?? 8)) }; }
    if (m.link) {
      const a = this.node(m.link[0]), b = this.node(m.link[1]);
      const k = m.at01 ?? 0.5;
      if (a && b) c = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, r: m.minR || 11 };
    }
    if (c) return { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2, round: true };
    return null;
  },
  draw(marks) {
    this.clear();
    const CY = this.CY;
    const o = document.createElement('div');
    o.id = 'tut-overlay';
    o.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Segoe UI,sans-serif';
    document.body.appendChild(o);
    let num = 0;
    marks.forEach((m) => {
      const r = this.target(m);
      if (r) {
        const box = document.createElement('div');
        box.style.cssText = `position:absolute;border:3px solid ${CY};border-radius:${r.round ? '50%' : '9px'};box-shadow:0 0 0 3px rgba(34,211,238,.25),0 0 22px rgba(34,211,238,.55)`;
        Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', boxSizing: 'border-box' });
        o.appendChild(box);
      }
      const tag = document.createElement('div');
      const numbered = m.num !== false;
      tag.style.cssText = `position:absolute;display:flex;align-items:center;gap:10px;padding:7px 14px 7px ${numbered || m.icon ? 7 : 14}px;background:rgba(8,10,14,.94);border:2px solid ${CY};border-radius:999px;color:#fff;font-size:${m.size || 19}px;font-weight:600;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.6)`;
      if (numbered) tag.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${CY};color:#000;font-weight:800;font-size:17px">${++num}</span>`;
      if (m.icon) tag.insertAdjacentHTML('beforeend', `<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;color:${CY}">${m.icon}</span>`);
      tag.append(m.label);
      if (m.sub) tag.insertAdjacentHTML('beforeend', `<span style="font-weight:400;font-size:15px;color:#a5f3fc;margin-left:-2px">${m.sub}</span>`);
      o.appendChild(tag);
      const tw = tag.offsetWidth, th = tag.offsetHeight, gap = 12;
      let x, y;
      if (m.at) { x = m.at.x; y = m.at.y; }
      else if (r) {
        const pos = m.pos || 'below';
        if (pos === 'below') { x = r.x; y = r.y + r.h + gap; }
        if (pos === 'above') { x = r.x; y = r.y - th - gap; }
        if (pos === 'right') { x = r.x + r.w + gap; y = r.y + r.h / 2 - th / 2; }
        if (pos === 'left') { x = r.x - tw - gap; y = r.y + r.h / 2 - th / 2; }
        if (pos === 'inside') { x = r.x + r.w / 2 - tw / 2; y = r.y + r.h / 2 - th / 2; }
      } else { x = 20; y = 20; }
      if (m.dx) x += m.dx; if (m.dy) y += m.dy;
      x = Math.max(8, Math.min(innerWidth - tw - 8, x));
      y = Math.max(8, Math.min(innerHeight - th - 8, y));
      Object.assign(tag.style, { left: x + 'px', top: y + 'px' });
      if (!r) return;
      const cx = x + tw / 2, cy = y + th / 2;
      let px, py;
      if (r.round) {
        // from the edge of the circle, towards the tag
        const ccx = r.x + r.w / 2, ccy = r.y + r.h / 2, a = Math.atan2(cy - ccy, cx - ccx);
        px = ccx + Math.cos(a) * r.w / 2; py = ccy + Math.sin(a) * r.h / 2;
      } else { px = Math.max(r.x, Math.min(r.x + r.w, cx)); py = Math.max(r.y, Math.min(r.y + r.h, cy)); }
      if (Math.hypot(cx - px, cy - py) > th) {
        const line = document.createElement('div');
        const len = Math.hypot(cx - px, cy - py), ang = Math.atan2(cy - py, cx - px);
        line.style.cssText = `position:absolute;height:3px;background:${CY};transform-origin:0 50%;box-shadow:0 0 8px rgba(34,211,238,.7);border-radius:2px`;
        Object.assign(line.style, { left: px + 'px', top: py - 1.5 + 'px', width: len + 'px', transform: 'rotate(' + ang + 'rad)' });
        o.insertBefore(line, tag);
        const dot = document.createElement('div');
        dot.style.cssText = `position:absolute;width:10px;height:10px;border-radius:50%;background:${CY}`;
        Object.assign(dot.style, { left: px - 5 + 'px', top: py - 5 + 'px' });
        o.insertBefore(dot, tag);
      }
    });
  },
};
