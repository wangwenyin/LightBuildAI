import { joinRelativeURL } from 'ufo'

const appBaseURL = '/'
const appBuildAssetsDir = '/_nuxt/'
const appCdnURL = ''

export function baseURL() {
  return appBaseURL
}

export function buildAssetsDir() {
  return appBuildAssetsDir
}

export function buildAssetsURL(...path) {
  return joinRelativeURL(publicAssetsURL(), buildAssetsDir(), ...path)
}

export function publicAssetsURL(...path) {
  const publicBase = appCdnURL || appBaseURL

  return path.length ? joinRelativeURL(publicBase, ...path) : publicBase
}
