// Obsidian plugin: adds a "Nova Galaxy" tab that shows the vault as a solar system.

import { Plugin, ItemView, TFile, debounce } from 'obsidian';
import { createGalaxy } from './scene.js';
import { buildGalaxyData, excerptOf } from './data.js';

const VIEW_TYPE = 'nova-galaxy';

class GalaxyView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.galaxy = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Nova Galaxy'; }
  getIcon() { return 'sparkles'; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('nova-galaxy-view');
    const data = await this.plugin.collect();
    this.galaxy = createGalaxy(this.contentEl, data, {
      onOpen: (path) => this.app.workspace.openLinkText(path, '', 'tab'),
      getExcerpt: (path) => this.plugin.excerpt(path),
    });
    // redraw when notes or links change
    const refresh = debounce(async () => {
      if (this.galaxy) this.galaxy.setData(await this.plugin.collect());
    }, 1500, true);
    this.registerEvent(this.app.metadataCache.on('resolved', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
  }

  async onClose() {
    if (this.galaxy) this.galaxy.destroy();
    this.galaxy = null;
  }
}

export default class NovaGalaxyPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new GalaxyView(leaf, this));
    this.addRibbonIcon('sparkles', 'Open Nova Galaxy', () => this.activate());
    this.addCommand({ id: 'open', name: 'Open Nova Galaxy', callback: () => this.activate() });
  }

  async activate() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) return this.app.workspace.revealLeaf(existing);
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async collect() {
    const files = this.app.vault.getMarkdownFiles().map((f) => {
      const cache = this.app.metadataCache.getFileCache(f);
      const tags = new Set();
      (cache?.tags || []).forEach((t) => tags.add(t.tag.replace(/^#/, '')));
      const fm = cache?.frontmatter?.tags;
      if (fm) [].concat(fm).forEach((t) => tags.add(String(t).replace(/^#/, '')));
      return { path: f.path, name: f.basename, ctime: f.stat.ctime, mtime: f.stat.mtime, tags: [...tags] };
    });
    let groups = [];
    try {
      const g = JSON.parse(await this.app.vault.adapter.read(`${this.app.vault.configDir}/graph.json`));
      groups = (g.colorGroups || []).map((x) => ({ query: x.query || '', rgb: x.color?.rgb || 0 }));
    } catch (e) {
      // no graph settings yet: use the built-in planet colours
    }
    return buildGalaxyData({ files, links: this.app.metadataCache.resolvedLinks, groups });
  }

  async excerpt(path) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) return { text: '', words: 0 };
    return excerptOf(await this.app.vault.cachedRead(f));
  }
}
