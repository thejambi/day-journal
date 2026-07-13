<script lang="ts">
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { baseName } from "$lib/paths";
	import { persist } from "$lib/settings";
	import { dateHeading } from "$lib/journal";
	import {
		app,
		isMac,
		isWindows,
		modKeyLabel,
		chooseFolder,
		setJournalDir,
		forgetCurrentJournal,
		revealJournal,
		closeMenus,
		unlockEntry,
		bumpFont,
		resetFont,
	} from "$lib/app.svelte";

	const appWindow = getCurrentWindow();
	const entryLabel = $derived(dateHeading(app.selected));
</script>

<div class="toolbar" class:mac={isMac} data-tauri-drag-region>
	<div class="toolbar-group">
		<div class="menu-wrap">
			<button
				class="tb-btn"
				title="Change journal folder ({modKeyLabel}O)"
				onclick={() => {
					app.settingsMenuShown = false;
					app.openMenuShown = !app.openMenuShown;
				}}>Journals ▾</button
			>
			{#if app.openMenuShown}
				<div class="menu">
					<button class="menu-item" onclick={chooseFolder}>Choose journal folder…</button>
					{#if app.settings.journals.length > 0}
						<div class="menu-sep"></div>
						{#each app.settings.journals as j (j)}
							<button
								class="menu-item journal"
								class:current={j === app.journalDir}
								onclick={() => {
									closeMenus();
									void setJournalDir(j);
								}}
							>
								<span class="j-name">{baseName(j)}</span>
								<span class="j-path">{j}</span>
							</button>
						{/each}
					{/if}
					{#if app.journalDir}
						<div class="menu-sep"></div>
						<button
							class="menu-item"
							onclick={() => {
								closeMenus();
								app.modal = "archive";
							}}>Create journal archive…</button
						>
						<div class="menu-sep"></div>
						<button class="menu-item" onclick={forgetCurrentJournal}>Forget current journal</button>
						<button class="menu-item" onclick={revealJournal}>View journal files</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<div class="entry-label" data-tauri-drag-region>{entryLabel}</div>

	<div class="toolbar-group">
		{#if app.locked}
			<button class="tb-btn unlock" title="Unlock entry ({modKeyLabel}U)" onclick={unlockEntry}>🔒 Unlock</button>
		{/if}
		{#if app.settings.showWordCount}
			<span class="word-count">{app.wordCount} {app.wordCount === 1 ? "word" : "words"}</span>
		{/if}
		<div class="menu-wrap">
			<button
				class="tb-btn"
				title="Settings"
				onclick={() => {
					app.openMenuShown = false;
					app.settingsMenuShown = !app.settingsMenuShown;
				}}>Aa ▾</button
			>
			{#if app.settingsMenuShown}
				<div class="menu menu-right">
					<button
						class="menu-item check"
						onclick={() => {
							app.settings.lockPastEntries = !app.settings.lockPastEntries;
							persist("lockPastEntries", app.settings.lockPastEntries);
						}}>{app.settings.lockPastEntries ? "✓" : " "} Lock past entries</button
					>
					<button
						class="menu-item check"
						onclick={() => {
							app.settings.showWordCount = !app.settings.showWordCount;
							persist("showWordCount", app.settings.showWordCount);
						}}>{app.settings.showWordCount ? "✓" : " "} Show word count</button
					>
					<div class="menu-sep"></div>
					<div class="menu-label">Appearance</div>
					{#each ["system", "light", "dark"] as const as tOpt (tOpt)}
						<button
							class="menu-item check"
							onclick={() => {
								app.settings.theme = tOpt;
								persist("theme", tOpt);
							}}>{app.settings.theme === tOpt ? "✓" : " "} {tOpt[0].toUpperCase() + tOpt.slice(1)}</button
						>
					{/each}
					<div class="menu-sep"></div>
					<div class="font-row">
						<span class="menu-label">Font size</span>
						<button class="tb-btn" onclick={() => bumpFont(-1)}>−</button>
						<button class="tb-btn" onclick={resetFont}>{app.settings.fontSize}</button>
						<button class="tb-btn" onclick={() => bumpFont(1)}>+</button>
					</div>
					<div class="menu-sep"></div>
					<button
						class="menu-item"
						onclick={() => {
							closeMenus();
							app.modal = "shortcuts";
						}}>Keyboard shortcuts</button
					>
					<button
						class="menu-item"
						onclick={() => {
							closeMenus();
							app.modal = "about";
						}}>About DayJournal</button
					>
				</div>
			{/if}
		</div>

		{#if isWindows}
			<div class="win-controls">
				<button class="win-btn" title="Minimize" onclick={() => void appWindow.minimize()}>&#xE921;</button>
				<button class="win-btn" title="Maximize" onclick={() => void appWindow.toggleMaximize()}>&#xE922;</button>
				<button class="win-btn win-close" title="Close" onclick={() => void appWindow.close()}>&#xE8BB;</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 10px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-panel);
		user-select: none;
		flex: none;
	}
	.toolbar.mac {
		padding-left: 84px;
	}
	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.entry-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--fg-dim);
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.word-count {
		font-size: 12px;
		color: var(--fg-dim);
		font-variant-numeric: tabular-nums;
	}
	.tb-btn.unlock {
		color: var(--accent);
	}

	.menu-wrap {
		position: relative;
	}
	.menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 50;
		min-width: 230px;
		max-width: 340px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
		padding: 4px;
	}
	.menu-right {
		left: auto;
		right: 0;
	}
	.menu-item {
		display: block;
		width: 100%;
		text-align: left;
		font: inherit;
		font-size: 13px;
		color: var(--fg);
		background: none;
		border: none;
		border-radius: 5px;
		padding: 6px 10px;
		cursor: pointer;
	}
	.menu-item:hover {
		background: var(--hover);
	}
	.menu-item.journal .j-name {
		display: block;
		font-weight: 600;
	}
	.menu-item.journal.current .j-name {
		color: var(--accent);
	}
	.menu-item.journal .j-path {
		display: block;
		font-size: 11px;
		color: var(--fg-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.menu-sep {
		height: 1px;
		background: var(--border);
		margin: 4px 6px;
	}
	.menu-label {
		font-size: 11px;
		color: var(--fg-dim);
		padding: 4px 10px 2px;
	}
	.font-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
	}
	.font-row .menu-label {
		flex: 1;
		padding: 0 4px;
	}

	.win-controls {
		display: flex;
		align-items: stretch;
		align-self: stretch;
		margin: -6px -10px -6px 4px;
	}
	.win-btn {
		font-family: "Segoe MDL2 Assets", "Segoe Fluent Icons", sans-serif;
		font-size: 10px;
		color: var(--fg);
		background: transparent;
		border: none;
		width: 46px;
		cursor: default;
	}
	.win-btn:hover {
		background: var(--hover);
	}
	.win-btn.win-close:hover {
		background: #e81123;
		color: #fff;
	}
</style>
