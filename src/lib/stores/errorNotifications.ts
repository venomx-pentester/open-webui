import { writable } from 'svelte/store';

export type ErrorNotificationSeverity = 'error' | 'warning';

export type ErrorNotification = {
	id: string;
	title: string;
	message: string;
	severity: ErrorNotificationSeverity;
	source?: string;
	targetId?: string;
	targetName?: string;
	createdAt: number;
};

type NotifyErrorOptions = {
	title?: string;
	source?: string;
	targetId?: string;
	targetName?: string;
	severity?: ErrorNotificationSeverity;
	dedupeKey?: string;
};

const DEDUPE_WINDOW_MS = 10000;
const recentNotifications = new Map<string, number>();

const randomId = () =>
	typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID()
		: `error-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

export const errorNotifications = writable<ErrorNotification[]>([]);

export const normalizeErrorMessage = (error: unknown, fallback = 'An unexpected error occurred.') => {
	if (!error) {
		return fallback;
	}

	if (typeof error === 'string') {
		return error;
	}

	if (error instanceof Error) {
		return error.message || fallback;
	}

	if (typeof error === 'object') {
		const value = error as {
			detail?: unknown;
			message?: unknown;
			error?: unknown;
		};

		if (typeof value.detail === 'string') {
			return value.detail;
		}

		if (typeof value.message === 'string') {
			return value.message;
		}

		if (typeof value.error === 'string') {
			return value.error;
		}

		if (
			value.error &&
			typeof value.error === 'object' &&
			'message' in value.error &&
			typeof (value.error as { message?: unknown }).message === 'string'
		) {
			return (value.error as { message: string }).message;
		}

		try {
			return JSON.stringify(error);
		} catch {
			return fallback;
		}
	}

	return String(error);
};

export const notifyError = (error: unknown, options: NotifyErrorOptions = {}) => {
	const message = normalizeErrorMessage(error);
	const title = options.title ?? 'Operation failed';
	const dedupeKey = options.dedupeKey ?? `${title}:${options.source ?? ''}:${message}`;
	const timestamp = Date.now();
	const lastSeen = recentNotifications.get(dedupeKey);

	if (lastSeen && timestamp - lastSeen < DEDUPE_WINDOW_MS) {
		return null;
	}

	recentNotifications.set(dedupeKey, timestamp);

	const notification: ErrorNotification = {
		id: randomId(),
		title,
		message,
		severity: options.severity ?? 'error',
		source: options.source,
		targetId: options.targetId,
		targetName: options.targetName,
		createdAt: timestamp
	};

	errorNotifications.update((current) => [...current, notification]);
	return notification;
};

export const clearErrorNotification = (id: string) => {
	errorNotifications.update((current) => current.filter((notification) => notification.id !== id));
};
