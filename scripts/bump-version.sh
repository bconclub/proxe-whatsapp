#!/bin/bash
# Bump version script - increments patch version for each push

echo "Bumping version..."

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")

# Bump patch version
npm version patch --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")

echo "Version bumped from $CURRENT_VERSION to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "1. git add package.json"
echo "2. git commit -m 'Bump version to $NEW_VERSION'"
echo "3. git push"

