/**
 * DayJournal file model: one entry per day at <journal>/<YYYY>/<MM>/<DD>.txt.
 * Empty entries delete their file and prune empty month/year folders,
 * exactly like the original GTK DayJournal.
 */
import { exists, mkdir, readTextFile, remove } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { pathJoin } from "./paths";

export interface EntryDate {
	y: number;
	m: number; // 1-12
	d: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function entryPaths(root: string, date: EntryDate) {
	const yearDir = pathJoin(root, String(date.y).padStart(4, "0"));
	const monthDir = pathJoin(yearDir, pad2(date.m));
	const filePath = pathJoin(monthDir, pad2(date.d) + ".txt");
	return { yearDir, monthDir, filePath };
}

export function today(): EntryDate {
	const now = new Date();
	return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

export function addDays(date: EntryDate, days: number): EntryDate {
	const dt = new Date(date.y, date.m - 1, date.d + days);
	return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

export function sameDate(a: EntryDate, b: EntryDate): boolean {
	return a.y === b.y && a.m === b.m && a.d === b.d;
}

export function isPast(date: EntryDate): boolean {
	const t = today();
	if (date.y !== t.y) return date.y < t.y;
	if (date.m !== t.m) return date.m < t.m;
	return date.d < t.d;
}

/** "July 13, 2026" — matches the original's %B %e, %Y date heading. */
export function dateHeading(date: EntryDate): string {
	return new Date(date.y, date.m - 1, date.d).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

/** "\n\n3:45pm |  " — the original's timestamped entry section. */
export function newSectionText(): string {
	const now = new Date();
	const h12 = now.getHours() % 12 || 12;
	const ampm = now.getHours() < 12 ? "am" : "pm";
	return `\n\n${h12}:${pad2(now.getMinutes())}${ampm} |  `;
}

export async function readEntry(root: string, date: EntryDate): Promise<string> {
	const { filePath } = entryPaths(root, date);
	try {
		return await readTextFile(filePath);
	} catch {
		return ""; // no entry yet for this day
	}
}

/** Crash-safe save; empty text deletes the entry and prunes empty dirs. */
export async function saveEntry(root: string, date: EntryDate, text: string): Promise<void> {
	const { yearDir, monthDir, filePath } = entryPaths(root, date);
	if (text.trim() === "") {
		if (await exists(filePath)) {
			await remove(filePath);
			// Prune now-empty month and year folders (remove() fails on
			// non-empty dirs, which is exactly the behavior we want)
			try {
				await remove(monthDir);
				await remove(yearDir);
			} catch {
				// not empty; leave them
			}
		}
		return;
	}
	if (!(await exists(monthDir))) {
		await mkdir(monthDir, { recursive: true });
	}
	await invoke("save_note", { path: filePath, contents: text });
}

interface FsEntry {
	name: string;
	isDir: boolean;
	mtimeMs: number;
}

/* --- Day images: stored beside the entry as DD_1.jpg, DD_2.png, ... --- */

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

export function mimeFor(name: string): string {
	const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
	if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
	if (ext === "svg") return "image/svg+xml";
	return "image/" + ext;
}

export interface DayImageFile {
	name: string;
	path: string;
}

/** Images belonging to a day: files named DD_*.ext in the month folder. */
export async function listDayImages(root: string, date: EntryDate): Promise<DayImageFile[]> {
	const { monthDir } = entryPaths(root, date);
	const prefix = pad2(date.d) + "_";
	try {
		const entries = await invoke<FsEntry[]>("list_notes", { dir: monthDir });
		return entries
			.filter((e) => {
				if (e.isDir || !e.name.startsWith(prefix)) return false;
				const ext = e.name.slice(e.name.lastIndexOf(".") + 1).toLowerCase();
				return IMAGE_EXTS.includes(ext);
			})
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
			.map((e) => ({ name: e.name, path: pathJoin(monthDir, e.name) }));
	} catch {
		return [];
	}
}

/** Next free image path for the day: DD_<n>.<ext> with n = max existing + 1. */
export async function nextImagePath(root: string, date: EntryDate, ext: string): Promise<string> {
	const { monthDir } = entryPaths(root, date);
	const existing = await listDayImages(root, date);
	let max = 0;
	for (const img of existing) {
		const m = /^\d\d_(\d+)\./.exec(img.name);
		if (m) max = Math.max(max, parseInt(m[1], 10));
	}
	return pathJoin(monthDir, `${pad2(date.d)}_${max + 1}${ext}`);
}

/** Which days of the given month have entries (for calendar marks). */
export async function daysWithEntries(root: string, y: number, m: number): Promise<number[]> {
	const monthDir = pathJoin(pathJoin(root, String(y).padStart(4, "0")), pad2(m));
	try {
		const entries = await invoke<FsEntry[]>("list_notes", { dir: monthDir });
		return entries
			.filter((e) => !e.isDir && /^\d\d\.txt$/i.test(e.name))
			.map((e) => parseInt(e.name.slice(0, 2), 10))
			.filter((d) => d >= 1 && d <= 31);
	} catch {
		return []; // month folder doesn't exist
	}
}
