import { Env, hmacHex, tossAuthHeader, verifyTossSignature } from './_shared';

export type PaymentProviderName = 'toss' | 'stripe';

export type ProviderPaymentStatus = 'paid' | 'failed' | 'cancelled';

export type ProviderPayment = {
  providerPaymentId: string;
  providerOrderId: string;
  amount: number;
  canceledAmount: number;
  currencyCode: string;
  rawStatus: string;
  status: ProviderPaymentStatus;
};

export type ConfirmPaymentInput = {
  paymentKey?: string;
  orderId?: string;
  amount?: number;
  idempotencyKey: string;
  sessionId?: string;
};

export type RetrievePaymentInput = {
  paymentKey?: string;
  orderId?: string;
};

export type CheckoutPayloadInput = {
  origin: string;
  paymentId: string;
  orderId: string;
  amount: number;
  currencyCode: string;
  status: string;
  providerPaymentId?: string | null;
};

export type CheckoutPayload = {
  provider: PaymentProviderName;
  paymentId: string;
  orderId: string;
  orderName: string;
  amount: number;
  currency: string;
  status: string;
  clientKey?: string;
  providerPaymentId?: string;
  sessionId?: string;
  checkoutUrl?: string;
  successUrl: string;
  failUrl: string;
};

export type ConfirmPaymentResult =
  | {
      ok: true;
      payment: ProviderPayment;
    }
  | {
      ok: false;
      status: number;
      providerError: unknown;
    };

export type PaymentProviderAdapter = {
  name: PaymentProviderName;
  isReady: (env: Env) => boolean;
  buildCheckoutPayload: (env: Env, input: CheckoutPayloadInput) => Promise<CheckoutPayload>;
  confirmPayment: (env: Env, input: ConfirmPaymentInput) => Promise<ConfirmPaymentResult>;
  retrievePayment: (env: Env, input: RetrievePaymentInput) => Promise<ProviderPayment | null>;
  verifyWebhookSignature: (env: Env, request: Request, rawBody: string) => Promise<boolean>;
};

type TossPayment = {
  paymentKey: string;
  orderId: string;
  amount?: number;
  totalAmount?: number;
  cancels?: Array<{
    cancelAmount?: number;
    transactionKey?: string;
  }> | null;
  currency: string;
  status: string;
};

type StripeCheckoutSession = {
  id: string;
  amount_subtotal?: number | null;
  amount_total?: number | null;
  client_reference_id?: string | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | null;
  payment_status?: string | null;
  status?: string | null;
  url?: string | null;
};

export function getPaymentProvider(name: string): PaymentProviderAdapter | null {
  if (name === 'toss') return tossProvider;
  if (name === 'stripe') return stripeProvider;
  return null;
}

export function configuredPaymentProvider(env: Env): PaymentProviderAdapter | null {
  return getPaymentProvider(env.PAYMENT_PROVIDER || 'stripe');
}

export function normalizeProviderPayment(payment: TossPayment): ProviderPayment {
  const rawStatus = payment.status;
  const amount = Number(payment.totalAmount ?? payment.amount);
  const canceledAmount = getCanceledAmount(payment, amount);
  return {
    providerPaymentId: payment.paymentKey,
    providerOrderId: payment.orderId,
    amount,
    canceledAmount,
    currencyCode: payment.currency,
    rawStatus,
    status: normalizeTossStatus(rawStatus),
  };
}

function normalizeTossStatus(status: string): ProviderPaymentStatus {
  const normalized = status.toUpperCase();
  if (normalized === 'DONE') return 'paid';
  if (normalized.includes('CANCEL')) return 'cancelled';
  return 'failed';
}

function getCanceledAmount(payment: TossPayment, amount: number): number {
  const cancelsAmount = (payment.cancels ?? []).reduce(
    (total, cancel) => total + Number(cancel.cancelAmount ?? 0),
    0,
  );
  if (cancelsAmount > 0) return cancelsAmount;
  return payment.status.toUpperCase() === 'CANCELED' ? amount : 0;
}

