/**
 * A unified diff read as the rows the diff view shows: its lines, and between
 * two changes a gap saying how many unchanged lines it leaves out, where the
 * diff itself only has a hunk header.
 */

export type DiffTone = 'added' | 'removed' | 'context' | 'note'

export type DiffRow =
	| { kind: 'line'; text: string; tone: DiffTone }
	| { kind: 'gap'; hidden: number }

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/
const DEFAULT_HUNK_LENGTH = 1

const TONES: [string, DiffTone][] = [
	['+', 'added'],
	['-', 'removed'],
	['\\', 'note'],
]

function toneOf(line: string): DiffTone {
	return TONES.find(([prefix]) => line.startsWith(prefix))?.[1] ?? 'context'
}

interface HunkSpan {
	first: number
	last: number
}

/**
 * The lines a hunk covers on the new side. A hunk of no new line names the line
 * before it, so it starts one further; unchanged lines number the same on both
 * sides, so either side counts a gap.
 */
function spanOf(match: RegExpMatchArray): HunkSpan {
	const start = Number(match[1])
	const length = match[2] === undefined ? DEFAULT_HUNK_LENGTH : Number(match[2])
	const first = length === 0 ? start + 1 : start
	return { first, last: first + length - 1 }
}

export function diffRows(diff: string): DiffRow[] {
	const rows: DiffRow[] = []
	let previousLast = 0
	for (const line of diff.split('\n')) {
		const header = line.match(HUNK_HEADER)
		if (!header) {
			rows.push({ kind: 'line', text: line, tone: toneOf(line) })
			continue
		}
		const span = spanOf(header)
		const hidden = span.first - previousLast - 1
		if (hidden > 0) {
			rows.push({ kind: 'gap', hidden })
		}
		previousLast = span.last
	}
	return rows
}
