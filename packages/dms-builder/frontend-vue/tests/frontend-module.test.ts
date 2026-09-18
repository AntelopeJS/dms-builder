import { describe, expect, it, vi } from 'vitest'
import frontendModule from '../dms.frontend'

/**
 * The builder edits the app's TypeScript sources, so the header action that
 * opens it must not exist outside development. The backend decides and
 * publishes the answer as a frontend module option; this asserts the module
 * entry point obeys it rather than registering unconditionally.
 */
function fakeSdk(publicOptions: Record<string, unknown>) {
  return {
    options: { public: publicOptions },
    registerComponent: vi.fn(),
    registerPlugin: vi.fn(),
  }
}

describe('dms-builder frontend module', () => {
  it('registers its components and plugin when the backend says the builder is enabled', async () => {
    const sdk = fakeSdk({ dmsBuilder: { enabled: true } })
    await frontendModule.setup(sdk)
    expect(sdk.registerPlugin).toHaveBeenCalledTimes(1)
    expect(sdk.registerComponent).toHaveBeenCalled()
  })

  it('registers nothing when the option says the builder is disabled', async () => {
    const sdk = fakeSdk({ dmsBuilder: { enabled: false } })
    await frontendModule.setup(sdk)
    expect(sdk.registerPlugin).not.toHaveBeenCalled()
    expect(sdk.registerComponent).not.toHaveBeenCalled()
  })

  it('registers nothing when the module carries no option at all', async () => {
    const sdk = fakeSdk({ dmsBuilder: {} })
    await frontendModule.setup(sdk)
    expect(sdk.registerPlugin).not.toHaveBeenCalled()
    expect(sdk.registerComponent).not.toHaveBeenCalled()
  })

  it('registers nothing when the manifest predates the option', async () => {
    const sdk = fakeSdk({})
    await frontendModule.setup(sdk)
    expect(sdk.registerPlugin).not.toHaveBeenCalled()
    expect(sdk.registerComponent).not.toHaveBeenCalled()
  })
})