const tossProvider: PaymentProviderAdapter = {
  name: 'toss',

  isReady(env) {
    return Boolean(env.TOSS_CLIENT_KEY && env.TOSS_SECRET_KEY);
  },

  async buildCheckoutPayload(env, input) {
    return {
      provider: 'toss',
      paymentId: input.paymentId,
      orderId: input.orderId,
      orderName: orderName(input),
      amount: Number(input.amount),
      currency: input.currencyCode,
      status: input.status,
      clientKey: env.TOSS_CLIENT_KEY,
      successUrl: `${input.origin}/payment/success`,
      failUrl: `${input.origin}/payment/fail`,
    };
  },

  async confirmPayment(env, input) {
    if (!env.TOSS_SECRET_KEY) {
      return {
        ok: false,
        status: 503,
        providerError: { message: 'Toss Payments secret key is not configured' },
      };
    }

    const paymentKey = input.paymentKey || '';
    const orderId = input.orderId || '';
    const amount = Number(input.amount);
    if (!paymentKey || !orderId || !Number.isInteger(amount) || amount <= 0) {
      return {
        ok: false,
        status: 400,
        providerError: { message: 'paymentKey, orderId, and amount are required' },
      };
    }

    const response = await fetch(`${tossApiBaseUrl(env)}/v1/payments/confirm`, {
      method: 'POST',
      headers: {
        Authorization: tossAuthHeader(env.TOSS_SECRET_KEY),
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        providerError: await readProviderError(response),
      };
    }

    return {
      ok: true,
      payment: normalizeProviderPayment((await response.json()) as TossPayment),
    };
  },

  async retrievePayment(env, input) {
    if (!env.TOSS_SECRET_KEY) return null;
    const path = input.paymentKey
      ? `/v1/payments/${encodeURIComponent(input.paymentKey)}`
      : `/v1/payments/orders/${encodeURIComponent(input.orderId || '')}`;
    const response = await fetch(`${tossApiBaseUrl(env)}${path}`, {
      headers: {
        Authorization: tossAuthHeader(env.TOSS_SECRET_KEY),
      },
    });
    if (!response.ok) return null;
    return normalizeProviderPayment((await response.json()) as TossPayment);
  },

  verifyWebhookSignature(env, request, rawBody) {
    return verifyTossSignature(request, rawBody, env.TOSS_WEBHOOK_SECRET);
  },
};

const stripeProvider: PaymentProviderAdapter = {
  name: 'stripe',

  isReady(env) {
    return Boolean(env.STRIPE_SECRET_KEY);
  },

  async buildCheckoutPayload(env, input) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key is not configured');
    }

    const existingSession = input.providerPaymentId
      ? await retrieveStripeCheckoutSession(env, input.providerPaymentId)
      : null;
    const session =
      existingSession && existingSession.url && existingSession.status !== 'expired'
        ? existingSession
        : await createStripeCheckoutSession(env, input);

    return {
      provider: 'stripe',
      paymentId: input.paymentId,
      orderId: input.orderId,
      orderName: orderName(input),
      amount: Number(input.amount),
      currency: input.currencyCode,
      status: input.status,
      providerPaymentId: session.id,
      sessionId: session.id,
      checkoutUrl: session.url || undefined,
      successUrl: stripeSuccessUrl(input.origin),
      failUrl: stripeFailUrl(input.origin, input.orderId),
    };
  },

  async confirmPayment(env, input) {
    if (!env.STRIPE_SECRET_KEY) {
      return {
        ok: false,
        status: 503,
        providerError: { message: 'Stripe secret key is not configured' },
      };
    }

    const sessionId = input.sessionId || input.paymentKey;
    if (!sessionId) {
      return {
        ok: false,
        status: 400,
        providerError: { message: 'sessionId is required' },
      };
    }

    const response = await stripeRequest(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        providerError: await readProviderError(response),
      };
    }

    return {
      ok: true,
      payment: normalizeStripeCheckoutSession((await response.json()) as StripeCheckoutSession),
    };
  },

  async retrievePayment(env, input) {
    if (!env.STRIPE_SECRET_KEY || !input.paymentKey) return null;
    const session = await retrieveStripeCheckoutSession(env, input.paymentKey);
    return session ? normalizeStripeCheckoutSession(session) : null;
  },

  verifyWebhookSignature(env, request, rawBody) {
    return verifyStripeSignature(request, rawBody, env.STRIPE_WEBHOOK_SECRET);
  },
};

