<script lang="ts">
	import { app, chooseFolder, modKeyLabel as mod } from "$lib/app.svelte";

	const shortcutRows: [string, string][] = [
		[`${mod}T`, "Go to today"],
		[`${mod}L  /  ${mod}J`, "Next / previous day"],
		[`${mod}K  /  ${mod}I`, "Jump a week forward / back"],
		[`${mod}D`, "Start entry with the date"],
		[`${mod}N`, "Insert a timestamped entry section"],
		[`${mod}U`, "Unlock entry"],
		[`${mod}O`, "Choose journal folder"],
		[`${mod}=  /  ${mod}-  /  ${mod}0`, "Font size bigger / smaller / reset"],
	];
</script>

{#if app.ready && !app.journalDir}
	<div class="welcome">
		<div class="welcome-box">
			<h1>DayJournal</h1>
			<p>
				A simple, smart journal. One plain text file per day, kept in year and month folders you can read
				anywhere, forever.
			</p>
			<button class="big-btn" onclick={chooseFolder}>Choose Journal Folder…</button>
		</div>
	</div>
{/if}

{#if app.modal}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) app.modal = null;
		}}
	>
		<div class="modal">
			{#if app.modal === "shortcuts"}
				<h2>Keyboard Shortcuts</h2>
				<table>
					<tbody>
						{#each shortcutRows as [keys, what] (keys)}
							<tr><td class="keys">{keys}</td><td>{what}</td></tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<h2>DayJournal</h2>
				<p>Remember your days.</p>
				<p>Entries are plain text files — <code>Journal/2026/07/13.txt</code> — portable to any app, on any device.</p>
				<p class="dim">by Zach Burnham</p>
			{/if}
			<button class="tb-btn" onclick={() => (app.modal = null)}>Close</button>
		</div>
	</div>
{/if}

<style>
	.welcome {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
	}
	.welcome-box {
		text-align: center;
		max-width: 26em;
		padding: 24px;
	}
	.welcome-box h1 {
		font-weight: 700;
	}
	.welcome-box p {
		color: var(--fg-dim);
		line-height: 1.5;
	}
	.big-btn {
		font: inherit;
		font-size: 15px;
		color: #fff;
		background: var(--accent);
		border: none;
		border-radius: 8px;
		padding: 10px 18px;
		cursor: pointer;
		margin-top: 8px;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(0, 0, 0, 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.modal {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 20px 24px;
		max-width: 30em;
		max-height: 80vh;
		overflow-y: auto;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
	}
	.modal h2 {
		margin-top: 0;
	}
	.modal table {
		border-collapse: collapse;
		font-size: 13px;
		margin-bottom: 14px;
	}
	.modal td {
		padding: 3px 14px 3px 0;
		vertical-align: top;
	}
	.modal .keys {
		font-family: var(--font-mono);
		white-space: nowrap;
		color: var(--fg-dim);
	}
	.modal .dim {
		color: var(--fg-dim);
	}
</style>
