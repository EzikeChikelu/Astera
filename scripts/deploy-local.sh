#!/usr/bin/env sh
# #445: Deploy all Astera contracts to the local Stellar quickstart network
# and write the resulting contract IDs to /contract-ids/env so other services
# (frontend, oracle, indexer) can consume them.
#
# Usage (inside the contracts container):
#   sh /app/scripts/deploy-local.sh
#
# Environment variables (with defaults):
#   STELLAR_RPC_URL          — Soroban RPC endpoint
#   STELLAR_NETWORK_PASSPHRASE — network passphrase
#   HORIZON_URL              — Horizon endpoint

set -eu

RPC_URL="${STELLAR_RPC_URL:-http://stellar:8000/soroban/rpc}"
NETWORK_PASSPHRASE="${STELLAR_NETWORK_PASSPHRASE:-Standalone Network ; February 2017}"
HORIZON_URL="${HORIZON_URL:-http://stellar:8000}"
OUTPUT_FILE="${CONTRACT_IDS_FILE:-/contract-ids/env}"

echo "==> Building contracts..."
cargo build --target wasm32-unknown-unknown --release --manifest-path /app/Cargo.toml

WASM_DIR="/app/target/wasm32-unknown-unknown/release"

# ── Generate a local deployer key if one is not already configured ──────────
if ! stellar keys show deployer > /dev/null 2>&1; then
  echo "==> Generating local deployer key..."
  stellar keys generate deployer --network local --fund || true
fi

deploy_contract() {
  local name="$1"
  local wasm="$2"
  echo "==> Deploying $name..."
  stellar contract deploy \
    --wasm "$wasm" \
    --source deployer \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    2>&1 | tail -1
}

INVOICE_CONTRACT_ID=$(deploy_contract "invoice" "$WASM_DIR/invoice.wasm")
POOL_CONTRACT_ID=$(deploy_contract "pool" "$WASM_DIR/pool.wasm")
CREDIT_CONTRACT_ID=$(deploy_contract "credit_score" "$WASM_DIR/credit_score.wasm")

echo "==> Contract IDs:"
echo "    Invoice:      $INVOICE_CONTRACT_ID"
echo "    Pool:         $POOL_CONTRACT_ID"
echo "    Credit Score: $CREDIT_CONTRACT_ID"

# Write IDs to shared volume so other containers can source them
mkdir -p "$(dirname "$OUTPUT_FILE")"
cat > "$OUTPUT_FILE" <<EOF
INVOICE_CONTRACT_ID=$INVOICE_CONTRACT_ID
POOL_CONTRACT_ID=$POOL_CONTRACT_ID
CREDIT_CONTRACT_ID=$CREDIT_CONTRACT_ID
EOF

echo "==> Contract IDs written to $OUTPUT_FILE"
