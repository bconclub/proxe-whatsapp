#!/usr/bin/env node
/**
 * Bump version script - increments patch version
 * Usage: node scripts/bump-version.js [patch|minor|major]
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packagePath = join(__dirname, '..', 'package.json');
const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));

const currentVersion = packageData.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

const bumpType = process.argv[2] || 'patch';

let newVersion;
if (bumpType === 'major') {
  newVersion = `${major + 1}.0.0`;
} else if (bumpType === 'minor') {
  newVersion = `${major}.${minor + 1}.0`;
} else {
  // patch (default)
  newVersion = `${major}.${minor}.${patch + 1}`;
}

packageData.version = newVersion;
writeFileSync(packagePath, JSON.stringify(packageData, null, 2) + '\n');

console.log(`Version bumped from ${currentVersion} to ${newVersion}`);
console.log('');
console.log('Next steps:');
console.log(`1. git add package.json`);
console.log(`2. git commit -m 'Bump version to ${newVersion}'`);
console.log(`3. git push`);

