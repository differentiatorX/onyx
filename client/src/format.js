// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

export const money = (paise) => (paise == null ? '—' : inr.format(paise / 100));

export const toPaise = (rupees) => Math.round(Number(String(rupees).replace(/,/g, '')) * 100);

export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');

export function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return shortDate(iso);
}

const STATUS_LABELS = {
  created: 'Awaiting payment',
  processing: 'Processing',
  authorized: 'Authorized',
  captured: 'Captured',
  partially_refunded: 'Partly refunded',
  refunded: 'Refunded',
  failed: 'Failed',
  expired: 'Expired',
  blocked: 'Blocked',
  pending: 'Pending',
  retrying: 'Retrying',
  succeeded: 'Delivered',
  dead: 'Gave up',
  received: 'Received',
  processed: 'Applied',
  ignored: 'Ignored',
  paid: 'Paid out',
};

const STATUS_TONE = {
  captured: 'good',
  succeeded: 'good',
  processed: 'good',
  paid: 'good',
  partially_refunded: 'neutral',
  refunded: 'neutral',
  ignored: 'neutral',
  created: 'neutral',
  expired: 'neutral',
  processing: 'wait',
  authorized: 'wait',
  pending: 'wait',
  retrying: 'wait',
  received: 'wait',
  failed: 'bad',
  blocked: 'bad',
  dead: 'bad',
};

export const statusLabel = (s) => STATUS_LABELS[s] || s;
export const statusTone = (s) => STATUS_TONE[s] || 'neutral';

export const ACCOUNT_NAMES = {
  provider_receivable: 'Due from provider',
  platform_cash: 'Platform bank',
  merchant_payable: 'Owed to merchant',
  fee_revenue: 'Fee revenue',
};

export const EVENT_LABELS = {
  'payment.captured': 'Payment captured',
  'payment.failed': 'Payment failed',
  'payment.expired': 'Payment expired',
  'payment.blocked': 'Payment blocked',
  'refund.succeeded': 'Refund succeeded',
  'refund.failed': 'Refund failed',
  'settlement.paid': 'Settlement paid',
};
