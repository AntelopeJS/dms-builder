import { defineAsyncComponent, type Component } from 'vue'
import type { DmsFrontendModule } from '#dms-inertia/frontend-module'
import builderPlugin from './app/plugins/builder.client'

interface VueModule {
  default: Component
}

const components = import.meta.glob<VueModule>('./app/components/**/*.vue')

/**
 * Where the option the backend publishes lands in the module's public options.
 * The loader nests a module's manifest options under its `configKey`, so these
 * two names mirror `FRONTEND_MODULE_CONFIG_KEY` and
 * `FRONTEND_MODULE_ENABLED_OPTION` in `src/constants/routes.ts`.
 *
 * The builder rewrites the app's TypeScript sources, so it only exists while
 * the backend runs in development. The backend registers this module only
 * then — but a frontend is built once and served later, so these sources can
 * outlive the manifest that shipped them and the module re-checks rather than
 * trusting the Vite build mode, which says nothing about how the backend runs.
 * Anything other than an explicit `true` means off: no components, no overlay,
 * no header action.
 */
const CONFIG_KEY = 'dmsBuilder'
const ENABLED_OPTION = 'enabled'

function isEnabled(options: Record<string, unknown> | undefined): boolean {
  const scoped = options?.[CONFIG_KEY] as Record<string, unknown> | undefined
  return scoped?.[ENABLED_OPTION] === true
}

const frontendModule: DmsFrontendModule = {
  setup(sdk) {
    if (!isEnabled(sdk.options.public)) {
      return
    }
    Object.entries(components)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([path, loader]) => {
        const name = `DmsBuilder${path
          .split('/')
          .at(-1)!
          .replace(/\.vue$/, '')}`
        sdk.registerComponent(name, defineAsyncComponent(loader))
      })
    sdk.registerPlugin(builderPlugin)
  },
}

export default frontendModule
