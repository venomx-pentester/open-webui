/**
 * VenomX debug logger.
 *
 * All output is prefixed with [VenomX] so you can filter the browser DevTools
 * console with that string.  Each category gets its own colour so the log is
 * scannable at a glance:
 *
 *   SSE events      — cyan
 *   Store mutations — purple
 *   UI actions      — orange
 *   Connections     — green
 *   Errors          — red (via console.error)
 */

const P = '[VenomX]';

const FMT = {
	sse:    'color:#38bdf8;font-weight:bold',  // cyan   — raw SSE payloads
	store:  'color:#a78bfa;font-weight:bold',  // purple — scanSessions mutations
	ui:     'color:#fb923c;font-weight:bold',  // orange — button / slash-command actions
	conn:   'color:#4ade80;font-weight:bold',  // green  — EventSource lifecycle
	warn:   'color:#facc15;font-weight:bold',  // yellow — unexpected but non-fatal
};

// ─── Generic helpers ──────────────────────────────────────────────────────────

export const vxLog = (category: keyof typeof FMT, label: string, ...args: unknown[]) =>
	console.log(`%c${P} ${label}`, FMT[category], ...args);

export const vxGroup = (
	category: keyof typeof FMT,
	label: string,
	fn: () => void,
	collapsed = true,
) => {
	const method = collapsed ? console.groupCollapsed : console.group;
	method(`%c${P} ${label}`, FMT[category]);
	fn();
	console.groupEnd();
};

export const vxError = (label: string, ...args: unknown[]) =>
	console.error(`%c${P} ${label}`, 'color:#f87171;font-weight:bold', ...args);

export const vxWarn = (label: string, ...args: unknown[]) =>
	console.warn(`%c${P} ${label}`, FMT.warn, ...args);

// ─── Specialised shortcuts ────────────────────────────────────────────────────

/**
 * Log a raw SSE event.  Shows type + key fields inline; full payload in group.
 */
export const vxSSE = (targetId: string, event: { type: string; [k: string]: unknown }) => {
	const { type, ts, run_id, ...rest } = event;
	const summary = Object.entries(rest)
		.slice(0, 4)
		.map(([k, v]) => `${k}=${JSON.stringify(v)}`)
		.join('  ');
	vxGroup('sse', `SSE ← ${type}  [target:${targetId.slice(0, 8)}]  ${summary}`, () => {
		console.log('full payload:', event);
		if (ts) console.log('ts:', ts);
	});
};

/**
 * Log a UI button / slash-command action.
 */
export const vxAction = (label: string, context?: Record<string, unknown>) => {
	if (context) {
		vxGroup('ui', `ACTION  ${label}`, () => console.table(context));
	} else {
		vxLog('ui', `ACTION  ${label}`);
	}
};

/**
 * Log an EventSource lifecycle event.
 */
export const vxConn = (label: string, runId?: string | null, targetId?: string) => {
	const parts = [label];
	if (targetId) parts.push(`target:${targetId.slice(0, 8)}`);
	if (runId)    parts.push(`run:${runId.slice(0, 8)}`);
	vxLog('conn', parts.join('  '));
};

/**
 * Log a scanSessions store mutation.
 */
export const vxStore = (label: string, context?: Record<string, unknown>) => {
	if (context) {
		vxGroup('store', `STORE  ${label}`, () => console.table(context));
	} else {
		vxLog('store', `STORE  ${label}`);
	}
};
