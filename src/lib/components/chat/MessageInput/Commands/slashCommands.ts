export type OfficialSlashCommand = {
	id: string;
	command: string;
	usage: string;
	description: string;
	requiresTarget?: boolean;
};

export const OFFICIAL_SLASH_COMMANDS: OfficialSlashCommand[] = [
	{
		id: 'pentest',
		command: '/pentest',
		usage: '/pentest <ip|host|url|cidr>',
		description: 'Start the pentest pipeline for a reachable target.',
		requiresTarget: true
	}
];

const SLASH_COMMAND_PATTERN = /^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/;

export const parseSlashCommand = (input: string) => {
	const trimmed = (input ?? '').trim();
	const match = trimmed.match(SLASH_COMMAND_PATTERN);

	if (!match) {
		return {
			isSlash: false,
			name: '',
			args: ''
		};
	}

	return {
		isSlash: true,
		name: match[1].toLowerCase(),
		args: (match[2] ?? '').trim()
	};
};

export const isOfficialSlashCommand = (name: string) =>
	OFFICIAL_SLASH_COMMANDS.some((command) => command.id === (name ?? '').trim().toLowerCase());
