/**
 * Shared application state (Svelte 5 rune module) and all actions:
 * loading/saving day entries, calendar marks, journals, watching.
 */
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir, readFile, watch, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Menu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

import { initSettings, persist, DEFAULT_FONT_SIZE, type Settings } from "./settings";
import {
	today,
	addDays,
	sameDate,
	isPast,
	dateHeading,
	newSectionText,
	readEntry,
	saveEntry,
	daysWithEntries,
	listDayImages,
	nextImagePath,
	mimeFor,
	entryPaths,
	IMAGE_EXTS,
	type EntryDate,
} from "./journal";
import {
	buildExtensions,
	createEditor,
	setDocument,
	setReadOnly,
	insertAtCursor,
	prependText,
	countWords,
} from "./editor";

export const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
export const isWindows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");
export const modKeyLabel = isMac ? "⌘" : "Ctrl+";
const SAVE_DELAY_MS = 800; // save during a natural typing breather

const t = today();

export const app = $state({
	settings: {
		journals: [],
		lastDir: null,
		fontSize: DEFAULT_FONT_SIZE,
		lockPastEntries: true,
		showWordCount: true,
		paneWidth: 280,
		theme: "system",
	} as Settings,
	ready: false,
	journalDir: null as string | null,
	selected: { ...t } as EntryDate,
	calYear: t.y,
	calMonth: t.m, // 1-12; the month shown on the calendar
	markedDays: [] as number[], // days of the shown month that have entries
	locked: false,
	wordCount: 0,
	openMenuShown: false,
	settingsMenuShown: false,
	modal: null as "shortcuts" | "about" | "archive" | null,
	dayImages: [] as { name: string; path: string; url: string }[],
	dropHover: false,
});

// --- Non-reactive editor / save machinery ---
let view: EditorView;
let extensions: Extension[];
let dirty = false;
let isOpening = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unwatch: UnwatchFn | null = null;
let savedDate: EntryDate = { ...t }; // the date the editor content belongs to

export function focusEditor(): void {
	view?.focus();
}

// --- Saving ---

function onDocChanged(): void {
	app.wordCount = countWords(view.state.doc.toString());
	if (isOpening) return;
	dirty = true;
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		saveTimer = null;
		void saveNow();
	}, SAVE_DELAY_MS);
}

async function saveNow(): Promise<void> {
	if (!app.journalDir || !dirty) return;
	dirty = false;
	const text = view.state.doc.toString();
	const date = savedDate;
	try {
		await saveEntry(app.journalDir, date, text);
	} catch (e) {
		console.error("save failed", e);
		dirty = true; // retry on next change/flush
		return;
	}
	if (date.y === app.calYear && date.m === app.calMonth) {
		await refreshMarks();
	}
}

export async function flushSave(): Promise<void> {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
	if (dirty) await saveNow();
}

// --- Entries & calendar ---

export async function refreshMarks(): Promise<void> {
	if (!app.journalDir) return;
	app.markedDays = await daysWithEntries(app.journalDir, app.calYear, app.calMonth);
}

export async function loadEntry(date: EntryDate): Promise<void> {
	if (!app.journalDir) return;
	await flushSave();
	isOpening = true;
	const text = await readEntry(app.journalDir, date);
	savedDate = { ...date };
	app.selected = { ...date };
	app.calYear = date.y;
	app.calMonth = date.m;
	setDocument(view, extensions, text);
	app.wordCount = countWords(text);
	app.locked = app.settings.lockPastEntries && isPast(date) && text.trim() !== "";
	setReadOnly(view, app.locked);
	dirty = false;
	isOpening = false;
	await refreshMarks();
	void loadDayImages(); // not awaited: keep day switching snappy
	view.focus();
}

export async function goToday(): Promise<void> {
	await loadEntry(today());
}

// --- Day images (stored beside the entry, fully separate from the text) ---

