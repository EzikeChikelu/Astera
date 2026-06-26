export const Errors = {
  1: { message: 'AlreadyInitialized' },
  2: { message: 'Unauthorized' },
  3: { message: 'ContractPaused' },
  4: { message: 'InvoiceAlreadyProcessed' },
  5: { message: 'InvalidThresholds' },
  6: { message: 'InvalidLateThreshold' },
  7: { message: 'PaymentHistoryLimitZero' },
  8: { message: 'UpgradeTimelockNotExpired' },
  9: { message: 'NoUpgradeProposed' },
  10: { message: 'InvalidUpgradeTimelock' },
  11: { message: 'InvalidWasmHash' },
} as const;

export type CreditScoreErrorCode = keyof typeof Errors;
export type CreditScoreErrorMessage = (typeof Errors)[CreditScoreErrorCode]['message'];
