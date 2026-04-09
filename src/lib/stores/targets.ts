import { derived, get, writable } from 'svelte/store';

import type { NewTargetInput, Target } from '$lib/components/workspace/Targets/types';
import {
	pauseScanSession,
	removeScanSession,
	resumeScanSession,
	scanSessions,
	startScanSession
} from '$lib/stores/scanSessions';

const TARGETS_STORAGE_KEY = 'venomx:targets';
const ACTIVE_TARGET_STORAGE_KEY = 'venomx:targets:active';

const isTargetType = (value: unknown): value is Target['type'] =>
	value === 'Domain' || value === 'IP' || value === 'URL' || value === 'CIDR' || value === 'Host';

const isTargetStatus = (value: unknown): value is Target['status'] =>
	value === 'Active' ||
	value === 'Pending' ||
	value === 'Paused' ||
	value === 'Complete' ||
	value === 'Error';

const isValidTarget = (value: unknown): value is Target => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<Target>;
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.name === 'string' &&
		isTargetType(candidate.type) &&
		typeof candidate.value === 'string' &&
		isTargetStatus(candidate.status) &&
		(candidate.lastScan === null || typeof candidate.lastScan === 'string') &&
		typeof candidate.description === 'string'
	);
};

const readPersistedTargets = (): Target[] => {
	if (typeof window === 'undefined') {
		return [];
	}

	try {
		const raw = localStorage.getItem(TARGETS_STORAGE_KEY);
		if (!raw) {
			return [];
		}

		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter(isValidTarget);
	} catch {
		return [];
	}
};

const readPersistedActiveTargetId = (targetList: Target[]): string | null => {
	if (typeof window === 'undefined') {
		return targetList[0]?.id ?? null;
	}

	const savedId = localStorage.getItem(ACTIVE_TARGET_STORAGE_KEY);
	if (!savedId) {
		return targetList[0]?.id ?? null;
	}

	return targetList.some((target) => target.id === savedId) ? savedId : (targetList[0]?.id ?? null);
};

const persistTargets = (targetList: Target[]) => {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		if (targetList.length === 0) {
			localStorage.removeItem(TARGETS_STORAGE_KEY);
			return;
		}

		localStorage.setItem(TARGETS_STORAGE_KEY, JSON.stringify(targetList));
	} catch {
		// no-op: persistence failure should never block runtime updates
	}
};

const persistActiveTargetId = (id: string | null) => {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		if (!id) {
			localStorage.removeItem(ACTIVE_TARGET_STORAGE_KEY);
			return;
		}

		localStorage.setItem(ACTIVE_TARGET_STORAGE_KEY, id);
	} catch {
		// no-op
	}
};

const normalizeTargetToken = (value: string) => value.trim().toLowerCase();

const targetFingerprint = (target: Target) =>
	`${target.type}|${normalizeTargetToken(target.name)}|${normalizeTargetToken(target.value)}`;

const dedupeTargets = (targetList: Target[]): Target[] => {
	const seenIds = new Set<string>();
	const seenFingerprints = new Set<string>();
	const deduped: Target[] = [];

	for (const target of targetList) {
		if (seenIds.has(target.id)) {
			continue;
		}

		const fp = targetFingerprint(target);
		if (seenFingerprints.has(fp)) {
			continue;
		}

		seenIds.add(target.id);
		seenFingerprints.add(fp);
		deduped.push(target);
	}

	return deduped;
};

const initialTargets: Target[] = dedupeTargets(readPersistedTargets());

export const targets = writable<Target[]>(initialTargets);
export const activeTargetId = writable<string | null>(readPersistedActiveTargetId(initialTargets));
export const scanQueue = writable<string[]>([]);
export const isScanQueueRunning = writable(false);
export const activeQueueTargetId = writable<string | null>(null);

targets.subscribe((targetList) => {
	persistTargets(targetList);

	const currentActiveId = get(activeTargetId);
	if (!currentActiveId || targetList.some((target) => target.id === currentActiveId)) {
		return;
	}

	activeTargetId.set(targetList[0]?.id ?? null);
});

activeTargetId.subscribe((id) => {
	persistActiveTargetId(id);
});

export const activeTarget = derived([targets, activeTargetId], ([$targets, $activeTargetId]) => {
	if (!$activeTargetId) {
		return null;
	}

	return $targets.find((target) => target.id === $activeTargetId) ?? null;
});

export const activeScanCount = derived(
	targets,
	($targets) => $targets.filter((target) => target.status === 'Active').length
);

