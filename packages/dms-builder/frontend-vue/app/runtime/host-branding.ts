import { useDmsAppConfig } from '#dms/frontend-module'
import type { DmsBrandingConfig, DmsBrandingDefaults } from '#dms-core/shared/types/app-config'
import type { LogoSlot, ThemeLogos, ThemeMode } from './types'

/**
 * The theme editor's only access to the host app config: reads the DMS
 * branding defaults, writes the logos previewed on the dashboard.
 *
 * Both go through `useDmsAppConfig()` for now. The defaults are the
 * `branding.defaults` the DMS layout layer publishes. The logos go into
 * `branding.logo`, which only a module's `setup` may extend; in development
 * the renderer rewrites it when a layer's app config changes, and the next
 * preview writes them again. Once the releases carrying them are required,
 * switch to the DMS's `DMS_BRANDING_DEFAULTS` and the renderer's
 * `previewDmsAppConfig(patch)`: a `LogoPatch` is that patch's `branding.logo`
 * (`undefined` removes a key there too), so nothing outside this module
 * changes.
 */

/** The DMS's own logos and palettes; a DMS older than 0.9 publishes none. */
export type DmsDefaults = Partial<DmsBrandingDefaults>

/** Logos by slot and mode; `undefined` removes that mode's logo from the slot. */
export type LogoPatch = Partial<Record<LogoSlot, Partial<Record<ThemeMode, string | undefined>>>>

/** The slice of the host app config used here; logos are partial so one mode can be set at a time. */
interface HostAppConfig {
	branding?: Omit<DmsBrandingConfig, 'logo'> & { logo?: ThemeLogos }
}

function hostConfig(): HostAppConfig {
	return useDmsAppConfig() as HostAppConfig
}

/** The DMS's own logos and palettes, as the host publishes them; reactive when read inside a computed. */
export function dmsBrandingDefaults(): DmsDefaults {
	return hostConfig().branding?.defaults ?? {}
}

/** The logos the dashboard shows now, by slot and mode. */
export function hostLogos(): ThemeLogos {
	return hostConfig().branding?.logo ?? {}
}

/**
 * Sets or removes one mode's logo: removing lets a dropped preview disappear
 * when the DMS has no logo to put back. The slot object is replaced, not
 * mutated, so readers react.
 */
function showLogo(logos: ThemeLogos, slot: LogoSlot, mode: ThemeMode, logoSource: string | undefined): void {
	if (logos[slot]?.[mode] === logoSource) {
		return
	}
	const logoByMode = { ...logos[slot] }
	if (logoSource === undefined) {
		delete logoByMode[mode]
	} else {
		logoByMode[mode] = logoSource
	}
	if (Object.keys(logoByMode).length > 0) {
		logos[slot] = logoByMode
	} else {
		delete logos[slot]
	}
}

/** Show logos on the dashboard: each slot and mode the patch names, the others left as they are. */
export function showHostLogos(patch: LogoPatch): void {
	const config = hostConfig()
	config.branding ??= {}
	config.branding.logo ??= {}
	const logos = config.branding.logo
	for (const [slot, logoByMode] of Object.entries(patch) as [LogoSlot, LogoPatch[LogoSlot]][]) {
		for (const [mode, logoSource] of Object.entries(logoByMode ?? {}) as [ThemeMode, string | undefined][]) {
			showLogo(logos, slot, mode, logoSource)
		}
	}
}
