#!/usr/bin/env node
import Database from 'better-sqlite3';
import { replay } from './replay';
import { computePredictiveQuality } from './metrics';
import { renderReport } from './report';

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function main() {
  const dbPath = parseArg('db') || process.env.INDEXER_DB_PATH;
  if (!dbPath) {
    console.error(
      'Usage: npm run backtest -- --db <path-to-indexer-sqlite-db>\n' +
        '(or set INDEXER_DB_PATH). The db is the indexer\'s own SQLite file — see indexer/src/db.ts.',
    );
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });
  const trajectories = replay(db);
  const quality = computePredictiveQuality(trajectories);
  console.log(renderReport(trajectories, quality));
}

main();
