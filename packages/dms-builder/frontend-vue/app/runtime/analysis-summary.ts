import type { MappingProposal, ProposedField, ProposedResource } from './database-types'

const MAX_CATEGORIES = 8
const MAX_TIME_AXES = 2

function categories(field: ProposedField): string {
	const values = field.profile?.categories ?? []
	const shown = values.slice(0, MAX_CATEGORIES).map((entry) => `${String(entry.value)} (${entry.rows})`)
	const more = values.length > MAX_CATEGORIES ? `, +${values.length - MAX_CATEGORIES} more` : ''
	return `${field.column}: ${shown.join(', ')}${more}`
}

function range(field: ProposedField): string {
	const bounds = field.profile?.range
	return bounds ? `${field.column} ${bounds.min} to ${bounds.max}` : field.column
}

function withTrait(resource: ProposedResource, trait: string): ProposedField[] {
	return resource.fields.filter((field) => field.profile?.traits.includes(trait))
}

function resourceLine(resource: ProposedResource): string {
	const rows = resource.rows === undefined ? 'rows unknown' : `${resource.rows} rows`
	const parts = [`- ${resource.relation} (${rows}, ${resource.tableView.value ? 'page' : 'stats only'})`]
	const label = resource.label.value
	if (label) parts.push(`label ${label}`)
	const time = withTrait(resource, 'time-axis').slice(0, MAX_TIME_AXES)
	if (time.length) parts.push(`time axes: ${time.map(range).join('; ')}`)
	const measures = withTrait(resource, 'measure')
	if (measures.length) parts.push(`measures: ${measures.map((field) => field.column).join(', ')}`)
	const enums = withTrait(resource, 'enum-like').filter((field) => field.profile?.categories?.length)
	if (enums.length) parts.push(`categories: ${enums.map(categories).join('; ')}`)
	const relations = resource.fields.filter((field) => field.relation)
	if (relations.length) {
		parts.push(`relations: ${relations.map((field) => `${field.column} -> ${field.relation?.value}`).join(', ')}`)
	}
	return parts.join(' | ')
}

/**
 * The analysis as the assistant needs it to plan: per relation its rows, time axes with their
 * ranges, measures, enum-like columns with categories, proposed label and relations. Short enough
 * to ride in the first message, so planning does not read the proposal back one tool call at a time.
 */
export function analysisSummary(proposal: MappingProposal): string {
	const lines = proposal.resources.map(resourceLine)
	const excluded = proposal.excluded.map((entry) => `${entry.relation} (${entry.reason})`)
	const open = proposal.open.filter((item) => item.kind !== 'schemas').length
	const tail = [
		excluded.length ? `Excluded: ${excluded.join(', ')}.` : '',
		open ? `${open} open item${open === 1 ? '' : 's'} left to settle.` : '',
	].filter(Boolean)
	return [`Analysis summary (${proposal.database.engine}, role ${proposal.database.role}):`, ...lines, ...tail].join(
		'\n',
	)
}
