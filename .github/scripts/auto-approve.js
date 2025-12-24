;(async()=>{
  try{
    const fs = require('fs');
    const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    console.log('DEBUG payload.inputs', payload.inputs || null);

    let prs = [];
    const run = payload.workflow_run || {};
    console.log('DEBUG run.event', run.event || null, 'run.pull_requests length', run.pull_requests ? run.pull_requests.length : 0);
    if (run.pull_requests && run.pull_requests.length) {
      prs = run.pull_requests;
    } else if (payload.inputs && payload.inputs.pull_number) {
      prs = [{ number: parseInt(payload.inputs.pull_number, 10) }];
    } else if (payload.action === 'labeled' && payload.label && payload.label.name === 'copilot-approved') {
      prs = [{ number: payload.pull_request.number }];
    }

    if (!prs.length) {
      console.log('No associated pull requests found for approval run.');
      // Fallback: try to find open PRs that match the workflow_run head sha or branch
      if (run && run.head_sha) {
        console.log('Attempt fallback lookup for head_sha:', run.head_sha);
        try {
          const octFallback = new (require('@octokit/rest').Octokit)({ auth: process.env.GITHUB_TOKEN });
          const pullsResp = await octFallback.rest.pulls.list({ owner, repo, state: 'open', per_page: 100 });
          const matches = pullsResp.data.filter(p => p.head && (p.head.sha === run.head_sha || p.head.ref === run.head_branch));
          if (matches && matches.length) {
            prs = matches.map(p => ({ number: p.number }));
            console.log('Found open PRs matching head_sha/head_branch:', prs.map(p => p.number));
          } else {
            console.log('No open PRs matched head_sha/head_branch.');
          }
        } catch (e) {
          console.log('Fallback PR lookup failed:', e.message || e);
        }
      }

      if (!prs.length) {
        // Dump more debugging info to help diagnose pipeline-trigger scenarios
        console.log('Payload event name:', payload.event_name || payload.action || process.env.GITHUB_EVENT_NAME || null);
        console.log('workflow_run present:', !!payload.workflow_run);
        console.log('workflow_run.pull_requests:', (payload.workflow_run && payload.workflow_run.pull_requests) ? JSON.stringify((payload.workflow_run.pull_requests || []).map(p => ({ number: p.number, head: p.head && p.head.sha }))) : null);
        process.exit(0);
      }
    }

    const { Octokit } = await import('@octokit/rest');
    const { createAppAuth } = await import('@octokit/auth-app');

    function getOctokitForToken(token){
      if (!token) return new Octokit({ auth: process.env.GITHUB_TOKEN });
      return new Octokit({ auth: token });
    }

    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');

    for (const pr of prs) {
      const prNumber = pr.number;

      const githubOct = new Octokit({ auth: process.env.GITHUB_TOKEN });
      const labelsResp = await githubOct.rest.issues.listLabelsOnIssue({ owner, repo, issue_number: prNumber });
      const labels = labelsResp.data.map(l => l.name);
      if (!labels.includes('copilot-approved')) {
        console.log(`PR #${prNumber} missing 'copilot-approved' label; skipping approval.`);
        continue;
      }

      // Get the PR head sha so we can attach a Check Run (preferred) or a commit status (fallback)
      const prResp = await githubOct.rest.pulls.get({ owner, repo, pull_number: prNumber });
      const headSha = prResp.data.head.sha;

      let oct = githubOct;
      let approverName = 'github-actions[bot]';

      // Create an automated check/status to record that the Copilot-approved + CI condition was met.
      async function createAutoApproveCheck(octClient, owner, repo, sha) {
        const checkName = 'mediapruner/auto-approve';
        try {
          // Skip if a successful check run already exists for this ref
          try {
            const existing = await octClient.rest.checks.listForRef({ owner, repo, ref: sha });
            if (existing && existing.data && existing.data.check_runs && existing.data.check_runs.some(c => c.name === checkName && c.conclusion === 'success')) {
              console.log(`Check run '${checkName}' already present and successful for ${sha}; skipping creation.`);
              return { created: false, method: 'checks' };
            }
          } catch (e) {
            // Non-fatal: listing checks can fail if checks permission is missing
            console.log('Listing checks failed (non-fatal):', e.message || e);
          }

          const res = await octClient.rest.checks.create({
            owner,
            repo,
            name: checkName,
            head_sha: sha,
            status: 'completed',
            conclusion: 'success',
            output: {
              title: 'Auto-approve check',
              summary: 'Automated approval condition met: CI passed and Copilot label detected.'
            }
          });
          console.log(`Created check run '${checkName}' for ${sha}`);
          return { created: true, method: 'checks' };
        } catch (err) {
          console.error('Creating check run failed:', { message: err.message || err, status: err.status || null, data: (err.response && err.response.data) ? err.response.data : null });
          try {
            await octClient.rest.repos.createCommitStatus({ owner, repo, sha, state: 'success', context: checkName, description: 'Automated approval condition met (copilot label + CI).' });
            console.log(`Created commit status '${checkName}' for ${sha}`);
            return { created: true, method: 'status' };
          } catch (e2) {
            console.error('Fallback commit status creation failed:', { message: e2.message || e2, status: e2.status || null, data: (e2.response && e2.response.data) ? e2.response.data : null });
            return { created: false, method: 'none' };
          }
        }
      }

      // Authenticate as GitHub App installation or machine PAT before creating check/status
      const appId = process.env.AUTO_APPROVE_APP_ID;
      const appPrivateKey = process.env.AUTO_APPROVE_APP_PRIVATE_KEY;

      if (appId && appPrivateKey) {
        console.log('AUTO_APPROVE_APP_ID and PRIVATE_KEY found: authenticating as GitHub App installation');
        const appAuth = createAppAuth({ appId: parseInt(appId, 10), privateKey: appPrivateKey });
        const appAuthentication = await appAuth({ type: 'app' });
        const appOct = new Octokit({ auth: appAuthentication.token });
        const installationResp = await appOct.rest.apps.getRepoInstallation({ owner, repo });
        console.log('Installation permissions:', JSON.stringify(installationResp.data.permissions || {}));
        console.log('Installation repository_selection:', installationResp.data.repository_selection || 'unknown');
        const installationId = installationResp.data.id;
        const installationAuthentication = await appAuth({ type: 'installation', installationId });
        oct = new Octokit({ auth: installationAuthentication.token });
        try {
          const appInfo = await appOct.rest.apps.getAuthenticated();
          approverName = appInfo.data.slug + '[app]';
        } catch (e) {
          approverName = `app:${appId}`;
        }
      } else if (process.env.AUTO_APPROVE_PAT) {
        console.log('AUTO_APPROVE_PAT found: authenticating with machine PAT');
        oct = getOctokitForToken(process.env.AUTO_APPROVE_PAT);
        const me = await oct.rest.users.getAuthenticated();
        approverName = me.data.login;
      } else {
        console.log('No AUTO_APPROVE_APP or AUTO_APPROVE_PAT found: falling back to github-actions[bot]');
        oct = githubOct;
        approverName = 'github-actions[bot]';
      }

      // will try to create check/status to signal auto-approval (using installation/PAT client)
      const checkResult = await createAutoApproveCheck(oct, owner, repo, headSha);
      if (checkResult.created) {
        try {
          const body = 'Automated approval signal created:\n- check/context: `mediapruner/auto-approve` (method: ' + checkResult.method + ').\nIf desired, add this check to branch protection required checks to allow automatic merges.';
          await githubOct.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
        } catch (e) {
          console.log('Failed to create PR comment about auto-approve check:', e.message || e);
        }
      } else {
        // If we couldn't create a check/status, notify repo admins of required app permissions
        try {
          const body = 'Automated approval could not create the repository check/status required for auto-merging.\n\nTo enable this: either grant the GitHub App `Checks` (write) or `Commit statuses` permission and reinstall it, or add a machine PAT as the `AUTO_APPROVE_PAT` repo secret.';
          await githubOct.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
        } catch (e) {
          console.log('Failed to create PR comment about missing permissions:', e.message || e);
        }
      }


      // Authentication already handled above (app installation or PAT); oct and approverName are set.

      const reviews = await oct.rest.pulls.listReviews({ owner, repo, pull_number: prNumber });
      const hasApproval = reviews.data.some(r => r.state === 'APPROVED');
      if (hasApproval) {
        console.log(`PR #${prNumber} already has an approval from ${approverName}; skipping.`);
        continue;
      }

      try {
        await oct.rest.pulls.createReview({ owner, repo, pull_number: prNumber, event: 'APPROVE', body: `Approved automatically after CI checks passed and Copilot label detected (${approverName}).` });
        console.log(`Approved PR #${prNumber} via ${approverName}.`);
      } catch (err) {
        console.error('Approval failed for PR #' + prNumber + ':', err.message || err);
        await githubOct.rest.issues.createComment({ owner, repo, issue_number: prNumber, body: `Automated approval failed when attempting to approve PR #${prNumber} as **${approverName}**.\n\nError: \`${err.message||err}\`.\n\nCommon causes: check workflow permissions or App/PAT secrets.` });
        process.exit(2);
      }
    }

    process.exit(0);
  } catch (e) {
    console.error('Fatal error:', e);
    process.exit(1);
  }
})();