function normalizeStripeCheckoutSession(session: StripeCheckoutSession): ProviderPayment {
  const rawStatus = `${session.status || 'unknown'}:${session.payment_status || 'unknown'}`;
  const amount = Number(session.amount_total ?? session.amount_subtotal ?? 0);
  const paymentStatus = String(session.payment_status || '').toLowerCase();
  const sessionStatus = String(session.status || '').toLowerCase();
  const providerOrderId = session.metadata?.order_id || session.metadata?.orderId || '';

  return {
    providerPaymentId: session.id,
    providerOrderId,
    amount,
    canceledAmount: 0,
    currencyCode: String(session.currency || '').toUpperCase(),
    rawStatus,
    status: paymentStatus === 'paid' ? 'paid' : sessionStatus === 'expired' ? 'cancelled' : 'failed',
  };
}

async function createStripeCheckoutSession(
  env: Env,
  input: CheckoutPayloadInput,
): Promise<StripeCheckoutSession> {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('client_reference_id', input.paymentId);
  params.set('success_url', stripeSuccessUrl(input.origin));
  params.set('cancel_url', stripeFailUrl(input.origin, input.orderId));
  params.set('line_items[0][price_data][currency]', input.currencyCode.toLowerCase());
  params.set('line_items[0][price_data][product_data][name]', orderName(input));
  params.set('line_items[0][price_data][unit_amount]', String(Number(input.amount)));
  params.set('line_items[0][quantity]', '1');
  params.set('metadata[payment_id]', input.paymentId);
  params.set('metadata[order_id]', input.orderId);
  params.set('metadata[currency_code]', input.currencyCode);
  params.set('payment_intent_data[metadata][payment_id]', input.paymentId);
  params.set('payment_intent_data[metadata][order_id]', input.orderId);

  const response = await stripeRequest(env, '/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': input.paymentId,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const providerError = await readProviderError(response);
    throw new Error(`Stripe Checkout session creation failed: ${providerErrorMessage(providerError)}`);
  }

  const session = (await response.json()) as StripeCheckoutSession;
  if (!session.id || !session.url) {
    throw new Error('Stripe Checkout session response did not include a checkout URL');
  }
  return session;
}

async function retrieveStripeCheckoutSession(
  env: Env,
  sessionId: string,
): Promise<StripeCheckoutSession | null> {
  const response = await stripeRequest(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) return null;
  return (await response.json()) as StripeCheckoutSession;
}

function stripeRequest(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const secretKey = env.STRIPE_SECRET_KEY || '';
  return fetch(`${stripeApiBaseUrl(env)}${path}`, {
    ...init,
    headers: {
      Authorization: stripeAuthHeader(secretKey),
      ...(init.headers ?? {}),
    },
  });
}

function orderName(input: Pick<CheckoutPayloadInput, 'amount' | 'currencyCode'>): string {
  return `GlobalPulse ${input.amount} ${input.currencyCode} top-up`;
}

function stripeSuccessUrl(origin: string): string {
  return `${origin}/payment/success?provider=stripe&session_id={CHECKOUT_SESSION_ID}`;
}

function stripeFailUrl(origin: string, orderId: string): string {
  return `${origin}/payment/fail?provider=stripe&orderId=${encodeURIComponent(
    orderId,
  )}&code=STRIPE_CHECKOUT_CANCELLED`;
}

function tossApiBaseUrl(env: Env): string {
  return (env.TOSS_API_BASE_URL || 'https://api.tosspayments.com').replace(/\/$/, '');
}

function stripeApiBaseUrl(env: Env): string {
  return (env.STRIPE_API_BASE_URL || 'https://api.stripe.com').replace(/\/$/, '');
}

function stripeAuthHeader(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

async function verifyStripeSignature(
  request: Request,
  rawBody: string,
  webhookSecret?: string,
): Promise<boolean> {
  if (!webhookSecret) return false;

  const signatureHeader = request.headers.get('stripe-signature');
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))
    .filter(Boolean);
  if (!timestamp || signatures.length === 0) return false;

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 300_000) {
    return false;
  }

  const expected = await hmacHex(webhookSecret, `${timestamp}.${rawBody}`);
  return signatures.some((signature) => safeEqual(signature, expected));
}

function providerErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const nested = record.error as Record<string, unknown> | undefined;
    const message = record.message || nested?.message;
    if (typeof message === 'string') return message;
  }
  return 'provider request failed';
}

async function readProviderError(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { message: await response.text() };
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}
