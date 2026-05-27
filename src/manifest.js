const config = require('./config')

function getManifest(baseUrl, options = {}) {
  const { configurationRequired = false } = options
  return {
    id: 'org.eze404.submodx',
    version: config.addonVersion,
    name: 'SubmodX',
    description: 'Subt\u00edtulos en espa\u00f1ol desde SubX (subdivx). Requiere id de IMDb para buscar y descargar subt\u00edtulos',
    catalogs: [],
    resources: configurationRequired ? [] : ['subtitles'],
    types: configurationRequired ? [] : ['movie', 'series'],
    idPrefixes: ['tt'],
    logo: `${baseUrl}/logo.png`,
    behaviorHints: { configurable: true, configurationRequired },
  }
}

module.exports = { getManifest }
