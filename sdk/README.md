# Astera SDK

A TypeScript SDK for interacting with Astera smart contracts on Stellar.

## Installation

```bash
npm install @astera/sdk @stellar/stellar-sdk
```

## Quick Start

### Initialize the Client

```typescript
import { AsteraClient } from '@astera/sdk';

const client = new AsteraClient({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  network: 'Test SDF Network ; September 2015',
  invoiceContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  poolContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABC2V',
});
```

### Create an Invoice

```typescript
const invoiceHash = await client.invoice.create({
  signer: async (txXdr: string) => {
    // Sign the transaction with your wallet (e.g., Freighter)
    const signedXdr = await window.freighter.signTransaction(txXdr);
    return signedXdr;
  },
  owner: 'GDZST3XVCDTUJ76ZAV2HA72KYQJ2DDFJFJ2GDWB7UJL5ZMQZLYFK4WJB',
  debtor: 'debtor-id-123',
  amount: BigInt('100000000'), // 100 USDC (with 7 decimals)
  dueDate: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days from now
  description: 'Invoice for services rendered',
  verificationHash: 'abc123def456', // Optional: hash of document
  onProgress: (progress) => {
    console.log(`Transaction status: ${progress.status}`);
  },
});

console.log('Invoice created with hash:', invoiceHash);
```

### Fetch Invoice Details

```typescript
const invoiceId = BigInt('1');
const invoice = await client.invoice.get(invoiceId);

console.log('Invoice status:', invoice.status);
console.log('Amount:', invoice.amount.toString());
console.log('Due date:', new Date(invoice.due_date * 1000).toISOString());

// Also fetch metadata
const metadata = await client.invoice.getMetadata(invoiceId);
console.log('Invoice name:', metadata.name);
console.log('Debtor:', metadata.debtor);
```

### Deposit into the Pool

```typescript
const depositHash = await client.pool.deposit({
  signer: async (txXdr: string) => {
    const signedXdr = await window.freighter.signTransaction(txXdr);
    return signedXdr;
  },
  investor: 'GDZST3XVCDTUJ76ZAV2HA72KYQJ2DDFJFJ2GDWB7UJL5ZMQZLYFK4WJB',
  token: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4', // USDC address
  amount: BigInt('1000000000'), // 1000 USDC
  onProgress: (progress) => {
    console.log(`Deposit status: ${progress.status}`);
    if (progress.status === 'confirmed') {
      console.log('Deposit confirmed at:', progress.hash);
    }
  },
});

console.log('Deposit successful, tx hash:', depositHash);
```

### Check Investor Position

```typescript
const investor = 'GDZST3XVCDTUJ76ZAV2HA72KYQJ2DDFJFJ2GDWB7UJL5ZMQZLYFK4WJB';
const token = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

const position = await client.pool.getPosition(investor, token);

if (position) {
  console.log('Deposited:', position.deposited.toString());
  console.log('Available:', position.available.toString());
  console.log('Deployed:', position.deployed.toString());
  console.log('Earned:', position.earned.toString());
} else {
  console.log('No position found for investor');
}
```

### Repay an Invoice

```typescript
const repayHash = await client.pool.repay({
  signer: async (txXdr: string) => {
    const signedXdr = await window.freighter.signTransaction(txXdr);
    return signedXdr;
  },
  payer: 'GDZST3XVCDTUJ76ZAV2HA72KYQJ2DDFJFJ2GDWB7UJL5ZMQZLYFK4WJB',
  invoiceId: BigInt('1'),
  amount: BigInt('100000000'), // 100 USDC
});

console.log('Repayment successful, tx hash:', repayHash);
```

### Listen for Contract Events

The SDK provides typed event definitions for all contract events. To listen for events, use the Soroban RPC:

```typescript
import { parseContractEvent, type PoolDepositEvent } from '@astera/sdk';

// Fetch events from Soroban RPC
const events = await client.server.getEvents({
  contractIds: ['CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABC2V'],
  startLedger: 1000,
});

for (const event of events.events) {
  const typed = parseContractEvent({
    topic: event.topic.map(t => String(t)),
    value: event.value,
  });

  if (typed?.type === 'pool:deposit') {
    const deposit = typed as PoolDepositEvent;
    console.log(`${deposit.depositor} deposited ${deposit.amount} with ${deposit.sharesMinted} shares minted`);
  }
}
```

## Available Types

The SDK exports TypeScript types for:

- `AsteraClient` - Main client class
- `Invoice` - Invoice contract data
- `InvoiceMetadata` - Invoice metadata
- `InvoiceStatus` - Invoice status union type
- `InvestorPosition` - Investor pool position
- `PoolConfig` - Pool contract configuration
- `PoolTokenTotals` - Pool token totals
- `FundedInvoice` - Funded invoice details
- `AsteraConfig` - Client configuration
- `TransactionProgress` - Transaction progress updates

### Event Types

- `PoolDepositEvent` - Pool deposit event
- `PoolWithdrawalEvent` - Pool withdrawal event
- `PoolYieldClaimedEvent` - Pool yield claimed event
- `ShareMintEvent` - Share token mint event
- `ShareBurnEvent` - Share token burn event
- `ShareTransferEvent` - Share token transfer event
- `ShareApproveEvent` - Share token approval event

Use `parseContractEvent()` to convert raw event payloads to typed events.

## Error Handling

The SDK throws errors for contract failures and RPC issues:

```typescript
import { AsteraClient } from '@astera/sdk';

const client = new AsteraClient({ /* config */ });

try {
  const invoice = await client.invoice.get(BigInt('999'));
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('Simulation failed')) {
      console.log('Contract simulation error:', error.message);
    } else if (error.message.includes('not found')) {
      console.log('Invoice not found');
    }
  }
}
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## License

MIT
