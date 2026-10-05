import { describe, expect, it } from 'vitest'
import {
	currencyCode,
	currencyLabel,
	rankingSummary,
	trendSummary,
	valueSummary,
} from '../app/runtime/figure-panel'

/**
 * What a KPI card's and a top list's folded parts say of how they are set, and
 * the currency codes they are written in.
 */

describe('a currency', () => {
	it('is named after its code, or left as the code', () => {
		expect(currencyLabel('EUR')).toBe('EUR · Euro')
		expect(currencyLabel('QQQ')).toBe('QQQ')
	})

	it('is taken as typed only when it is three letters', () => {
		expect(currencyCode(' chf ')).toBe('CHF')
		expect(currencyCode('euro')).toBeUndefined()
		expect(currencyCode('E1')).toBeUndefined()
	})
})

describe('the summaries of the folded parts', () => {
	it('say the format, and the currency once it is one', () => {
		expect(valueSummary('currency', 'EUR')).toBe('Currency · EUR')
		expect(valueSummary('compact', 'EUR')).toBe('Compact')
	})

	it('say what the trend shows', () => {
		expect(trendSummary(true, false)).toBe('Variation · no sparkline')
		expect(trendSummary(false, true)).toBe('No variation · sparkline')
	})

	it('say how a list is ranked', () => {
		expect(rankingSummary(true, 3)).toBe('Ranked · first 3 highlighted')
		expect(rankingSummary(true, 0)).toBe('Ranked')
		expect(rankingSummary(false, 3)).toBe('No rank')
	})
})
