# BBCode Text Colors

An Obsidian plugin for adding inline text colors without writing HTML in your notes.

Instead of this:

```html
<span style="color:red">important</span>
```

Write this:

```md
[color=red]important[/color]
[color=#888888]muted[/color]
[red]urgent[/red]
```

The plugin renders the text in color in Reading View and Live Preview, while keeping your Markdown clean and readable.

## Features

- BBCode-style color tags
- named colors and hex colors
- status-bar color picker
- editable color palette
- no `<span>` tags written into your notes

## Install

Copy `dist/bbcode-text-colors` into your vault:

```txt
.obsidian/plugins/bbcode-text-colors
```

Then enable **BBCode Text Colors** in Obsidian's Community Plugins settings.
