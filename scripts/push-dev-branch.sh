#!/usr/bin/env bash

# Script to push the dev branch to origin
# This script should be run by a user with appropriate GitHub credentials

set -e

echo "=================================="
echo "Push Dev Branch to Origin"
echo "=================================="
echo ""
echo "This script will push the locally created 'dev' branch to the origin repository."
echo "The dev branch was created from main at commit: 2a1fdc325e96aab5eba72fc8d6ab9f549d736e32"
echo ""

# Check if dev branch exists locally
if ! git show-ref --verify --quiet refs/heads/dev; then
    echo "ERROR: dev branch does not exist locally!"
    echo "Creating dev branch from main..."
    git fetch origin main
    git branch dev 2a1fdc325e96aab5eba72fc8d6ab9f549d736e32
fi

echo "Pushing dev branch to origin..."
git push -u origin dev

echo ""
echo "✓ Dev branch successfully pushed to origin!"
echo "✓ The dev branch is now available as an integration branch for feature PRs."
echo ""
echo "Next steps:"
echo "- Update any CI/CD workflows to include the dev branch"
echo "- Configure branch protection rules if needed"
echo "- Notify team members about the new branching strategy"
