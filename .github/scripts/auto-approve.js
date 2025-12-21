;(async()=>{
  try{
    const fs = require('fs');
    const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    console.log('DEBUG payload.inputs', payload.inputs || null);

    let prs = [];
    const run = payload.workflow_run || {};
    if (run.pull_requests && run.pull_requests.length) {
      prs = run.pull_requests;
    } else if (payload.action === 'labeled' && payload.label && payload.label.name === 'copilot-approved') {
      prs = [{ number: payload.pull_request.number }];
    } else if (payload.inputs && payload.inputs.pull_number) {
      prs = [{ number: parseInt(payload.inputs.pull_number, 10) }];
    }

    if (!prs.length) {
      console.log('No associated pull requests found for approval run.');
      process.exit(0);
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

      let oct = githubOct;
      let approverName = 'github-actions[bot]';

      const appId = process.env.AUTO_APPROVE_APP_ID;
      const appPrivateKey = process.env.AUTO_APPROVE_APP_PRIVATE_KEY;

      if (appId && appPrivateKey) {
        console.log('AUTO_APPROVE_APP_ID and PRIVATE_KEY found: authenticating as GitHub App installation');
        const appAuth = createAppAuth({ appId: parseInt(appId, 10), privateKey: appPrivateKey });
        const appAuthentication = await appAuth({ type: 'app' });
        const appOct = new Octokit({ auth: appAuthentication.token });
        const installationResp = await appOct.rest.apps.getRepoInstallation({ owner, repo });
        const installationId = installationResp.data.id;
        const installationAuthentication = await appAuth({ type: 'installation', installationId });
        oct = new Octokit({ auth: installationAuthentication.token });
        const me = await oct.rest.users.getAuthenticated();
        approverName = me.data.login;

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

      const reviews = await oct.rest.pulls.listReviews({ owner, repo, pull_number: prNumber });
      const hasApproval = reviews.data.some(r => r.state === 'APPROVED' && r.user && r.user.login === approverName);
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
