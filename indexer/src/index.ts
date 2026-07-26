#!/usr/bin/env node
/**
 * Astera Soroban Event Indexer
 *
 * Subscribes to Stellar Horizon event streams for Astera contract events,
 * parses them, and stores them in a SQLite database for fast querying.
 */

import { Horizon } from "stellar-sdk";
import { parseEvents } from "./parser";
import { initDb, storeEvents, getEvents, getLatestLedger } from "./db";
import { startApiServer } from "./api";

const HORIZON_URL =
  process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";
// #700: also watch the credit_score contract so SME payment history is
// queryable off-chain. Accept it either inside CONTRACT_IDS (legacy) or as a
// dedicated CREDIT_SCORE_CONTRACT_ID env var. Dedupe to keep Horizon happy.
const INVOICE_POOL_CONTRACT_IDS = (process.env.CONTRACT_IDS || "")
  .split(",")
  .filter(Boolean);
const CREDIT_SCORE_CONTRACT_ID = (
  process.env.CREDIT_SCORE_CONTRACT_ID || ""
).trim();
// #861: also watch the oracle_registry contract, if deployed, so
// VerificationRound / vote / slash events are queryable off-chain.
const ORACLE_REGISTRY_CONTRACT_ID = (
  process.env.ORACLE_REGISTRY_CONTRACT_ID || ""
).trim();
const CONTRACT_IDS = Array.from(
  new Set(
    [
      ...INVOICE_POOL_CONTRACT_IDS,
      CREDIT_SCORE_CONTRACT_ID,
      ORACLE_REGISTRY_CONTRACT_ID,
    ].filter(Boolean),
  ),
);
const POLLING_INTERVAL_MS = parseInt(
  process.env.POLLING_INTERVAL_MS || "5000",
  10,
);
const API_PORT = parseInt(process.env.API_PORT || "3001", 10);
const DB_PATH = process.env.DB_PATH || "./indexer.db";
// #975: backfill support — set BACKFILL_START_LEDGER to replay historical events
const BACKFILL_START_LEDGER = process.env.BACKFILL_START_LEDGER
  ? parseInt(process.env.BACKFILL_START_LEDGER, 10)
  : null;
const BACKFILL_END_LEDGER = process.env.BACKFILL_END_LEDGER
  ? parseInt(process.env.BACKFILL_END_LEDGER, 10)
  : null;
// #976: lookback window on restart to catch events missed during downtime
const LOOKBACK_LEDGERS = parseInt(process.env.LOOKBACK_LEDGERS || "100", 10);

async function main() {
  console.log("[Astera Indexer] Starting...");
  console.log(`[Astera Indexer] Horizon: ${HORIZON_URL}`);
  console.log(
    `[Astera Indexer] Contracts: ${CONTRACT_IDS.join(", ") || "(none)"}`,
  );
  if (CREDIT_SCORE_CONTRACT_ID) {
    console.log(
      `[Astera Indexer] Credit-score contract: ${CREDIT_SCORE_CONTRACT_ID}`,
    );
  }
  if (ORACLE_REGISTRY_CONTRACT_ID) {
    console.log(
      `[Astera Indexer] Oracle-registry contract: ${ORACLE_REGISTRY_CONTRACT_ID}`,
    );
  }
  console.log(`[Astera Indexer] DB: ${DB_PATH}`);
  console.log(
    `[Astera Indexer] Lookback ledgers on restart: ${LOOKBACK_LEDGERS}`,
  );

  // Initialize database
  const db = initDb(DB_PATH);

  // #975: Check if backfill mode
  if (BACKFILL_START_LEDGER !== null) {
    console.log(
      `[Astera Indexer] Backfill mode: ledgers ${BACKFILL_START_LEDGER} to ${BACKFILL_END_LEDGER || "latest"}`,
    );
    await backfillLedgers(db, BACKFILL_START_LEDGER, BACKFILL_END_LEDGER);
    console.log("[Astera Indexer] Backfill complete. Exiting.");
    process.exit(0);
  }

  // #973: Store indexer state for health endpoint
  const state = { lastProcessedLedger: getLatestLedger(db) || "0" };

  // Start API server with state reference
  startApiServer(db, API_PORT, state);

  // Start polling
  await pollLoop(db, state);

  process.on("SIGINT", () => {
    console.log("\n[Astera Indexer] Shutting down...");
    process.exit(0);
  });
}

