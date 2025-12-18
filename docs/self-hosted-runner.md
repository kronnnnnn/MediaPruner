# Self-hosted GitHub Actions Runner on Unraid

This guide explains how to set up a self-hosted GitHub Actions runner on an Unraid host and use it to deploy the MediaPruner staging image.

## Overview
- We'll register a self-hosted runner with labels `self-hosted`, `linux`, `unraid` (or any custom label you prefer).
- GitHub Actions will run the `deploy-staging` job on that runner and it will: pull the staging image from GHCR, write a temporary `.env` file from GitHub Secrets to the `UNRAID_COMPOSE_DIR`, `docker compose up -d`, run a healthcheck, then remove the temporary `.env`.

## Pre-requisites on Unraid
- Docker (already part of Unraid)
- Docker Compose plugin or the compose V2 plugin installed
- A dedicated folder where the `docker-compose.yml` for MediaPruner lives (e.g., `/mnt/user/appdata/mediapruner`)
- (Recommended) Create a dedicated user for the runner or use the `root` user carefully
- Decide if you want the runner binary installed directly on the host or run as a container (container approach isolates the runner):
  - Container-based runner: use a maintained runner image (e.g., `ghcr.io/linuxserver/github-runner` or `myoung34/github-runner`). Configure it per container docs.
  - Host-based runner: download, configure, and run as a service.

## Registering a Runner (host-based example)
1. Go to your GitHub repo -> Settings -> Actions -> Runners -> Add runner -> Linux
2. Copy the `curl` download / config commands and run on Unraid shell (or an Unraid VM). Example:

   ```bash
   # As the user you'll run the runner with (e.g., actions-runner)
   mkdir -p ~/actions-runner && cd ~/actions-runner
   curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-linux-x64-2.x.x.tar.gz
   tar xzf ./actions-runner-linux-x64.tar.gz

   # Follow GitHub's instructions; when asked, supply a name and add labels like: unraid
   ./config.sh --url https://github.com/<owner>/<repo> --token <RUNNER_REGISTRATION_TOKEN> --labels "unraid,self-hosted"

   # Run the runner
   ./run.sh
   
   # Or install as a service (see the config script output for instructions)
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```

3. Verify the runner appears online in the GitHub UI.

## Container-based runner (recommended for Unraid)
- Many users run the GitHub Actions runner in a Docker container on Unraid. Example using `myoung34/github-runner` or `linuxserver/github-runner` images from community docs.
- Make sure to: mount `/var/run/docker.sock` so the runner can control Docker on the host, or give the container a Docker-in-Docker setup (socket mount is simpler).
- Assign labels: pass them via environment variables or container args to ensure the runner has the `unraid` label.

## Security & Permissions
- Runner access = high privilege. Only register runners on trusted machines.
- Limit which workflows run on the runner by using the runner label in workflow YAML (`runs-on: [self-hosted, linux, unraid]`).
- Use GitHub Environments for `staging` and put required reviewers or approvals to protect deploys.
- Use repository / environment secrets to provide sensitive variables; do not keep plaintext secrets on the host repository.

## Required GitHub Secrets (suggested)
- `GHCR_PAT` – token with restricted scope to pull/push to GHCR (if needed)
- `UNRAID_COMPOSE_DIR` – absolute path to the folder on the Unraid host with your `docker-compose.yml`
- `MB_TMDB_API_KEY`, `MB_OMDB_API_KEY`, `MB_DATABASE_URL`, `MB_DEBUG` – app runtime variables for the staging environment

Set these in your repository under Settings -> Environments -> staging to restrict access/approval.

## Example directory layout on Unraid

/mnt/user/appdata/mediapruner/
  - docker-compose.yml
  - .env (kept out of VCS; will be temporarily overwritten by the deploy workflow)

Your `docker-compose.yml` should use the `.env` file or `environment:` values to pick up secrets.

## Testing the deployment
1. Commit & push to the `develop` branch (or trigger `workflow_dispatch` for the `Deploy to Staging` workflow).
2. In GitHub Actions, verify the `build-and-push` job runs, then the `deploy-on-unraid` job executes on your self-hosted runner.
3. Check the job logs for any errors and that the healthcheck passes.

## Rollback strategy
- Tag and push a previous image to `staging` tag and re-run the deploy workflow, or keep a small script on host to `docker compose down` and `docker compose up -d` pointing to a desired tag.

## Troubleshooting tips
- If `docker` commands fail in the runner: ensure the runner user is in the `docker` group or run with proper privileges.
- If the runner appears offline: check runner logs and service status, and confirm the registration token is valid.
- If secrets are missing at runtime: confirm they exist under `Settings -> Environments -> staging` and that the workflow uses `environment: staging` in YAML.

---
If you’d like, I can also:
- Create an example `docker-compose.yml` snippet for Unraid that persists volumes correctly and uses the `.env` values, or
- Add a `workflow_dispatch`-only quick redeploy workflow for manual rollouts.
