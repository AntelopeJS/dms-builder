import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { backendBoundary } from './build/backend-boundary.ts'

export default defineConfig({
  plugins: [backendBoundary()],
  resolve: {
    alias: {
      // The host runtime only exists inside a generated Inertia workspace; the
      // tests substitute the slice of it this package imports.
      '#dms/frontend-module': fileURLToPath(
        new URL('./tests/stubs/frontend-module.ts', import.meta.url),
      ),
      // The DMS core layer's own sources, which a module imports by this alias.
      '#dms-core': fileURLToPath(
        new URL('./node_modules/@antelopejs/dms/frontend-vue/layers/dms-core', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
