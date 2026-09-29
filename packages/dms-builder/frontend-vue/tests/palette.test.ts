import { describe, expect, it } from 'vitest'
import { paletteGroups } from '../app/runtime/catalog'
import { testCatalog } from './support/builder-harness'
import type { BlockCatalog, BlockTypeDescriptor } from '../app/runtime/types'

/**
 * What the palette offers, which is not everything the catalog carries.
 *
 * A type a container names as its one allowed child is scaffolding the editor
 * writes around what is dropped in; offering it is offering a component whose
 * only possible use is to be created for you. That rule is the catalog's own, so
 * these read it back off catalogs rather than off a list of type names.
 *
 * The layout blocks are masked as well: the page is a grid its author never
 * sees, and the editor writes the rows, columns and stacks a placement takes.
 */

const catalog = testCatalog()

function offered(source: BlockCatalog, query = '', advanced = false): string[] {
	return paletteGroups(source, query, advanced).flatMap((group) =>
		group.blocks.map((block) => block.type),
	)
}

function labelled(source: BlockCatalog, query = ''): string[] {
	return paletteGroups(source, query).flatMap((group) =>
		group.blocks.map((block) => block.label ?? block.type),
	)
}

/** A catalog with the pair declared under other names, and one row kept spare. */
function frameCatalog(): BlockCatalog {
	return {
		...catalog,
		blocks: [
			...catalog.blocks,
			container('Frame', { allowedChildren: ['Slat'] }),
			container('Slat'),
		],
	}
}

/**
 * A container naming two allowed children — nothing the catalog carries today,
 * and the case that tells the rule from a rule about `allowedChildren` at large:
 * neither named type is one this container would build on its own.
 */
function panelCatalog(): BlockCatalog {
	return {
		...catalog,
		blocks: [
			...catalog.blocks,
			container('Panel', { allowedChildren: ['Text', 'Section'] }),
		],
	}
}

/** The charts on their own, beside the card that draws with two of them. */
function chartCatalog(): BlockCatalog {
	return {
		...catalog,
		blocks: [
			...catalog.blocks,
			chart('ChartLine', 'Line Chart'),
			chart('ChartArea', 'Area Chart'),
			chart('ChartGauge', 'Gauge'),
		],
	}
}

function chart(type: string, label: string): BlockTypeDescriptor {
	return {
		type,
		componentName: `Dms${type}`,
		label,
		group: 'visualization',
		config: {},
		shapeSource: 'test',
	}
}

function container(
	type: string,
	extra: Partial<BlockTypeDescriptor> = {},
): BlockTypeDescriptor {
	return {
		type,
		componentName: `Dms${type}`,
		label: type,
		group: 'layout',
		container: true,
		config: {},
		shapeSource: 'test',
		...extra,
	}
}

describe('the components the palette lists', () => {
	it('leaves out the row a Grid writes for itself', () => {
		expect(offered(catalog)).not.toContain('GridRow')
		expect(labelled(catalog)).not.toContain('Grid row')
	})

	it('leaves out every block that only lays others out', () => {
		expect(offered(catalog)).not.toContain('Grid')
		expect(offered(catalog)).not.toContain('HStack')
		expect(offered(catalog)).not.toContain('VStack')
		expect(labelled(catalog)).not.toContain('Vertical stack')
	})

	it('offers every other type the catalog carries', () => {
		expect(offered(catalog)).toEqual([
			'Section',
			'Tab',
			'PeriodSelector',
			'Text',
			'TableView',
			'Form',
			'ChartCard',
		])
	})

	it('masks the layout and the row, and nothing else', () => {
		const declaring = catalog.blocks
			.filter((block) => block.allowedChildren !== undefined)
			.map((block) => block.type)
		expect(declaring, 'the only allowedChildren in the catalog').toEqual(['Grid'])

		const hidden = catalog.blocks
			.map((block) => block.type)
			.filter((type) => !offered(catalog).includes(type))
		expect(hidden).toEqual(['HStack', 'VStack', 'Grid', 'GridRow'])
	})

	it('masks whatever pair the catalog declares next, under any name', () => {
		expect(offered(frameCatalog())).toContain('Frame')
		expect(offered(frameCatalog())).not.toContain('Slat')
		expect(offered(frameCatalog()), 'the first pair too').not.toContain('GridRow')
	})

	it('masks neither child of a container that names two', () => {
		expect(offered(panelCatalog())).toContain('Text')
		expect(offered(panelCatalog())).toContain('Section')
		expect(offered(panelCatalog())).toContain('Panel')
	})

	it('still answers the search box, and never with a type it masks', () => {
		expect(offered(catalog, 'section')).toEqual(['Section'])
		expect(offered(catalog, 'stack'), 'searching for it does not reveal it').toEqual(
			[],
		)
		expect(offered(catalog, 'grid')).toEqual([])
		expect(offered(catalog, 'row')).toEqual([])
	})

	it('answers nothing at all before the catalog has arrived', () => {
		expect(paletteGroups(null, '')).toEqual([])
	})
})

describe('the charts a chart card draws with', () => {
	it('leaves them to the card in the simple mode', () => {
		const types = offered(chartCatalog())
		expect(types).toContain('ChartCard')
		expect(types).not.toContain('ChartLine')
		expect(types).not.toContain('ChartArea')
		expect(types, 'a chart the card does not take').toContain('ChartGauge')
	})

	it('finds the card when one of them is searched for', () => {
		expect(offered(chartCatalog(), 'line')).toEqual(['ChartCard'])
		expect(offered(chartCatalog(), 'area chart')).toEqual(['ChartCard'])
	})

	it('offers them on their own in the advanced view', () => {
		const types = offered(chartCatalog(), '', true)
		expect(types).toContain('ChartCard')
		expect(types).toContain('ChartLine')
		expect(types).toContain('ChartArea')
		expect(offered(chartCatalog(), 'line', true)).toEqual(['ChartLine'])
	})
})
