import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  setIcon,
} from "obsidian";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

interface BBColorSettings {
  palette: Record<string, string>;
  toolbarExpanded: boolean;
}

interface ColorRange {
  colorInput: string;
  openFrom: number;
  openTo: number;
  contentFrom: number;
  contentTo: number;
  closeFrom: number;
  closeTo: number;
}

interface ActiveTag {
  type: "color" | "alias";
  name: string;
  colorInput: string;
  from: number;
  to: number;
}

interface TextSegment {
  node: Text;
  from: number;
  to: number;
}

const DEFAULT_SETTINGS: BBColorSettings = {
  toolbarExpanded: false,
  palette: {
    red: "#ff5555",
    gray: "#8a8a8a",
    blue: "#579dff",
    green: "#4ade80",
    yellow: "#facc15",
    orange: "#fb923c",
    purple: "#c084fc",
    accent: "var(--interactive-accent)",
  },
};

export default class BBCodeTextColorsPlugin extends Plugin {
  settings: BBColorSettings;
  toolbarEl: HTMLElement | null = null;
  statusBarEl: HTMLElement | null = null;
  statusBarButtonEl: HTMLButtonElement | null = null;

  async onload() {
    await this.loadSettings();

    this.registerMarkdownPostProcessor((el) => {
      renderColorTags(el, this.settings);
    });

    this.registerEditorExtension(createEditorExtension(this));

    this.addRibbonIcon("palette", "BBCode text colors", () => {
      new ColorPickerModal(this.app, this).open();
    });

    this.createStatusBarControl();
    this.refreshToolbar();

    this.addCommand({
      id: "open-color-picker",
      name: "Open color picker",
      editorCallback: () => {
        new ColorPickerModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "toggle-color-toolbar",
      name: "Toggle color toolbar",
      callback: async () => {
        await this.setToolbarExpanded(!this.settings.toolbarExpanded);
      },
    });

    this.addCommand({
      id: "remove-color",
      name: "Remove BBCode color from selection or line",
      editorCallback: (editor) => {
        this.removeColor(editor);
      },
    });

    for (const name of Object.keys(this.settings.palette)) {
      this.addCommand({
        id: `apply-color-${name}`,
        name: `Apply color: ${name}`,
        editorCallback: (editor) => {
          this.applyColor(editor, name);
        },
      });
    }

    this.addSettingTab(new BBColorSettingTab(this.app, this));
  }

  onunload() {
    this.toolbarEl?.remove();
    this.statusBarEl?.remove();
  }

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      toolbarExpanded: loaded?.toolbarExpanded ?? DEFAULT_SETTINGS.toolbarExpanded,
      palette: {
        ...DEFAULT_SETTINGS.palette,
        ...(loaded?.palette ?? {}),
      },
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  createStatusBarControl() {
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("bb-color-status");

    this.statusBarButtonEl = this.statusBarEl.createEl("button", {
      cls: "bb-color-status-button",
      attr: {
        type: "button",
        title: "Toggle BBCode text colors",
        "aria-label": "Toggle BBCode text colors",
        "aria-expanded": String(this.settings.toolbarExpanded),
      },
    });
    setIcon(this.statusBarButtonEl, "palette");
    this.statusBarButtonEl.addEventListener("click", async () => {
      await this.setToolbarExpanded(!this.settings.toolbarExpanded);
    });
  }

  async setToolbarExpanded(expanded: boolean) {
    this.settings.toolbarExpanded = expanded;
    await this.saveSettings();
    this.refreshToolbar();
  }

  refreshToolbar() {
    this.statusBarButtonEl?.setAttr("aria-expanded", String(this.settings.toolbarExpanded));
    this.statusBarButtonEl?.toggleClass("is-active", this.settings.toolbarExpanded);

    if (!this.settings.toolbarExpanded) {
      this.toolbarEl?.remove();
      this.toolbarEl = null;
      return;
    }

    if (!this.toolbarEl) {
      this.toolbarEl = document.body.createDiv({ cls: "bb-color-toolbar" });
    }

    this.toolbarEl.empty();

    for (const [name, value] of Object.entries(this.settings.palette)) {
      const color = resolveColor(name, this.settings);
      const button = this.toolbarEl.createEl("button", {
        cls: "bb-color-toolbar-button",
        attr: {
          type: "button",
          title: `Apply ${name}`,
          "aria-label": `Apply ${name}`,
        },
      });
      const swatch = button.createSpan({ cls: "bb-color-toolbar-swatch" });
      swatch.style.backgroundColor = color ?? value;
      button.addEventListener("click", () => {
        this.applyColorToActiveView(name);
      });
    }

    const custom = this.toolbarEl.createEl("button", {
      cls: "bb-color-toolbar-button",
      attr: {
        type: "button",
        title: "Open color picker",
        "aria-label": "Open color picker",
      },
    });
    setIcon(custom, "palette");
    custom.addEventListener("click", () => {
      new ColorPickerModal(this.app, this).open();
    });

    const remove = this.toolbarEl.createEl("button", {
      cls: "bb-color-toolbar-button",
      attr: {
        type: "button",
        title: "Remove color",
        "aria-label": "Remove color",
      },
    });
    setIcon(remove, "eraser");
    remove.addEventListener("click", () => {
      const editor = this.getActiveEditor();
      if (!editor) {
        new Notice("Open a Markdown note to remove colors.");
        return;
      }
      this.removeColor(editor);
    });

    const hide = this.toolbarEl.createEl("button", {
      cls: "bb-color-toolbar-button",
      attr: {
        type: "button",
        title: "Collapse toolbar",
        "aria-label": "Collapse toolbar",
      },
    });
    setIcon(hide, "x");
    hide.addEventListener("click", async () => {
      await this.setToolbarExpanded(false);
    });
  }

  getActiveEditor(): Editor | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    return activeView?.editor ?? null;
  }

