#!/usr/bin/env bash

# Script to push the dev branch to origin
# This script should be run by a user with appropriate GitHub credentials

set -e

echo "Pushing dev branch to origin..."

# The dev branch has been created locally from main at commit 2a1fdc3
# It needs to be pushed to origin

git push -u origin dev

echo "Dev branch successfully pushed to origin!"
echo "The dev branch is now available as an integration branch for feature PRs."
