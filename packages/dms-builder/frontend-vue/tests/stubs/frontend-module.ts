/**
 * Stand-in for the host runtime the DMS frontend loader materializes as
 * `#dms/frontend-module`. It exists so the module entry point can be
 * exercised outside a generated Inertia workspace; only what this package
 * imports from the host is declared.
 */
import { ref, type Ref } from 'vue'
import englishMessages from '../../i18n/locales/builder-en-GB.json'

export interface DmsModuleOptions {
  public: Record<string, unknown>
}

export interface DmsFrontendSdk {
  options: DmsModuleOptions
  registerComponent(name: string, component: unknown): void
  registerPlugin(setup: () => void): void
}

export interface DmsFrontendModule {
  setup(sdk: DmsFrontendSdk): void | Promise<void>
}

export type DmsPluginSetup = () => void

export function defineDmsPlugin(setup: DmsPluginSetup): DmsPluginSetup {
  return setup
}

const states = new Map<string, Ref<unknown>>()

export function useDmsState<T>(key: string, init: () => T): Ref<T> {
  if (!states.has(key)) {
    states.set(key, ref(init()) as Ref<unknown>)
  }
  return states.get(key) as Ref<T>
}

export function useDmsRoute(): { path: string } {
  return { path: '/' }
}

/** Every route pushed through `useDmsRouter()`, oldest first. */
export const pushedRoutes: string[] = []

export function useDmsRouter(): { push: (route: string) => Promise<void> } {
  return {
    push: (route) => {
      pushedRoutes.push(route)
      return Promise.resolve()
    },
  }
}

type Messages = { [key: string]: string | Messages }

function lookup(messages: Messages, path: string): string | undefined {
  let node: string | Messages | undefined = messages
  for (const part of path.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined
  }
  return typeof node === 'string' ? node : undefined
}

/** vue-i18n's default choice: `zero | one | many`, or `one | many`. */
function pluralForm(message: string, count: number | undefined): string {
  const forms = message.split(' | ')
  if (count === undefined || forms.length === 1) {
    return message
  }
  const index =
    forms.length === 2 ? (count === 1 ? 0 : 1) : Math.min(Math.abs(count), 2)
  return forms[index] ?? message
}

/**
 * The application composer, reading the module's English catalog: a test
 * asserts the texts an English-speaking author sees, and a key the catalog
 * lacks comes back as itself, as vue-i18n returns it.
 */
function translate(
  key: string,
  params: Record<string, unknown> = {},
  count?: number,
): string {
  const message = lookup(englishMessages as Messages, key)
  if (message === undefined) {
    return key
  }
  return pluralForm(message, count).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

export function useDmsApp(): { $i18n: { t: typeof translate } } {
  return { $i18n: { t: translate } }
}
