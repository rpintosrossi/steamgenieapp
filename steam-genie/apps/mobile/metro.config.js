const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Only watch mobile app + shared workspace packages (exclude api, web, and their node_modules)
config.watchFolders = [
  projectRoot,
  path.resolve(monorepoRoot, 'packages/shared-types/src'),
  path.resolve(monorepoRoot, 'packages/shared-validators/src'),
  path.resolve(monorepoRoot, 'packages/shared-constants/src'),
];

// Resolve modules from the mobile app first, then the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Block Metro from scanning irrelevant parts of the monorepo
config.resolver.blockList = [
  // Exclude other apps
  new RegExp(path.resolve(monorepoRoot, 'apps/api').replace(/\\/g, '\\\\') + '.*'),
  new RegExp(path.resolve(monorepoRoot, 'apps/web').replace(/\\/g, '\\\\') + '.*'),
  // Exclude node_modules inside packages (handled by monorepo root node_modules)
  new RegExp(path.resolve(monorepoRoot, 'packages').replace(/\\/g, '\\\\') + '[/\\\\].*[/\\\\]node_modules[/\\\\].*'),
  // Exclude .ignored* files/dirs anywhere
  /[/\\]\.ignored[/\\_.]/,
];

module.exports = config;
