import { defineAsyncComponent, type Component } from 'vue'
import type { DmsFrontendModule } from '#dms-inertia/frontend-module'
import builderPlugin from './app/plugins/builder.client'

interface VueModule {
  default: Component
}

const components = import.meta.glob<VueModule>('./app/components/**/*.vue')

const frontendModule: DmsFrontendModule = {
  setup(sdk) {
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
