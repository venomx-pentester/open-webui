<script lang="ts">
	import { getContext } from 'svelte';
	import {
		scanSessions,
		type TopologySystem,
		type VulnerabilitySeverity
	} from '$lib/stores/scanSessions';

	const i18n = getContext<any>('i18n');

	export let targetId: string | null = null;

	type PositionedSystem = TopologySystem & {
		x: number;
		y: number;
	};

	const width = 720;
	const height = 360;
	const centerX = width / 2;
	const centerY = height / 2;

	$: session = targetId ? ($scanSessions[targetId] ?? null) : null;
	$: systems = session?.findings.systems ?? [];
	$: links = session?.findings.links ?? [];
	$: positionedSystems = positionSystems(systems);
	$: systemsById = new Map(positionedSystems.map((system) => [system.id, system]));
	$: visibleLinks = links.filter(
		(link) => systemsById.has(link.source) && systemsById.has(link.target)
	);
	$: criticalCount = systems.filter(
		(system) => system.risk === 'critical' || system.risk === 'high'
	).length;

	function positionSystems(items: TopologySystem[]): PositionedSystem[] {
		if (items.length === 0) return [];
		if (items.length === 1) {
			return [{ ...items[0], x: centerX, y: centerY }];
		}

		const radiusX = Math.min(285, 105 + items.length * 26);
		const radiusY = Math.min(130, 70 + items.length * 9);
		const sorted = [...items].sort((a, b) => severityValue(b.risk) - severityValue(a.risk));

		return sorted.map((system, index) => {
			const angle = -Math.PI / 2 + (index / sorted.length) * Math.PI * 2;
			return {
				...system,
				x: centerX + Math.cos(angle) * radiusX,
				y: centerY + Math.sin(angle) * radiusY
			};
		});
	}

	function severityValue(severity: VulnerabilitySeverity) {
		return {
			critical: 5,
			high: 4,
			medium: 3,
			low: 2,
			info: 1,
			unknown: 0
		}[severity];
	}

	function nodeClass(severity: VulnerabilitySeverity) {
		if (severity === 'critical') return 'topology-node topology-node-critical';
		if (severity === 'high') return 'topology-node topology-node-high';
		if (severity === 'medium') return 'topology-node topology-node-medium';
		if (severity === 'low') return 'topology-node topology-node-low';
		return 'topology-node topology-node-neutral';
	}
</script>

