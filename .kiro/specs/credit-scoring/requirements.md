# Requirements Document

## Introduction

This feature implements a credit scoring mechanism for SMEs (Small and Medium Enterprises) on the Astera invoice financing platform. The system evaluates creditworthiness based on invoice repayment history, considering on-time payments, number of completed invoices, total volume repaid, and default history. The score influences lending decisions and risk assessment within the platform.

## Glossary

- **SME**: Small or Medium Enterprise — the borrower who creates invoices and receives funding.
- **Credit Score**: A numeric value in the range [200, 850] representing an SME's creditworthiness.
- **Score Band**: A human-readable label (e.g., "Excellent", "Good") derived from a credit score range.
- **Payment Record**: A stored record of a single invoice repayment event, including timing and status.
- **Payment Status**: One of `PaidOnTime`, `PaidLate`, or `Defaulted`, assigned to each invoice repayment.
- **On-Time Payment**: A repayment made at or before the invoice due date.
- **Late Payment**: A repayment made after the due date but within the late threshold window (7 days).
- **Default**: A repayment made more than 7 days after the due date, or explicitly recorded as a default.
- **Total Volume**: The cumulative sum of all invoice amounts processed for an SME.
- **Average Payment Days**: The mean number of days early (negative) or late (positive) across all paid invoices.
- **Pool Contract**: The authorized smart contract that calls `record_payment` and `record_default`.
- **Invoice Contract**: The smart contract managing invoice lifecycle.
- **CreditScoreData**: The aggregate data structure holding all scoring metrics for an SME.
- **BASE_SCORE**: The starting score (500) applied when an SME has at least one invoice.
- **MIN_SCORE**: The floor score (200) returned for SMEs with no history.
- **MAX_SCORE**: The ceiling score (850) that cannot be exceeded.

## Requirements

### Requirement 1

**User Story:** As an SME, I want my credit score to reflect my invoice repayment history, so that consistent on-time payments improve my score and defaults reduce it.

#### Acceptance Criteria

1. WHEN an SME has no payment history, THE CreditScoreContract SHALL return a score equal to MIN_SCORE (200).
2. WHEN a payment is recorded as on-time, THE CreditScoreContract SHALL increase the SME's score by PTS_PAID_ON_TIME (30) points relative to the base calculation.
3. WHEN a payment is recorded as late, THE CreditScoreContract SHALL increase the SME's score by PTS_PAID_LATE (15) points relative to the base calculation.
4. WHEN a default is recorded, THE CreditScoreContract SHALL decrease the SME's score by PTS_DEFAULTED (50) points relative to the base calculation.
5. WHILE the computed score exceeds MAX_SCORE (850), THE CreditScoreContract SHALL cap the returned score at MAX_SCORE.
6. WHILE the computed score falls below MIN_SCORE (200), THE CreditScoreContract SHALL floor the returned score at MIN_SCORE.

---

### Requirement 2

**User Story:** As an investor, I want to see the number of completed invoices factored into the credit score, so that SMEs with longer track records are rewarded.

#### Acceptance Criteria

1. WHEN an SME reaches 5 total invoices, THE CreditScoreContract SHALL apply a bonus of PTS_NEW_INVOICE (5) points.
2. WHEN an SME reaches 10 total invoices, THE CreditScoreContract SHALL apply an additional bonus of PTS_NEW_INVOICE (5) points.
3. WHEN an SME reaches 20 total invoices, THE CreditScoreContract SHALL apply an additional bonus of PTS_NEW_INVOICE (5) points.
4. WHEN a new payment or default is recorded, THE CreditScoreContract SHALL increment the SME's total_invoices count by exactly 1.

---

### Requirement 3

**User Story:** As an investor, I want total repaid volume to influence the credit score, so that high-volume SMEs with good history are recognized.

#### Acceptance Criteria

