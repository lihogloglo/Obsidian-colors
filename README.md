# BBCode Text Colors Development Workspace

This folder is split into development files and the copy-ready Obsidian plugin.

Copy this folder into your vault:

```txt
dist/bbcode-text-colors
```

Destination:

```txt
<your vault>/.obsidian/plugins/bbcode-text-colors
```

The rest of the repository is only for development.

## Usage

The plugin adds inline text colors while keeping your notes free of HTML.

Write:

```md
This is [color=red]important[/color].
This is [color=#888888]muted[/color].
This is [red]urgent[/red].
```

The plugin renders the text in color in Reading View and colors the inner text in Live Preview. The source Markdown remains BBCode-style text, not `<span>` tags.

Use the palette icon in Obsidian's bottom status bar:

- click the icon to expand or collapse the color toolbar
- select text, then click a color swatch
- click a swatch with no selection to insert empty color tags
- use the palette icon for a custom color
- use the eraser icon to remove color tags from the selection or current line
- use the x icon to collapse the toolbar back to the status-bar icon

## Features

- `[color=name]text[/color]` and `[color=#hex]text[/color]`
- palette shorthands like `[red]text[/red]`
- Reading View rendering that preserves rendered Markdown inside colored ranges
- Live Preview decorations
- ribbon color picker
- collapsed-by-default status-bar toolbar
- command palette actions for palette colors
- remove-color command for the current selection or line
- editable named palette in plugin settings

## Build

1. Run `npm install`.
2. Run `npm run build`.
3. Copy this folder into your vault:

```txt
dist/bbcode-text-colors
```

4. Enable the plugin in Obsidian community plugin settings.

## Folder Layout

```txt
src/
  main.ts                       source code

dist/
  bbcode-text-colors/
    manifest.json               copy this folder to Obsidian
    main.js
    styles.css
    versions.json
    README.md

package.json                    build dependencies/scripts
package-lock.json
tsconfig.json
esbuild.config.mjs
```

## Palette Format

In settings, write one color per line:

```txt
red = #ff5555
gray = #8a8a8a
accent = var(--interactive-accent)
```

Palette names can be used with either:

```md
[color=red]text[/color]
```

or:

```md
[red]text[/red]
```
