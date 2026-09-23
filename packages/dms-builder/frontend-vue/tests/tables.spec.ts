import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import Bar from '../app/components/Bar.vue'
import Config from '../app/components/Config.vue'
import FieldForm from '../app/components/FieldForm.vue'
import Option from '../app/components/Option.vue'
import Overlay from '../app/components/Overlay.vue'
import ResourcePanel from '../app/components/ResourcePanel.vue'
import { installFakeHost, type FakeBackend } from './support/builder-harness'
import {
	findAll,
	fire,
	installDocumentStub,
	mount,
	stub,
	textOf,
	type TestNode,
} from './support/render'
import { useBuilder, type BuilderController } from '../app/runtime/session'
import type { BlockNode, ResourceStructure } from '../app/runtime/types'

/**
 * What someone who never wrote a line of the app reaches the database through:
 * the tables, from the bar, whether or not a block reads one yet — and the
 * deletions that take rows with them, which have to be asked twice.
 */

let backend: FakeBackend
let builder: BuilderController

installDocumentStub()
Object.assign(globalThis, { resolveDmsComponent: () => undefined })

const RESOURCES = 'GET /api/builder/resources'
const RESOURCE = 'GET /api/builder/resource'

function ticket(): ResourceStructure {
	return {
		ref: 'ticket',
		className: 'Ticket',
		tableName: 'tickets',
		route: '/api/ticket',
		version: 'r1',
		fields: [
			{
				name: 'title',
				label: 'Title',
				dataType: { $dataType: 'string' },
				listable: true,
			} as ResourceStructure['fields'][number],
		],
	}
}

function summary(ref: string) {
	return { ref, className: 'Ticket', tableName: 'tickets', route: `/api/${ref}`, fieldCount: 1 }
}

async function openEditor(blocks: BlockNode[] = []): Promise<void> {
	backend.structure = { ...backend.structure, blocks }
	await builder.open('/reports/sales')
	await vi.advanceTimersByTimeAsync(200)
}

function buttonLabelled(root: TestNode, label: string): TestNode {
	const found = findAll(
		root,
		(node) => node.tag === 'UButton' && node.props.label === label,
	)[0]
	if (!found) {
		throw new Error(`no button labelled "${label}"`)
	}
	return found
}

function labels(root: TestNode): string[] {
	return findAll(root, (node) => node.tag === 'UButton').map((node) =>
		String(node.props.label ?? ''),
	)
}

function picker(root: TestNode, placeholder: string): TestNode {
	const found = findAll(
		root,
		(node) => node.tag === 'USelectMenu' && node.props.placeholder === placeholder,
	)[0]
	if (!found) {
		throw new Error(`no picker reading "${placeholder}"`)
	}
	return found
}

/** Fire a control's own `update:modelValue`, the way a user's input does. */
function write(node: TestNode, value: unknown): void {
	const handler = node.props['onUpdate:modelValue']
	if (typeof handler !== 'function') {
		throw new Error(`<${node.tag}> writes nothing`)
	}
	;(handler as (value: unknown) => void)(value)
}

function deletions(): string[] {
	return backend.calledPaths().filter((call) => call.startsWith('DELETE '))
}

/** Let a write and the reads it triggers answer, then render what they left. */
async function settle(): Promise<void> {
	for (let round = 0; round < 5; round += 1) {
		await vi.advanceTimersByTimeAsync(0)
	}
	await nextTick()
}

beforeEach(() => {
	vi.useFakeTimers()
	backend = installFakeHost()
	builder = useBuilder()
	builder.close()
})

afterEach(() => {
	builder.close()
	vi.useRealTimers()
})

describe('the tables, from the bar', () => {
	it('are one click away, with no block selected', async () => {
		await openEditor()
		const { root } = mount(Bar)
		await nextTick()

		fire(buttonLabelled(root, 'Tables'), 'click')

		expect(builder.session.value.view).toBe('resource')
	})

	it('let a project with none create its first one, under the ref it gets', async () => {
		await openEditor()
		builder.setView('resource')
		const { root } = mount(ResourcePanel)
		await nextTick()

		const tables = picker(root, 'Choose a table…')
		expect(tables.props.disabled, 'nothing to pick yet').toBe(true)
		expect(textOf(root)).toContain('No table yet')

		// The engine names the ref; the panel follows it rather than what was typed.
		backend.answers['POST /api/builder/resources'] = {
			ok: true,
			data: { ref: 'support_ticket' },
			changes: [],
		}
		backend.answers[RESOURCES] = [summary('support_ticket')]
		backend.answers[RESOURCE] = {
			ok: true,
			data: { ...ticket(), ref: 'support_ticket' },
			changes: [],
		}
		const name = findAll(
			root,
			(node) => node.tag === 'UInput' && node.props.placeholder === 'product',
		)[0]!
		write(name, 'Support ticket')
		await nextTick()
		fire(buttonLabelled(root, 'Create the table and its API'), 'click')
		await settle()

		expect(picker(root, 'Choose a table…').props['model-value']).toBe(
			'support_ticket',
		)
	})
})

