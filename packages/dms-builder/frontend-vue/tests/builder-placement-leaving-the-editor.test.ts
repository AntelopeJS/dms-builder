import { describe, expect, it } from 'vitest'
import { useDmsState } from '#dms/frontend-module'
import registerBuilder from '../app/plugins/builder.client'
import { ACTION_ID, HEADER_ACTIONS_STATE_KEY } from '../app/runtime/constants'
import { describeError } from '../app/runtime/errors'
import {
	backend,
	builder,
	settle,
	names,
	row,
	withBlocks,
	beside,
} from './support/builder-placement-harness'

describe('leaving the editor', () => {
	it('closes at once when there is nothing to lose', () => {
		builder.leave()

		expect(builder.session.value.active).toBe(false)
	})

	it('asks first when the draft holds changes nobody saved', () => {
		builder.addBlock('Text')
		builder.leave()

		// The draft lives in this session and nowhere else: closing on one is
		// throwing the work away.
		expect(builder.session.value.pendingClose).toBe(true)
		expect(builder.session.value.active, 'and nothing is closed yet').toBe(true)
		expect(names()).toContain('text')
	})

	it('stays when that is the answer', () => {
		builder.addBlock('Text')
		builder.leave()
		builder.stayOpen()

		expect(builder.session.value.pendingClose).toBe(false)
		expect(builder.session.value.active).toBe(true)
	})

	it('asks from the button that opened it, which is the same button', () => {
		registerBuilder()
		const actions = useDmsState<
			Array<{ id: string; onSelect: () => void }>
		>(HEADER_ACTIONS_STATE_KEY, () => [])
		const toggle = actions.value.find((action) => action.id === ACTION_ID)
		builder.addBlock('Text')

		toggle?.onSelect()

		expect(builder.session.value.pendingClose).toBe(true)
		expect(builder.session.value.active).toBe(true)
	})

	it('drops the draft when that is the answer', async () => {
		builder.addBlock('Text')
		builder.leave()
		await builder.resolveClose(false)

		expect(builder.session.value.active).toBe(false)
		expect(backend.calledPaths()).not.toContain(
			'POST /api/builder/page/blocks',
		)
	})

	it('saves first when that is the answer', async () => {
		builder.addBlock('Text')
		builder.leave()
		await builder.resolveClose(true)

		expect(backend.calledPaths()).toContain('POST /api/builder/page/blocks')
		expect(builder.session.value.active).toBe(false)
	})

	it('stays open on a save the module turned down', async () => {
		builder.addBlock('Text')
		backend.save = {
			ok: false,
			error: { code: 'stale', ref: '/reports/sales', currentVersion: 'v9' },
		}
		builder.leave()
		await builder.resolveClose(true)

		// Closing here would drop the draft over a refusal the author has not
		// even read yet.
		expect(builder.session.value.active).toBe(true)
		expect(builder.session.value.conflict).toBe(true)
	})
})

describe('a move the draft refuses', () => {
	it('drops a container into itself without changing anything, and without arming Undo', () => {
		builder.addBlock('Section')
		builder.addBlock('Text', 'section', null)
		const before = JSON.stringify(builder.session.value.draft)
		const historyBefore = builder.session.value.history.length

		builder.beginDrag({ path: 'section' })
		builder.dropAt('section/text', 0)

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.toast).toBe('A block cannot go inside itself')
		expect(builder.session.value.error).toBe(null)
		// Bar.vue enables Undo on `history.length > 0`; there is nothing to undo.
		expect(builder.session.value.history.length).toBe(historyBefore)
	})

	it('leaves no row behind when the move it built one for is refused', () => {
		withBlocks(row('card', 'note'))
		const before = JSON.stringify(builder.session.value.draft)
		const historyBefore = builder.session.value.history.length

		// A Grid into itself: the row is built first, and the draft then turns the
		// move down. A row left behind would make the page dirty for nothing.
		builder.move('grid', 'grid', 0)

		expect(JSON.stringify(builder.session.value.draft)).toBe(before)
		expect(builder.session.value.history.length).toBe(historyBefore)
	})

	it('pushes no history entry for an edit that changes nothing', () => {
		const historyBefore = builder.session.value.history.length
		// The config already holds this value, so the patch is a no-op.
		builder.patchConfig('title', { content: 'Sales' })
		expect(builder.session.value.history.length).toBe(historyBefore)

		builder.patchConfig('title', { content: 'Revenue' })
		expect(builder.session.value.history.length).toBe(historyBefore + 1)
	})
})

