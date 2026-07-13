import { load, type Store } from "@tauri-apps/plugin-store";

export interface Settings {
	journals: string[];
	lastDir: string | null;
	fontSize: number;
	lockPastEntries: boolean;
	showWordCount: boolean;
	paneWidth: number;
	theme: "system" | "light" | "dark";
}

export const DEFAULT_FONT_SIZE = 15;

const defaults: Settings = {
	journals: [],
	lastDir: null,
	fontSize: DEFAULT_FONT_SIZE,
	lockPastEntries: true,
	showWordCount: true,
	paneWidth: 280,
	theme: "system",
};

let store: Store | null = null;

export async function initSettings(): Promise<Settings> {
	store = await load("settings.json", {
		autoSave: true,
		defaults: { ...defaults } as unknown as Record<string, unknown>,
	});
	const s: Settings = { ...defaults };
	for (const key of Object.keys(defaults) as (keyof Settings)[]) {
		const val = await store.get(key);
		if (val !== undefined && val !== null) {
			(s as unknown as Record<string, unknown>)[key] = val;
		}
	}
	return s;
}

export function persist<K extends keyof Settings>(key: K, value: Settings[K]): void {
	void store?.set(key, value);
}
