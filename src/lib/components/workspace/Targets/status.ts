import type { TargetStatus } from './types';

export const getTargetStatusClass = (status: TargetStatus) => {
	if (status === 'Active') {
		return 'text-sky-800 dark:text-sky-200 bg-sky-50/90 dark:bg-sky-950/40 border border-sky-200/60 dark:border-sky-800/55';
	}

	if (status === 'Pending') {
		return 'text-amber-800 dark:text-amber-200 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/55';
	}

	if (status === 'Paused') {
		return 'text-slate-700 dark:text-slate-300 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60';
	}

	if (status === 'Complete') {
		return 'text-teal-800 dark:text-teal-200 bg-teal-50/90 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-800/55';
	}

	return 'text-rose-800 dark:text-rose-200 bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800/55';
};
