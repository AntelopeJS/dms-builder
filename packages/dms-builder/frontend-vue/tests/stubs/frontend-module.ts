/**
 * Stand-in for the host runtime the DMS frontend loader materializes as
 * `#dms/frontend-module`. It exists so the module entry point can be
 * exercised outside a generated Inertia workspace; only what this package
 * imports from the host is declared.
 */
import { ref, type Ref } from 'vue'

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
