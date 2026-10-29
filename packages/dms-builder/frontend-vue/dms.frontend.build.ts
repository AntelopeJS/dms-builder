import { defineDmsFrontendBuild } from '#dms/frontend-build'
import { backendBoundary } from './build/backend-boundary.ts'

export default defineDmsFrontendBuild((build) => {
	build.registerVitePlugins(() => [backendBoundary()])
})
