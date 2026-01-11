#!/usr/bin/env node
/**
 * Auto bump version script - increments version in v1.01 format
 * Format: v1.01, v1.02, v1.03, etc.
 * Usage: node scripts/bump-version-auto.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packagePath = join(__dirname, '..', 'package.json');
const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));

// Parse version (handles both "1.01" and "1.0.1" formats)
let currentVersion = packageData.version;
let major, minor;

// Convert from semantic versioning (1.0.1) to simple (1.01)
if (currentVersion.includes('.')) {
  const parts = currentVersion.split('.');
  major = parseInt(parts[0]) || 1;
  const patch = parseInt(parts[2]) || 0;
  const minorPart = parseInt(parts[1]) || 0;
  // Convert 1.0.1 -> 1.01, 1.0.2 -> 1.02
  minor = minorPart * 100 + patch;
} else {
  // Already in 1.01 format
  const match = currentVersion.match(/^(\d+)\.?(\d+)$/);
  if (match) {
    major = parseInt(match[1]) || 1;
    minor = parseInt(match[2]) || 1;
  } else {
    major = 1;
    minor = 1;
  }
}

// Increment minor version
minor += 1;

// Format as v1.01, v1.02, etc.
const newVersion = `${major}.${minor.toString().padStart(2, '0')}`;
const newVersionFormatted = `v${newVersion}`;

// Update package.json
packageData.version = newVersion;
writeFileSync(packagePath, JSON.stringify(packageData, null, 2) + '\n');

console.log(`Version bumped: ${currentVersion} → ${newVersionFormatted}`);
console.log(`package.json updated to version: ${newVersion}`);

// Return new version for use in git hooks
if (process.argv.includes('--quiet')) {
  process.stdout.write(newVersion);
} else {
  console.log('');
  console.log('Version updated in package.json');
}