  applyColorToActiveView(colorInput: string) {
    const editor = this.getActiveEditor();
    if (!editor) {
      new Notice("Open a Markdown note to apply colors.");
      return;
    }

    this.applyColor(editor, colorInput);
    editor.focus();
  }

  applyColor(editor: Editor, colorInput: string) {
    const color = resolveColor(colorInput, this.settings);
    if (!color) {
      new Notice(`Invalid color: ${colorInput}`);
      return;
    }

    const opening = `[color=${colorInput}]`;
    const closing = "[/color]";
    const selected = editor.getSelection();

    if (selected) {
      editor.replaceSelection(`${opening}${selected}${closing}`);
      return;
    }

    const cursor = editor.getCursor();
    editor.replaceSelection(`${opening}${closing}`);
    editor.setCursor({
      line: cursor.line,
      ch: cursor.ch + opening.length,
    });
  }

  removeColor(editor: Editor) {
    const selected = editor.getSelection();

    if (selected) {
      const unwrapped = unwrapColorMarkup(selected, this.settings);
      if (unwrapped === selected) {
        new Notice("No BBCode color tags found in selection.");
        return;
      }
      editor.replaceSelection(unwrapped);
      return;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const unwrapped = unwrapColorMarkup(line, this.settings);

    if (unwrapped === line) {
      new Notice("No BBCode color tags found on this line.");
      return;
    }

    editor.setLine(cursor.line, unwrapped);
  }
}

function createEditorExtension(plugin: BBCodeTextColorsPlugin): Extension {
  class BBColorViewPlugin implements PluginValue {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    destroy() {}

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const text = view.state.doc.toString();
      const ranges = parseColorRanges(text, plugin.settings);

      for (const range of ranges) {
        if (!intersectsVisibleRange(view, range.openFrom, range.closeTo)) {
          continue;
        }

        const color = resolveColor(range.colorInput, plugin.settings);
        if (!color) {
          continue;
        }

        builder.add(
          range.openFrom,
          range.openTo,
          Decoration.mark({ class: "bb-color-token" })
        );

        if (range.contentFrom < range.contentTo) {
          builder.add(
            range.contentFrom,
            range.contentTo,
            Decoration.mark({
              class: "bb-color-text",
              attributes: {
                style: `--bb-color: ${color};`,
              },
            })
          );
        }

        builder.add(
          range.closeFrom,
          range.closeTo,
          Decoration.mark({ class: "bb-color-token" })
        );
      }

      return builder.finish();
    }
  }

  const pluginSpec: PluginSpec<BBColorViewPlugin> = {
    decorations: (value: BBColorViewPlugin) => value.decorations,
  };

  return ViewPlugin.fromClass(BBColorViewPlugin, pluginSpec);
}

