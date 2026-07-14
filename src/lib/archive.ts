/**
 * Journal archive export: flatten the whole journal (or one year) into a
 * single printable HTML document or a plain text file, saved to
 * <journal>/Archive/. The HTML has real print CSS, so "print to PDF" from
 * the browser gives a clean PDF for free.
 */
import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir, readFile } from "@tauri-apps/plugin-fs";
import { pathJoin, baseName } from "./paths";
import { mimeFor } from "./journal";

export interface JournalDay {
	y: number;
	m: number;
	d: number;
	text: string;
	images: string[]; // full paths of the day's image files
}

export type ArchiveFormat = "html" | "txt";

export async function collectEntries(root: string, year?: number): Promise<JournalDay[]> {
	return await invoke<JournalDay[]>("collect_entries", { root, year: year ?? null });
}

/** Years present in the journal, ascending (for the year picker). */
export async function journalYears(root: string): Promise<number[]> {
	interface FsEntry {
		name: string;
		isDir: boolean;
	}
	try {
		const entries = await invoke<FsEntry[]>("list_notes", { dir: root });
		return entries
			.filter((e) => e.isDir && /^\d{4}$/.test(e.name))
			.map((e) => parseInt(e.name, 10))
			.sort((a, b) => a - b);
	} catch {
		return [];
	}
}

const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

function longDate(e: JournalDay): string {
	return new Date(e.y, e.m - 1, e.d).toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toDataUri(bytes: Uint8Array, mime: string): string {
	let bin = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return `data:${mime};base64,` + btoa(bin);
}

export async function buildHtml(entries: JournalDay[], journalName: string, scope: string): Promise<string> {
	const created = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
	let body = "";
	let curYear = 0;
	let curMonth = 0;
	for (const e of entries) {
		if (e.y !== curYear) {
			curYear = e.y;
			curMonth = 0;
			body += `<h1 class="year">${e.y}</h1>\n`;
		}
		if (e.m !== curMonth) {
			curMonth = e.m;
			body += `<h2 class="month">${MONTHS[e.m - 1]} ${e.y}</h2>\n`;
		}
		// Embed the day's images as data URIs: the archive stays one
		// fully self-contained file, photos included
		let imagesHtml = "";
		for (const imgPath of e.images) {
			try {
				const bytes = await readFile(imgPath);
				const name = imgPath.split(/[\\/]/).pop() ?? imgPath;
				imagesHtml += `<img src="${toDataUri(bytes, mimeFor(name))}" alt="${escapeHtml(name)}"/>\n`;
			} catch {
				// unreadable image; skip it
			}
		}
		body += `<article class="entry">\n<h3 class="date">${longDate(e)}</h3>\n`;
		if (e.text.trim() !== "") {
			body += `<div class="text">${escapeHtml(e.text.trim())}</div>\n`;
		}
		if (imagesHtml) {
			body += `<div class="images">\n${imagesHtml}</div>\n`;
		}
		body += `</article>\n`;
	}
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(journalName)} — Journal Archive</title>
<style>
	body {
		font-family: Charter, Georgia, "Times New Roman", serif;
		font-size: 12.5pt;
		line-height: 1.55;
		color: #1c1b18;
		background: #fff;
		max-width: 42em;
		margin: 0 auto;
		padding: 3em 1.5em 5em;
	}
	header.cover { text-align: center; margin-bottom: 4em; }
	header.cover h1 { font-size: 2.4em; margin: 0 0 0.2em; }
	header.cover p { color: #6d6a62; margin: 0.2em 0; }
	h1.year {
		font-size: 2em;
		border-bottom: 2px solid #1c1b18;
		padding-bottom: 0.2em;
		margin: 2.5em 0 1em;
	}
	h2.month {
		font-size: 1.35em;
		color: #444138;
		margin: 2em 0 1em;
	}
	article.entry { margin: 0 0 2.2em; }
	h3.date {
		font-size: 0.85em;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #8a8578;
		border-bottom: 1px solid #e4e1d8;
		padding-bottom: 0.3em;
		margin: 0 0 0.7em;
	}
	.text { white-space: pre-wrap; }
	.images { display: flex; flex-wrap: wrap; gap: 0.7em; margin-top: 0.9em; }
	.images img { max-width: 47%; max-height: 26em; border-radius: 4px; object-fit: contain; }
	@media print {
		body { padding: 0; max-width: none; font-size: 11pt; }
		h1.year { break-before: page; }
		header.cover { break-after: page; margin-top: 30vh; }
		article.entry { break-inside: avoid; }
		@page { margin: 2cm 2.2cm; }
	}
</style>
</head>
<body>
<header class="cover">
	<h1>${escapeHtml(journalName)}</h1>
	<p>Journal Archive — ${escapeHtml(scope)}</p>
	<p>${entries.length} entries · Created ${created} with DayJournal</p>
</header>
${body}
</body>
</html>
`;
}

/** Plain text format, faithful to the original DayJournal archive. */
export function buildText(entries: JournalDay[]): string {
	let out = "";
	for (const e of entries) {
		const dateString = longDate(e);
		out += "\n\n-----------------------------------\n";
		out += dateString + "\n";
		out += "-".repeat(dateString.length) + "\n\n";
		out += e.text.trim() + "\n";
		if (e.images.length > 0) {
			const names = e.images.map((p) => p.split(/[\\/]/).pop()).join(", ");
			out += `\n[Images: ${names}]\n`;
		}
	}
	return out.trimStart();
}

export interface ArchiveResult {
	path: string;
	count: number;
}

export async function createArchive(root: string, format: ArchiveFormat, year?: number): Promise<ArchiveResult> {
	const entries = await collectEntries(root, year);
	if (entries.length === 0) {
		throw new Error("No entries found" + (year ? ` for ${year}` : "") + ".");
	}
	const journalName = baseName(root);
	const scope = year ? String(year) : `${entries[0].y}–${entries[entries.length - 1].y}`;
	const contents =
		format === "html" ? await buildHtml(entries, journalName, scope) : buildText(entries);

	const archiveDir = pathJoin(root, "Archive");
	if (!(await exists(archiveDir))) await mkdir(archiveDir);
	const stamp = new Date().toISOString().slice(0, 10);
	const name = `${journalName} Archive ${year ?? "Complete"} (${stamp}).${format}`;
	const path = pathJoin(archiveDir, name);
	await invoke("save_note", { path, contents });
	return { path, count: entries.length };
}
