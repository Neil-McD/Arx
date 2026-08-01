export type StripeRefundAllocationInput = {
  id: string;
  amount: number;
  created: number;
  status: string | null;
};

function normalizedBaseUnits(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
}

function refundIsSucceeded(status: string | null): boolean {
  return String(status ?? "").trim().toLowerCase() === "succeeded";
}

export function calculateApplicationFeeRefundAllocation(args: {
  chargeAmountBaseUnits: number;
  applicationFeeAmountBaseUnits: number;
  targetRefundId: string;
  refunds: StripeRefundAllocationInput[];
}): number {
  const chargeAmount = normalizedBaseUnits(args.chargeAmountBaseUnits);
  const applicationFeeAmount = normalizedBaseUnits(args.applicationFeeAmountBaseUnits);
  const targetRefundId = String(args.targetRefundId ?? "").trim();
  if (chargeAmount <= 0 || applicationFeeAmount <= 0 || !targetRefundId) return 0;

  const succeeded = args.refunds
    .map((refund) => ({
      id: String(refund.id ?? "").trim(),
      amount: normalizedBaseUnits(refund.amount),
      created: normalizedBaseUnits(refund.created),
      status: refund.status,
    }))
    .filter((refund) => refund.id && refund.amount > 0 && refundIsSucceeded(refund.status))
    .sort((left, right) => left.created - right.created || left.id.localeCompare(right.id));

  let refundedBefore = 0;
  for (const refund of succeeded) {
    const refundedAfter = Math.min(chargeAmount, refundedBefore + refund.amount);
    if (refund.id === targetRefundId) {
      const feeBefore = Math.floor((applicationFeeAmount * refundedBefore) / chargeAmount);
      const feeAfter = Math.floor((applicationFeeAmount * refundedAfter) / chargeAmount);
      return Math.max(0, feeAfter - feeBefore);
    }
    refundedBefore = refundedAfter;
  }
  return 0;
}