function intersectsVisibleRange(view: EditorView, from: number, to: number): boolean {
  return view.visibleRanges.some((range) => from <= range.to && to >= range.from);
}

function parseColorRanges(text: string, settings: BBColorSettings): ColorRange[] {
  const aliasNames = Object.keys(settings.palette).map(escapeRegExp);
  const aliasPattern = aliasNames.length > 0 ? aliasNames.join("|") : "a^";
  const tokenPattern = new RegExp(
    `\\[color=([^\\]\\r\\n]+)\\]|\\[/color\\]|\\[(${aliasPattern})\\]|\\[/(${aliasPattern})\\]`,
    "gi"
  );
  const ranges: ColorRange[] = [];
  let active: ActiveTag | null = null;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    const raw = match[0];
    const from = match.index;
    const to = from + raw.length;

    if (match[1] && !active) {
      active = {
        type: "color",
        name: "color",
        colorInput: match[1].trim(),
        from,
        to,
      };
      continue;
    }

    if (match[2] && !active) {
      const alias = match[2].toLowerCase();
      active = {
        type: "alias",
        name: alias,
        colorInput: alias,
        from,
        to,
      };
      continue;
    }

    if (!active) {
      continue;
    }

    const isColorClose = raw.toLowerCase() === "[/color]" && active.type === "color";
    const aliasClose = match[3]?.toLowerCase();
    const isAliasClose = active.type === "alias" && aliasClose === active.name;

    if (!isColorClose && !isAliasClose) {
      continue;
    }

    ranges.push({
      colorInput: active.colorInput,
      openFrom: active.from,
      openTo: active.to,
      contentFrom: active.to,
      contentTo: from,
      closeFrom: from,
      closeTo: to,
    });
    active = null;
  }

  return ranges;
}

function renderColorTags(root: HTMLElement, settings: BBColorSettings) {
  const text = collectTextSegments(root)
    .map((segment) => segment.node.nodeValue ?? "")
    .join("");
  const ranges = parseColorRanges(text, settings);

  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    const color = resolveColor(range.colorInput, settings);

    if (!color) {
      continue;
    }

    const openingLength = range.openTo - range.openFrom;
    removeTextRange(root, range.closeFrom, range.closeTo);
    removeTextRange(root, range.openFrom, range.openTo);
    wrapTextRange(root, range.openFrom, range.closeFrom - openingLength, color);
  }
}

function collectTextSegments(root: HTMLElement): TextSegment[] {
  const segments: TextSegment[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return isEligibleTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    }
  );
  let position = 0;
  let node = walker.nextNode() as Text | null;

  while (node) {
    const value = node.nodeValue ?? "";
    segments.push({
      node,
      from: position,
      to: position + value.length,
    });
    position += value.length;
    node = walker.nextNode() as Text | null;
  }

  return segments;
}

function isEligibleTextNode(node: Node): boolean {
  let parent = node.parentElement;

  while (parent) {
    const tagName = parent.tagName.toLowerCase();
    if (["code", "pre", "script", "style", "textarea"].includes(tagName)) {
      return false;
    }
    parent = parent.parentElement;
  }

  return true;
}

function locateTextPosition(root: HTMLElement, position: number) {
  const segments = collectTextSegments(root);

  for (const segment of segments) {
    if (position <= segment.to) {
      return {
        node: segment.node,
        offset: Math.max(0, Math.min(position - segment.from, segment.to - segment.from)),
      };
    }
  }

  const last = segments.last();
  if (!last) {
    return null;
  }

  return {
    node: last.node,
    offset: last.to - last.from,
  };
}

function removeTextRange(root: HTMLElement, from: number, to: number) {
  if (from >= to) {
    return;
  }

  const start = locateTextPosition(root, from);
  const end = locateTextPosition(root, to);

  if (!start || !end) {
    return;
  }

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  range.deleteContents();
}

function wrapTextRange(root: HTMLElement, from: number, to: number, color: string) {
  if (from >= to) {
    return;
  }

  const start = locateTextPosition(root, from);
  const end = locateTextPosition(root, to);

  if (!start || !end) {
    return;
  }

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  const span = document.createElement("span");
  span.addClass("bb-color-text");
  span.style.setProperty("--bb-color", color);
  span.appendChild(range.extractContents());
  range.insertNode(span);
}