async function loadDayImages(): Promise<void> {
	for (const img of app.dayImages) URL.revokeObjectURL(img.url);
	app.dayImages = [];
	if (!app.journalDir) return;
	const date = savedDate;
	const files = await listDayImages(app.journalDir, date);
	if (!sameDate(date, savedDate)) return; // switched days during the listing
	const imgs: { name: string; path: string; url: string }[] = [];
	for (const f of files) {
		try {
			const bytes = await readFile(f.path);
			imgs.push({ ...f, url: URL.createObjectURL(new Blob([bytes], { type: mimeFor(f.name) })) });
		} catch (e) {
			console.error("could not read image", f.path, e);
		}
	}
	if (!sameDate(date, savedDate)) {
		for (const img of imgs) URL.revokeObjectURL(img.url);
		return;
	}
	app.dayImages = imgs;
}

function isImagePath(path: string): boolean {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return IMAGE_EXTS.includes(ext);
}

/** Copy image files into the selected day as DD_n.ext. */
export async function addImageFiles(paths: string[]): Promise<void> {
	if (!app.journalDir || paths.length === 0) return;
	const date = savedDate;
	const { monthDir } = entryPaths(app.journalDir, date);
	if (!(await exists(monthDir))) await mkdir(monthDir, { recursive: true });
	for (const src of paths) {
		const dot = src.lastIndexOf(".");
		const ext = dot === -1 ? ".jpg" : src.slice(dot).toLowerCase();
		try {
			await copyFile(src, await nextImagePath(app.journalDir, date, ext));
		} catch (e) {
			console.error("could not copy image", src, e);
		}
	}
	await loadDayImages();
}

/** Add images to the selected day via the file picker. */
export async function addImages(): Promise<void> {
	if (!app.journalDir) return;
	const picked = await openFolderDialog({
		multiple: true,
		title: "Add Images to This Day",
		filters: [{ name: "Images", extensions: IMAGE_EXTS }],
	});
	const files = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
	await addImageFiles(files);
}

/** Move a day image to the OS trash. */
export async function removeImage(path: string): Promise<void> {
	try {
		await invoke("move_to_trash", { path });
	} catch (e) {
		console.error("trash failed", e);
	}
	await loadDayImages();
}

export async function navDays(days: number): Promise<void> {
	await loadEntry(addDays(app.selected, days));
}

export async function showMonth(y: number, m: number): Promise<void> {
	app.calYear = y;
	app.calMonth = m;
	await refreshMarks();
}

export function unlockEntry(): void {
	app.locked = false;
	setReadOnly(view, false);
	view.focus();
}

/** Ctrl+D: start the entry with its date heading (if not already there). */
export function prependDateHeading(): void {
	if (app.locked) return;
	const heading = dateHeading(app.selected);
	if (!view.state.doc.toString().startsWith(heading)) {
		prependText(view, heading + "\n\n");
	}
	view.focus();
}

/** Ctrl+N: insert a timestamped section at the cursor. */
export function insertSection(): void {
	if (app.locked) return;
	insertAtCursor(view, newSectionText());
}

// --- Journals (remembered folders) ---

function isJournal(dir: string): boolean {
	return app.settings.journals.includes(dir);
}

export async function setJournalDir(dir: string): Promise<void> {
	await flushSave();
	app.journalDir = dir;
	if (!isJournal(dir)) {
		app.settings.journals = [...app.settings.journals, dir];
		persist("journals", $state.snapshot(app.settings.journals));
	}
	app.settings.lastDir = dir;
	persist("lastDir", dir);
	await loadEntry(today());
	await watchDir(dir);
}

export async function chooseFolder(): Promise<void> {
	closeMenus();
	const dir = await openFolderDialog({ directory: true, title: "Choose Journal Folder" });
	if (typeof dir === "string" && dir) {
		await setJournalDir(dir);
	}
}

export function forgetCurrentJournal(): void {
	closeMenus();
	if (!app.journalDir) return;
	app.settings.journals = app.settings.journals.filter((j) => j !== app.journalDir);
	persist("journals", $state.snapshot(app.settings.journals));
}

export function revealJournal(): void {
	closeMenus();
	if (app.journalDir) void revealItemInDir(app.journalDir);
}

