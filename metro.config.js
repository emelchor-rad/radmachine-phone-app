const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm', 'zip', 'tar', 'bin');

module.exports = config;
