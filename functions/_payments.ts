import { Env, tossAuthHeader, verifyTossSignature } from './_shared';

export type PaymentProviderName = 'toss';

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
  paymentKey: string;
  orderId: string;
  amount: number;
  idempotencyKey: string;
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
};

export type CheckoutPayload = {
  paymentId: string;
  orderId: string;
  orderName: string;
  amount: number;
  currency: string;
  status: string;
  clientKey?: string;
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
  buildCheckoutPayload: (env: Env, input: CheckoutPayloadInput) => CheckoutPayload;
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

export function getPaymentProvider(name: string): PaymentProviderAdapter | null {
  if (name === 'toss') return tossProvider;
  return null;
}

export function configuredPaymentProvider(env: Env): PaymentProviderAdapter | null {
  return getPaymentProvider(env.PAYMENT_PROVIDER || 'toss');
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

  buildCheckoutPayload(env, input) {
    return {
      paymentId: input.paymentId,
      orderId: input.orderId,
      orderName: `GlobalPulse ${input.amount} ${input.currencyCode} top-up`,
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

    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: tossAuthHeader(env.TOSS_SECRET_KEY),
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
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
    const response = await fetch(`https://api.tosspayments.com${path}`, {
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

async function readProviderError(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { message: await response.text() };
  }
}
