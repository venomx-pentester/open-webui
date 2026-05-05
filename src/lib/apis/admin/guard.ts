import { WEBUI_API_BASE_URL } from '$lib/constants';

export type S4NotificationItem = {
	guard_id: string;
	session_id: string | number | null;
	chat_id: string | null;
	user_id: string | null;
	category: string;
	intent_label: string | null;
	prompt_content: string | null;
	created_at: string;
};

export const getS4Notifications = async (token: string, limit = 50) => {
	let error = null;
	const searchParams = new URLSearchParams({ limit: String(limit) });

	const res = await fetch(
		`${WEBUI_API_BASE_URL}/guard/notifications/s4?${searchParams.toString()}`,
		{
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			}
		}
	)
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			console.error(err);
			error = err?.detail ?? err;
			return null;
		});

	if (error) {
		throw error;
	}

	return (Array.isArray(res) ? res : []) as S4NotificationItem[];
};