const formatTimestamp = (value = new Date()) => {
	const pad = (value: number) => value.toString().padStart(2, '0');
	return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

type SessionTargetSnapshot = {
	targetId: string;
	targetName: string;
	lifecycle: 'queued' | 'running' | 'paused' | 'complete' | 'error';
	endedAt?: number | null;
	updatedAt?: number;
};

const statusFromLifecycle = (lifecycle: SessionTargetSnapshot['lifecycle']): Target['status'] =>
	lifecycle === 'queued'
		? 'Pending'
		: lifecycle === 'running'
			? 'Active'
			: lifecycle === 'paused'
				? 'Paused'
				: lifecycle === 'complete'
					? 'Complete'
					: 'Error';

let queueAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

const clearQueueAdvanceTimer = () => {
	if (!queueAdvanceTimer) {
		return;
	}

	clearTimeout(queueAdvanceTimer);
	queueAdvanceTimer = null;
};

const triggerNextQueuedScan = () => {
	if (!get(isScanQueueRunning)) {
		return;
	}

	const activeTargetId = get(activeQueueTargetId);
	if (activeTargetId) {
		const activeSession = get(scanSessions)[activeTargetId];
		if (
			activeSession &&
			activeSession.lifecycle !== 'complete' &&
			activeSession.lifecycle !== 'error'
		) {
			return;
		}

		activeQueueTargetId.set(null);
	}

	const queue = get(scanQueue);
	const nextTargetId = queue[0];
	if (!nextTargetId) {
		isScanQueueRunning.set(false);
		return;
	}

	const target = get(targets).find((item) => item.id === nextTargetId);
	if (!target) {
		scanQueue.update((items) => items.filter((id) => id !== nextTargetId));
		triggerNextQueuedScan();
		return;
	}

	activeQueueTargetId.set(nextTargetId);
	setActiveTarget(nextTargetId);
	startScanSession(target);
};

scanSessions.subscribe(($scanSessions) => {
	targets.update((currentTargets) =>
		currentTargets.map((target) => {
			const session = $scanSessions[target.id];
			if (!session) {
				return target;
			}

			const nextStatus =
				session.lifecycle === 'queued'
					? 'Pending'
					: session.lifecycle === 'running'
						? 'Active'
						: session.lifecycle === 'paused'
							? 'Paused'
							: session.lifecycle === 'complete'
								? 'Complete'
								: 'Error';

			const nextLastScan =
				session.lifecycle === 'complete' || session.lifecycle === 'error'
					? formatTimestamp(new Date(session.endedAt ?? session.updatedAt))
					: target.lastScan;

			if (target.status === nextStatus && target.lastScan === nextLastScan) {
				return target;
			}

			return {
				...target,
				status: nextStatus,
				lastScan: nextLastScan
			};
		})
	);

	if (!get(isScanQueueRunning)) {
		return;
	}

	const currentQueueTarget = get(activeQueueTargetId);
	if (!currentQueueTarget) {
		triggerNextQueuedScan();
		return;
	}

	const currentSession = $scanSessions[currentQueueTarget];
	if (!currentSession) {
		activeQueueTargetId.set(null);
		triggerNextQueuedScan();
		return;
	}

	if (currentSession.lifecycle === 'complete' || currentSession.lifecycle === 'error') {
		scanQueue.update((items) => items.filter((id) => id !== currentQueueTarget));
		activeQueueTargetId.set(null);

		if (!queueAdvanceTimer) {
			queueAdvanceTimer = setTimeout(() => {
				queueAdvanceTimer = null;
				triggerNextQueuedScan();
			}, 700);
		}
	}
});

export const setActiveTarget = (id: string) => {
	activeTargetId.set(id);
};

export const addTarget = (payload: NewTargetInput) => {
	const id =
		typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tgt-${Date.now()}`;

	targets.update((currentTargets) => [
		{
			id,
			name: payload.name,
			type: payload.type,
			value: payload.value,
			status: 'Pending',
			lastScan: null,
			description: payload.description
		},
		...currentTargets
	]);

	if (!get(activeTargetId)) {
		activeTargetId.set(id);
	}

	return id;
};

const inferTargetFromPrompt = (prompt: string): NewTargetInput => {
	const trimmed = prompt.trim();
	const safePrompt = trimmed.slice(0, 220);

	const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
	if (urlMatch) {
		return {
			name: `Prompt URL Target`,
			type: 'URL',
			value: urlMatch[0],
			description: safePrompt || 'Generated from user prompt.'
		};
	}

	const cidrMatch = trimmed.match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/);
	if (cidrMatch) {
		return {
			name: `Prompt Network Target`,
			type: 'CIDR',
			value: cidrMatch[0],
			description: safePrompt || 'Generated from user prompt.'
		};
	}

	const ipMatch = trimmed.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
	if (ipMatch) {
		return {
			name: `Prompt IP Target`,
			type: 'IP',
			value: ipMatch[0],
			description: safePrompt || 'Generated from user prompt.'
		};
	}

	const domainMatch = trimmed.match(/\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/);
	if (domainMatch) {
		return {
			name: `Prompt Domain Target`,
			type: 'Domain',
			value: domainMatch[0],
			description: safePrompt || 'Generated from user prompt.'
		};
	}

	const compact = trimmed.replace(/\s+/g, ' ').slice(0, 48);
	return {
		name: compact ? `Prompt Task: ${compact}` : 'Prompt Task Target',
		type: 'Host',
		value: 'prompt-task',
		description: safePrompt || 'Generated from user prompt.'
	};
};

export const createPromptTarget = (prompt: string) => {
	if (!prompt.trim()) {
		return null;
	}

	const id = addTarget(inferTargetFromPrompt(prompt));
	setActiveTarget(id);
	queueTargetScan(id);

	if (!get(isScanQueueRunning)) {
		startScanQueue();
	}

	return id;
};

/**
 * Ensure target cards exist for restored sessions, so the workspace target view
 * is not empty when scan session state was restored from storage first.
 */
export const restoreTargetsFromSessions = (sessionSnapshots: SessionTargetSnapshot[]) => {
	if (!Array.isArray(sessionSnapshots) || sessionSnapshots.length === 0) {
		return;
	}

	targets.update((currentTargets) => {
		const existingIds = new Set(currentTargets.map((target) => target.id));
		const existingFingerprints = new Set(currentTargets.map((target) => targetFingerprint(target)));
		const additions: Target[] = [];

		for (const session of sessionSnapshots) {
			if (!session?.targetId || existingIds.has(session.targetId)) {
				continue;
			}

			const candidateName = (session.targetName || 'Restored Target').trim();
			const candidateValue = candidateName || session.targetId;
			const candidateType: Target['type'] = 'Host';
			const candidateFingerprint = `${candidateType}|${normalizeTargetToken(candidateName)}|${normalizeTargetToken(candidateValue)}`;
			if (existingFingerprints.has(candidateFingerprint)) {
				continue;
			}

			existingIds.add(session.targetId);
			existingFingerprints.add(candidateFingerprint);
			additions.push({
				id: session.targetId,
				name: candidateName,
				type: candidateType,
				value: candidateValue,
				status: statusFromLifecycle(session.lifecycle),
				lastScan:
					session.lifecycle === 'complete' || session.lifecycle === 'error'
						? formatTimestamp(new Date(session.endedAt ?? session.updatedAt ?? Date.now()))
						: null,
				description: 'Restored from previous scan session state.'
			});
		}

		if (additions.length === 0) {
			return dedupeTargets(currentTargets);
		}

		return dedupeTargets([...additions, ...currentTargets]);
	});

	if (!get(activeTargetId)) {
		const firstSessionTargetId = sessionSnapshots[0]?.targetId ?? null;
		if (firstSessionTargetId) {
			activeTargetId.set(firstSessionTargetId);
		}
	}
};

export const queueTargetScan = (id: string) => {
	if (!get(targets).some((item) => item.id === id)) {
		return;
	}

	scanQueue.update((currentQueue) =>
		currentQueue.includes(id) ? currentQueue : [...currentQueue, id]
	);
	targets.update((currentTargets) =>
		currentTargets.map((target) =>
			target.id === id && target.status !== 'Active' && target.status !== 'Paused'
				? { ...target, status: 'Pending' }
				: target
		)
	);
};

export const queueAndStartTargetScan = (id: string) => {
	queueTargetScan(id);

	if (!get(isScanQueueRunning)) {
		startScanQueue();
		return;
	}

	triggerNextQueuedScan();
};

export const removeFromScanQueue = (id: string) => {
	scanQueue.update((currentQueue) => currentQueue.filter((targetId) => targetId !== id));
	if (get(activeQueueTargetId) === id) {
		activeQueueTargetId.set(null);
	}
};

export const startScanQueue = () => {
	if (get(scanQueue).length === 0) {
		return;
	}

	if (!get(isScanQueueRunning)) {
		isScanQueueRunning.set(true);
	}

	triggerNextQueuedScan();
};

export const stopScanQueue = () => {
	isScanQueueRunning.set(false);
	activeQueueTargetId.set(null);
	clearQueueAdvanceTimer();
};

export const toggleTargetStatus = (id: string) => {
	const target = get(targets).find((item) => item.id === id);
	if (!target) {
		return;
	}

	if (target.status === 'Active') {
		pauseScanSession(id);
		return;
	}

	if (target.status === 'Paused') {
		resumeScanSession(id);
		return;
	}

	targets.update((currentTargets) =>
		currentTargets.map((target) => {
			if (target.id !== id) {
				return target;
			}

			return {
				...target,
				status: target.status === 'Paused' ? 'Active' : 'Paused'
			};
		})
	);
};

export const deleteTarget = (id: string) => {
	removeScanSession(id);
	removeFromScanQueue(id);
	targets.update((currentTargets) => currentTargets.filter((target) => target.id !== id));

	if (get(activeTargetId) === id) {
		const remainingTargets = get(targets);
		activeTargetId.set(remainingTargets[0]?.id ?? null);
	}
};