async function backfillLedgers(
  db: any,
  startLedger: number,
  endLedger: number | null,
) {
  console.log(
    `[Astera Indexer] Starting backfill from ledger ${startLedger}...`,
  );

  const horizon = new Horizon.Server(HORIZON_URL);
  let currentLedger = startLedger;
  let totalEvents = 0;

  while (true) {
    try {
      const params: any = {
        join: "transactions",
        limit: 100,
        order: "asc",
      };

      // Use ledger cursor for pagination
      params.cursor = currentLedger.toString();

      if (CONTRACT_IDS.length > 0) {
        params.contractIds = CONTRACT_IDS;
      }

      const response: any = await horizon
        .effects()
        .cursor(currentLedger.toString())
        .order("asc")
        .limit(100)
        .call();

      if (!response.records || response.records.length === 0) {
        console.log(
          `[Astera Indexer] Backfill complete at ledger ${currentLedger}. Total events: ${totalEvents}`,
        );
        break;
      }

      const events = parseEvents(response.records || []);

      if (events.length > 0) {
        storeEvents(db, events);
        totalEvents += events.length;
        const lastEvent = events[events.length - 1];
        currentLedger = lastEvent.ledgerSequence;
        console.log(
          `[Astera Indexer] Backfilled ${events.length} events up to ledger ${currentLedger}`,
        );
      }

      // Check if we've reached the end ledger
      if (endLedger !== null && currentLedger >= endLedger) {
        console.log(
          `[Astera Indexer] Reached end ledger ${endLedger}. Total events: ${totalEvents}`,
        );
        break;
      }

      // Move to next page
      const lastRecord = response.records[response.records.length - 1];
      const nextLedger = lastRecord.ledger_sequence || currentLedger + 1;

      if (nextLedger === currentLedger) {
        currentLedger++;
      } else {
        currentLedger = nextLedger;
      }

      // Brief delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(
        `[Astera Indexer] Error during backfill at ledger ${currentLedger}:`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function pollLoop(db: any, state: { lastProcessedLedger: string }) {
  let cursor = getLatestLedger(db);

  // #976: Apply lookback window on startup to catch any events missed during downtime
  if (cursor) {
    const lookbackLedger = Math.max(0, parseInt(cursor, 10) - LOOKBACK_LEDGERS);
    console.log(
      `[Astera Indexer] Applying lookback: starting from ledger ${lookbackLedger} (${LOOKBACK_LEDGERS} ledgers before ${cursor})`,
    );
    cursor = lookbackLedger.toString();
  }

  console.log(`[Astera Indexer] Starting from ledger: ${cursor || "latest"}`);

  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 60000;
  const BACKOFF_MULTIPLIER = 2;
  const ALERT_THRESHOLD = 10;

  let consecutiveFailures = 0;

  while (true) {
    try {
      const horizon = new Horizon.Server(HORIZON_URL);
      const params: any = {
        join: "transactions",
        limit: 100,
      };

      if (cursor) {
        params.cursor = cursor;
      }

      if (CONTRACT_IDS.length > 0) {
        params.contractIds = CONTRACT_IDS;
      }

      const response: any = await horizon
        .effects()
        .cursor(cursor || "")
        .order("asc")
        .call();

      const events = parseEvents(response.records || []);

      if (events.length > 0) {
        storeEvents(db, events);
        console.log(`[Astera Indexer] Stored ${events.length} events`);
        const lastEvent = events[events.length - 1];
        cursor = lastEvent.ledgerSequence?.toString() || cursor;
        state.lastProcessedLedger = cursor;
      }

      // Check if there are more pages
      if (response.records && response.records.length > 0) {
        const lastRecord = response.records[response.records.length - 1];
        cursor = lastRecord.paging_token || cursor;
        state.lastProcessedLedger = cursor;
      }

      consecutiveFailures = 0;

      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));
    } catch (error) {
      consecutiveFailures++;

      const delay = Math.min(
        BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, consecutiveFailures - 1),
        MAX_DELAY_MS,
      );

      console.error(
        `[Astera Indexer] Error polling Horizon (attempt ${consecutiveFailures}):`,
        error,
      );
      console.log(`[Astera Indexer] Retrying in ${delay}ms...`);

      if (consecutiveFailures >= ALERT_THRESHOLD) {
        console.error(
          `[Astera Indexer] ALERT: ${consecutiveFailures} consecutive polling failures. Continuing to retry...`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

main().catch((err) => {
  console.error("[Astera Indexer] Fatal error:", err);
  process.exit(1);
});