<section class="topology-panel">
	<div class="topology-header">
		<div>
			<div class="topology-kicker">{$i18n.t('Network Topology')}</div>
			<div class="topology-title">
				{session?.targetName ?? $i18n.t('No target selected')}
			</div>
		</div>
		<div class="topology-metrics" aria-label={$i18n.t('Topology metrics')}>
			<div>
				<span>{systems.length}</span>
				<div class="topology-metric-label">{$i18n.t('Systems')}</div>
			</div>
			<div>
				<span>{visibleLinks.length}</span>
				<div class="topology-metric-label">{$i18n.t('Links')}</div>
			</div>
			<div>
				<span>{criticalCount}</span>
				<div class="topology-metric-label">{$i18n.t('High Risk')}</div>
			</div>
		</div>
	</div>

	<div class="topology-canvas">
		{#if positionedSystems.length > 0}
			<svg viewBox="0 0 {width} {height}" role="img" aria-label={$i18n.t('Network topology map')}>
				<defs>
					<marker
						id="topology-arrow"
						markerWidth="8"
						markerHeight="8"
						refX="7"
						refY="4"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8 Z" class="topology-arrow" />
					</marker>
				</defs>

				{#each visibleLinks as link (link.id)}
					{@const source = systemsById.get(link.source)}
					{@const target = systemsById.get(link.target)}
					{#if source && target}
						<line
							x1={source.x}
							y1={source.y}
							x2={target.x}
							y2={target.y}
							class="topology-link"
							marker-end="url(#topology-arrow)"
						/>
						{#if link.label || link.protocol}
							<text
								x={(source.x + target.x) / 2}
								y={(source.y + target.y) / 2 - 6}
								text-anchor="middle"
								class="topology-link-label"
							>
								{link.label ?? link.protocol}
							</text>
						{/if}
					{/if}
				{/each}

				{#each positionedSystems as system (system.id)}
					<g transform="translate({system.x}, {system.y})">
						<circle r="32" class={nodeClass(system.risk)} />
						<circle r="20" class="topology-node-core" />
						<text y="-47" text-anchor="middle" class="topology-node-label">
							{system.name}
						</text>
						{#if system.address && system.address !== system.name}
							<text y="52" text-anchor="middle" class="topology-node-sub">
								{system.address}
							</text>
						{/if}
						<text y="5" text-anchor="middle" class="topology-node-risk">
							{system.risk === 'unknown' ? 'OK' : system.risk.slice(0, 4).toUpperCase()}
						</text>
					</g>
				{/each}
			</svg>
		{:else}
			<div class="topology-empty">
				<div class="topology-empty-title">{$i18n.t('Waiting for topology data')}</div>
				<div class="topology-empty-copy">
					{$i18n.t(
						'Systems, links, and services will appear as the model reports structured scan updates.'
					)}
				</div>
			</div>
		{/if}
	</div>

	{#if systems.length > 0}
		<div class="topology-system-list">
			{#each systems.slice(0, 6) as system (system.id)}
				<div class="topology-system-row">
					<div>
						<div class="topology-system-name">{system.name}</div>
						<div class="topology-system-meta">
							{system.type ?? $i18n.t('System')}{system.services.length
								? ` | ${system.services.slice(0, 3).join(', ')}`
								: ''}
						</div>
					</div>
					<div class="topology-risk topology-risk-{system.risk}">{system.risk}</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.topology-panel {
		border: 1px solid rgba(148, 163, 184, 0.26);
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.84);
		box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
		padding: 14px;
		min-height: 31rem;
	}

	:global(.dark) .topology-panel {
		border-color: rgba(51, 65, 85, 0.8);
		background: rgba(15, 23, 42, 0.62);
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
	}

	.topology-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.topology-kicker {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgb(100, 116, 139);
	}

	.topology-title {
		margin-top: 5px;
		font-size: 16px;
		font-weight: 700;
		color: rgb(15, 23, 42);
	}

	:global(.dark) .topology-title {
		color: rgb(226, 232, 240);
	}

	.topology-metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(3.4rem, 1fr));
		gap: 6px;
	}

	.topology-metrics > div {
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 10px;
		padding: 7px 8px;
		background: rgba(248, 250, 252, 0.8);
		text-align: right;
	}

	:global(.dark) .topology-metrics > div {
		border-color: rgba(51, 65, 85, 0.82);
		background: rgba(15, 23, 42, 0.7);
	}

	.topology-metrics span {
		display: block;
		font-size: 17px;
		font-weight: 700;
		line-height: 1;
	}

	.topology-metric-label {
		display: block;
		margin-top: 4px;
		font-size: 10px;
		color: rgb(100, 116, 139);
	}

	.topology-canvas {
		margin-top: 14px;
		height: 22rem;
		border-radius: 14px;
		border: 1px solid rgba(148, 163, 184, 0.22);
		background: linear-gradient(rgba(148, 163, 184, 0.14) 1px, transparent 1px),
			linear-gradient(90deg, rgba(148, 163, 184, 0.14) 1px, transparent 1px),
			rgba(248, 250, 252, 0.68);
		background-size: 28px 28px;
		overflow: hidden;
	}

	:global(.dark) .topology-canvas {
		border-color: rgba(51, 65, 85, 0.72);
		background: linear-gradient(rgba(71, 85, 105, 0.28) 1px, transparent 1px),
			linear-gradient(90deg, rgba(71, 85, 105, 0.28) 1px, transparent 1px), rgba(2, 6, 23, 0.34);
		background-size: 28px 28px;
	}

	svg {
		width: 100%;
		height: 100%;
	}

	.topology-link {
		stroke: rgba(71, 85, 105, 0.58);
		stroke-width: 2;
	}

	:global(.dark) .topology-link {
		stroke: rgba(148, 163, 184, 0.62);
	}

	.topology-arrow {
		fill: rgba(71, 85, 105, 0.66);
	}

	.topology-link-label {
		font-size: 10px;
		fill: rgb(71, 85, 105);
		font-weight: 600;
	}

	.topology-node {
		stroke-width: 2;
		filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.15));
	}

	.topology-node-critical {
		fill: rgba(190, 18, 60, 0.2);
		stroke: rgb(190, 18, 60);
	}

	.topology-node-high {
		fill: rgba(220, 38, 38, 0.18);
		stroke: rgb(220, 38, 38);
	}

	.topology-node-medium {
		fill: rgba(217, 119, 6, 0.18);
		stroke: rgb(217, 119, 6);
	}

	.topology-node-low {
		fill: rgba(37, 99, 235, 0.14);
		stroke: rgb(37, 99, 235);
	}

	.topology-node-neutral {
		fill: rgba(20, 184, 166, 0.14);
		stroke: rgb(15, 118, 110);
	}

	.topology-node-core {
		fill: rgba(255, 255, 255, 0.9);
		stroke: rgba(148, 163, 184, 0.34);
	}

	:global(.dark) .topology-node-core {
		fill: rgba(15, 23, 42, 0.94);
		stroke: rgba(148, 163, 184, 0.3);
	}

	.topology-node-label,
	.topology-node-risk,
	.topology-node-sub {
		font-weight: 700;
		fill: rgb(15, 23, 42);
		font-size: 12px;
	}

	.topology-node-risk {
		font-size: 10px;
	}

	.topology-node-sub {
		font-size: 10px;
		font-weight: 500;
		fill: rgb(100, 116, 139);
	}

	:global(.dark) .topology-node-label,
	:global(.dark) .topology-node-risk {
		fill: rgb(226, 232, 240);
	}

	.topology-empty {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 24px;
	}

	.topology-empty-title {
		font-weight: 700;
		color: rgb(15, 23, 42);
	}

	:global(.dark) .topology-empty-title {
		color: rgb(226, 232, 240);
	}

	.topology-empty-copy {
		margin-top: 7px;
		max-width: 25rem;
		font-size: 13px;
		line-height: 1.55;
		color: rgb(100, 116, 139);
	}

	.topology-system-list {
		margin-top: 10px;
		display: grid;
		gap: 6px;
	}

	.topology-system-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 10px;
		padding: 8px 10px;
	}

	:global(.dark) .topology-system-row {
		border-color: rgba(51, 65, 85, 0.76);
	}

	.topology-system-name {
		font-size: 13px;
		font-weight: 700;
	}

	.topology-system-meta {
		margin-top: 2px;
		font-size: 11px;
		color: rgb(100, 116, 139);
	}

	.topology-risk {
		border-radius: 999px;
		padding: 4px 8px;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		background: rgba(148, 163, 184, 0.16);
		color: rgb(71, 85, 105);
	}

	.topology-risk-critical,
	.topology-risk-high {
		background: rgba(239, 68, 68, 0.12);
		color: rgb(185, 28, 28);
	}

	.topology-risk-medium {
		background: rgba(245, 158, 11, 0.14);
		color: rgb(180, 83, 9);
	}

	.topology-risk-low {
		background: rgba(59, 130, 246, 0.12);
		color: rgb(29, 78, 216);
	}
</style>
