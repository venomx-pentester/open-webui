import { get, writable } from 'svelte/store';
import { WEBUI_BASE_URL } from '$lib/constants';
import { notifyError } from '$lib/stores/errorNotifications';
import { applyAgentEvent, getScanSessionForTarget } from '$lib/stores/scanSessions';
import { vxConn, vxSSE, vxError, vxLog } from '$lib/utils/venomxDebug';

export type AgentEventType =
	| 'run_start'
	| 'dispatch'
	| 'specialist_result'
	| 'tool_start'
	| 'tool_result'
	| 'phase_complete'
	| 'report'
	| 'run_complete'
	| 'run_error'
	| '__done__'
	| 'proxy_error';

export type AgentEvent = {
	type: AgentEventType;
	run_id?: string;
	ts?: number;
	[key: string]: unknown;
};

type Connection = {
	eventSource: EventSource;
	runId: string;
	targetId: string;
};

const connections = new Map<string, Connection>();

/** Tracks targets that already matched a Run ID in chat (prevents reconnecting on every token). */
const handshakeTargets = new Set<string>();

export const hasAgentHandshake = (targetId: string): boolean => handshakeTargets.has(targetId);

export const registerAgentHandshake = (targetId: string) => {
	handshakeTargets.add(targetId);
};

export const clearAgentHandshake = (targetId: string) => {
	handshakeTargets.delete(targetId);
};

export const activeRunId = writable<string | null>(null);
export const activeRunTargetId = writable<string | null>(null);

const STREAM_URL = `${WEBUI_BASE_URL}/api/v1/agent/run`;

export const connectToRun = (targetId: string, runId: string) => {
	const existing = connections.get(targetId);
	if (existing) {
		if (existing.runId === runId) {
			return;
		}
		disconnectRun(targetId);
	}

	const url = `${STREAM_URL}/${runId}/stream`;
	const es = new EventSource(url);

	const conn: Connection = { eventSource: es, runId, targetId };
	connections.set(targetId, conn);
	activeRunId.set(runId);
	activeRunTargetId.set(targetId);

	vxConn('EventSource OPEN', runId, targetId);

	es.onmessage = (msg) => {
		if (!msg.data || msg.data === '[DONE]') {
			return;
		}

		try {
			const event: AgentEvent = JSON.parse(msg.data);
			vxSSE(targetId, event);
			applyAgentEvent(targetId, event);

			if (
				event.type === '__done__' ||
				event.type === 'run_complete' ||
				event.type === 'run_error' ||
				event.type === 'proxy_error'
			) {
				disconnectRun(targetId);
			}
		} catch {
			// Ignore malformed JSON lines
		}
	};

	es.onerror = () => {
		const current = connections.get(targetId);
		if (
			current &&
			current.runId === runId &&
			current.eventSource.readyState === EventSource.CLOSED
		) {
			vxError('EventSource CLOSED (error)', { runId, targetId });
			const session = getScanSessionForTarget(targetId);
			notifyError('The live pentest event stream disconnected before completion.', {
				title: 'Pentest stream disconnected',
				source: 'pentest',
				targetId,
				targetName: session?.targetName,
				dedupeKey: `agent-stream-closed:${targetId}:${runId}`
			});
			disconnectRun(targetId);
		}
	};
};

export const disconnectRun = (targetId: string) => {
	const conn = connections.get(targetId);
	if (!conn) {
		return;
	}

	vxConn('EventSource CLOSE', conn.runId, targetId);
	conn.eventSource.close();
	connections.delete(targetId);
	clearAgentHandshake(targetId);

	if (get(activeRunTargetId) === targetId) {
		activeRunId.set(null);
		activeRunTargetId.set(null);
	}
};

export const isConnected = (targetId: string): boolean => connections.has(targetId);

/**
 * Signal the agent to proceed into Phase 2.
 * Returns true on success, false if the call failed.
 */
export const resumeAgentRun = async (runId: string): Promise<boolean> => {
	vxLog('ui', `ACTION  resumeAgentRun  run:${runId.slice(0, 8)}`);
	try {
		const res = await fetch(`${WEBUI_BASE_URL}/api/v1/agent/run/${runId}/resume`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${localStorage.token}`,
				'Content-Type': 'application/json'
			}
		});
		if (!res.ok) {
			notifyError('Unable to resume the pentest run.', {
				title: 'Pentest resume failed',
				source: 'pentest',
				dedupeKey: `resume-run:${runId}`
			});
		}
		return res.ok;
	} catch (error) {
		notifyError(error, {
			title: 'Pentest resume failed',
			source: 'pentest',
			dedupeKey: `resume-run:${runId}`
		});
		return false;
	}
};

/**
 * Drop the EventSource and open a new one for the same run (SSE replay / catch-up).
 * Requires `agentRunId` on the scan session (from chat Run ID or `run_start`).
 */
export const reconnectAgentStream = (targetId: string): boolean => {
	const session = getScanSessionForTarget(targetId);
	const runId = session?.agentRunId ?? null;
	if (!runId) {
		return false;
	}
	clearAgentHandshake(targetId);
	disconnectRun(targetId);
	connectToRun(targetId, runId);
	registerAgentHandshake(targetId);
	return true;
};
