/** Minimal path helpers that work with both / and \ separators. */

export function sepOf(path: string): string {
	return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

export function pathJoin(dir: string, name: string): string {
	const sep = sepOf(dir);
	return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export function baseName(path: string): string {
	const parts = path.split(/[\\/]/).filter((p) => p !== "");
	return parts[parts.length - 1] ?? path;
}

export function parentDir(path: string): string {
	const sep = sepOf(path);
	const parts = path.split(/[\\/]/);
	while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
	parts.pop();
	const parent = parts.join(sep);
	return parent === "" ? sep : parent;
}

/** Is `child` equal to or inside `dir`? */
export function isWithin(dir: string, child: string): boolean {
	const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\\/g, "/");
	const d = norm(dir);
	const c = norm(child);
	return c === d || c.startsWith(d + "/");
}
