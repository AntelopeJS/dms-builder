import { pointingAt, type ResourceDraft } from './database'
import type { MappedRelation } from './database-types'

/**
 * The titles of the mapped relations whose columns show one of `relations` by its label, when a
 * remap changes that label: their pages are written again too.
 */
export function relabelledBy(
	relations: string[],
	drafts: Record<string, ResourceDraft>,
	read: Record<string, ResourceDraft>,
	mapped: MappedRelation[],
): string[] {
	const changed = relations.filter((relation) => drafts[relation]?.label !== read[relation]?.label)
	const pointing = changed.flatMap((relation) => pointingAt(null, mapped, relation))
	return [...new Set(pointing.map((column) => column.split('.').slice(0, -1).join('.')))]
		.filter((relation) => !relations.includes(relation))
		.map((relation) => drafts[relation]?.title ?? relation)
}
