import { afterEach, describe, expect, it } from 'vitest'
import { lossyText } from '../app/runtime/database-server-text'
import { setTestLocale } from './stubs/frontend-module'

/** The reasons the MySQL driver words, as it words them, read in the catalog's French. */
const MYSQL_REASONS: [reason: string, french: string][] = [
	[
		'a BIGINT beyond 2^53 loses precision as a number; declare it string to read it exactly',
		'un bigint au-delà de 2^53 perd en précision comme nombre ; déclarez-le en chaîne pour le lire exactement',
	],
	[
		'a DECIMAL loses precision as a number; declare it string to read it exactly',
		'un decimal perd en précision comme nombre ; déclarez-le en chaîne pour le lire exactement',
	],
	[
		'a FLOAT widened to a number is not the decimal it was written as',
		'un float converti en nombre n’est pas la décimale telle qu’elle a été écrite',
	],
	[
		'a DATETIME holds no time zone and is read as UTC',
		'un datetime ne contient pas de fuseau horaire et est lu en UTC',
	],
	[
		'a DATETIME holds no time zone and is read as UTC; microseconds are truncated to milliseconds',
		'un datetime ne contient pas de fuseau horaire et est lu en UTC ; les microsecondes sont tronquées en millisecondes',
	],
]

afterEach(() => {
	setTestLocale('en-GB')
})

describe('a MySQL driver reason a declaration does not round-trip', () => {
	it.each(MYSQL_REASONS)('reads %s in French, not as the driver sent it', (reason, french) => {
		setTestLocale('fr-FR')
		expect(lossyText(reason)).toBe(french)
	})

	it('words the PostgreSQL reasons as before', () => {
		setTestLocale('fr-FR')
		expect(lossyText('a timestamp without time zone is read as UTC; microseconds are truncated to milliseconds')).toBe(
			'un timestamp sans fuseau horaire est lu en UTC ; les microsecondes sont tronquées en millisecondes',
		)
	})

	it('shows a reason it does not know as it was sent', () => {
		setTestLocale('fr-FR')
		expect(lossyText('a SET is read as text')).toBe('a SET is read as text')
	})
})
