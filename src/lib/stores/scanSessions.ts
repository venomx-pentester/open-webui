import { derived, get, writable } from 'svelte/store';

import type { Target } from '$lib/components/workspace/Targets/types';
import { vxStore } from '$lib/utils/venomxDebug';

export type ScanStageStatus = 'pending' | 'in_progress' | 'complete' | 'error';
export type ScanLifecycle = 'queued' | 'running' | 'paused' | 'complete' | 'error';

export type ScanStageId =
	| 'queued'
	| 'asset_validation'
	| 'surface_enumeration'
	| 'service_analysis'
	| 'findings_assembly'
	| 'complete';

export type ScanStage = {
	id: ScanStageId;
	label: string;
	status: ScanStageStatus;
};

export type ScanActivity = {
	id: string;
	timestamp: number;
	message: string;
	stageId: ScanStageId;
};

export type DispatchStatus = 'pending' | 'active' | 'done' | 'awaiting' | 'skipped' | 'error';

export type DispatchEntry = {
	key: string;
	label: string;
	status: DispatchStatus;
	summary?: string;
	nodesAdded?: number;
	credsAdded?: number;
	tools?: string[];
};

export type ScanSession = {
	id: string;
	targetId: string;
	targetName: string;
	lifecycle: ScanLifecycle;
	progress: number;
	streamChars: number;
	startedAt: number;
	updatedAt: number;
	endedAt: number | null;
	currentStageId: ScanStageId;
	stages: ScanStage[];
	activity: ScanActivity[];
	dispatches: DispatchEntry[];
	phase: number;
	reviewed: boolean;
	errorSpecialist: string | null;
	errorMessage: string | null;
	/** Set from chat (Run ID) or agent `run_start` SSE — used to reconnect the event stream */
	agentRunId: string | null;
	/** Populated for specialist runs — the specialist key (e.g. "auth", "recon"). Null for full runs. */
	specialist: string | null;
	/** True when the run_complete event reports a .docx was generated */
	hasDocx: boolean;
};

type ScanSessionMap = Record<string, ScanSession>;

type RuntimeSessionState = {
	intervalId: ReturnType<typeof setInterval>;
	stageIndex: number;
	stageProgress: number;
};

const SCAN_STAGES: Array<{ id: ScanStageId; label: string; weight: number }> = [
	{ id: 'queued', label: 'Queued', weight: 6 },
	{ id: 'asset_validation', label: 'Asset Validation', weight: 16 },
	{ id: 'surface_enumeration', label: 'Surface Enumeration', weight: 24 },
	{ id: 'service_analysis', label: 'Service Analysis', weight: 27 },
	{ id: 'findings_assembly', label: 'Findings Assembly', weight: 22 },
	{ id: 'complete', label: 'Complete', weight: 5 }
];

const RUNNING_STAGE_IDS: ScanStageId[] = [
	'asset_validation',
	'surface_enumeration',
	'service_analysis',
	'findings_assembly'
];

const STAGE_MESSAGES: Record<ScanStageId, string[]> = {
	queued: ['Target added to local scan queue.', 'Scan worker reserved for this target.'],
	asset_validation: [
		'Validating target metadata and connectivity assumptions.',
		'Normalizing target scope for enumeration stage.'
	],
	surface_enumeration: [
		'Enumerating reachable endpoints and externally visible assets.',
		'Collecting baseline response signatures from target surface.'
	],
	service_analysis: [
		'Inspecting exposed services and protocol fingerprints.',
		'Scoring service banners and transport characteristics.'
	],
	findings_assembly: [
		'Assembling generic mock findings summary for review.',
		'Consolidating stage artifacts into a final report draft.'
	],
	complete: ['Mock scan lifecycle completed successfully.']
};

const MOCK_ERROR_PROBABILITY = 0.08;
const MAX_ACTIVITY_ITEMS = 24;

const sessions = writable<ScanSessionMap>({});
const runtime = new Map<string, RuntimeSessionState>();

const now = () => Date.now();

