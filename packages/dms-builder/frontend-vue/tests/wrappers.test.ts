import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isStructural, paletteGroups } from '../app/runtime/catalog'
import { cloneDraft, findNode } from '../app/runtime/draft'
import { blockPosition } from '../app/runtime/naming'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockDraft, BlockNode, PageDraft } from '../app/runtime/types'
import {
	contentGuard,
	guardContent,
	ownerOf,
	tidyWrappers,
	unguardContent,
} from '../app/runtime/wrappers'
import { installFakeHost, withWrappers, type FakeBackend } from './support/builder-harness'

/**
 * The wrappers the editor writes so that nobody has to place them: a section's
 * row around a control, and a guard around a container's content, showing a
 * message instead when a source says there is nothing.
 */

const catalog = withWrappers()

function text(name: string): BlockDraft {
	return { name, type: 'Text', config: { content: name } }
}

function meter(name = 'meter'): BlockDraft {
	return { name, type: 'Meter', config: {} }
}

function section(name: string, ...children: BlockDraft[]): BlockDraft {
	return { name, type: 'Section', config: {}, children }
}

function row(name: string, block: BlockDraft, label = 'Meter'): BlockDraft {
	return { name, type: 'FieldRow', config: { label }, children: [block] }
}

function page(...blocks: BlockDraft[]): PageDraft {
	return { blocks }
}

/** The draft after `edit`, tidied the way every edit is. */
function after(before: PageDraft, edit: (draft: PageDraft) => void, known = catalog): PageDraft {
	const next = cloneDraft(before)
	edit(next)
	tidyWrappers(next, known, before)
	return next
}

function children(draft: PageDraft, path: string): string[] {
	return (findNode(draft, path)?.children ?? []).map((child) => `${child.name}:${child.type}`)
}

describe('a section’s rows', () => {
	it('are written around a control that arrives, not around a form or a notice', () => {
		const next = after(page(section('settings')), (draft) => {
			findNode(draft, 'settings')?.children?.push(meter(), text('notice'), {
				name: 'form',
				type: 'Form',
				config: {},
			})
		})
		expect(children(next, 'settings')).toEqual([
			'meterRow:FieldRow',
			'notice:Text',
			'form:Form',
		])
		expect(findNode(next, 'settings/meterRow')?.config).toEqual({ label: 'Meter' })
	})

	it('leave a control written straight into a section by hand as it is', () => {
		const written = page(section('settings', meter()), text('after'))
		const next = after(written, (draft) => draft.blocks.push(text('more')))
		expect(children(next, 'settings')).toEqual(['meter:Meter'])
	})

	it('go when the block they held leaves, and stay when written empty', () => {
		const before = page(section('settings', row('meterRow', meter()), {
			name: 'blank',
			type: 'FieldRow',
			config: {},
			children: [],
		}))
		const next = after(before, (draft) => {
			const kept = findNode(draft, 'settings/meterRow')
			if (kept) kept.children = []
			draft.blocks.push(text('moved'))
		})
		expect(children(next, 'settings')).toEqual(['blank:FieldRow'])
	})

	it('split when one is handed a second control, keeping its own block and label', () => {
		const before = page(section('settings', row('meterRow', meter(), 'Seats')))
		const next = after(before, (draft) => {
			findNode(draft, 'settings/meterRow')?.children?.unshift(meter('quota'))
		})
		expect(children(next, 'settings')).toEqual(['quotaRow:FieldRow', 'meterRow:FieldRow'])
		expect(findNode(next, 'settings/meterRow')?.config).toEqual({ label: 'Seats' })
		expect(children(next, 'settings/meterRow')).toEqual(['meter:Meter'])
	})

	it('are not written where the DMS has none, nor in a section moved elsewhere', () => {
		const older = { ...catalog, blocks: catalog.blocks.filter((block) => block.type !== 'FieldRow') }
		const arrived = after(page(section('settings')), (draft) => {
			findNode(draft, 'settings')?.children?.push(meter())
		}, older)
		expect(children(arrived, 'settings')).toEqual(['meter:Meter'])

		const moved = after(page(text('top'), section('settings')), (draft) => {
			const moving = draft.blocks.splice(1, 1)[0] as BlockDraft
			moving.name = 'elsewhere'
			moving.children?.push(meter())
			draft.blocks.unshift(moving)
		})
		expect(children(moved, 'elsewhere')).toEqual(['meter:Meter'])
	})
})

