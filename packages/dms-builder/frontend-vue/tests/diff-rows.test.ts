import { describe, expect, it } from 'vitest'
import { diffRows } from '../app/runtime/diff-rows'

describe('the rows of a diff', () => {
	it('puts a gap counting the unchanged lines between two changes where the hunk header was', () => {
		const rows = diffRows(['@@ -77,6 +77,13 @@', ' a', '+b', ' c', '@@ -92,6 +99,13 @@', ' d', '+e'].join('\n'))
		expect(rows).toEqual([
			{ kind: 'gap', hidden: 76 },
			{ kind: 'line', text: ' a', tone: 'context' },
			{ kind: 'line', text: '+b', tone: 'added' },
			{ kind: 'line', text: ' c', tone: 'context' },
			{ kind: 'gap', hidden: 9 },
			{ kind: 'line', text: ' d', tone: 'context' },
			{ kind: 'line', text: '+e', tone: 'added' },
		])
	})

	it('shows no gap before a new file, nor between changes that touch', () => {
		expect(diffRows('@@ -1,0 +1,2 @@\n+a\n+b').filter((row) => row.kind === 'gap')).toEqual([])
		expect(diffRows('@@ -1,3 +1,3 @@\n a\n@@ -4,2 +4,2 @@\n b').filter((row) => row.kind === 'gap')).toEqual([])
	})

	it('tells removed lines and notes from unchanged ones', () => {
		expect(diffRows('@@ -1 +1 @@\n-a\n\\ No newline at end of file').map((row) => row.kind === 'line' && row.tone)).toEqual([
			'removed',
			'note',
		])
	})
})
