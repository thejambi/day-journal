import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	MatchDecorator,
	ViewPlugin,
	keymap,
	placeholder,
	type DecorationSet,
	type ViewUpdate,
} from "@codemirror/view";
import { openUrl } from "@tauri-apps/plugin-opener";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/* Entries are plain text, but passively styling markdown-ish content
   (headings, bold, lists) costs nothing and reads nicely. */
const mdHighlight = HighlightStyle.define([
	{ tag: tags.heading1, fontSize: "1.4em", fontWeight: "700" },
	{ tag: tags.heading2, fontSize: "1.25em", fontWeight: "700" },
	{ tag: tags.heading3, fontSize: "1.1em", fontWeight: "700" },
	{ tag: tags.strong, fontWeight: "700" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{ tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em" },
	{ tag: tags.quote, color: "var(--fg-dim)", fontStyle: "italic" },
	{ tag: tags.link, color: "var(--accent)" },
	{ tag: tags.url, color: "var(--fg-faint)" },
	{ tag: tags.processingInstruction, color: "var(--fg-faint)" },
	{ tag: tags.contentSeparator, color: "var(--fg-faint)" },
]);

const cmTheme = EditorView.theme({
	"&": {
		height: "100%",
		fontSize: "inherit",
		backgroundColor: "transparent",
		color: "var(--fg)",
	},
	"&.cm-focused": { outline: "none" },
	".cm-scroller": {
		fontFamily: "inherit",
		lineHeight: "1.6",
	},
	".cm-content": {
		padding: "18px 0 45vh 0",
		caretColor: "var(--accent)",
	},
	".cm-line": { padding: "0 24px" },
	".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
		backgroundColor: "var(--sel) !important",
	},
	".cm-placeholder": { color: "var(--fg-faint)" },
	".cm-clickable-url": {
		color: "var(--accent)",
		textDecoration: "underline",
		textUnderlineOffset: "2px",
		textDecorationColor: "var(--fg-faint)",
	},
	"&.cm-mod-down .cm-clickable-url": { cursor: "pointer" },
});

/* --- Markdown editing commands (ported from ps-notes) --- */

/** Wrap the selection in `marker` (e.g. ** or *), or unwrap if already wrapped. */
export function toggleSurround(view: EditorView, marker: string): boolean {
	return toggleSurroundWith(view, marker, marker);
}

export function toggleSurroundWith(view: EditorView, open: string, close: string): boolean {
	const tr = view.state.changeByRange((range) => {
		const { from, to } = range;
		const doc = view.state.doc;
		const before = doc.sliceString(Math.max(0, from - open.length), from);
		const after = doc.sliceString(to, Math.min(doc.length, to + close.length));
		if (before === open && after === close) {
			return {
				changes: [
					{ from: from - open.length, to: from, insert: "" },
					{ from: to, to: to + close.length, insert: "" },
				],
				range: EditorSelection.range(from - open.length, to - open.length),
			};
		}
		return {
			changes: [
				{ from, insert: open },
				{ from: to, insert: close },
			],
			range: EditorSelection.range(from + open.length, to + open.length),
		};
	});
	view.dispatch(tr, { scrollIntoView: true, userEvent: "input" });
	return true;
}

/** Set the current line's markdown heading level (0 removes the heading). */
export function setHeading(view: EditorView, level: number): boolean {
	const tr = view.state.changeByRange((range) => {
		const line = view.state.doc.lineAt(range.head);
		const match = /^(#{0,6})[ \t]*/.exec(line.text) ?? ["", ""];
		const old = match[0];
		const insert = level > 0 ? "#".repeat(level) + " " : "";
		const diff = insert.length - old.length;
		const boundary = line.from + old.length;
		const map = (pos: number) =>
			pos < line.from ? pos : pos <= boundary ? line.from + insert.length : pos + diff;
		return {
			changes: { from: line.from, to: boundary, insert },
			range: EditorSelection.range(map(range.anchor), map(range.head)),
		};
	});
	view.dispatch(tr, { userEvent: "input" });
	return true;
}

export function adjustHeading(view: EditorView, delta: number): boolean {
	const line = view.state.doc.lineAt(view.state.selection.main.head);
	const current = (/^(#{0,6})/.exec(line.text) ?? ["", ""])[1].length;
	const level = Math.min(6, Math.max(0, current + delta));
	return setHeading(view, level);
}

// Mod+L/J/K/I are day and week navigation here, so the formatting
// commands that collide with them live on Alt (or shifted) variants.
const mdKeymap = [
	{ key: "Mod-b", run: (v: EditorView) => toggleSurround(v, "**") },
	{ key: "Mod-Shift-i", run: (v: EditorView) => toggleSurround(v, "*") },
	{ key: "Mod-Alt-u", run: (v: EditorView) => toggleSurround(v, "~~") },
	{ key: "Mod-Shift-k", run: insertLink },
	{ key: "Mod-/", run: (v: EditorView) => toggleSurroundWith(v, "<!-- ", " -->") },
	{ key: "Mod-Alt-j", run: (v: EditorView) => toggleSurround(v, "`") },
	{ key: "Mod-Alt-Shift-j", run: insertCodeBlock },
	{ key: "Mod-Alt-l", run: (v: EditorView) => toggleList(v, "bullet") },
	{ key: "Mod-Alt-Shift-l", run: (v: EditorView) => toggleList(v, "ordered") },
	{ key: "Mod-Alt-t", run: (v: EditorView) => toggleList(v, "task") },
	{ key: "Mod-Alt-x", run: toggleTaskDone },
	{ key: "Mod-Shift-.", run: toggleBlockquote },
	{ key: "Mod->", run: toggleBlockquote },
	...[1, 2, 3, 4, 5, 6].map((n) => ({
		key: `Mod-${n}`,
		run: (v: EditorView) => setHeading(v, n),
	})),
	{ key: "Mod-\\", run: (v: EditorView) => adjustHeading(v, 1) },
	{ key: "Mod-Shift-\\", run: (v: EditorView) => adjustHeading(v, -1) },
];

/* --- Line-prefix commands: lists, tasks, blockquote --- */

const BULLET_RE = /^(\s*)([-*+])\s+/;
const ORDERED_RE = /^(\s*)(\d+[.)])\s+/;
const TASK_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+/;
const QUOTE_RE = /^(\s*)>\s?/;

/** Every line touched by the selection (deduped, in order). */
function selectedLines(state: EditorState) {
	const lines = [];
	const seen = new Set<number>();
	for (const range of state.selection.ranges) {
		const last = state.doc.lineAt(range.to).number;
		for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
			if (!seen.has(n)) {
				seen.add(n);
				lines.push(state.doc.line(n));
			}
		}
	}
	return lines;
}

/** Split a line into its indent and its content, dropping any list marker. */
function stripMarker(text: string): { indent: string; body: string } {
	const m = TASK_RE.exec(text) ?? BULLET_RE.exec(text) ?? ORDERED_RE.exec(text);
	if (m) return { indent: m[1], body: text.slice(m[0].length) };
	const indent = /^(\s*)/.exec(text)?.[1] ?? "";
	return { indent, body: text.slice(indent.length) };
}

export function toggleList(view: EditorView, kind: "bullet" | "ordered" | "task"): boolean {
	const lines = selectedLines(view.state);
	if (lines.length === 0) return false;
	const has = (t: string) =>
		kind === "bullet"
			? BULLET_RE.test(t) && !TASK_RE.test(t)
			: kind === "ordered"
				? ORDERED_RE.test(t)
				: TASK_RE.test(t);
	const allHave = lines.every((l) => has(l.text));
	let n = 1;
	const changes = lines.map((l) => {
		const { indent, body } = stripMarker(l.text);
		let insert: string;
		if (allHave) insert = indent + body;
		else if (kind === "bullet") insert = `${indent}- ${body}`;
		else if (kind === "ordered") insert = `${indent}${n++}. ${body}`;
		else insert = `${indent}- [ ] ${body}`;
		return { from: l.from, to: l.to, insert };
	});
	view.dispatch({ changes, userEvent: "input", scrollIntoView: true });
	return true;
}

export function toggleBlockquote(view: EditorView): boolean {
	const lines = selectedLines(view.state);
	if (lines.length === 0) return false;
	const allQuoted = lines.every((l) => QUOTE_RE.test(l.text));
	const changes = lines.map((l) => {
		if (allQuoted) {
			const m = QUOTE_RE.exec(l.text);
			return { from: l.from, to: l.to, insert: (m?.[1] ?? "") + l.text.slice(m?.[0].length ?? 0) };
		}
		const indent = /^(\s*)/.exec(l.text)?.[1] ?? "";
		return { from: l.from, to: l.to, insert: `${indent}> ${l.text.slice(indent.length)}` };
	});
	view.dispatch({ changes, userEvent: "input", scrollIntoView: true });
	return true;
}

/** Toggle [ ] / [x] on task lines; turn plain lines into unchecked tasks. */
export function toggleTaskDone(view: EditorView): boolean {
	const lines = selectedLines(view.state);
	if (lines.length === 0) return false;
	const changes = lines.map((l) => {
		const m = TASK_RE.exec(l.text);
		if (m) {
			const done = m[3].toLowerCase() === "x";
			const rest = l.text.slice(m[0].length);
			return { from: l.from, to: l.to, insert: `${m[1]}${m[2]} [${done ? " " : "x"}] ${rest}` };
		}
		const { indent, body } = stripMarker(l.text);
		return { from: l.from, to: l.to, insert: `${indent}- [ ] ${body}` };
	});
	view.dispatch({ changes, userEvent: "input", scrollIntoView: true });
	return true;
}

/** [selection]() with the cursor in the parens; a selected URL becomes the target. */
export function insertLink(view: EditorView): boolean {
	const tr = view.state.changeByRange((range) => {
		const sel = view.state.sliceDoc(range.from, range.to).trim();
		if (/^https?:\/\/\S+$/.test(sel)) {
			return {
				changes: { from: range.from, to: range.to, insert: `[](${sel})` },
				range: EditorSelection.cursor(range.from + 1),
			};
		}
		return {
			changes: { from: range.from, to: range.to, insert: `[${sel}]()` },
			range: EditorSelection.cursor(range.from + sel.length + 3),
		};
	});
	view.dispatch(tr, { userEvent: "input", scrollIntoView: true });
	return true;
}

/** Wrap the selected lines in a ``` fence (or open an empty one). */
export function insertCodeBlock(view: EditorView): boolean {
	const { state } = view;
	const sel = state.selection.main;
	const first = state.doc.lineAt(sel.from);
	const last = state.doc.lineAt(sel.to);
	const body = state.sliceDoc(first.from, last.to);
	view.dispatch({
		changes: { from: first.from, to: last.to, insert: "```\n" + body + "\n```" },
		selection: EditorSelection.cursor(first.from + 4 + body.length),
		userEvent: "input",
		scrollIntoView: true,
	});
	view.focus();
	return true;
}

/* --- Tab / indent behavior --- */

const LIST_ITEM_RE = /^\s*([-*+]|\d+[.)])\s/;

/** Tab indents list items and multi-line selections; elsewhere it inserts
    a tab character. Never moves focus out of the editor. */
function smartTab(view: EditorView): boolean {
	const { state } = view;
	const sel = state.selection.main;
	const line = state.doc.lineAt(sel.head);
	if (!sel.empty || LIST_ITEM_RE.test(line.text)) {
		return indentMore(view);
	}
	view.dispatch(state.replaceSelection(state.facet(indentUnit)), {
		scrollIntoView: true,
		userEvent: "input",
	});
	return true;
}

const indentKeymap = [
	{ key: "Tab", run: smartTab, shift: indentLess },
	{ key: "Mod-]", run: indentMore },
	{ key: "Mod-[", run: indentLess },
];

/* --- Clickable URLs (Cmd/Ctrl+click to open; plain click just edits) --- */

const isMacUA = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
// URLs end on a non-punctuation char so a trailing "." or ")" isn't swallowed
const URL_REGEX = /https?:\/\/[^\s<>()"']*[^\s<>()"'.,;:!?]/g;

const urlMatcher = new MatchDecorator({
	regexp: URL_REGEX,
	decoration: Decoration.mark({
		class: "cm-clickable-url",
		attributes: { title: (isMacUA ? "⌘" : "Ctrl+") + "click to open" },
	}),
});

const urlHighlighter = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = urlMatcher.createDeco(view);
		}
		update(update: ViewUpdate) {
			this.decorations = urlMatcher.updateDeco(update, this.decorations);
		}
	},
	{ decorations: (v) => v.decorations },
);

