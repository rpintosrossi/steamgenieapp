const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Expo SDK 52+ auto-detects monorepos — only add watchFolders if not already set
if (!config.watchFolders?.length) {
  config.watchFolders = [monorepoRoot];
}

// Block .ignored* paths that cause EACCES errors during file watching
config.resolver.blockList = [
  ...(config.resolver.blockList ?? []),
  /[/\\]\.ignored[/\\._]/,
  /[/\\]\.ignored$/,
];

module.exports = config;
