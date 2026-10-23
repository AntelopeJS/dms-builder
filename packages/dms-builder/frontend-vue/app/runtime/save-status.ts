/**
 * What the bar says about the draft, in one word and a count: saved, waiting,
 * being saved, held back by something to fix, or turned down. Always on screen
 * and the way into the list of changes, so it is the one place an author looks
 * to know whether their work is safe.
 */

import { t } from './i18n'

export type SaveStatusKind = 'clean' | 'dirty' | 'saving' | 'saved' | 'fix' | 'error'

export interface SaveStatus {
	kind: SaveStatusKind
	label: string
	icon: string
}

export interface SaveStatusInput {
	saving: boolean
	dirty: boolean
	/** How many changes the list holds. */
	changes: number
	/** How many blocks still need a setting before the page can be saved. */
	problems: number
	lastSave: { outcome: 'saved' | 'failed'; at: number } | null
}

/** The time of a save, as the bar says it: `14:12`. */
export function clockTime(at: number): string {
	const date = new Date(at)
	const pad = (value: number): string => String(value).padStart(2, '0')
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function saveStatus(input: SaveStatusInput): SaveStatus {
	const unsaved = input.changes
		? t('save_status.unsaved_count', {}, input.changes)
		: t('save_status.unsaved')
	if (input.saving) {
		return { kind: 'saving', label: t('save_status.saving'), icon: 'i-ph-circle-notch' }
	}
	if (input.dirty && input.lastSave?.outcome === 'failed') {
		return {
			kind: 'error',
			label: t('save_status.failed'),
			icon: 'i-ph-warning-circle-light',
		}
	}
	if (input.problems) {
		return {
			kind: 'fix',
			label: !input.dirty
				? t('save_status.fix', { problems: input.problems })
				: input.changes
					? t('save_status.fix_unsaved', { problems: input.problems, changes: input.changes })
					: t('save_status.fix_some_unsaved', { problems: input.problems }),
			icon: 'i-ph-warning-light',
		}
	}
	if (input.dirty) {
		return { kind: 'dirty', label: unsaved, icon: 'i-ph-circle-fill' }
	}
	if (input.lastSave?.outcome === 'saved') {
		return {
			kind: 'saved',
			label: t('save_status.saved', { time: clockTime(input.lastSave.at) }),
			icon: 'i-ph-check-circle-light',
		}
	}
	return { kind: 'clean', label: t('save_status.clean'), icon: 'i-ph-check-circle-light' }
}