1. WHEN an SME's total_volume exceeds 100,000,000,000 stroops, THE CreditScoreContract SHALL apply a volume bonus of 25 points.
2. WHEN an SME's total_volume exceeds 10,000,000,000 stroops but does not exceed 100,000,000,000, THE CreditScoreContract SHALL apply a volume bonus of 15 points.
3. WHEN an SME's total_volume exceeds 1,000,000,000 stroops but does not exceed 10,000,000,000, THE CreditScoreContract SHALL apply a volume bonus of 5 points.
4. WHEN a payment or default is recorded, THE CreditScoreContract SHALL add the invoice amount to the SME's total_volume.

---

### Requirement 4

**User Story:** As an investor, I want default history to significantly penalize the credit score, so that SMEs with defaults are clearly distinguished from reliable payers.

#### Acceptance Criteria

1. WHEN an SME has more defaults than on-time payments, THE CreditScoreContract SHALL produce a score below BASE_SCORE (500).
2. WHEN the pool contract calls record_default, THE CreditScoreContract SHALL record the invoice as Defaulted and update the score immediately.
3. IF the same invoice_id has already been processed, THEN THE CreditScoreContract SHALL panic with "invoice already processed".

---

### Requirement 5

**User Story:** As a platform operator, I want average payment timing to influence the score, so that consistently early payers are rewarded and chronically late payers are penalized.

#### Acceptance Criteria

1. WHEN an SME's average_payment_days is negative (pays early), THE CreditScoreContract SHALL apply a timing bonus of 20 points.
2. WHEN an SME's average_payment_days is between 0 and 2 inclusive, THE CreditScoreContract SHALL apply a timing bonus of 15 points.
3. WHEN an SME's average_payment_days is between 3 and 6 inclusive, THE CreditScoreContract SHALL apply a timing bonus of 10 points.
4. WHEN an SME's average_payment_days exceeds 30, THE CreditScoreContract SHALL apply a timing penalty of 15 points.
5. WHEN a payment is recorded, THE CreditScoreContract SHALL update average_payment_days using a running average across all paid invoices.

---

### Requirement 6

**User Story:** As a platform operator, I want score bands to categorize SMEs, so that lending decisions can be made quickly based on a human-readable tier.

#### Acceptance Criteria

1. WHEN get_score_band is called with a score of 800 or above, THE CreditScoreContract SHALL return "Excellent".
2. WHEN get_score_band is called with a score between 740 and 799 inclusive, THE CreditScoreContract SHALL return "Very Good".
3. WHEN get_score_band is called with a score between 670 and 739 inclusive, THE CreditScoreContract SHALL return "Good".
4. WHEN get_score_band is called with a score between 580 and 669 inclusive, THE CreditScoreContract SHALL return "Fair".
5. WHEN get_score_band is called with a score between 500 and 579 inclusive, THE CreditScoreContract SHALL return "Poor".
6. WHEN get_score_band is called with a score below 500, THE CreditScoreContract SHALL return "Very Poor".

---

### Requirement 7

**User Story:** As a platform operator, I want full payment history to be retrievable per SME, so that audits and dispute resolution can reference individual records.

#### Acceptance Criteria

1. WHEN get_payment_history is called for an SME, THE CreditScoreContract SHALL return all PaymentRecord entries in insertion order.
2. WHEN get_payment_record is called with a valid index, THE CreditScoreContract SHALL return the PaymentRecord at that index.
3. WHEN get_payment_history_length is called, THE CreditScoreContract SHALL return the count of records stored for that SME.
4. WHEN a payment or default is recorded, THE CreditScoreContract SHALL persist the PaymentRecord to storage before returning.

---

### Requirement 8

**User Story:** As a platform operator, I want only the authorized pool contract to record payments and defaults, so that the credit score cannot be manipulated by unauthorized callers.

#### Acceptance Criteria

1. WHEN record_payment is called by an address that is not the registered pool contract, THE CreditScoreContract SHALL require authorization from the pool contract.
2. WHEN record_default is called by an address that is not the registered pool contract, THE CreditScoreContract SHALL require authorization from the pool contract.
3. WHEN set_invoice_contract or set_pool_contract is called, THE CreditScoreContract SHALL require authorization from the admin address.