describe('a container’s guard', () => {
	it('takes the whole content of a region in, and gives it back where it stood', () => {
		const draft = page({ name: 'card', type: 'Card', config: {}, children: [text('a'), text('b')] })
		expect(guardContent(draft, 'card')).toBe(true)
		expect(children(draft, 'card')).toEqual(['guard:Guard'])
		expect(children(draft, 'card/guard')).toEqual(['a:Text', 'b:Text'])
		expect(contentGuard(findNode(draft, 'card'))?.config).toEqual({ when: 'empty' })

		expect(unguardContent(draft, 'card')).toBe(true)
		expect(children(draft, 'card')).toEqual(['a:Text', 'b:Text'])
	})

	it('guards one tab of a tab set, the others left alone', () => {
		const tabs: BlockDraft = {
			name: 'tabs',
			type: 'Tab',
			config: {},
			children: [{ ...text('one'), slot: 'first' }, { ...text('two'), slot: 'second' }],
		}
		const draft = page(tabs)
		guardContent(draft, 'tabs', 'second')
		const held = findNode(draft, 'tabs')?.children ?? []
		expect(held.map((child) => `${child.name}@${child.slot}`)).toEqual(['one@first', 'secondGuard@second'])
		expect(findNode(draft, 'tabs/secondGuard/two')?.slot).toBeUndefined()

		unguardContent(draft, 'tabs', 'second')
		expect(findNode(draft, 'tabs/two')?.slot).toBe('second')
	})

	it('is not written over nothing', () => {
		const draft = page({ name: 'card', type: 'Card', config: {}, children: [] })
		expect(guardContent(draft, 'card')).toBe(false)
	})

	it('takes in what arrives in its container, in the order it stands in', () => {
		const before = page({ name: 'card', type: 'Card', config: {}, children: [text('a')] })
		guardContent(before, 'card')
		const next = after(before, (draft) => {
			const card = findNode(draft, 'card')
			card?.children?.unshift(text('first'))
			card?.children?.push(text('last'))
		})
		expect(children(next, 'card')).toEqual(['guard:Guard'])
		expect(children(next, 'card/guard')).toEqual(['first:Text', 'a:Text', 'last:Text'])
	})

	it('goes once the edit leaves it nothing to guard', () => {
		const before = page({ name: 'card', type: 'Card', config: {}, children: [text('a')] })
		guardContent(before, 'card')
		const next = after(before, (draft) => {
			const guard = findNode(draft, 'card/guard')
			if (guard) guard.children = []
		})
		expect(children(next, 'card')).toEqual([])
	})

	it('holds a section’s rows, which still get written inside it', () => {
		const before = page(section('settings', row('meterRow', meter())))
		guardContent(before, 'settings')
		const next = after(before, (draft) => {
			findNode(draft, 'settings')?.children?.push(meter('quota'))
		})
		expect(children(next, 'settings/guard')).toEqual(['meterRow:FieldRow', 'quotaRow:FieldRow'])
	})
})

describe('what stands for a wrapper', () => {
	const draft = page(section('settings', row('meterRow', meter())), {
		name: 'card',
		type: 'Card',
		config: {},
		children: [{ name: 'guard', type: 'Guard', config: {}, children: [text('a')] }],
	})

	it('is the block a row holds, the container a guard guards', () => {
		expect(ownerOf(draft, 'settings/meterRow')).toBe('settings/meterRow/meter')
		expect(ownerOf(draft, 'card/guard')).toBe('card')
		expect(ownerOf(draft, 'card/guard/a')).toBe('card/guard/a')
	})

	it('is said to be in the section, never in a column of its row', () => {
		expect(blockPosition(draft, 'settings/meterRow/meter', catalog)).toBe('in Section')
		expect(blockPosition(draft, 'card/guard/a', catalog)).toBe('in Card')
	})

	it('is never offered by the palette, in either mode', () => {
		expect(isStructural(catalog, 'FieldRow')).toBe(true)
		expect(isStructural(catalog, 'Guard')).toBe(true)
		for (const advanced of [false, true]) {
			const offered = paletteGroups(catalog, '', advanced).flatMap((group) =>
				group.blocks.map((block) => block.type),
			)
			expect(offered).not.toContain('FieldRow')
			expect(offered).not.toContain('Guard')
			expect(offered).toContain('Meter')
		}
	})
})

describe('the editor around them', () => {
	let backend: FakeBackend
	let builder: BuilderController

	function node(name: string, type: string, nested?: BlockNode[]): BlockNode {
		return { path: name, name, type, editable: true, config: {}, children: nested }
	}

	beforeEach(async () => {
		vi.useFakeTimers()
		backend = installFakeHost()
		backend.catalog = withWrappers()
		backend.structure = {
			...backend.structure,
			blocks: [
				node('settings', 'Section', [
					{ ...node('seatsRow', 'FieldRow', [node('seats', 'Meter')]), path: 'settings/seatsRow' },
				]),
				node('card', 'Card', [{ ...node('note', 'Text'), path: 'card/note' }]),
			],
		}
		builder = useBuilder()
		builder.close()
		await builder.open('/reports/sales')
		await vi.advanceTimersByTimeAsync(200)
	})

	afterEach(() => {
		builder.close()
		vi.useRealTimers()
	})

	const names = (path: string): string[] =>
		(findNode(builder.session.value.draft as PageDraft, path)?.children ?? []).map((child) => child.name)

	it('adds into the section, not into the row of the control selected', () => {
		builder.select('settings/seatsRow/seats')
		expect(builder.paletteTarget.value).toBe('settings')
		builder.addBlock('Meter', builder.paletteTarget.value, null)
		expect(names('settings')).toEqual(['seatsRow', 'meterRow'])
	})

	it('selects a row through its control, and a guard through its container', () => {
		builder.select('settings/seatsRow')
		expect(builder.session.value.selection).toBe('settings/seatsRow/seats')
		builder.mutate((draft) => guardContent(draft, 'card'))
		builder.select('card/guard')
		expect(builder.session.value.selection).toBe('card')
	})

	it('moves a control with its row', () => {
		builder.addBlock('Meter', 'settings', null)
		builder.nudge('settings/seatsRow/seats', 1)
		expect(names('settings')).toEqual(['meterRow', 'seatsRow'])
	})

	it('says a guard with no source is its container’s to fill in', () => {
		builder.mutate((draft) => guardContent(draft, 'card'))
		expect(builder.problems.value).toContain('card')
		expect(builder.problems.value).not.toContain('card/guard')
	})
})
