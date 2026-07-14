<script lang="ts">
	import { onMount } from "svelte";
	import Toolbar from "$lib/components/Toolbar.svelte";
	import Calendar from "$lib/components/Calendar.svelte";
	import DayImages from "$lib/components/DayImages.svelte";
	import Overlays from "$lib/components/Overlays.svelte";
	import { persist } from "$lib/settings";
	import { dateHeading } from "$lib/journal";
	import {
		app,
		isMac,
		initApp,
		flushSave,
		chooseFolder,
		goToday,
		navDays,
		prependDateHeading,
		insertSection,
		unlockEntry,
		closeMenus,
		bumpFont,
		resetFont,
		showEditContextMenu,
	} from "$lib/app.svelte";

	let editorParent: HTMLElement;

	onMount(() => initApp(editorParent));

	// Apply the theme choice; "system" defers to prefers-color-scheme
	$effect(() => {
		if (app.settings.theme === "system") {
			delete document.documentElement.dataset.theme;
		} else {
			document.documentElement.dataset.theme = app.settings.theme;
		}
	});

	function onWindowMousedown(e: MouseEvent): void {
		const el = e.target as Element | null;
		if (!el?.closest(".menu-wrap")) closeMenus();
	}

	function onContextMenu(e: MouseEvent): void {
		e.preventDefault(); // never show the webview's browser menu
		const el = e.target as Element | null;
		if (el?.closest(".cm-editor") || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
			void showEditContextMenu();
		}
	}

	function onKeydown(e: KeyboardEvent): void {
		const modKey = isMac ? e.metaKey : e.ctrlKey;
		const key = e.key.toLowerCase();

		if (e.key === "Escape") {
			if (app.modal) app.modal = null;
			else if (app.openMenuShown || app.settingsMenuShown) closeMenus();
			e.preventDefault();
			return;
		}

		if (!modKey || e.shiftKey) return;

		switch (key) {
			case "l":
				e.preventDefault();
				void navDays(1);
				break;
			case "j":
				e.preventDefault();
				void navDays(-1);
				break;
			case "i":
				e.preventDefault();
				void navDays(-7);
				break;
			case "k":
				e.preventDefault();
				void navDays(7);
				break;
			case "t":
				e.preventDefault();
				void goToday();
				break;
			case "d":
				e.preventDefault();
				prependDateHeading();
				break;
			case "n":
				e.preventDefault();
				insertSection();
				break;
			case "u":
				e.preventDefault();
				unlockEntry();
				break;
			case "o":
				e.preventDefault();
				void chooseFolder();
				break;
			case "s":
				e.preventDefault();
				void flushSave();
				break;
			case "=":
			case "+":
				e.preventDefault();
				bumpFont(1);
				break;
			case "-":
				e.preventDefault();
				bumpFont(-1);
				break;
			case "0":
				e.preventDefault();
				resetFont();
				break;
		}
	}

	// --- Pane divider drag ---
	function startPaneDrag(e: MouseEvent): void {
		e.preventDefault();
		const onMove = (ev: MouseEvent) => {
			app.settings.paneWidth = Math.min(420, Math.max(220, ev.clientX));
		};
		const onUp = () => {
			persist("paneWidth", app.settings.paneWidth);
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	}
</script>

<svelte:window onkeydown={onKeydown} onmousedown={onWindowMousedown} oncontextmenu={onContextMenu} />

<main class="app">
	<Toolbar />

	<div class="body">
		<aside class="sidebar" style="width: {app.settings.paneWidth}px">
			<Calendar />
			<DayImages />
		</aside>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="divider" role="separator" aria-orientation="vertical" onmousedown={startPaneDrag}></div>

		<div class="editor-wrap" class:locked={app.locked} style="font-size: {app.settings.fontSize}px" bind:this={editorParent}></div>
	</div>

	{#if app.dropHover}
		<div class="drop-hint">
			<div class="drop-box">Drop images to add to {dateHeading(app.selected)}</div>
		</div>
	{/if}

	<Overlays />
</main>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}

	.body {
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.sidebar {
		flex: none;
		min-width: 220px;
		background: var(--bg-panel);
		border-right: 1px solid var(--border);
		overflow-y: auto;
	}

	.divider {
		flex: none;
		width: 7px;
		margin-left: -4px;
		cursor: col-resize;
		z-index: 10;
	}

	.editor-wrap {
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow: hidden;
	}
	.editor-wrap.locked {
		background: var(--bg-panel);
	}

	.drop-hint {
		position: fixed;
		inset: 0;
		z-index: 150;
		pointer-events: none;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.drop-box {
		font-size: 15px;
		font-weight: 600;
		color: var(--fg);
		background: var(--bg);
		border: 2px dashed var(--accent);
		border-radius: 12px;
		padding: 18px 28px;
	}
	.editor-wrap :global(.cm-editor) {
		height: 100%;
	}
</style>
