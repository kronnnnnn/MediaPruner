# Branching Strategy

## Main Branches

### `main`
The main branch contains production-ready code. Direct commits to `main` should be avoided.

### `dev`
The `dev` branch serves as the integration branch for all feature development. 

- **Created from**: `main` at commit `2a1fdc3` (Create Test Buttons for API #3)
- **Purpose**: Integration branch for feature PRs
- **Workflow**: Feature branches should be created from `dev` and merged back into `dev`

## Workflow

1. Create feature branches from `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/my-feature
   ```

2. Develop your feature and commit changes

3. Create a PR targeting the `dev` branch (not `main`)

4. Once merged into `dev`, the integration testing happens on `dev`

5. Periodically, `dev` is merged into `main` for production releases

## Branch Status

- ✅ `main` - Production branch (exists on origin)
- 🔄 `dev` - Integration branch (created locally, ready to be pushed to origin)

## Pushing the Dev Branch

The `dev` branch has been created locally and is ready to be pushed to the origin repository. Due to environment constraints in the automated setup, the branch push requires manual execution by a user with GitHub credentials.

### Option 1: Run the provided script
```bash
./scripts/push-dev-branch.sh
```

### Option 2: Push manually
```bash
git push -u origin dev
```

### Option 3: Use GitHub CLI
```bash
gh api /repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/git/refs \
  -f ref='refs/heads/dev' \
  -f sha='2a1fdc325e96aab5eba72fc8d6ab9f549d736e32'
```

Once pushed, the `dev` branch will be available on GitHub for the team to use as the integration branch for feature development.