function resolveColor(input: string, settings: BBColorSettings): string | null {
  const trimmed = input.trim();
  const paletteValue = settings.palette[trimmed.toLowerCase()];
  const candidate = paletteValue ?? trimmed;

  if (isSafeCssColor(candidate)) {
    return candidate;
  }

  return null;
}

function isSafeCssColor(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length === 0 || /[;{}<>]/.test(trimmed)) {
    return false;
  }

  return (
    /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ||
    /^(rgb|rgba|hsl|hsla)\([0-9.,%+\-\s]+\)$/.test(trimmed) ||
    /^var\(--[a-zA-Z0-9_-]+\)$/.test(trimmed) ||
    /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(trimmed)
  );
}

function unwrapColorMarkup(text: string, settings: BBColorSettings): string {
  let output = text.replace(/\[color=[^\]\r\n]+\]([\s\S]*?)\[\/color\]/gi, "$1");
  const aliases = Object.keys(settings.palette).map(escapeRegExp);

  if (aliases.length > 0) {
    const aliasPattern = aliases.join("|");
    output = output.replace(
      new RegExp(`\\[(${aliasPattern})\\]([\\s\\S]*?)\\[/\\1\\]`, "gi"),
      "$2"
    );
  }

  return output;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function paletteToText(palette: Record<string, string>): string {
  return Object.entries(palette)
    .map(([name, value]) => `${name} = ${value}`)
    .join("\n");
}

function paletteFromText(text: string): Record<string, string> {
  const palette: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex).trim().toLowerCase();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (/^[a-z][a-z0-9_-]*$/i.test(name) && isSafeCssColor(value)) {
      palette[name] = value;
    }
  }

  return palette;
}

class ColorPickerModal extends Modal {
  plugin: BBCodeTextColorsPlugin;

  constructor(app: App, plugin: BBCodeTextColorsPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "BBCode text color" });

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      contentEl.createEl("p", { text: "Open a Markdown note to apply colors." });
      return;
    }

    const picker = contentEl.createDiv({ cls: "bb-color-picker" });

    for (const [name, value] of Object.entries(this.plugin.settings.palette)) {
      const color = resolveColor(name, this.plugin.settings);
      const button = picker.createEl("button", {
        cls: "bb-color-button",
        type: "button",
      });
      const swatch = button.createSpan({ cls: "bb-color-swatch" });
      swatch.style.backgroundColor = color ?? value;
      button.createSpan({ text: name });
      button.addEventListener("click", () => {
        this.plugin.applyColor(activeView.editor, name);
        this.close();
      });
    }

    const custom = contentEl.createDiv({ cls: "bb-color-custom" });
    const input = custom.createEl("input", {
      attr: {
        type: "text",
        placeholder: "#ff5555, red, or var(--interactive-accent)",
      },
    });
    const apply = custom.createEl("button", {
      text: "Apply",
      type: "button",
    });

    apply.addEventListener("click", () => {
      const colorInput = input.value.trim();
      this.plugin.applyColor(activeView.editor, colorInput);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class BBColorSettingTab extends PluginSettingTab {
  plugin: BBCodeTextColorsPlugin;

  constructor(app: App, plugin: BBCodeTextColorsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "BBCode text colors" });

    new Setting(containerEl)
      .setName("Open color toolbar")
      .setDesc("Expand the status-bar color toolbar. When off, only the bottom-bar icon is shown.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.toolbarExpanded)
          .onChange(async (value) => {
            await this.plugin.setToolbarExpanded(value);
          });
      });

    new Setting(containerEl)
      .setName("Color palette")
      .setDesc("One color per line, written as name = CSS color. Palette names also enable shorthand tags like [red]text[/red].")
      .addTextArea((text) => {
        text
          .setValue(paletteToText(this.plugin.settings.palette))
          .onChange(async (value) => {
            const palette = paletteFromText(value);
            if (Object.keys(palette).length === 0) {
              return;
            }
            this.plugin.settings.palette = palette;
            await this.plugin.saveSettings();
            this.plugin.refreshToolbar();
          });
        text.inputEl.addClass("bb-color-palette-editor");
      });

    new Setting(containerEl)
      .setName("Reset palette")
      .setDesc("Restore the default named colors.")
      .addButton((button) => {
        button
          .setButtonText("Reset")
          .onClick(async () => {
            this.plugin.settings.palette = { ...DEFAULT_SETTINGS.palette };
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }
}