/* Show the pointer hand over clickables while the mod key is held */
const modKeyCursor = ViewPlugin.fromClass(
	class {
		private setDown: (e: KeyboardEvent) => void;
		private setUp: (e: KeyboardEvent) => void;
		private clear: () => void;
		constructor(view: EditorView) {
			const modKey = isMacUA ? "Meta" : "Control";
			this.setDown = (e) => {
				if (e.key === modKey) view.dom.classList.add("cm-mod-down");
			};
			this.setUp = (e) => {
				if (e.key === modKey) view.dom.classList.remove("cm-mod-down");
			};
			this.clear = () => view.dom.classList.remove("cm-mod-down");
			window.addEventListener("keydown", this.setDown);
			window.addEventListener("keyup", this.setUp);
			window.addEventListener("blur", this.clear);
		}
		destroy() {
			window.removeEventListener("keydown", this.setDown);
			window.removeEventListener("keyup", this.setUp);
			window.removeEventListener("blur", this.clear);
		}
	},
);

const urlClickHandler = EditorView.domEventHandlers({
	mousedown(e, view) {
		const mod = isMacUA ? e.metaKey : e.ctrlKey;
		if (!mod || e.button !== 0) return false;
		const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
		if (pos == null) return false;
		const line = view.state.doc.lineAt(pos);
		const re = new RegExp(URL_REGEX.source, "g");
		let m: RegExpExecArray | null;
		while ((m = re.exec(line.text))) {
			const from = line.from + m.index;
			const to = from + m[0].length;
			if (pos >= from && pos <= to) {
				e.preventDefault();
				void openUrl(m[0]);
				return true;
			}
		}
		return false;
	},
});

