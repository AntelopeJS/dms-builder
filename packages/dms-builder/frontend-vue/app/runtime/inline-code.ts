/**
 * A block's help text, split where it quotes code.
 *
 * The blocks describe their options in Markdown's habit — `Card`, `sm` — and
 * the panel showed the backticks as they were typed. Split here, the quoted
 * part is drawn as code and the rest as text, with nothing interpreted beyond
 * that: no other Markdown, and no HTML.
 */
export interface TextPart {
	text: string
	code: boolean
}

const QUOTED = /`([^`]+)`/g

export function codeSpans(text: string): TextPart[] {
	const parts: TextPart[] = []
	let from = 0
	for (const match of text.matchAll(QUOTED)) {
		const at = match.index ?? 0
		if (at > from) {
			parts.push({ text: text.slice(from, at), code: false })
		}
		parts.push({ text: match[1] ?? '', code: true })
		from = at + match[0].length
	}
	if (from < text.length) {
		parts.push({ text: text.slice(from), code: false })
	}
	return parts
}
