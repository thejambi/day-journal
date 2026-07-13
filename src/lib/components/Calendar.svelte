<script lang="ts">
	import { app, loadEntry, showMonth, goToday } from "$lib/app.svelte";
	import { today, sameDate } from "$lib/journal";

	const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
	const MONTHS = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December",
	];

	const grid = $derived.by(() => {
		const firstWeekday = new Date(app.calYear, app.calMonth - 1, 1).getDay();
		const daysInMonth = new Date(app.calYear, app.calMonth, 0).getDate();
		const cells: (number | null)[] = [];
		for (let i = 0; i < firstWeekday; i++) cells.push(null);
		for (let d = 1; d <= daysInMonth; d++) cells.push(d);
		while (cells.length % 7 !== 0) cells.push(null);
		return cells;
	});

	const now = $derived(today());

	function prevMonth(): void {
		const m = app.calMonth === 1 ? 12 : app.calMonth - 1;
		const y = app.calMonth === 1 ? app.calYear - 1 : app.calYear;
		void showMonth(y, m);
	}

	function nextMonth(): void {
		const m = app.calMonth === 12 ? 1 : app.calMonth + 1;
		const y = app.calMonth === 12 ? app.calYear + 1 : app.calYear;
		void showMonth(y, m);
	}

	function pick(d: number): void {
		void loadEntry({ y: app.calYear, m: app.calMonth, d });
	}
</script>

<div class="calendar">
	<div class="cal-header">
		<button class="cal-nav" title="Previous month" onclick={prevMonth}>‹</button>
		<span class="cal-title">{MONTHS[app.calMonth - 1]} {app.calYear}</span>
		<button class="cal-nav" title="Next month" onclick={nextMonth}>›</button>
	</div>
	<div class="cal-grid">
		{#each WEEKDAYS as w, i (i)}
			<span class="cal-weekday">{w}</span>
		{/each}
		{#each grid as cell, i (i)}
			{#if cell === null}
				<span class="cal-blank"></span>
			{:else}
				<button
					class="cal-day"
					class:selected={sameDate(app.selected, { y: app.calYear, m: app.calMonth, d: cell })}
					class:today={sameDate(now, { y: app.calYear, m: app.calMonth, d: cell })}
					class:marked={app.markedDays.includes(cell)}
					onclick={() => pick(cell)}
				>
					{cell}<span class="dot"></span>
				</button>
			{/if}
		{/each}
	</div>
	<button class="today-btn" onclick={() => void goToday()}>Today</button>
</div>

<style>
	.calendar {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
	}
	.cal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.cal-title {
		font-size: 13px;
		font-weight: 600;
	}
	.cal-nav {
		font: inherit;
		font-size: 16px;
		line-height: 1;
		color: var(--fg-dim);
		background: none;
		border: none;
		border-radius: 6px;
		padding: 2px 10px;
		cursor: pointer;
	}
	.cal-nav:hover {
		background: var(--hover);
	}

	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.cal-weekday {
		font-size: 10px;
		color: var(--fg-faint);
		text-align: center;
		padding: 2px 0;
	}
	.cal-day {
		position: relative;
		font: inherit;
		font-size: 12px;
		color: var(--fg);
		background: none;
		border: 1px solid transparent;
		border-radius: 6px;
		aspect-ratio: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.cal-day:hover {
		background: var(--hover);
	}
	.cal-day.today {
		border-color: var(--accent);
	}
	.cal-day.selected {
		background: var(--sel);
		font-weight: 700;
	}
	.cal-day .dot {
		display: none;
		position: absolute;
		bottom: 3px;
		left: 50%;
		transform: translateX(-50%);
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--accent);
	}
	.cal-day.marked .dot {
		display: block;
	}
	.cal-day.marked {
		font-weight: 600;
	}

	.today-btn {
		font: inherit;
		font-size: 12px;
		color: var(--fg);
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 5px 0;
		cursor: pointer;
		margin-top: 2px;
	}
	.today-btn:hover {
		background: var(--hover);
	}
</style>
