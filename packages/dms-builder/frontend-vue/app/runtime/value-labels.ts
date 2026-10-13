/**
 * The words a menu shows for a value its block declares no label for.
 *
 * A block names its choices the way its code reads them — `sm`, `elevated`,
 * `is_not` — and someone building a page reads them as words: a size as the
 * letters a size reads as, anything else with its first letter up and its parts
 * apart. What is written to the page is still the value declared.
 */
import { THEME_COLORS } from './constants'

/** The size codes a block takes, as clothes and paper say them. */
const SIZE_LABELS: Record<string, string> = {
	xs: 'XS',
	sm: 'S',
	md: 'M',
	lg: 'L',
	xl: 'XL',
	'2xl': '2XL',
}

/** `rangeArea` → `Range area`, `is_not` → `Is not`, `sm` → `S`. */
export function enumLabel(value: unknown): string {
	const text = String(value)
	const size = SIZE_LABELS[text]
	if (size) {
		return size
	}
	const words = text
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[-_]+/g, ' ')
		.trim()
	return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

const THEME_COLOR_SET = new Set<string>(THEME_COLORS)

/**
 * The theme colour a value names, for its menu entry to be drawn in: a tone is
 * picked by sight, not by the word for it.
 */
export function enumColour(
	value: unknown,
): (typeof THEME_COLORS)[number] | undefined {
	const text = String(value)
	return THEME_COLOR_SET.has(text)
		? (text as (typeof THEME_COLORS)[number])
		: undefined
}
