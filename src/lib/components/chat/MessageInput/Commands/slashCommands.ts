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
		description: 'Full autonomous pentest — all specialists, both phases.',
		requiresTarget: true
	},
	{
		id: 'osint',
		command: '/osint',
		usage: '/osint <domain>',
		description: 'Subdomain and DNS discovery (domain targets only).',
		requiresTarget: true
	},
	{
		id: 'recon',
		command: '/recon',
		usage: '/recon <ip|host|cidr>',
		description: 'Port scan and service detection.',
		requiresTarget: true
	},
	{
		id: 'web',
		command: '/web',
		usage: '/web <ip|host|url>',
		description: 'Web app enumeration — nikto, gobuster, nuclei.',
		requiresTarget: true
	},
	{
		id: 'auth',
		command: '/auth',
		usage: '/auth <ip|host> [hints:password=X]',
		description: 'Credential attacks — hydra, kerbrute.',
		requiresTarget: true
	},
	{
		id: 'vuln',
		command: '/vuln',
		usage: '/vuln <ip|host> [hints:service=vsftpd 2.3.4]',
		description: 'Exploit research via searchsploit.',
		requiresTarget: true
	},
	{
		id: 'smb',
		command: '/smb',
		usage: '/smb <ip|host> [hints:username=administrator]',
		description: 'SMB enumeration — enum4linux, netexec.',
		requiresTarget: true
	},
	{
		id: 'ad',
		command: '/ad',
		usage: '/ad <ip|host>',
		description: 'Active Directory attacks — Kerberoasting, AS-REP roasting.',
		requiresTarget: true
	},
	{
		id: 'sql',
		command: '/sql',
		usage: '/sql <ip|host|url>',
		description: 'SQL injection testing.',
		requiresTarget: true
	},
	{
		id: 'exploit',
		command: '/exploit',
		usage: '/exploit <ip|host> hints:module=exploit/unix/ftp/vsftpd_234_backdoor',
		description: 'Metasploit exploitation — Phase 2, needs module hint.',
		requiresTarget: true
	},
	{
		id: 'post',
		command: '/post',
		usage: '/post <ip|host>',
		description: 'Post-exploitation credential dump.',
		requiresTarget: true
	},
	{
		id: 'report',
		command: '/report',
		usage: '/report <ip|host>',
		description: 'Generate final pentest report for target.',
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
