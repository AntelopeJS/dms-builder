import { resolveI18nKey } from '#dms-core/app/composables/translation/useTranslation'
import { useDmsApp } from '#dms/frontend-module'

/**
 * The builder's own messages, under one namespace of the app's catalog.
 *
 * The DMS frontend loader merges every module's `i18n/locales/*-xx-XX.json`
 * into the application's messages, so the module ships its texts the way any
 * DMS layer does — `builder-en-GB.json`, `builder-fr-FR.json` — and reads them
 * back through the host's composer. English is the fallback locale: a key a
 * translation lacks still reads as English.
 */
export const I18N_NAMESPACE = 'dms_builder'

export type MessageParams = Record<string, unknown>

/**
 * A builder message as a DMS display string: the host translates a value
 * marked with `$` wherever it draws one — a header action's label, its
 * tooltip, its aria-label — so what the builder hands the host stays a key.
 */
export function displayKey(key: string): string {
	return `$${I18N_NAMESPACE}.${key}`
}

/**
 * A builder message in the active locale. `count` picks the plural form of a
 * message written as `one | many`; it is passed as `{count}` too.
 *
 * It reads the application's composer on every call, from a template as from
 * the session runtime, so a text drawn in a render follows a language switch.
 */
export function t(key: string, params: MessageParams = {}, count?: number): string {
	const { $i18n } = useDmsApp()
	const path = `${I18N_NAMESPACE}.${key}`
	return count === undefined
		? $i18n.t(path, params)
		: $i18n.t(path, { count, ...params }, count)
}

/**
 * A DMS display string as the reader sees it: a value marked with `$` — a
 * page's title, a block's heading, `$demo.home.hero.title` — is a key read in
 * the active locale, anything else is shown as written. The DMS's own
 * `resolveI18nKey`, the one `processI18n` uses, made for code outside a
 * component like the session runtime. Only what the editor draws goes
 * through it; the fields that edit those values keep the raw text.
 */
export function displayText(value: string): string {
	const { $i18n } = useDmsApp()
	return resolveI18nKey((key, params) => $i18n.t(key, params), value)
}
