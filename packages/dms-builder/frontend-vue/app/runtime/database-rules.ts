import { t } from './i18n'

/** The rules the workspace says beside a choice; each has a sentence in the catalog under `database.rules`. */
const RULES: ReadonlySet<string> = new Set([
	'R1',
	'R2',
	'R3',
	'R4',
	'R5',
	'R6',
	'R7',
	'R8',
	'R9',
	'L1',
	'L2',
	'F1',
	'F2',
	'F3',
	'F4',
	'F5',
	'FL',
	'D1',
	'D2',
	'D3',
	'T1',
	'W1',
	'mapped',
])

/** What a rule decides, as the workspace says it beside a choice, in the active locale. */
export function ruleSentence(rule: string): string {
	return RULES.has(rule) ? t(`database.rules.${rule}`) : rule
}
