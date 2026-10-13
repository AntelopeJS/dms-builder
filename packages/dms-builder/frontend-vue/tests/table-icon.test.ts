import { describe, expect, it } from 'vitest'
import {
	blockLineIcon,
	TABLE_BLOCK_ICON,
	tableIcon,
	takesTableIcons,
} from '../app/runtime/table-icon'
import type { BlockCatalog, ResourceSummary } from '../app/runtime/types'

/**
 * A table's icon: its own when its code declares one, the generic one of the
 * place it is drawn in otherwise — and a table block drawn with it, as the DMS
 * draws one.
 */

const ticket: ResourceSummary = {
	ref: 'ticket',
	className: 'Ticket',
	tableName: 'tickets',
	route: '/api/ticket',
	fieldCount: 1,
	icon: 'i-ph-ticket',
}
const plain: ResourceSummary = { ...ticket, ref: 'plain', icon: undefined }

describe('a table drawn on a line', () => {
	it('takes its own icon, in the weight of a line', () => {
		expect(tableIcon(ticket)).toBe('i-ph-ticket-light')
	})

	it('falls back on the generic icon of where it is drawn', () => {
		expect(tableIcon(plain)).toBe('i-ph-database-light')
		expect(tableIcon(undefined, TABLE_BLOCK_ICON)).toBe('i-ph-table-light')
	})
})

describe('a block drawn on a line', () => {
	it('is a table block drawn with the icon of the table it lists', () => {
		const block = { name: 'list', type: 'TableView', controller: 'ticket' }
		expect(blockLineIcon(block, 'i-ph-table', [ticket])).toBe('i-ph-ticket-light')
		expect(
			blockLineIcon({ ...block, controller: 'plain' }, 'i-ph-table', [ticket, plain]),
		).toBe('i-ph-table-light')
	})

	it('keeps its type icon for any other block over a table', () => {
		const form = { name: 'form', type: 'ResourceForm', controller: 'ticket' }
		expect(blockLineIcon(form, 'i-ph-note-pencil', [ticket])).toBe(
			'i-ph-note-pencil-light',
		)
	})
})

describe('a DMS taking table icons', () => {
	it('says so in its catalog, and one that predates them does not', () => {
		const catalog = { blocks: [], dataTypes: [], reservedFieldNames: [], generatedAt: '' }
		expect(takesTableIcons({ ...catalog, tableIcons: true } as BlockCatalog)).toBe(true)
		expect(takesTableIcons(catalog as BlockCatalog)).toBe(false)
		expect(takesTableIcons(null)).toBe(false)
	})
})
