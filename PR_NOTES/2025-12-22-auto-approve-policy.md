# Auto-Approve Policy & How to Trigger the Flow ✅

**Date:** 2025-12-22
**Author:** kronnnnnn (via Copilot automation)

## Summary
This note documents the recently implemented automated approval flow for pull requests and the slight policy change on `main` that enables a secure, auditable auto-approval process.

## What changed 🔧
- **Removed** the "Require approving review" rule from the `main` branch protection to allow the automated check to gate merges.
- **Added** (and now *require*) the status check **`mediapruner/auto-approve`** to both `develop` and `main`.
- The `mediapruner/auto-approve` check is created by the **GPT Auto-Approve** workflow when certain conditions are met (see below).

## How the flow works (high level) 🔁
1. Developers open a PR and CI runs as usual (the `CI` workflow). 
2. When CI completes successfully, the **Copilot Review** workflow (either automatically on CI success or via manual dispatch) performs additional checks (build/lint/tests) and adds the `copilot-approved` label.
3. The **GPT Auto-Approve** workflow listens for that label (or CI workflow_run completion) and attempts to create the `mediapruner/auto-approve` check run as proof of automated approval.
4. Branch protection expects the `mediapruner/auto-approve` check to be successful; once present and passing, the branch can be merged (you still control merging).

## How to manually trigger or recover the flow 🛠️
- If you need to re-run the Copilot Review for a PR, dispatch the `Copilot Review (label) on CI success` workflow via the Actions UI using the `pull_number` input.
- To manually request an automated approval, add the label `copilot-approved` to the PR (this triggers the GPT Auto-Approve workflow). 
- If the GitHub App cannot create checks due to permissions, the repo has a fallback path with a PAT (not currently enabled by default). Contact repo admin to enable/add the `AUTO_APPROVE_PAT` secret.

## Security notes 🔐
- This design prefers the GitHub App (no PAT secrets required) and creates an auditable check run (`mediapruner/auto-approve`) instead of adding human approvals.
- The `mediapruner/auto-approve` check is required in branch protection to ensure the same approval bar applies for `develop` and `main`.

## Troubleshooting & FAQ ❓
- Q: Why is my PR still blocked even after auto-approve ran?
  - A: Ensure the `mediapruner/auto-approve` check appears in the PR's status checks and is `SUCCESS`. If missing, run the Copilot Review workflow (see manual dispatch above) and confirm the GPT Auto-Approve workflow can create checks.

- Q: Who can merge after auto-approve?
  - A: Merging is still manually performed by repo maintainers; this change only replaces the "Approving review" requirement with a machine-created check.

## Reference & Links 🔗
- Copilot Review workflow: `.github/workflows/copilot-review.yml`
- GPT Auto-Approve workflow: `.github/workflows/gpt-auto-approve.yml`
- Auto-approve script: `.github/scripts/auto-approve.js`

---

If you'd like, I can also add a short comment to the active PR (`dev -> main`) linking to this note so contributors see the policy change immediately — say the word and I’ll add it.