// --- External changes (Dropbox, other devices) ---

async function watchDir(dir: string): Promise<void> {
	if (unwatch) {
		unwatch();
		unwatch = null;
	}
	try {
		unwatch = await watch(dir, () => void onExternalChange(), { delayMs: 600, recursive: true });
	} catch (e) {
		console.error("could not watch journal", e);
	}
}

async function onExternalChange(): Promise<void> {
	await refreshMarks();
	void loadDayImages();
	if (!app.journalDir || dirty || saveTimer) return;
	const date = { ...savedDate };
	const text = await readEntry(app.journalDir, date);
	// Re-check after the read: never clobber live keystrokes or a switched day
	if (!sameDate(date, savedDate) || dirty || saveTimer) return;
	if (text !== view.state.doc.toString()) {
		const sel = Math.min(view.state.selection.main.head, text.length);
		isOpening = true;
		setDocument(view, extensions, text);
		view.dispatch({ selection: { anchor: sel } });
		setReadOnly(view, app.locked);
		app.wordCount = countWords(text);
		isOpening = false;
	}
}

// --- Context menus, fonts, menus ---

export async function showEditContextMenu(): Promise<void> {
	const items = await Promise.all([
		PredefinedMenuItem.new({ item: "Cut" }),
		PredefinedMenuItem.new({ item: "Copy" }),
		PredefinedMenuItem.new({ item: "Paste" }),
		PredefinedMenuItem.new({ item: "Separator" }),
		PredefinedMenuItem.new({ item: "SelectAll" }),
	]);
	const menu = await Menu.new({ items });
	await menu.popup();
}

export function bumpFont(delta: number): void {
	const size = app.settings.fontSize + delta;
	if (size < 8 || size > 42) return;
	app.settings.fontSize = size;
	persist("fontSize", size);
}

export function resetFont(): void {
	app.settings.fontSize = DEFAULT_FONT_SIZE;
	persist("fontSize", DEFAULT_FONT_SIZE);
}

export function closeMenus(): void {
	app.openMenuShown = false;
	app.settingsMenuShown = false;
}

// --- Startup / teardown ---

export function initApp(editorParentEl: HTMLElement): () => void {
	let unlistenClose: (() => void) | undefined;
	let unlistenExit: (() => void) | undefined;
	let unlistenDrop: (() => void) | undefined;

	void (async () => {
		app.settings = { ...app.settings, ...(await initSettings()) };
		extensions = buildExtensions(onDocChanged);
		view = createEditor(editorParentEl, extensions);

		if (app.settings.lastDir && (await exists(app.settings.lastDir))) {
			app.journalDir = app.settings.lastDir;
			await loadEntry(today());
			await watchDir(app.journalDir);
		}
		app.ready = true;
		view.focus();

		const appWindow = getCurrentWindow();
		unlistenClose = await appWindow.onCloseRequested(async (event) => {
			if (dirty || saveTimer) {
				event.preventDefault();
				await flushSave();
				void appWindow.destroy();
			}
		});

		// Cmd+Q / app quit: Rust holds the exit until we flush and confirm
		unlistenExit = await listen("app-exit-requested", async () => {
			await flushSave();
			await invoke("really_quit");
		});

		// Dropping image files anywhere on the window adds them to the day
		unlistenDrop = await getCurrentWebview().onDragDropEvent((event) => {
			const payload = event.payload;
			if (payload.type === "enter") {
				app.dropHover = payload.paths.some(isImagePath);
			} else if (payload.type === "leave") {
				app.dropHover = false;
			} else if (payload.type === "drop") {
				app.dropHover = false;
				const images = payload.paths.filter(isImagePath);
				if (images.length > 0) void addImageFiles(images);
			}
		});
	})();

	const flushOnBlur = () => void flushSave();
	window.addEventListener("blur", flushOnBlur);

	return () => {
		window.removeEventListener("blur", flushOnBlur);
		unlistenClose?.();
		unlistenExit?.();
		unlistenDrop?.();
		if (unwatch) unwatch();
		view?.destroy();
	};
}
