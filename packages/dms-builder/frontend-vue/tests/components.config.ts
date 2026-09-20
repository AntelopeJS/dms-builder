import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { defineConfig, transformWithOxc, type Plugin } from 'vite'

/**
 * A second vitest project, for the tests that mount the builder's components.
 *
 * The package declares no SFC plugin, so one is assembled here from
 * `@vue/compiler-sfc`, which vue already brings. It only has to handle these
 * components: `<script setup lang="ts">` plus a template, no `<style>`.
 *
 * Run with `npx vitest run --config tests/components.config.ts`. The suite
 * matches `*.spec.ts`, so the package's own `vitest.config.ts` — which matches
 * `*.test.ts` — is untouched and `pnpm test` keeps working as before.
 */
function singleFileComponents(): Plugin {
	return {
		name: 'tests:sfc',
		async transform(code, id) {
			const file = id.split('?')[0] ?? id
			if (!file.endsWith('.vue')) {
				return null
			}
			const { parse, compileScript } = await import('@vue/compiler-sfc')
			const { descriptor } = parse(code, { filename: file })
			const compiled = compileScript(descriptor, {
				id: createHash('sha256').update(file).digest('hex').slice(0, 8),
				inlineTemplate: true,
				// Static hoisting emits vnodes the renderer would have to clone
				// out of markup; there is no markup here.
				templateOptions: { compilerOptions: { hoistStatic: false } },
			})
			const js = await transformWithOxc(compiled.content, `${file}.ts`, {
				lang: 'ts',
			})
			return { code: js.code, map: js.map }
		},
	}
}

export default defineConfig({
	plugins: [singleFileComponents()],
	resolve: {
		alias: {
			'#dms/frontend-module': fileURLToPath(
				new URL('./stubs/frontend-module.ts', import.meta.url),
			),
		},
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.spec.ts'],
	},
})
