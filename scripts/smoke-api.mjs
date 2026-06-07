import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const persistTo = '.wrangler/smoke-state';
const wranglerBin = path.join(root, 'node_modules', '.bin', 'wrangler');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const jsonRequest = async (baseUrl, pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { body, response };
};

const freePort = async () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Unable to allocate port'));
      });
    });
    server.on('error', reject);
  });

const waitForServer = async (baseUrl, process) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Wrangler exited early with code ${process.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/issues`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Timed out waiting for Wrangler Pages dev');
};

fs.rmSync(path.join(root, persistTo), { force: true, recursive: true });
execFileSync('node', ['scripts/apply-local-migrations.mjs', persistTo], {
  cwd: root,
  stdio: 'inherit',
});

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const wrangler = spawn(
  wranglerBin,
  [
    'pages',
    'dev',
    'dist',
    '--persist-to',
    persistTo,
    '--port',
    String(port),
    '--ip',
    '127.0.0.1',
    '--binding',
    'SESSION_TOKEN_SECRET=smoke-session-secret',
    '--binding',
    'MODERATION_ADMIN_TOKEN=smoke-moderation-token',
    '--binding',
    `APP_PUBLIC_ORIGIN=${baseUrl}`,
    '--binding',
    'ALLOW_DEMO_LOGIN=true',
    '--binding',
    'AUTH_PROVIDER=resend',
    '--binding',
    'AUTH_EMAIL_DELIVERY=log',
    '--log-level',
    'error',
    '--show-interactive-dev-session=false',
    '--no-install-skills',
  ],
  {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let wranglerOutput = '';
wrangler.stdout.on('data', (chunk) => {
  wranglerOutput += chunk.toString();
});
wrangler.stderr.on('data', (chunk) => {
  wranglerOutput += chunk.toString();
});

try {
  await waitForServer(baseUrl, wrangler);

  const issues = await jsonRequest(baseUrl, '/api/issues');
  assert(issues.response.ok, 'GET /api/issues failed');
  assert(issues.body.issues.length === 20, 'Expected 20 seeded issues');
  const reactionIssue = issues.body.issues.find((issue) => issue.id === 'issue-001');
  assert(reactionIssue, 'Expected issue-001 in seeded issues');

  const walletWithoutAuth = await jsonRequest(baseUrl, '/api/wallet');
  assert(walletWithoutAuth.response.status === 401, 'Wallet API must reject missing session');

  const paymentCreate = await jsonRequest(baseUrl, '/api/payments/create', {
    method: 'POST',
    body: JSON.stringify({
      planId: 'removed',
      idempotencyKey: randomUUID(),
    }),
  });
  assert(paymentCreate.response.status === 410, 'Payment creation must stay disabled');

  const loginCode = await jsonRequest(baseUrl, '/api/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({
      email: 'smoke@example.com',
      displayName: 'Smoke Tester',
      countryCode: 'KR',
    }),
  });
  assert(loginCode.response.ok, 'Email login code request failed');
  assert(loginCode.body.status === 'code_sent', 'Email login code should be sent');
  assert(/^\d{6}$/.test(loginCode.body.devCode), 'Local email log mode should return a dev code');

  const login = await jsonRequest(baseUrl, '/api/auth/verify-code', {
    method: 'POST',
    body: JSON.stringify({
      email: 'smoke@example.com',
      code: loginCode.body.devCode,
    }),
  });
  assert(login.response.ok, 'POST /api/auth/verify-code failed');
  assert(login.body.user.sessionToken, 'Login did not return a session token');
  assert(login.body.wallet.balance === 0, 'New wallet should start at 0');

  const auth = { Authorization: `Bearer ${login.body.user.sessionToken}` };
  const currentUser = await jsonRequest(baseUrl, '/api/auth/me', { headers: auth });
  assert(currentUser.response.ok, 'Current user session request failed');
  assert(currentUser.body.user.id === login.body.user.id, 'Current user should match login session');

  const wallet = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', { headers: auth });
  assert(wallet.response.ok, 'Authorized wallet request failed');
  assert(wallet.body.wallet.balance === 0, 'Wallet balance should remain zero without payments');
  assert(Array.isArray(wallet.body.plans) && wallet.body.plans.length === 0, 'Wallet must not expose payment plans');

  const anonymousToken = randomUUID();
  const like = await jsonRequest(baseUrl, '/api/reactions', {
    method: 'POST',
    body: JSON.stringify({ anonymousToken, issueId: 'issue-001', reactionType: 'like' }),
  });
  assert(like.response.ok, 'Like reaction failed');
  assert(like.body.currentReaction === 'like', 'Like reaction was not stored');
  assert(like.body.likes === reactionIssue.likes + 1, 'Like should increment issue like count');
  assert(like.body.dislikes === reactionIssue.dislikes, 'Like should not change issue dislike count');

  const issuesAfterLike = await jsonRequest(baseUrl, '/api/issues');
  assert(issuesAfterLike.response.ok, 'Issue list after like failed');
  const issueAfterLike = issuesAfterLike.body.issues.find((issue) => issue.id === 'issue-001');
  assert(issueAfterLike, 'Expected issue-001 after like');
  assert(issueAfterLike.likes === reactionIssue.likes + 1, 'Like should persist in issue aggregate');

  const switchToDislike = await jsonRequest(baseUrl, '/api/reactions', {
    method: 'POST',
    body: JSON.stringify({ anonymousToken, issueId: 'issue-001', reactionType: 'dislike' }),
  });
  assert(switchToDislike.response.ok, 'Reaction switch to dislike failed');
  assert(switchToDislike.body.currentReaction === 'dislike', 'Reaction should switch to dislike');
  assert(switchToDislike.body.likes === reactionIssue.likes, 'Switch should remove previous like');
  assert(
    switchToDislike.body.dislikes === reactionIssue.dislikes + 1,
    'Switch should increment dislike count',
  );

  const issuesAfterSwitch = await jsonRequest(baseUrl, '/api/issues');
  assert(issuesAfterSwitch.response.ok, 'Issue list after reaction switch failed');
  const issueAfterSwitch = issuesAfterSwitch.body.issues.find((issue) => issue.id === 'issue-001');
  assert(issueAfterSwitch, 'Expected issue-001 after reaction switch');
  assert(issueAfterSwitch.likes === reactionIssue.likes, 'Reaction switch should persist removed like');
  assert(
    issueAfterSwitch.dislikes === reactionIssue.dislikes + 1,
    'Reaction switch should persist added dislike',
  );

  const cancelDislike = await jsonRequest(baseUrl, '/api/reactions', {
    method: 'POST',
    body: JSON.stringify({ anonymousToken, issueId: 'issue-001', reactionType: 'dislike' }),
  });
  assert(cancelDislike.response.ok, 'Reaction cancel failed');
  assert(cancelDislike.body.currentReaction === null, 'Repeated dislike should cancel reaction');
  assert(cancelDislike.body.likes === reactionIssue.likes, 'Cancel should restore original like count');
  assert(
    cancelDislike.body.dislikes === reactionIssue.dislikes,
    'Cancel should restore original dislike count',
  );

  const commentWithoutAuth = await jsonRequest(baseUrl, '/api/comments', {
    method: 'POST',
    body: JSON.stringify({
      issueId: 'issue-001',
      content: 'No auth',
      idempotencyKey: randomUUID(),
    }),
  });
  assert(commentWithoutAuth.response.status === 401, 'Comment API must reject missing session');

  const invalidIssueComment = await jsonRequest(baseUrl, '/api/comments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      issueId: 'missing-issue',
      content: 'Missing issue should not write',
      idempotencyKey: randomUUID(),
    }),
  });
  assert(invalidIssueComment.response.status === 404, 'Missing issue comment should be rejected');

  const walletAfterInvalidIssue = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', {
    headers: auth,
  });
  assert(walletAfterInvalidIssue.response.ok, 'Wallet request after missing issue comment failed');
  assert(walletAfterInvalidIssue.body.wallet.balance === 0, 'Missing issue comment should not affect wallet balance');

  const freeCommentKey = randomUUID();
  const freeComment = await jsonRequest(baseUrl, '/api/comments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      issueId: 'issue-001',
      content: 'Smoke test free comment',
      idempotencyKey: freeCommentKey,
    }),
  });
  assert(freeComment.response.ok, 'Free comment failed');
  assert(freeComment.body.comment.cost === 0, 'Free comment should have zero cost');
  assert(freeComment.body.comment.userId === login.body.user.id, 'Free comment should include author userId');

  const duplicateFreeComment = await jsonRequest(baseUrl, '/api/comments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      issueId: 'issue-001',
      content: 'Smoke test duplicate free comment',
      idempotencyKey: freeCommentKey,
    }),
  });
  assert(duplicateFreeComment.response.ok, 'Duplicate free comment request failed');
  assert(duplicateFreeComment.body.status === 'duplicate', 'Duplicate free comment should be idempotent');
  assert(
    duplicateFreeComment.body.commentId === freeComment.body.comment.id,
    'Duplicate free comment should return the original comment id',
  );

  const walletAfterDuplicateComment = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', {
    headers: auth,
  });
  assert(walletAfterDuplicateComment.response.ok, 'Wallet request after duplicate comment failed');
  assert(walletAfterDuplicateComment.body.wallet.balance === 0, 'Free comments must not subtract wallet balance');

  const reportToken = randomUUID();
  const report = await jsonRequest(baseUrl, '/api/comment-reports', {
    method: 'POST',
    body: JSON.stringify({
      commentId: freeComment.body.comment.id,
      anonymousToken: reportToken,
      reason: 'policy_review',
    }),
  });
  assert(report.response.ok, 'Comment report failed');
  assert(report.body.status === 'received', 'Comment report should be accepted');

  const duplicateReport = await jsonRequest(baseUrl, '/api/comment-reports', {
    method: 'POST',
    body: JSON.stringify({
      commentId: freeComment.body.comment.id,
      anonymousToken: reportToken,
      reason: 'policy_review',
    }),
  });
  assert(duplicateReport.response.ok, 'Duplicate comment report failed');
  assert(duplicateReport.body.status === 'duplicate', 'Duplicate report should be idempotent');
  assert(
    duplicateReport.body.reportId === report.body.reportId,
    'Duplicate report should return the original report id',
  );

  const commentsAfterReport = await jsonRequest(
    baseUrl,
    `/api/comments?issueId=${freeComment.body.comment.issueId}`,
  );
  assert(commentsAfterReport.response.ok, 'Comment list after report failed');
  assert(
    commentsAfterReport.body.comments.some(
      (comment) => comment.id === freeComment.body.comment.id && comment.status === 'reported',
    ),
    'Reported comment should stay visible with reported status',
  );

  const moderationWithoutAuth = await jsonRequest(baseUrl, '/api/moderation/reports');
  assert(moderationWithoutAuth.response.status === 401, 'Moderation reports must reject missing admin token');

  const refreshIssuesWithoutAuth = await jsonRequest(baseUrl, '/api/admin/refresh-issues', {
    method: 'POST',
  });
  assert(refreshIssuesWithoutAuth.response.status === 401, 'Issue refresh must reject missing admin token');

  const adminStatusWithoutAuth = await jsonRequest(baseUrl, '/api/admin/status');
  assert(adminStatusWithoutAuth.response.status === 401, 'Admin status must reject missing admin token');

  const moderationAuth = { Authorization: 'Bearer smoke-moderation-token' };
  const adminStatus = await jsonRequest(baseUrl, '/api/admin/status', {
    headers: moderationAuth,
  });
  assert(adminStatus.response.ok, 'Admin status request failed');
  assert(adminStatus.body.d1.issueCount === 20, 'Admin status should report seeded issue count');
  assert(adminStatus.body.d1.requiredTablesPresent === true, 'Admin status should confirm required D1 tables');
  assert(adminStatus.body.d1.missingTables.length === 0, 'Admin status should not report missing D1 tables');
  assert(
    adminStatus.body.config.appPublicOriginMatchesRequest === true,
    'Admin status should confirm APP_PUBLIC_ORIGIN matches the request origin',
  );
  assert(adminStatus.body.payments.activePlanCount === 0, 'Admin status should confirm disabled payment plans');
  assert(adminStatus.body.payments.legacySecretCount === 0, 'Admin status should confirm no legacy payment secrets');
  assert(
    Array.isArray(adminStatus.body.payments.legacySecretsPresent) &&
      adminStatus.body.payments.legacySecretsPresent.length === 0,
    'Admin status should list no legacy payment secrets',
  );
  assert(adminStatus.body.auth.provider === 'resend', 'Admin status should report resend auth provider');
  assert(adminStatus.body.auth.logDeliveryEnabled === true, 'Smoke admin status should report local log delivery');

  const moderationQueue = await jsonRequest(baseUrl, '/api/moderation/reports?status=open', {
    headers: moderationAuth,
  });
  assert(moderationQueue.response.ok, 'Moderation report queue failed');
  assert(
    moderationQueue.body.reports.some(
      (item) =>
        item.commentId === freeComment.body.comment.id &&
        item.commentStatus === 'reported' &&
        item.openReportCount === 1,
    ),
    'Reported comment should appear in the moderation queue',
  );

  const hideReportedComment = await jsonRequest(baseUrl, '/api/moderation/reports', {
    method: 'PATCH',
    headers: moderationAuth,
    body: JSON.stringify({
      action: 'hide',
      commentId: freeComment.body.comment.id,
      note: 'Smoke test hide',
    }),
  });
  assert(hideReportedComment.response.ok, 'Moderation hide action failed');
  assert(hideReportedComment.body.commentStatus === 'hidden', 'Moderation hide should hide the comment');
  assert(hideReportedComment.body.openReportCount === 0, 'Moderation hide should close open reports');

  const commentsAfterModerationHide = await jsonRequest(
    baseUrl,
    `/api/comments?issueId=${freeComment.body.comment.issueId}`,
  );
  assert(commentsAfterModerationHide.response.ok, 'Comment list after moderation hide failed');
  assert(
    !commentsAfterModerationHide.body.comments.some((comment) => comment.id === freeComment.body.comment.id),
    'Hidden moderated comment should not be returned publicly',
  );

  const reviewedModerationQueue = await jsonRequest(baseUrl, '/api/moderation/reports?status=reviewed', {
    headers: moderationAuth,
  });
  assert(reviewedModerationQueue.response.ok, 'Reviewed moderation report queue failed');
  assert(
    reviewedModerationQueue.body.reports.some(
      (item) =>
        item.commentId === freeComment.body.comment.id &&
        item.review?.action === 'hide' &&
        item.openReportCount === 0,
    ),
    'Reviewed moderation queue should include the hide decision',
  );

  const restoreReportedComment = await jsonRequest(baseUrl, '/api/moderation/reports', {
    method: 'PATCH',
    headers: moderationAuth,
    body: JSON.stringify({
      action: 'restore',
      commentId: freeComment.body.comment.id,
      note: 'Smoke test restore',
    }),
  });
  assert(restoreReportedComment.response.ok, 'Moderation restore action failed');
  assert(restoreReportedComment.body.commentStatus === 'visible', 'Moderation restore should make the comment visible');

  const commentsAfterModerationRestore = await jsonRequest(
    baseUrl,
    `/api/comments?issueId=${freeComment.body.comment.issueId}`,
  );
  assert(commentsAfterModerationRestore.response.ok, 'Comment list after moderation restore failed');
  assert(
    commentsAfterModerationRestore.body.comments.some(
      (comment) => comment.id === freeComment.body.comment.id && comment.status === 'visible',
    ),
    'Restored moderated comment should be returned publicly',
  );

  const deleteComment = await jsonRequest(
    baseUrl,
    `/api/comments?commentId=${freeComment.body.comment.id}`,
    {
      method: 'DELETE',
      headers: auth,
    },
  );
  assert(deleteComment.response.ok, 'Comment delete request failed');
  assert(deleteComment.body.deleted === true, 'Own comment should be deleted');

  const commentsAfterDelete = await jsonRequest(
    baseUrl,
    `/api/comments?issueId=${freeComment.body.comment.issueId}`,
  );
  assert(commentsAfterDelete.response.ok, 'Comment list after delete failed');
  assert(
    !commentsAfterDelete.body.comments.some((comment) => comment.id === freeComment.body.comment.id),
    'Deleted comment should not be returned',
  );

  const paymentConfirm = await jsonRequest(baseUrl, '/api/payments/confirm', {
    method: 'POST',
    body: JSON.stringify({ sessionId: 'removed' }),
  });
  assert(paymentConfirm.response.status === 410, 'Payment confirmation must stay disabled');

  const paymentWebhook = await jsonRequest(baseUrl, '/api/payments/webhook', {
    method: 'POST',
    body: JSON.stringify({ type: 'removed' }),
  });
  assert(paymentWebhook.response.status === 410, 'Payment webhook must stay disabled');

  const logout = await jsonRequest(baseUrl, '/api/auth/logout', {
    method: 'POST',
    headers: auth,
  });
  assert(logout.response.ok, 'Logout request failed');
  assert(logout.body.revoked === true, 'Logout should revoke the current session');

  const walletAfterLogout = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', {
    headers: auth,
  });
  assert(walletAfterLogout.response.status === 401, 'Revoked session should not access wallet');

  console.log('GlobalPulse API smoke test passed');
} catch (error) {
  console.error(wranglerOutput);
  throw error;
} finally {
  wrangler.kill('SIGTERM');
}