const readOnlyCompartment = new Compartment();

export function buildExtensions(onDocChanged: () => void): Extension[] {
	return [
		history(),
		markdown({ base: markdownLanguage }),
		syntaxHighlighting(mdHighlight),
		EditorView.lineWrapping,
		cmTheme,
		indentUnit.of("\t"),
		urlHighlighter,
		modKeyCursor,
		urlClickHandler,
		placeholder("Write about your day…"),
		readOnlyCompartment.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]),
		keymap.of([...indentKeymap, ...mdKeymap, ...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) onDocChanged();
		}),
	];
}

/** Lock or unlock the entry (read-only view, caret hidden). */
export function setReadOnly(view: EditorView, ro: boolean): void {
	view.dispatch({
		effects: readOnlyCompartment.reconfigure([EditorState.readOnly.of(ro), EditorView.editable.of(!ro)]),
	});
}

export function createEditor(parent: HTMLElement, extensions: Extension[]): EditorView {
	return new EditorView({
		state: EditorState.create({ doc: "", extensions }),
		parent,
	});
}

/** Replace the document and reset undo history (used when switching days). */
export function setDocument(view: EditorView, extensions: Extension[], text: string): void {
	view.setState(EditorState.create({ doc: text, extensions }));
}

/** Insert text at the cursor and move the cursor to its end. */
export function insertAtCursor(view: EditorView, text: string): void {
	const { head } = view.state.selection.main;
	view.dispatch({
		changes: { from: head, insert: text },
		selection: { anchor: head + text.length },
		scrollIntoView: true,
		userEvent: "input",
	});
	view.focus();
}

/** Prepend text to the document (cursor stays in place, adjusted). */
export function prependText(view: EditorView, text: string): void {
	view.dispatch({
		changes: { from: 0, insert: text },
		userEvent: "input",
	});
}

export function countWords(text: string): number {
	const words = text.match(/\S+/g);
	return words ? words.length : 0;
}