describe('a deletion that takes data with it', () => {
	async function panelOnTicket(): Promise<TestNode> {
		backend.answers[RESOURCES] = [summary('ticket')]
		backend.answers[RESOURCE] = { ok: true, data: ticket(), changes: [] }
		await openEditor()
		builder.setView('resource')
		const { root } = mount(ResourcePanel)
		await nextTick()
		write(picker(root, 'Choose a table…'), 'ticket')
		await settle()
		return root
	}

	it('asks before a field and its column go', async () => {
		const root = await panelOnTicket()
		const header = findAll(
			root,
			(node) =>
				node.tag === 'div' &&
				typeof node.props.onClick === 'function' &&
				textOf(node).includes('title'),
		)[0]!
		fire(header, 'click')
		await nextTick()

		fire(buttonLabelled(root, 'Remove this field'), 'click')
		await nextTick()
		expect(deletions(), 'nothing written on the first click').toEqual([])
		expect(textOf(root)).toContain('drops its column')

		fire(buttonLabelled(root, 'Remove the field and its data'), 'click')
		await settle()
		expect(deletions()).toEqual(['DELETE /api/builder/resource/fields'])
	})

	it('asks before a table and every row in it go', async () => {
		const root = await panelOnTicket()

		fire(buttonLabelled(root, 'Delete this resource'), 'click')
		await nextTick()
		expect(deletions(), 'nothing written on the first click').toEqual([])
		expect(labels(root)).toContain('Keep it')

		fire(buttonLabelled(root, 'Delete the table and its rows'), 'click')
		await settle()
		expect(deletions()).toEqual(['DELETE /api/builder/resource'])
	})
})

describe('a write that went through with a warning', () => {
	const shell = (): Record<string, Component> => ({
		DmsBuilderBar: stub('DmsBuilderBar'),
		DmsBuilderCanvas: stub('DmsBuilderCanvas'),
		DmsBuilderRail: stub('DmsBuilderRail'),
		DmsBuilderBlockMenu: stub('DmsBuilderBlockMenu'),
	})
	const fallback = {
		code: 'datatype_fallback',
		message: 'field "rank" dataType "made_up" has no DB-type mapping',
	}

	it('says what it had to settle for, once, until dismissed', async () => {
		backend.answers[RESOURCE] = { ok: true, data: ticket(), changes: [] }
		await openEditor()
		backend.answers['POST /api/builder/resource/fields'] = {
			ok: true,
			data: { path: 'ticket#rank' },
			changes: [],
			warnings: [fallback],
		}
		const field = { name: 'rank', dataType: { $dataType: 'made_up' } }
		await builder.addField('ticket', field)
		await builder.addField('ticket', field)
		const { root } = mount(Overlay, { components: shell() })
		await nextTick()

		const listed = findAll(root, (node) => node.tag === 'li').map(textOf)
		expect(listed).toEqual([fallback.message])

		const dismiss = findAll(
			root,
			(node) => node.props['aria-label'] === 'Dismiss the warnings',
		)[0]!
		fire(dismiss, 'click')
		await nextTick()
		expect(findAll(root, (node) => node.tag === 'li')).toHaveLength(0)
	})
})

describe('the Type menu', () => {
	it('names each type for whoever picks it', async () => {
		backend.catalog = {
			...backend.catalog,
			dataTypes: [
				{ id: 'made_up', config: {} },
				{ id: 'relation', config: {} },
				{ id: 'string', config: {} },
			],
		}
		await openEditor()
		const { root } = mount(FieldForm, { props: { resource: 'ticket' } })
		await nextTick()

		const type = findAll(root, (node) => node.tag === 'USelectMenu')[0]!
		expect(
			(type.props.items as { label: string }[]).map((item) => item.label),
			'known ones first, in the order they are listed',
		).toEqual(['Text', 'Row of another table', 'Made up'])
	})
})

describe('a block that reads a table', () => {
	const panel = (): Record<string, Component> => ({
		DmsBuilderOption: Option as Component,
		DmsBuilderIconInput: stub('DmsBuilderIconInput'),
		DmsBuilderDataSource: stub('DmsBuilderDataSource'),
		USelectMenu: stub('USelectMenu'),
		USwitch: stub('USwitch'),
		UTextarea: stub('UTextarea'),
	})

	async function selected(type: string): Promise<TestNode> {
		backend.catalog = {
			...backend.catalog,
			blocks: [
				...backend.catalog.blocks,
				{
					type,
					componentName: `Dms${type}`,
					label: type,
					group: 'data',
					container: false,
					config: {},
					shapeSource: 'test',
					controllerArg: true,
				},
			],
		}
		backend.answers[RESOURCE] = { ok: true, data: ticket(), changes: [] }
		await openEditor([
			{
				path: 'block',
				name: 'block',
				type,
				editable: true,
				controller: 'ticket',
				config: {},
			},
		])
		builder.select('block')
		await settle()
		const { root } = mount(Config, { components: panel() })
		await settle()
		return root
	}

	it('offers the search bar only on the table that has one', async () => {
		const table = await selected('TableView')
		expect(findAll(table, (node) => node.tag === 'label').map(textOf)).toContain(
			'Search field',
		)
	})

	it('leaves it off a form over the same table', async () => {
		const form = await selected('ResourceForm')
		const shown = findAll(form, (node) => node.tag === 'label').map(textOf)
		expect(shown).toContain('Database table')
		expect(shown).not.toContain('Search field')
	})

	it('no longer switches the export from the block', async () => {
		const table = await selected('TableView')
		expect(textOf(table)).not.toContain('Data export')
	})
})