describe('the draft after the preview refuses the page', () => {
	/**
	 * What the module answers for a draft its validation rejects.
	 *
	 * The refusal is one the editor cannot foresee: which types a Grid takes is
	 * in the catalog and read before the drop, but what a row's own metadata may
	 * hold is the module's to judge, and only the preview says so.
	 */
	function refuseGridChild(): void {
		backend.preview = {
			ok: false,
			error: {
				code: 'invalid_config',
				issues: [
					{
						pointer: '/blocks/0/children/0/meta/colSpan',
						message: 'colSpan must be a whole number of columns',
					},
				],
			},
		}
	}

	/** A block put beside the title: the row the preview then refuses. */
	async function dropRowInAGrid(): Promise<void> {
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0, beside('title'))
		await settle()
	}

	it('keeps the block, keeps the old canvas, and says the page was refused', async () => {
		backend.preview = {
			ok: true,
			data: { components: { title: { componentName: 'DmsText' } }, degraded: [] },
			changes: [],
		}
		builder.addBlock('Text')
		await settle()
		const canvasBefore = JSON.stringify(builder.session.value.preview)

		refuseGridChild()
		await dropRowInAGrid()

		expect(names('grid')).toEqual(['gridRow'])
		expect(
			JSON.stringify(builder.session.value.preview),
			'the canvas still shows the page from before the drop',
		).toBe(canvasBefore)
		expect(builder.session.value.error?.code).toBe('invalid_config')
		expect(builder.session.value.previewState).toBe('refused')
		expect(builder.dirty.value).toBe(true)
	})

	it('words the refusal by block name, without the pointer', async () => {
		refuseGridChild()
		await dropRowInAGrid()

		const error = builder.session.value.error
		expect(error).not.toBe(null)
		const banner = describeError(error!, builder.session.value.draft)
		expect(banner).toContain(
			'grid/gridRow: colSpan must be a whole number of columns',
		)
		expect(banner, 'the JSON pointer is not shown').not.toContain('/blocks/')
	})

	it('flags the refused block in the bar instead of vouching for the page', async () => {
		refuseGridChild()
		await dropRowInAGrid()

		expect(builder.problems.value).toContain('grid/gridRow')
		// Bar.vue shows its green badge only on a 'valid' preview.
		expect(builder.session.value.previewState).not.toBe('valid')
	})

	it('clears the refusal once the page builds again', async () => {
		refuseGridChild()
		await dropRowInAGrid()
		expect(builder.problems.value).toContain('grid/gridRow')

		backend.preview = {
			ok: true,
			data: { components: {}, degraded: [] },
			changes: [],
		}
		builder.remove('grid/gridRow')
		await settle()

		expect(builder.session.value.error).toBe(null)
		expect(builder.session.value.previewState).toBe('valid')
		expect(builder.problems.value).toEqual([])
	})
})

describe('undo, redo and discard', () => {
	it('undoes an insertion and redoes it', () => {
		builder.addBlock('Text')
		expect(names()).toEqual(['title', 'intro', 'text'])
		builder.undo()
		expect(names()).toEqual(['title', 'intro'])
		builder.redo()
		expect(names()).toEqual(['title', 'intro', 'text'])
	})

	it('drops the selection on a block undo has just removed', () => {
		builder.addBlock('Text')
		expect(builder.session.value.selection).toBe('text')
		builder.undo()
		expect(builder.session.value.selection).toBe(null)
		expect(builder.selected.value).toBe(undefined)
		// The inspector says nothing is selected rather than configuring a block
		// that is gone.
		expect(builder.session.value.inspector).toBe('block')
	})

	it('keeps a selection the undone step did not touch', () => {
		builder.addBlock('Section')
		builder.addBlock('Text', 'section', null)
		builder.select('section')
		builder.remove('section/text')
		builder.undo()
		expect(builder.session.value.selection).toBe('section')
		expect(builder.session.value.inspector).toBe('block')
	})

	it('drops the selection on a block redo takes away again', () => {
		builder.addBlock('Text')
		builder.remove('text')
		builder.undo()
		builder.select('text')
		expect(builder.selected.value?.type).toBe('Text')

		builder.redo()
		expect(names()).toEqual(['title', 'intro'])
		expect(builder.session.value.selection).toBe(null)
		expect(builder.selected.value).toBe(undefined)
	})

	it('undoes a deletion', () => {
		builder.remove('intro')
		expect(names()).toEqual(['title'])
		builder.undo()
		expect(names()).toEqual(['title', 'intro'])
	})

	it('undoes a move', () => {
		builder.beginDrag({ path: 'intro' })
		builder.dropAt(null, 0)
		expect(names()).toEqual(['intro', 'title'])
		builder.undo()
		expect(names()).toEqual(['title', 'intro'])
	})

	it('discards back to the saved page, and the discard is itself undoable', () => {
		builder.addBlock('Text')
		builder.cancel()
		expect(names()).toEqual(['title', 'intro'])
		expect(builder.dirty.value).toBe(false)
		builder.undo()
		expect(names()).toEqual(['title', 'intro', 'text'])
	})

	it('says nothing, and arms nothing, when a removal removed nothing', () => {
		builder.remove('does-not-exist')
		expect(names()).toEqual(['title', 'intro'])
		expect(builder.session.value.toast).toBe(null)
		expect(builder.session.value.history).toHaveLength(0)
	})

	it('keeps the draft and reports the refusal when the server rejects a save', async () => {
		builder.beginDrag({ type: 'Text' })
		builder.dropAt(null, 0, beside('title'))
		backend.save = {
			ok: false,
			error: {
				code: 'invalid_config',
				issues: [
					{
						pointer: '/blocks/0/children/0/meta/colSpan',
						message: 'colSpan must be a whole number of columns',
					},
				],
			},
		}
		await builder.save()

		// The banner the overlay shows — the first time the placement is
		// questioned, several edits after it was made.
		expect(builder.session.value.error?.code).toBe('invalid_config')
		expect(names('grid')).toEqual(['gridRow'])
		expect(builder.dirty.value).toBe(true)
	})

	it('drops the whole history on save, so Undo cannot reach the page before it', async () => {
		builder.addBlock('Text')
		await builder.save()
		expect(builder.session.value.history).toHaveLength(0)
		builder.undo()
		expect(names()).toEqual(['title', 'intro', 'text'])
	})
})
