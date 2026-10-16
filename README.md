# ✦ Nova Galaxy

An Obsidian plugin that shows your vault as a 3D solar system, in the Nova Studios style: near-black space, frosted glass, soft white glow and a cyan accent.

- **The sun** is your `Home` note (or the best-linked note at the top of the vault).
- **Planets** are your projects: each folder under `Projects/` (or each top-level folder). The planet is the project's `<name> - Overview` note when there is one.
- **Moons** are the notes in that project. Work logs sit on an outer shell.
- **Space** has twinkling ✦ sparkles and star dust, faint fog, orbit rings and a globe of grid lines.
- Planet colours come from the colour groups in Obsidian's graph settings (`path:"Projects/..."`), or a built-in palette.

## Using it

- Open it with the ✦ ribbon icon or the command **Open Nova Galaxy**.
- Drag to turn, scroll to zoom. Hover a note to light up its links; click to fly to it and see its details. Double-click opens the note.
- The side panel shows links in and out, word count, a summary and tags. **Open note** opens it in a new tab.
- The left panel shows notes, links, your day streak, activity over the last three weeks and every planet (click one to fly there).
- The bottom bar has search, **Recenter**, **Pause** (stops the orbits) and **Lonely** (lights up notes with no links).
- It redraws by itself when notes or links change.

## Install

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `<your vault>/.obsidian/plugins/nova-galaxy/`.
3. In Obsidian: Settings → Community plugins → turn them on, then enable **Nova Galaxy**.

Desktop only.

## Building

```sh
npm install
npm run build            # builds dist/
npm run install-plugin   # builds and copies into the vault (vault path from NOVA_VAULT or vault-path.txt)
npm run preview          # exports your vault to test/vault.json and builds a browser preview: open test/harness.html
```

`test/vault.json` holds the text of your notes, so it is git-ignored.

Made by Nova Studios.
