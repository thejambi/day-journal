import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
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
});

const readOnlyCompartment = new Compartment();

export function buildExtensions(onDocChanged: () => void): Extension[] {
	return [
		history(),
		markdown({ base: markdownLanguage }),
		syntaxHighlighting(mdHighlight),
		EditorView.lineWrapping,
		cmTheme,
		placeholder("Write about your day…"),
		readOnlyCompartment.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]),
		keymap.of([...defaultKeymap, ...historyKeymap]),
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
