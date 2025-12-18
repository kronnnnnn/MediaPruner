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
- 🔄 `dev` - Integration branch (created locally, needs to be pushed to origin)

## Next Steps

To push the `dev` branch to origin, run:
```bash
./scripts/push-dev-branch.sh
```

Or manually:
```bash
git push -u origin dev
```
