import { execFileSync, spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const persistTo = '.wrangler/smoke-state';
const wranglerBin = path.join(root, 'node_modules', '.bin', 'wrangler');
const smokeWebhookSecret = 'smoke-webhook-secret-for-tests';

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

const signedWebhookRequest = async (baseUrl, payload) => {
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const signature = createHmac('sha256', smokeWebhookSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  return jsonRequest(baseUrl, '/api/payments/webhook', {
    method: 'POST',
    headers: {
      'x-toss-timestamp': timestamp,
      'x-toss-signature': signature,
    },
    body,
  });
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

const startTossMock = async () => {
  const paymentsByKey = new Map();
  const paymentsByOrder = new Map();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    if (request.method === 'POST' && url.pathname === '/v1/payments/confirm') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const payment = {
        paymentKey: body.paymentKey,
        orderId: body.orderId,
        totalAmount: Number(body.amount),
        currency: 'KRW',
        status: 'DONE',
        cancels: null,
      };
      paymentsByKey.set(payment.paymentKey, payment);
      paymentsByOrder.set(payment.orderId, payment);
      send(200, payment);
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/v1/payments/orders/')) {
      const orderId = decodeURIComponent(url.pathname.replace('/v1/payments/orders/', ''));
      const payment = paymentsByOrder.get(orderId);
      send(payment ? 200 : 404, payment || { message: 'Payment not found' });
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/v1/payments/')) {
      const paymentKey = decodeURIComponent(url.pathname.replace('/v1/payments/', ''));
      const payment = paymentsByKey.get(paymentKey);
      send(payment ? 200 : 404, payment || { message: 'Payment not found' });
      return;
    }

    send(404, { message: 'Unhandled Toss mock route' });
  });

  const port = await freePort();
  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    cancelPayment(paymentKey, cancelAmount) {
      const payment = paymentsByKey.get(paymentKey);
      if (!payment) throw new Error(`Missing mock payment ${paymentKey}`);
      const cancelled = {
        ...payment,
        status: 'CANCELED',
        cancels: [{ cancelAmount, transactionKey: `mock_cancel_${paymentKey}` }],
      };
      paymentsByKey.set(paymentKey, cancelled);
      paymentsByOrder.set(payment.orderId, cancelled);
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

fs.rmSync(path.join(root, persistTo), { force: true, recursive: true });
execFileSync('node', ['scripts/apply-local-migrations.mjs', persistTo], {
  cwd: root,
  stdio: 'inherit',
});

const tossMock = await startTossMock();
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
    '--binding',
    'TOSS_CLIENT_KEY=test_ck_smoke',
    '--binding',
    'TOSS_SECRET_KEY=test_sk_smoke',
    '--binding',
    `TOSS_WEBHOOK_SECRET=${smokeWebhookSecret}`,
    '--binding',
    `TOSS_API_BASE_URL=${tossMock.baseUrl}`,
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

  const reportToken = randomUUID();
  const report = await jsonRequest(baseUrl, '/api/comment-reports', {
    method: 'POST',
    body: JSON.stringify({
      commentId: paidComment.body.comment.id,
      anonymousToken: reportToken,
      reason: 'policy_review',
    }),
  });
  assert(report.response.ok, 'Comment report failed');
  assert(report.body.status === 'received', 'Comment report should be accepted');

  const duplicateReport = await jsonRequest(baseUrl, '/api/comment-reports', {
    method: 'POST',
    body: JSON.stringify({
      commentId: paidComment.body.comment.id,
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
    `/api/comments?issueId=${paidComment.body.comment.issueId}`,
  );
  assert(commentsAfterReport.response.ok, 'Comment list after report failed');
  assert(
    commentsAfterReport.body.comments.some(
      (comment) => comment.id === paidComment.body.comment.id && comment.status === 'reported',
    ),
    'Reported comment should stay visible with reported status',
  );

  const moderationWithoutAuth = await jsonRequest(baseUrl, '/api/moderation/reports');
  assert(moderationWithoutAuth.response.status === 401, 'Moderation reports must reject missing admin token');

  const moderationAuth = { Authorization: 'Bearer smoke-moderation-token' };
  const moderationQueue = await jsonRequest(baseUrl, '/api/moderation/reports?status=open', {
    headers: moderationAuth,
  });
  assert(moderationQueue.response.ok, 'Moderation report queue failed');
  assert(
    moderationQueue.body.reports.some(
      (item) =>
        item.commentId === paidComment.body.comment.id &&
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
      commentId: paidComment.body.comment.id,
      note: 'Smoke test hide',
    }),
  });
  assert(hideReportedComment.response.ok, 'Moderation hide action failed');
  assert(hideReportedComment.body.commentStatus === 'hidden', 'Moderation hide should hide the comment');
  assert(hideReportedComment.body.openReportCount === 0, 'Moderation hide should close open reports');

  const commentsAfterModerationHide = await jsonRequest(
    baseUrl,
    `/api/comments?issueId=${paidComment.body.comment.issueId}`,
  );
  assert(commentsAfterModerationHide.response.ok, 'Comment list after moderation hide failed');
  assert(
    !commentsAfterModerationHide.body.comments.some((comment) => comment.id === paidComment.body.comment.id),
    'Hidden moderated comment should not be returned publicly',
  );

  const reviewedModerationQueue = await jsonRequest(baseUrl, '/api/moderation/reports?status=reviewed', {
    headers: moderationAuth,
  });
  assert(reviewedModerationQueue.response.ok, 'Reviewed moderation report queue failed');
  assert(
    reviewedModerationQueue.body.reports.some(
      (item) =>
        item.commentId === paidComment.body.comment.id &&
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
      commentId: paidComment.body.comment.id,
      note: 'Smoke test restore',
    }),
  });
  assert(restoreReportedComment.response.ok, 'Moderation restore action failed');
  assert(restoreReportedComment.body.commentStatus === 'visible', 'Moderation restore should make the comment visible');

  const commentsAfterModerationRestore = await jsonRequest(
    baseUrl,
    `/api/comments?issueId=${paidComment.body.comment.issueId}`,
  );
  assert(commentsAfterModerationRestore.response.ok, 'Comment list after moderation restore failed');
  assert(
    commentsAfterModerationRestore.body.comments.some(
      (comment) => comment.id === paidComment.body.comment.id && comment.status === 'visible',
    ),
    'Restored moderated comment should be returned publicly',
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
  assert(
    payment.body.successUrl === `${baseUrl}/payment/success` &&
      payment.body.failUrl === `${baseUrl}/payment/fail`,
    'Payment callback URLs should use the configured public origin',
  );

  const hostileOriginPayment = await jsonRequest(baseUrl, '/api/payments/create', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      planId: 'krw-1000-toss',
      idempotencyKey: randomUUID(),
      origin: 'https://evil.example',
    }),
  });
  assert(hostileOriginPayment.response.ok, 'Payment creation with hostile origin body failed');
  assert(
    hostileOriginPayment.body.successUrl === `${baseUrl}/payment/success` &&
      hostileOriginPayment.body.failUrl === `${baseUrl}/payment/fail`,
    'Configured public origin must override client-supplied payment callback origin',
  );

  const paidPayment = await jsonRequest(baseUrl, '/api/payments/create', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      planId: 'krw-1000-toss',
      idempotencyKey: randomUUID(),
      origin: baseUrl,
    }),
  });
  assert(paidPayment.response.ok, 'Paid payment creation failed');

  const confirmPayment = await jsonRequest(baseUrl, '/api/payments/confirm', {
    method: 'POST',
    body: JSON.stringify({
      paymentKey: `mock_${paidPayment.body.orderId}`,
      orderId: paidPayment.body.orderId,
      amount: paidPayment.body.amount,
    }),
  });
  assert(confirmPayment.response.ok, 'Payment confirmation failed');
  assert(confirmPayment.body.status === 'paid', 'Payment confirmation should mark payment paid');
  assert(confirmPayment.body.wallet.balance === 1100, 'Confirmed payment should increase wallet balance');

  const duplicateConfirmPayment = await jsonRequest(baseUrl, '/api/payments/confirm', {
    method: 'POST',
    body: JSON.stringify({
      paymentKey: `mock_${paidPayment.body.orderId}`,
      orderId: paidPayment.body.orderId,
      amount: paidPayment.body.amount,
    }),
  });
  assert(duplicateConfirmPayment.response.ok, 'Duplicate payment confirmation failed');
  assert(
    duplicateConfirmPayment.body.alreadyProcessed === true,
    'Duplicate payment confirmation should be idempotent',
  );

  const walletAfterConfirmedPayment = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', {
    headers: auth,
  });
  assert(walletAfterConfirmedPayment.response.ok, 'Wallet request after confirmed payment failed');
  assert(
    walletAfterConfirmedPayment.body.wallet.balance === 1100,
    'Duplicate payment confirmation should not increase wallet balance twice',
  );
  assert(
    walletAfterConfirmedPayment.body.transactions.some(
      (transaction) =>
        transaction.type === 'topup' &&
        transaction.status === 'completed' &&
        transaction.amount === paidPayment.body.amount &&
        transaction.label === 'Wallet top-up completed' &&
        transaction.reference === `payment:${paidPayment.body.paymentId}`,
    ),
    'Confirmed payment should appear in wallet transaction history',
  );

  const cancellationWebhookPayload = {
    eventType: 'PAYMENT_STATUS_CHANGED',
    data: {
      paymentKey: `mock_${paidPayment.body.orderId}`,
      orderId: paidPayment.body.orderId,
    },
  };

  const unsignedCancellationWebhook = await jsonRequest(baseUrl, '/api/payments/webhook', {
    method: 'POST',
    body: JSON.stringify(cancellationWebhookPayload),
  });
  assert(
    unsignedCancellationWebhook.response.status === 401,
    'Webhook must reject missing Toss signature when webhook secret is configured',
  );

  const invalidSignatureCancellationWebhook = await jsonRequest(baseUrl, '/api/payments/webhook', {
    method: 'POST',
    headers: {
      'x-toss-timestamp': new Date().toISOString(),
      'x-toss-signature': 'invalid-signature',
    },
    body: JSON.stringify(cancellationWebhookPayload),
  });
  assert(
    invalidSignatureCancellationWebhook.response.status === 401,
    'Webhook must reject invalid Toss signature',
  );

  tossMock.cancelPayment(`mock_${paidPayment.body.orderId}`, paidPayment.body.amount);
  const cancellationWebhook = await signedWebhookRequest(baseUrl, cancellationWebhookPayload);
  assert(cancellationWebhook.response.ok, 'Paid payment cancellation webhook failed');
  assert(cancellationWebhook.body.status === 'refunded', 'Full cancellation should mark payment refunded');
  assert(cancellationWebhook.body.refundRecorded === true, 'Cancellation webhook should record a refund');
  assert(cancellationWebhook.body.walletAdjusted === true, 'Cancellation webhook should adjust wallet balance');

  const repeatedCancellationWebhook = await signedWebhookRequest(baseUrl, cancellationWebhookPayload);
  assert(repeatedCancellationWebhook.response.ok, 'Repeated cancellation webhook failed');
  assert(
    repeatedCancellationWebhook.body.refundRecorded === false,
    'Repeated cancellation webhook should not duplicate refund transactions',
  );

  const walletAfterRefund = await jsonRequest(baseUrl, '/api/wallet?countryCode=KR', {
    headers: auth,
  });
  assert(walletAfterRefund.response.ok, 'Wallet request after refund failed');
  assert(walletAfterRefund.body.wallet.balance === 100, 'Refund should subtract the top-up from wallet balance');
  assert(
    walletAfterRefund.body.transactions.some(
      (transaction) =>
        transaction.type === 'refund' &&
        transaction.status === 'completed' &&
        transaction.amount === -paidPayment.body.amount &&
        transaction.label === 'Payment refund',
    ),
    'Refund should appear in wallet transaction history',
  );

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
        transaction.label === 'Wallet top-up cancelled' &&
        transaction.reference === `payment:${payment.body.paymentId}:cancelled`,
    ),
    'Cancelled payment should appear in wallet transaction history',
  );

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
  await tossMock.close();
}