const randomId = () =>
	typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID()
		: `scan-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const randomInRange = (min: number, max: number) =>
	Math.floor(Math.random() * (max - min + 1)) + min;

const toStageRows = (): ScanStage[] =>
	SCAN_STAGES.map((stage, index) => ({
		id: stage.id,
		label: stage.label,
		status: index === 0 ? 'in_progress' : 'pending'
	}));

const totalRunningWeight = RUNNING_STAGE_IDS.reduce((sum, stageId) => {
	const stage = SCAN_STAGES.find((candidate) => candidate.id === stageId);
	return sum + (stage?.weight ?? 0);
}, 0);

const stopRuntime = (targetId: string) => {
	const state = runtime.get(targetId);
	if (!state) {
		return;
	}

	clearInterval(state.intervalId);
	runtime.delete(targetId);
};

const appendActivity = (
	session: ScanSession,
	stageId: ScanStageId,
	message: string
): ScanSession => {
	const nextActivity: ScanActivity = {
		id: randomId(),
		timestamp: now(),
		message,
		stageId
	};

	const activity = [...session.activity, nextActivity].slice(-MAX_ACTIVITY_ITEMS);
	return {
		...session,
		activity,
		updatedAt: nextActivity.timestamp
	};
};

const markStageStatus = (
	stages: ScanStage[],
	stageId: ScanStageId,
	status: ScanStageStatus
): ScanStage[] => stages.map((stage) => (stage.id === stageId ? { ...stage, status } : stage));

const weightedProgress = (stageIndex: number, stageProgress: number) => {
	const activeStageId = RUNNING_STAGE_IDS[stageIndex];
	const completedWeight = RUNNING_STAGE_IDS.slice(0, stageIndex).reduce((sum, stageId) => {
		const stage = SCAN_STAGES.find((candidate) => candidate.id === stageId);
		return sum + (stage?.weight ?? 0);
	}, 0);

	const activeWeight = SCAN_STAGES.find((stage) => stage.id === activeStageId)?.weight ?? 0;
	const runningPortion = completedWeight + activeWeight * stageProgress;
	const base = SCAN_STAGES.find((stage) => stage.id === 'queued')?.weight ?? 0;

	return Math.min(99, Math.round(base + (runningPortion / totalRunningWeight) * 89));
};

const setSession = (targetId: string, updater: (session: ScanSession) => ScanSession) => {
	sessions.update((current) => {
		const existing = current[targetId];
		if (!existing) {
			return current;
		}

		return {
			...current,
			[targetId]: updater(existing)
		};
	});
};

const startTicker = (targetId: string) => {
	stopRuntime(targetId);

	const intervalId = setInterval(() => {
		const current = get(sessions)[targetId];
		const runtimeState = runtime.get(targetId);
		if (!current || !runtimeState) {
			stopRuntime(targetId);
			return;
		}

		if (current.lifecycle !== 'running') {
			return;
		}

		const activeStageId = RUNNING_STAGE_IDS[runtimeState.stageIndex];
		if (!activeStageId) {
			return;
		}

		const stageProgress = Math.min(1, runtimeState.stageProgress + randomInRange(7, 13) / 100);
		runtimeState.stageProgress = stageProgress;

		if (
			activeStageId === 'service_analysis' &&
			stageProgress > 0.5 &&
			Math.random() < MOCK_ERROR_PROBABILITY
		) {
			setSession(targetId, (session) => {
				const failed = appendActivity(
					session,
					'service_analysis',
					'Mock signal indicates analysis instability. Escalating as demo error.'
				);
				return {
					...failed,
					lifecycle: 'error',
					currentStageId: 'service_analysis',
					progress: Math.max(failed.progress, 72),
					endedAt: now(),
					stages: markStageStatus(failed.stages, 'service_analysis', 'error'),
					updatedAt: now()
				};
			});
			stopRuntime(targetId);
			return;
		}

		if (stageProgress >= 1) {
			const completedStageId = activeStageId;
			runtimeState.stageIndex += 1;
			runtimeState.stageProgress = 0;

			const nextStageId = RUNNING_STAGE_IDS[runtimeState.stageIndex];
			if (!nextStageId) {
				setSession(targetId, (session) => {
					let nextSession = appendActivity(
						session,
						completedStageId,
						'Finalizing mock scan output package.'
					);
					nextSession = appendActivity(nextSession, 'complete', STAGE_MESSAGES.complete[0]);
					return {
						...nextSession,
						lifecycle: 'complete',
						progress: 100,
						currentStageId: 'complete',
						endedAt: now(),
						updatedAt: now(),
						stages: nextSession.stages.map((stage) => {
							if (stage.id === 'complete') {
								return { ...stage, status: 'complete' };
							}
							if (stage.id === completedStageId || RUNNING_STAGE_IDS.includes(stage.id)) {
								return { ...stage, status: 'complete' };
							}
							return stage;
						})
					};
				});
				stopRuntime(targetId);
				return;
			}

			setSession(targetId, (session) => {
				const progressed = appendActivity(
					session,
					nextStageId,
					STAGE_MESSAGES[nextStageId][randomInRange(0, STAGE_MESSAGES[nextStageId].length - 1)]
				);

				return {
					...progressed,
					currentStageId: nextStageId,
					progress: weightedProgress(runtimeState.stageIndex, 0),
					updatedAt: now(),
					stages: progressed.stages.map((stage) => {
						if (stage.id === completedStageId) {
							return { ...stage, status: 'complete' };
						}
						if (stage.id === nextStageId) {
							return { ...stage, status: 'in_progress' };
						}
						return stage;
					})
				};
			});

			return;
		}

		setSession(targetId, (session) => ({
			...session,
			progress: weightedProgress(runtimeState.stageIndex, stageProgress),
			updatedAt: now()
		}));
	}, 1100);

	runtime.set(targetId, { intervalId, stageIndex: 0, stageProgress: 0 });
};

export const scanSessions = derived(sessions, ($sessions) => $sessions);

export const startMockScanSession = (target: Target) => {
	const startedAt = now();
	const sessionId = randomId();

	stopRuntime(target.id);

	sessions.update((current) => ({
		...current,
		[target.id]: {
			id: sessionId,
			targetId: target.id,
			targetName: target.name,
			lifecycle: 'queued',
			progress: 4,
			streamChars: 0,
			startedAt,
			updatedAt: startedAt,
			endedAt: null,
			currentStageId: 'queued',
			stages: toStageRows(),
			activity: [
				{
					id: randomId(),
					timestamp: startedAt,
					message: STAGE_MESSAGES.queued[0],
					stageId: 'queued'
				}
			],
			dispatches: [],
			phase: 1,
			reviewed: false,
			errorSpecialist: null,
			errorMessage: null,
			agentRunId: null,
			specialist: null,
			hasDocx: false
		}
	}));

	const promoteQueueTimeout = setTimeout(
		() => {
			const latest = get(sessions)[target.id];
			if (!latest || latest.id !== sessionId) {
				return;
			}

			sessions.update((current) => {
				const existing = current[target.id];
				if (!existing || existing.id !== sessionId || existing.lifecycle !== 'queued') {
					return current;
				}

				const nextStageId: ScanStageId = 'asset_validation';
				const next = appendActivity(
					existing,
					nextStageId,
					STAGE_MESSAGES[nextStageId][randomInRange(0, STAGE_MESSAGES[nextStageId].length - 1)]
				);

				return {
					...current,
					[target.id]: {
						...next,
						lifecycle: 'running',
						currentStageId: nextStageId,
						progress: 10,
						updatedAt: now(),
						stages: next.stages.map((stage) => {
							if (stage.id === 'queued') {
								return { ...stage, status: 'complete' };
							}
							if (stage.id === nextStageId) {
								return { ...stage, status: 'in_progress' };
							}
							return stage;
						})
					}
				};
			});

			startTicker(target.id);
		},
		randomInRange(1200, 2200)
	);

	setTimeout(() => {
		const latest = get(sessions)[target.id];
		if (!latest || latest.id !== sessionId || latest.lifecycle !== 'queued') {
			return;
		}

		clearTimeout(promoteQueueTimeout);
	}, 2400);
};

export const pauseMockScanSession = (targetId: string) => {
	const existing = get(sessions)[targetId];
	if (!existing || existing.lifecycle !== 'running') {
		return;
	}

	setSession(targetId, (session) =>
		appendActivity(
			{
				...session,
				lifecycle: 'paused',
				updatedAt: now(),
				stages: markStageStatus(session.stages, session.currentStageId, 'pending')
			},
			session.currentStageId,
			'Mock scan paused by operator.'
		)
	);
};

export const resumeMockScanSession = (targetId: string) => {
	const existing = get(sessions)[targetId];
	if (!existing || existing.lifecycle !== 'paused') {
		return;
	}

	setSession(targetId, (session) =>
		appendActivity(
			{
				...session,
				lifecycle: 'running',
				updatedAt: now(),
				stages: markStageStatus(session.stages, session.currentStageId, 'in_progress')
			},
			session.currentStageId,
			'Mock scan resumed and processing continues.'
		)
	);

	if (!runtime.get(targetId)) {
		startTicker(targetId);
	}
};

export const removeScanSession = (targetId: string) => {
	stopRuntime(targetId);
	sessions.update((current) => {
		if (!current[targetId]) {
			return current;
		}

		const next = { ...current };
		delete next[targetId];
		return next;
	});
};

export const getScanSessionForTarget = (targetId: string | null | undefined) => {
	if (!targetId) {
		return null;
	}

	return get(sessions)[targetId] ?? null;
};

const LIVE_STAGE_PROGRESS_MIN: Record<ScanStageId, number> = {
	queued: 2,
	asset_validation: 6,
	surface_enumeration: 14,
	service_analysis: 26,
	findings_assembly: 44,
	complete: 100
};

const STREAM_PROGRESS_CAP = 88;
const STATUS_PROGRESS_CAP = 92;

const STAGE_PROGRESS_BANDS: Record<ScanStageId, { min: number; max: number }> = {
	queued: { min: 2, max: 8 },
	asset_validation: { min: 8, max: 24 },
	surface_enumeration: { min: 24, max: 44 },
	service_analysis: { min: 44, max: 68 },
	findings_assembly: { min: 68, max: 92 },
	complete: { min: 100, max: 100 }
};

const toIntProgress = (value: number) => Math.max(0, Math.min(100, Math.floor(value)));

const resolveStatusStage = (action?: string): ScanStageId => {
	const normalized = (action ?? '').toLowerCase();

	if (
		normalized.includes('web_search') ||
		normalized.includes('query') ||
		normalized.includes('retriev') ||
		normalized.includes('search')
	) {
		return 'surface_enumeration';
	}

	if (
		normalized.includes('tool') ||
		normalized.includes('function') ||
		normalized.includes('image') ||
		normalized.includes('code')
	) {
		return 'service_analysis';
	}

	if (
		normalized.includes('chat') ||
		normalized.includes('completion') ||
		normalized.includes('response') ||
		normalized.includes('message')
	) {
		return 'findings_assembly';
	}

	return 'asset_validation';
};

const deriveStagesForLiveSession = (
	session: ScanSession,
	stageId: ScanStageId,
	{
		lifecycle,
		error = false
	}: {
		lifecycle: ScanLifecycle;
		error?: boolean;
	}
): ScanStage[] => {
	const stageOrder: ScanStageId[] = [
		'queued',
		'asset_validation',
		'surface_enumeration',
		'service_analysis',
		'findings_assembly',
		'complete'
	];
	const activeIndex = stageOrder.indexOf(stageId);

	return session.stages.map((stage) => {
		const idx = stageOrder.indexOf(stage.id);

		if (error && stage.id === stageId) {
			return { ...stage, status: 'error' as ScanStageStatus };
		}

		if (lifecycle === 'complete') {
			return { ...stage, status: 'complete' as ScanStageStatus };
		}

		if (idx < activeIndex) {
			return { ...stage, status: 'complete' as ScanStageStatus };
		}

		if (idx === activeIndex) {
			if (lifecycle === 'paused') {
				return { ...stage, status: 'pending' as ScanStageStatus };
			}
			if (lifecycle === 'error') {
				return { ...stage, status: 'error' as ScanStageStatus };
			}

			return { ...stage, status: 'in_progress' as ScanStageStatus };
		}

		return { ...stage, status: 'pending' as ScanStageStatus };
	});
};

const ensureLiveSession = (targetId: string) => {
	const session = get(sessions)[targetId];
	if (session) {
		return session;
	}

	return null;
};

export const startScanSession = (target: Target) => {
	const startedAt = now();

	stopRuntime(target.id);

	sessions.update((current) => ({
		...current,
		[target.id]: {
			id: randomId(),
			targetId: target.id,
			targetName: target.name,
			lifecycle: 'queued',
			progress: LIVE_STAGE_PROGRESS_MIN.queued,
			streamChars: 0,
			startedAt,
			updatedAt: startedAt,
			endedAt: null,
			currentStageId: 'queued',
			stages: toStageRows(),
			activity: [
				{
					id: randomId(),
					timestamp: startedAt,
					message: 'Target added to live model execution queue.',
					stageId: 'queued'
				}
			],
			dispatches: [],
			phase: 1,
			reviewed: false,
			errorSpecialist: null,
			errorMessage: null,
			agentRunId: null,
			specialist: null,
			hasDocx: false
		}
	}));
};

export const setAgentRunId = (targetId: string, runId: string) => {
	if (!ensureLiveSession(targetId)) {
		return;
	}
	setSession(targetId, (session) => ({
		...session,
		agentRunId: runId,
		updatedAt: now()
	}));
};

export const applyScanSessionStatusEvent = (
	targetId: string,
	status: {
		action?: string;
		description?: string;
		done?: boolean;
		error?: boolean;
	}
) => {
	if (!ensureLiveSession(targetId)) {
		return;
	}

	const stageId = resolveStatusStage(status.action);
	const statusMessage =
		status.description ??
		(status.action ? `Status update: ${status.action}` : 'Status update received.');

	setSession(targetId, (session) => {
		const timestamp = now();
		const elapsedSeconds = Math.max(0, (timestamp - session.startedAt) / 1000);
		const band = STAGE_PROGRESS_BANDS[stageId] ?? STAGE_PROGRESS_BANDS.asset_validation;
		const cap = phaseProgressCap(session);
		const lifecycle: ScanLifecycle = status.error
			? 'error'
			: session.lifecycle === 'paused'
				? 'paused'
				: 'running';

		const baseline = Math.max(session.progress, band.min);
		const inFlightCeiling = Math.min(STATUS_PROGRESS_CAP - 1, band.max - 1);
		const drift = Math.min(3, Math.floor(elapsedSeconds / 18));
		const progress = toIntProgress(
			status.error
				? baseline
				: status.done
					? Math.min(STATUS_PROGRESS_CAP, Math.max(baseline, band.max - 1))
					: Math.min(inFlightCeiling, Math.max(baseline, band.min + drift))
		);
		const boundedProgress = status.error ? progress : Math.min(cap, progress);

		const nextSession = appendActivity(
			{
				...session,
				lifecycle,
				currentStageId: stageId,
				progress: Math.max(session.progress, boundedProgress),
				updatedAt: timestamp,
				stages: deriveStagesForLiveSession(session, stageId, {
					lifecycle,
					error: Boolean(status.error)
				})
			},
			stageId,
			statusMessage
		);

		if (!status.error) {
			return nextSession;
		}

		return {
			...nextSession,
			endedAt: timestamp
		};
	});
};

export const applyScanSessionDelta = (targetId: string, contentLength: number) => {
	if (!ensureLiveSession(targetId)) {
		return;
	}

	setSession(targetId, (session) => {
		const elapsedSeconds = Math.max(0, (now() - session.startedAt) / 1000);
		const length = Math.max(0, contentLength);
		const band = STAGE_PROGRESS_BANDS.findings_assembly;
		const maxBandProgress = Math.min(STREAM_PROGRESS_CAP, band.max - 1);
		const cap = phaseProgressCap(session);
		const estimatedTokens = length / 4;
		const streamFraction = 1 - Math.exp(-estimatedTokens / 260);
		const timeFraction = Math.min(1, elapsedSeconds / 60);
		const blendedFraction = Math.max(streamFraction, timeFraction * 0.45);

		const streamProgress = band.min + (maxBandProgress - band.min) * blendedFraction;
		const boundedStreamProgress = Math.min(cap, toIntProgress(streamProgress));
		const progress = Math.max(session.progress, boundedStreamProgress);
		const prevBucket = Math.floor(session.progress / 10);
		const nextBucket = Math.floor(progress / 10);

		let nextSession: ScanSession = {
			...session,
			lifecycle: session.lifecycle === 'paused' ? 'paused' : 'running',
			currentStageId: 'findings_assembly',
			progress,
			streamChars: length,
			updatedAt: now(),
			stages: deriveStagesForLiveSession(session, 'findings_assembly', {
				lifecycle: session.lifecycle === 'paused' ? 'paused' : 'running'
			})
		};

		if (nextBucket > prevBucket && nextBucket >= 4) {
			nextSession = appendActivity(
				nextSession,
				'findings_assembly',
				`Model response stream reached ~${Math.min(99, nextBucket * 10)}%.`
			);
		}

		return nextSession;
	});
};

export const completeScanSession = (
	targetId: string,
	{ errorMessage }: { errorMessage?: string } = {}
) => {
	if (!ensureLiveSession(targetId)) {
		return;
	}

	setSession(targetId, (session) => {
		const timestamp = now();
		const stageId: ScanStageId = errorMessage ? session.currentStageId : 'complete';
		const lifecycle: ScanLifecycle = errorMessage ? 'error' : 'complete';

		const updated = {
			...session,
			lifecycle,
			currentStageId: stageId,
			progress: errorMessage ? Math.max(session.progress, 70) : 100,
			streamChars: session.streamChars,
			endedAt: timestamp,
			updatedAt: timestamp,
			stages: deriveStagesForLiveSession(session, stageId, {
				lifecycle,
				error: Boolean(errorMessage)
			})
		};

		return appendActivity(
			updated,
			stageId,
			errorMessage ?? 'Model response completed successfully for this target.'
		);
	});
};

export const pauseScanSession = (targetId: string) => {
	if (!ensureLiveSession(targetId)) {
		return;
	}

	setSession(targetId, (session) =>
		appendActivity(
			{
				...session,
				lifecycle: 'paused',
				streamChars: session.streamChars,
				updatedAt: now(),
				stages: deriveStagesForLiveSession(session, session.currentStageId, {
					lifecycle: 'paused'
				})
			},
			session.currentStageId,
			'Scan tracking paused by operator.'
		)
	);
};

export const resumeScanSession = (targetId: string) => {
	if (!ensureLiveSession(targetId)) {
		return;
	}

	setSession(targetId, (session) =>
		appendActivity(
			{
				...session,
				lifecycle: 'running',
				streamChars: session.streamChars,
				updatedAt: now(),
				stages: deriveStagesForLiveSession(session, session.currentStageId, {
					lifecycle: 'running'
				})
			},
			session.currentStageId,
			'Scan tracking resumed and waiting for model updates.'
		)
	);
};

const RECON_SPECIALISTS = new Set(['recon', 'web', 'osint']);
const ANALYSIS_SPECIALISTS = new Set(['smb', 'auth', 'vuln', 'sql', 'ad']);
const EXPLOIT_SPECIALISTS = new Set(['exploit', 'post', 'report']);

const CLASS_TO_KEY: Record<string, string> = {
	OsintSpecialist: 'osint',
	ReconSpecialist: 'recon',
	WebSpecialist: 'web',
	AuthSpecialist: 'auth',
	VulnSpecialist: 'vuln',
	SqlSpecialist: 'sql',
	SmbSpecialist: 'smb',
	ADSpecialist: 'ad',
	ExploitSpecialist: 'exploit',
	PostSpecialist: 'post',
	ReportSpecialist: 'report'
};

const KEY_TO_LABEL: Record<string, string> = {
	osint: 'OSINT',
	recon: 'Recon',
	web: 'Web',
	auth: 'Auth',
	vuln: 'Vuln',
	sql: 'SQL',
	smb: 'SMB',
	ad: 'AD',
	exploit: 'Exploit',
	post: 'Post-Exploit',
	report: 'Report'
};

const PHASE2_KEYS = new Set(['exploit', 'post', 'report']);

const resolveSpecialistKey = (name: string): string => {
	return CLASS_TO_KEY[name] ?? name.toLowerCase().replace(/specialist$/i, '');
};

const stageForSpecialist = (specialist: string): ScanStageId => {
	const name = (specialist ?? '').toLowerCase();
	if (RECON_SPECIALISTS.has(name)) return 'surface_enumeration';
	if (ANALYSIS_SPECIALISTS.has(name)) return 'service_analysis';
	if (EXPLOIT_SPECIALISTS.has(name)) return 'findings_assembly';
	return 'asset_validation';
};

const isTerminalDispatchStatus = (status: DispatchStatus): boolean =>
	status === 'done' || status === 'error' || status === 'skipped';

const phaseProgressCap = (session: ScanSession): number => {
	if (session.lifecycle === 'complete') {
		return 100;
	}

	if (session.phase >= 2) {
		return 95;
	}

	return 55;
};

const dispatchStatusContribution = (status: DispatchStatus): number => {
	if (isTerminalDispatchStatus(status)) {
		return 1;
	}

	if (status === 'active') {
		return 0.62;
	}

	if (status === 'pending') {
		return 0.26;
	}

	if (status === 'awaiting') {
		return 0.14;
	}

	return 0;
};

const dispatchProgress = (session: ScanSession): number => {
	const phase1Dispatches = session.dispatches.filter((d) => !PHASE2_KEYS.has(d.key));
	const phase2Dispatches = session.dispatches.filter((d) => PHASE2_KEYS.has(d.key));

	const phase1Total = Math.max(4, phase1Dispatches.length || 0);
	const phase1Units = phase1Dispatches.reduce(
		(total, dispatch) => total + dispatchStatusContribution(dispatch.status),
		0
	);
	const phase1Fraction = phase1Total > 0 ? phase1Units / phase1Total : 0;

	const phase1Progress = Math.floor(8 + phase1Fraction * (55 - 8));

	if (session.phase <= 1) {
		const bounded = Math.max(8, Math.min(phaseProgressCap(session), phase1Progress));
		return Math.max(session.progress, bounded);
	}

	const phase2Total = Math.max(3, phase2Dispatches.length || 0);
	const phase2Units = phase2Dispatches.reduce(
		(total, dispatch) => total + dispatchStatusContribution(dispatch.status),
		0
	);
	const phase2Fraction = phase2Total > 0 ? phase2Units / phase2Total : 0;
	const phase2Progress = Math.floor(55 + phase2Fraction * (95 - 55));

	const bounded = Math.max(55, Math.min(phaseProgressCap(session), phase2Progress));
	return Math.max(session.progress, bounded);
};

export const applyAgentEvent = (
	targetId: string,
	event: { type: string; [key: string]: unknown }
) => {
	if (!ensureLiveSession(targetId)) {
		return;
	}

	const eventType = event.type;

	if (eventType === 'run_start') {
		vxStore('run_start', { targetId, run_id: event.run_id, specialist: event.specialist });
		const target = (event.target as string) ?? '';
		const rid =
			typeof event.run_id === 'string' ? event.run_id : undefined;
		const specialistKey = typeof event.specialist === 'string' ? event.specialist : null;
		setSession(targetId, (session) => {
			const stageId: ScanStageId = 'asset_validation';
			const next = appendActivity(
				{
					...session,
					lifecycle: 'running',
					currentStageId: stageId,
					progress: STAGE_PROGRESS_BANDS[stageId].min,
					updatedAt: now(),
					stages: deriveStagesForLiveSession(session, stageId, { lifecycle: 'running' }),
					dispatches: [],
					phase: 1,
					reviewed: false,
					errorSpecialist: null,
					errorMessage: null,
					agentRunId: rid ?? session.agentRunId ?? null,
					specialist: specialistKey
				},
				stageId,
				`Agent run started for ${target || 'target'}.`
			);
			return next;
		});
		return;
	}

	if (eventType === 'dispatch') {
		vxStore('dispatch', { targetId, specialist: event.specialist, objective: event.objective });
		const specialist = (event.specialist as string) ?? 'unknown';
		const objective = (event.objective as string) ?? '';
		const stageId = stageForSpecialist(specialist);

		setSession(targetId, (session) => {
			const existing = session.dispatches.find((d) => d.key === specialist);
			let dispatches: DispatchEntry[];
			if (existing) {
				dispatches = session.dispatches.map((d) =>
					d.key === specialist ? { ...d, status: 'active' as DispatchStatus } : d
				);
			} else {
				dispatches = [
					...session.dispatches,
					{
						key: specialist,
						label: KEY_TO_LABEL[specialist] ?? specialist,
						status: 'active',
						tools: []
					}
				];
			}

			const updated = {
				...session,
				lifecycle: 'running' as ScanLifecycle,
				currentStageId: stageId,
				dispatches,
				updatedAt: now(),
				stages: deriveStagesForLiveSession(session, stageId, { lifecycle: 'running' })
			};
			updated.progress = dispatchProgress(updated);

			return appendActivity(
				updated,
				stageId,
				`Dispatching to ${specialist}: ${objective.slice(0, 120) || 'executing task'}`
			);
		});
		return;
	}

	if (eventType === 'tool_start') {
		vxStore('tool_start', { targetId, specialist: event.specialist, tool: event.tool });
		const rawSpecialist = (event.specialist as string) ?? '';
		const key = resolveSpecialistKey(rawSpecialist);
		const tool = (event.tool as string) ?? 'unknown';

		setSession(targetId, (session) => {
			const dispatches = session.dispatches.map((d) => {
				if (d.key === key) {
					const tools = d.tools ? [...d.tools] : [];
					if (!tools.includes(tool)) tools.push(tool);
					return { ...d, tools };
				}
				return d;
			});
			return appendActivity(
				{ ...session, dispatches, updatedAt: now() },
				session.currentStageId,
				`[${KEY_TO_LABEL[key] ?? rawSpecialist}] Running ${tool}`
			);
		});
		return;
	}

	if (eventType === 'tool_result') {
		vxStore('tool_result', { targetId, specialist: event.specialist, tool: event.tool, success: event.success, ms: event.execution_ms });
		const rawSpecialist = (event.specialist as string) ?? '';
		const key = resolveSpecialistKey(rawSpecialist);
		const tool = (event.tool as string) ?? 'unknown';
		const success = event.success as boolean;
		const ms = (event.execution_ms as number) ?? 0;
		const label = success ? 'completed' : 'failed';
		const timing = ms > 0 ? ` (${(ms / 1000).toFixed(1)}s)` : '';
		setSession(targetId, (session) =>
			appendActivity(
				session,
				session.currentStageId,
				`[${KEY_TO_LABEL[key] ?? rawSpecialist}] ${tool} ${label}${timing}`
			)
		);
		return;
	}

	if (eventType === 'specialist_result') {
		vxStore('specialist_result', { targetId, specialist: event.specialist, success: event.success, nodes_added: event.nodes_added, creds_added: event.creds_added });
		const specialist = (event.specialist as string) ?? 'unknown';
		const success = event.success as boolean;
		const nodesAdded = (event.nodes_added as number) ?? 0;
		const credsAdded = (event.creds_added as number) ?? 0;
		const summary = ((event.summary as string) ?? '').slice(0, 200);

		setSession(targetId, (session) => {
			const dispatches = session.dispatches.map((d) =>
				d.key === specialist
					? {
							...d,
							status: (success ? 'done' : 'error') as DispatchStatus,
							summary,
							nodesAdded,
							credsAdded
						}
					: d
			);

			const updated = {
				...session,
				dispatches,
				updatedAt: now()
			};
			updated.progress = dispatchProgress(updated);

			const statusLabel = success ? 'OK' : 'failed';
			const details = [
				nodesAdded > 0 ? `+${nodesAdded} nodes` : null,
				credsAdded > 0 ? `+${credsAdded} creds` : null
			]
				.filter(Boolean)
				.join(', ');
			const detailsSuffix = details ? ` — ${details}` : '';
			const msg = `${KEY_TO_LABEL[specialist] ?? specialist} ${statusLabel}${detailsSuffix}${summary ? `. ${summary}` : ''}`;

			return appendActivity(updated, session.currentStageId, msg);
		});
		return;
	}

	if (eventType === 'phase_complete') {
		vxStore('phase_complete', { targetId, message: event.message });
		const message = (event.message as string) ?? 'Phase complete.';
		setSession(targetId, (session) => {
			const hasPhase2State =
				session.phase >= 2 ||
				session.dispatches.some((d) => PHASE2_KEYS.has(d.key) && d.status !== 'awaiting');

			// During stream replay, old phase_complete events can arrive after phase 2 has
			// already been confirmed. Ignore those stale events so we don't re-prompt.
			if (hasPhase2State) {
				return session;
			}

			const phase2Entries: DispatchEntry[] = ['exploit', 'post', 'report']
				.filter((k) => !session.dispatches.some((d) => d.key === k))
				.map((k) => ({
					key: k,
					label: KEY_TO_LABEL[k] ?? k,
					status: 'awaiting' as DispatchStatus
				}));

			const dispatches = [...session.dispatches, ...phase2Entries];

			const next = appendActivity(
				{
					...session,
					lifecycle: 'paused',
					dispatches,
					progress: Math.max(dispatchProgress({ ...session, dispatches, phase: 1 }), 55),
					reviewed: false,
					updatedAt: now(),
					stages: deriveStagesForLiveSession(session, session.currentStageId, {
						lifecycle: 'paused'
					})
				},
				session.currentStageId,
				message.slice(0, 200)
			);
			return next;
		});
		return;
	}

	if (eventType === 'report') {
		setSession(targetId, (session) => {
			const stageId: ScanStageId = 'findings_assembly';
			const dispatches = session.dispatches.map((d) =>
				d.key === 'report' ? { ...d, status: 'done' as DispatchStatus } : d
			);
			return appendActivity(
				{
					...session,
					dispatches,
					currentStageId: stageId,
					progress: Math.max(session.progress, STAGE_PROGRESS_BANDS[stageId].max - 2),
					updatedAt: now(),
					stages: deriveStagesForLiveSession(session, stageId, { lifecycle: 'running' })
				},
				stageId,
				'Final report generated.'
			);
		});
		return;
	}

	if (eventType === 'run_complete') {
		vxStore('run_complete', { targetId });
		const hasDocx = !!(event as any).has_docx;
		setSession(targetId, (session) => {
			const timestamp = now();
			const dispatches = session.dispatches.map((d) =>
				d.status === 'active' ? { ...d, status: 'done' as DispatchStatus } : d
			);
			return appendActivity(
				{
					...session,
					dispatches,
					lifecycle: 'complete',
					currentStageId: 'complete',
					progress: 100,
					endedAt: timestamp,
					updatedAt: timestamp,
					hasDocx,
					stages: deriveStagesForLiveSession(session, 'complete', { lifecycle: 'complete' })
				},
				'complete',
				'Agent run completed successfully.'
			);
		});
		return;
	}

	if (eventType === 'run_error') {
		vxStore('run_error', { targetId, error: event.error });
		const errorMsg = (event.error as string) ?? 'Unknown error';
		setSession(targetId, (session) => {
			const timestamp = now();
			const activeDispatch = session.dispatches.find((d) => d.status === 'active');
			const dispatches = session.dispatches.map((d) =>
				d.status === 'active' ? { ...d, status: 'error' as DispatchStatus } : d
			);
			return appendActivity(
				{
					...session,
					dispatches,
					lifecycle: 'error',
					progress: Math.max(session.progress, 50),
					endedAt: timestamp,
					updatedAt: timestamp,
					errorSpecialist: activeDispatch
						? (KEY_TO_LABEL[activeDispatch.key] ?? activeDispatch.key)
						: null,
					errorMessage: errorMsg.slice(0, 200),
					stages: deriveStagesForLiveSession(session, session.currentStageId, {
						lifecycle: 'error',
						error: true
					})
				},
				session.currentStageId,
				`Agent error: ${errorMsg.slice(0, 200)}`
			);
		});
		return;
	}
};

export const confirmPhase2 = (targetId: string) => {
	vxStore('confirmPhase2', { targetId });
	setSession(targetId, (session) => {
		const dispatches = session.dispatches.map((d) =>
			d.status === 'awaiting' ? { ...d, status: 'pending' as DispatchStatus } : d
		);
		const nextPhaseSession = {
			...session,
			dispatches,
			phase: 2
		};
		return appendActivity(
			{
				...nextPhaseSession,
				lifecycle: 'running',
				progress: dispatchProgress(nextPhaseSession),
				reviewed: false,
				updatedAt: now(),
				stages: deriveStagesForLiveSession(session, session.currentStageId, {
					lifecycle: 'running'
				})
			},
			session.currentStageId,
			'Phase 2 confirmed — proceeding with exploitation.'
		);
	});
};

export const skipExploitation = (targetId: string) => {
	vxStore('skipExploitation', { targetId });
	setSession(targetId, (session) => {
		const timestamp = now();
		const dispatches = session.dispatches.map((d) =>
			d.status === 'awaiting' || d.status === 'pending'
				? { ...d, status: 'skipped' as DispatchStatus }
				: d
		);
		return appendActivity(
			{
				...session,
				lifecycle: 'complete',
				dispatches,
				progress: 100,
				endedAt: timestamp,
				updatedAt: timestamp,
				stages: deriveStagesForLiveSession(session, 'complete', { lifecycle: 'complete' })
			},
			'complete',
			'Run ended — exploitation phase skipped by user.'
		);
	});
};

export const setReviewed = (targetId: string) => {
	setSession(targetId, (session) => ({
		...session,
		reviewed: true,
		updatedAt: now()
	}));
};

/**
 * Restore persisted scan sessions (e.g. from localStorage) into the in-memory
 * store. Only imports sessions whose targetId has no live/active entry already,
 * so reconnects never clobber a running scan.
 */
export const restoreScanSessions = (savedSessions: ScanSession[]) => {
	sessions.update((current) => {
		const next = { ...current };
		for (const session of savedSessions) {
			const existing = next[session.targetId];
			// Don't overwrite an active session
			if (existing && existing.lifecycle !== 'complete' && existing.lifecycle !== 'error') {
				continue;
			}
			next[session.targetId] = { ...session, specialist: session.specialist ?? null };
		}
		return next;
	});
};
