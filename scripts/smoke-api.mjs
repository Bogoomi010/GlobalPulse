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

const command = (args) =>
  execFileSync(wranglerBin, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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
    'TOSS_CLIENT_KEY=test_ck_smoke',
    '--binding',
    'TOSS_SECRET_KEY=test_sk_smoke',
    '--log-level',
    'error',
    '--show-interactive-dev-session=false',
    '--install-skills=false',
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

  const walletWithoutAuth = await jsonRequest(baseUrl, '/api/wallet');
  assert(walletWithoutAuth.response.status === 401, 'Wallet API must reject missing session');

  const login = await jsonRequest(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'smoke@example.com',
      displayName: 'Smoke Tester',
      countryCode: 'KR',
    }),
  });
  assert(login.response.ok, 'POST /api/auth/login failed');
  assert(login.body.user.sessionToken, 'Login did not return a session token');
  assert(login.body.wallet.balance === 0, 'New wallet should start at 0');

  const auth = { Authorization: `Bearer ${login.body.user.sessionToken}` };
  const wallet = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', { headers: auth });
  assert(wallet.response.ok, 'Authorized wallet request failed');
  assert(wallet.body.plans.some((plan) => plan.id === 'krw-1000-toss'), 'KRW 1,000 plan missing');

  const anonymousToken = randomUUID();
  const like = await jsonRequest(baseUrl, '/api/reactions', {
    method: 'POST',
    body: JSON.stringify({ anonymousToken, issueId: 'issue-001', reactionType: 'like' }),
  });
  assert(like.response.ok, 'Like reaction failed');
  assert(like.body.currentReaction === 'like', 'Like reaction was not stored');

  const unlike = await jsonRequest(baseUrl, '/api/reactions', {
    method: 'POST',
    body: JSON.stringify({ anonymousToken, issueId: 'issue-001', reactionType: 'like' }),
  });
  assert(unlike.response.ok, 'Reaction cancel failed');
  assert(unlike.body.currentReaction === null, 'Repeated like should cancel reaction');

  const commentWithoutAuth = await jsonRequest(baseUrl, '/api/comments', {
    method: 'POST',
    body: JSON.stringify({
      issueId: 'issue-001',
      content: 'No auth',
      idempotencyKey: randomUUID(),
    }),
  });
  assert(commentWithoutAuth.response.status === 401, 'Comment API must reject missing session');

  const insufficientComment = await jsonRequest(baseUrl, '/api/comments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      issueId: 'issue-001',
      content: 'Too early',
      idempotencyKey: randomUUID(),
    }),
  });
  assert(insufficientComment.response.status === 402, 'Comment should require at least 100 KRW');

  command([
    'd1',
    'execute',
    'DB',
    '--local',
    '--persist-to',
    persistTo,
    '--command',
    `UPDATE wallets SET balance_amount = 200 WHERE user_id = '${login.body.user.id}'`,
  ]);

  const invalidIssueComment = await jsonRequest(baseUrl, '/api/comments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      issueId: 'missing-issue',
      content: 'Missing issue should not charge',
      idempotencyKey: randomUUID(),
    }),
  });
  assert(invalidIssueComment.response.status === 404, 'Missing issue comment should be rejected');

  const walletAfterInvalidIssue = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', {
    headers: auth,
  });
  assert(walletAfterInvalidIssue.response.ok, 'Wallet request after missing issue comment failed');
  assert(
    walletAfterInvalidIssue.body.wallet.balance === 200,
    'Missing issue comment should not subtract wallet balance',
  );

  const paidCommentKey = randomUUID();
  const paidComment = await jsonRequest(baseUrl, '/api/comments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      issueId: 'issue-001',
      content: 'Smoke test paid comment',
      idempotencyKey: paidCommentKey,
    }),
  });
  assert(paidComment.response.ok, 'Paid comment failed after wallet top-up');
  assert(paidComment.body.wallet.balance === 100, 'Paid comment should subtract 100 KRW');
  assert(paidComment.body.comment.userId === login.body.user.id, 'Paid comment should include author userId');

  const duplicatePaidComment = await jsonRequest(baseUrl, '/api/comments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      issueId: 'issue-001',
      content: 'Smoke test duplicate paid comment',
      idempotencyKey: paidCommentKey,
    }),
  });
  assert(duplicatePaidComment.response.ok, 'Duplicate paid comment request failed');
  assert(duplicatePaidComment.body.status === 'duplicate', 'Duplicate paid comment should be idempotent');
  assert(
    duplicatePaidComment.body.commentId === paidComment.body.comment.id,
    'Duplicate paid comment should return the original comment id',
  );

  const walletAfterDuplicateComment = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', {
    headers: auth,
  });
  assert(walletAfterDuplicateComment.response.ok, 'Wallet request after duplicate comment failed');
  assert(
    walletAfterDuplicateComment.body.wallet.balance === 100,
    'Duplicate paid comment should not subtract wallet balance again',
  );

  const report = await jsonRequest(baseUrl, '/api/comment-reports', {
    method: 'POST',
    body: JSON.stringify({
      commentId: paidComment.body.comment.id,
      anonymousToken: randomUUID(),
      reason: 'policy_review',
    }),
  });
  assert(report.response.ok, 'Comment report failed');
  assert(report.body.status === 'received', 'Comment report should be accepted');

  const commentsAfterReport = await jsonRequest(
    baseUrl,
    `/api/comments?issueId=${paidComment.body.comment.issueId}`,
  );
  assert(commentsAfterReport.response.ok, 'Comment list after report failed');
  assert(
    commentsAfterReport.body.comments.some(
      (comment) => comment.id === paidComment.body.comment.id && comment.status === 'reported',
    ),
    'Reported comment should stay visible with reported status',
  );

  const deleteComment = await jsonRequest(
    baseUrl,
    `/api/comments?commentId=${paidComment.body.comment.id}`,
    {
      method: 'DELETE',
      headers: auth,
    },
  );
  assert(deleteComment.response.ok, 'Comment delete request failed');
  assert(deleteComment.body.deleted === true, 'Own comment should be deleted');

  const commentsAfterDelete = await jsonRequest(
    baseUrl,
    `/api/comments?issueId=${paidComment.body.comment.issueId}`,
  );
  assert(commentsAfterDelete.response.ok, 'Comment list after delete failed');
  assert(
    !commentsAfterDelete.body.comments.some((comment) => comment.id === paidComment.body.comment.id),
    'Deleted comment should not be returned',
  );

  const payment = await jsonRequest(baseUrl, '/api/payments/create', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      planId: 'krw-1000-toss',
      idempotencyKey: randomUUID(),
      origin: baseUrl,
    }),
  });
  assert(payment.response.ok, 'Payment creation failed');
  assert(payment.body.status === 'pending', 'Payment should start as pending');
  assert(payment.body.orderId.startsWith('gp_'), 'Payment orderId should use GlobalPulse prefix');

  const paymentFail = await jsonRequest(baseUrl, '/api/payments/fail', {
    method: 'POST',
    body: JSON.stringify({
      orderId: payment.body.orderId,
      code: 'PAY_PROCESS_CANCELED',
      message: 'Smoke test cancellation',
    }),
  });
  assert(paymentFail.response.ok, 'Payment failure recording failed');
  assert(paymentFail.body.status === 'cancelled', 'Cancelled payment should be recorded as cancelled');
  assert(paymentFail.body.transactionRecorded === true, 'Cancelled payment should create a transaction');

  const repeatedPaymentFail = await jsonRequest(baseUrl, '/api/payments/fail', {
    method: 'POST',
    body: JSON.stringify({
      orderId: payment.body.orderId,
      code: 'PAY_PROCESS_CANCELED',
      message: 'Smoke test cancellation retry',
    }),
  });
  assert(repeatedPaymentFail.response.ok, 'Repeated payment failure recording failed');
  assert(
    repeatedPaymentFail.body.transactionRecorded === false,
    'Repeated payment failure should not create duplicate transactions',
  );

  const walletAfterFailedPayment = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', {
    headers: auth,
  });
  assert(walletAfterFailedPayment.response.ok, 'Wallet request after failed payment failed');
  assert(
    walletAfterFailedPayment.body.wallet.balance === 100,
    'Cancelled payment should not increase wallet balance',
  );
  assert(
    walletAfterFailedPayment.body.transactions.some(
      (transaction) =>
        transaction.type === 'topup' &&
        transaction.status === 'cancelled' &&
        transaction.amount === payment.body.amount &&
        transaction.label === `payment:${payment.body.paymentId}:cancelled`,
    ),
    'Cancelled payment should appear in wallet transaction history',
  );

  console.log('GlobalPulse API smoke test passed');
} catch (error) {
  console.error(wranglerOutput);
  throw error;
} finally {
  wrangler.kill('SIGTERM');
}
