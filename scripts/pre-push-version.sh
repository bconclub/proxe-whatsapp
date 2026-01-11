#!/bin/bash
# Pre-push version bump script
# Usage: Add to git hooks or run manually before push

echo "Auto-bumping version before push..."
node scripts/bump-version-auto.js

# Stage the version change
git add package.json

# Get the new version
NEW_VERSION=$(node -e "const pkg=require('./package.json');console.log('v' + pkg.version)")

echo "Version bumped to ${NEW_VERSION}"
echo "Run: git commit -m 'chore: Bump version to ${NEW_VERSION}'"
echo "Then: git push"
