<script lang="ts">
	import { revealItemInDir } from "@tauri-apps/plugin-opener";
	import { app, addImages, removeImage } from "$lib/app.svelte";

	let viewer = $state<number | null>(null);

	// Keep the viewer index valid as images load/change
	$effect(() => {
		if (viewer !== null && viewer >= app.dayImages.length) {
			viewer = app.dayImages.length === 0 ? null : app.dayImages.length - 1;
		}
	});

	function onViewerKeydown(e: KeyboardEvent): void {
		if (viewer === null) return;
		if (e.key === "Escape") {
			viewer = null;
			e.stopPropagation();
		} else if (e.key === "ArrowRight" && viewer < app.dayImages.length - 1) {
			viewer++;
		} else if (e.key === "ArrowLeft" && viewer > 0) {
			viewer--;
		}
	}

	async function trashCurrent(): Promise<void> {
		if (viewer === null) return;
		const img = app.dayImages[viewer];
		await removeImage(img.path);
	}
</script>

<svelte:window onkeydown={onViewerKeydown} />

<div class="day-images">
	<div class="di-header">
		<span class="di-title">Images{app.dayImages.length ? ` (${app.dayImages.length})` : ""}</span>
		<button class="di-add" title="Add images to this day" onclick={() => void addImages()} disabled={!app.journalDir}
			>+ Add</button
		>
	</div>
	{#if app.dayImages.length > 0}
		<div class="di-grid">
			{#each app.dayImages as img, i (img.path)}
				<button class="di-thumb" title={img.name} onclick={() => (viewer = i)}>
					<img src={img.url} alt={img.name} loading="lazy" />
				</button>
			{/each}
		</div>
	{/if}
</div>

{#if viewer !== null && app.dayImages[viewer]}
	{@const img = app.dayImages[viewer]}
	<div
		class="viewer-backdrop"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) viewer = null;
		}}
	>
		{#if viewer > 0}
			<button class="v-nav v-prev" title="Previous" onclick={() => viewer !== null && viewer--}>‹</button>
		{/if}
		<div class="v-stage">
			<img class="v-img" src={img.url} alt={img.name} />
			<div class="v-bar">
				<span class="v-name">{img.name}</span>
				<button class="v-btn" title="Show in folder" onclick={() => void revealItemInDir(img.path)}>Reveal</button>
				<button class="v-btn v-danger" title="Move image to trash" onclick={() => void trashCurrent()}>Trash</button>
				<button class="v-btn" onclick={() => (viewer = null)}>Close</button>
			</div>
		</div>
		{#if viewer < app.dayImages.length - 1}
			<button class="v-nav v-next" title="Next" onclick={() => viewer !== null && viewer++}>›</button>
		{/if}
	</div>
{/if}

<style>
	.day-images {
		border-top: 1px solid var(--border);
		padding: 8px 10px 12px;
	}
	.di-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}
	.di-title {
		font-size: 11px;
		color: var(--fg-dim);
	}
	.di-add {
		font: inherit;
		font-size: 12px;
		color: var(--fg);
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 2px 9px;
		cursor: pointer;
	}
	.di-add:hover:not(:disabled) {
		background: var(--hover);
	}
	.di-add:disabled {
		color: var(--fg-faint);
		cursor: default;
	}
	.di-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
		gap: 6px;
	}
	.di-thumb {
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: none;
		cursor: pointer;
		overflow: hidden;
		aspect-ratio: 1;
	}
	.di-thumb:hover {
		border-color: var(--accent);
	}
	.di-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.viewer-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(0, 0, 0, 0.72);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}
	.v-stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		max-width: 86vw;
		max-height: 92vh;
	}
	.v-img {
		max-width: 86vw;
		max-height: 82vh;
		object-fit: contain;
		border-radius: 6px;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
	}
	.v-bar {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.v-name {
		font-size: 12px;
		color: #ddd;
		margin-right: 6px;
	}
	.v-btn {
		font: inherit;
		font-size: 12px;
		color: #eee;
		background: rgba(255, 255, 255, 0.12);
		border: none;
		border-radius: 6px;
		padding: 4px 12px;
		cursor: pointer;
	}
	.v-btn:hover {
		background: rgba(255, 255, 255, 0.24);
	}
	.v-btn.v-danger:hover {
		background: #c0392b;
	}
	.v-nav {
		font-size: 34px;
		line-height: 1;
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 10px;
		padding: 14px 12px;
		cursor: pointer;
	}
	.v-nav:hover {
		background: rgba(255, 255, 255, 0.22);
	}
</style>
