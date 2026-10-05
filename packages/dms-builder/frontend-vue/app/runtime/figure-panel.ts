/**
 * A KPI card and a top list, as the simple mode's panels edit them: both show
 * figures read from a source, written in a format, with how far they moved and
 * a sparkline beside them. Each folds what it shows of a figure — its format,
 * its trend, a list's ranking — behind a line saying how it is set.
 *
 * The DMS components fall back on defaults the schemas do not declare: they are
 * mirrored here, or a switch the card shows on would read off in the panel.
 */
import { FORMAT_LABELS } from './chart-card'

/** The blocks the simple mode edits with a panel of their own. */
export const KPI_CARD_BLOCK = 'KpiCard'
export const TOP_LIST_BLOCK = 'TopListCard'

/**
 * The options each panel answers for. The ones it does not show — a list's
 * height and the colour of its period badge — are left to the advanced view,
 * and offered nowhere in the simple mode.
 */
export const KPI_CARD_PANEL_OPTIONS = new Set([
	'title',
	'description',
	'icon',
	'variant',
	'fetchUrl',
	'valueFormat',
	'currencyCode',
	'showDelta',
	'invert',
	'compareLabel',
	'showSparkline',
	'sparklineAccent',
])

export const TOP_LIST_PANEL_OPTIONS = new Set([
	'title',
	'description',
	'emptyLabel',
	'fetchUrl',
	'valueFormat',
	'currencyCode',
	'showRank',
	'highlightTopN',
	'rankColor',
	'showDelta',
	'invert',
	'showSparkline',
	'sparklineAccent',
	'badgeColor',
	'maxHeight',
])

/** A sparkline coloured after the trend: green up, red down. */
export const TREND_ACCENT = 'auto'

/** What each card does when nothing says: the DMS components' own defaults. */
export const FIGURE_DEFAULTS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
	[KPI_CARD_BLOCK]: {
		variant: 'default',
		valueFormat: 'compact',
		currencyCode: 'EUR',
		showDelta: true,
		showSparkline: false,
		sparklineAccent: TREND_ACCENT,
	},
	[TOP_LIST_BLOCK]: {
		valueFormat: 'number',
		currencyCode: 'EUR',
		showRank: true,
		highlightTopN: 3,
		rankColor: 'primary',
		showDelta: true,
		showSparkline: false,
		sparklineAccent: TREND_ACCENT,
	},
}

/** The currencies offered first; any other three-letter code can be typed. */
export const CURRENCIES = [
	'EUR',
	'USD',
	'GBP',
	'CHF',
	'CAD',
	'AUD',
	'JPY',
	'CNY',
	'SEK',
	'NOK',
	'DKK',
	'PLN',
	'BRL',
	'INR',
	'MAD',
	'XOF',
]

const CURRENCY_CODE = /^[A-Z]{3}$/

/** `EUR · Euro`, or the code alone where the browser has no name for it. */
export function currencyLabel(code: string): string {
	try {
		const name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code)
		return name && name !== code ? `${code} · ${name}` : code
	} catch {
		return code
	}
}

/** A code typed in, as the format reads it; anything else is no code. */
export function currencyCode(typed: string): string | undefined {
	const code = typed.trim().toUpperCase()
	return CURRENCY_CODE.test(code) ? code : undefined
}

/** `Currency · EUR`, `Compact`: what the Value fold says while folded. */
export function valueSummary(format: string, currency: string): string {
	const shown = FORMAT_LABELS[format] ?? format
	return format === 'currency' ? `${shown} · ${currency}` : shown
}

export function trendSummary(variation: boolean, sparkline: boolean): string {
	return `${variation ? 'Variation' : 'No variation'} · ${sparkline ? 'sparkline' : 'no sparkline'}`
}

export function rankingSummary(shown: boolean, highlighted: number): string {
	if (!shown) {
		return 'No rank'
	}
	return highlighted > 0 ? `Ranked · first ${highlighted} highlighted` : 'Ranked'
}
