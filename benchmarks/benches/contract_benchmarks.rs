use criterion::{black_box, criterion_group, criterion_main, Criterion};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String as SorobanString,
};

// Import contract implementations
use invoice::{InvoiceContract, InvoiceContractClient};
use pool::{FundingPool, FundingPoolClient};

/// Setup helper for invoice contract benchmarks
fn setup_invoice_env() -> (Env, InvoiceContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 100_000);

    let contract_id = env.register(InvoiceContract, ());
    let client = InvoiceContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let pool = Address::generate(&env);

    client.initialize(&admin, &pool);

    (env, client, admin, pool)
}

/// Setup helper for pool contract benchmarks
fn setup_pool_env() -> (Env, FundingPoolClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 100_000);

    let contract_id = env.register(FundingPool, ());
    let client = FundingPoolClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let usdc_id = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
    let invoice_contract = Address::generate(&env);

    // Mint USDC for testing
    soroban_sdk::token::StellarAssetClient::new(&env, &usdc_id).mint(&admin, &10_000_000_000);

    client.initialize(&admin, &usdc_id, &invoice_contract);

    (env, client, admin, usdc_id)
}

fn bench_create_invoice(c: &mut Criterion) {
    c.bench_function("create_invoice", |b| {
        b.iter_batched(
            || {
                let (env, client, _admin, _pool) = setup_invoice_env();
                let owner = Address::generate(&env);
                (env, client, owner)
            },
            |(env, client, owner)| {
                let debtor = SorobanString::from_str(&env, "Acme Corp");
                let amount = black_box(1_000_000_000i128);
                let due_date = black_box(env.ledger().timestamp() + 2_592_000);
                let description = SorobanString::from_str(&env, "Invoice for services");

                client.create_invoice(&owner, &debtor, &amount, &due_date, &description)
            },
            criterion::BatchSize::SmallInput,
        )
    });
}

fn bench_mark_paid(c: &mut Criterion) {
    c.bench_function("mark_paid", |b| {
        b.iter_batched(
            || {
                let (env, client, _admin, pool) = setup_invoice_env();
                let owner = Address::generate(&env);
                let debtor = SorobanString::from_str(&env, "Acme Corp");
                let amount = 1_000_000_000i128;
                let due_date = env.ledger().timestamp() + 2_592_000;
                let description = SorobanString::from_str(&env, "Invoice for services");

                let invoice_id = client.create_invoice(&owner, &debtor, &amount, &due_date, &description);
                client.mark_funded(&invoice_id, &pool);

                (env, client, invoice_id, pool)
            },
            |(env, client, invoice_id, pool)| {
                client.mark_paid(&black_box(invoice_id), &black_box(pool))
            },
            criterion::BatchSize::SmallInput,
        )
    });
}

fn bench_deposit(c: &mut Criterion) {
    c.bench_function("deposit", |b| {
        b.iter_batched(
            || {
                let (env, client, _admin, usdc_id) = setup_pool_env();
                let investor = Address::generate(&env);
                
                // Mint USDC to investor
                soroban_sdk::token::StellarAssetClient::new(&env, &usdc_id)
                    .mint(&investor, &5_000_000_000);

                (env, client, investor)
            },
            |(env, client, investor)| {
                let amount = black_box(1_000_000_000i128);
                client.deposit(&investor, &amount)
            },
            criterion::BatchSize::SmallInput,
        )
    });
}

fn bench_commit_to_invoice(c: &mut Criterion) {
    c.bench_function("commit_to_invoice", |b| {
        b.iter_batched(
            || {
                let (env, client, admin, usdc_id) = setup_pool_env();
                let investor = Address::generate(&env);
                let sme = Address::generate(&env);

                // Mint and deposit USDC
                soroban_sdk::token::StellarAssetClient::new(&env, &usdc_id)
                    .mint(&investor, &5_000_000_000);
                client.deposit(&investor, &3_000_000_000);

                // Initialize co-funding
                let invoice_id = 1u64;
                let principal = 3_000_000_000i128;
                let due_date = env.ledger().timestamp() + 2_592_000;
                client.init_co_funding(&admin, &invoice_id, &principal, &sme, &due_date);

                (env, client, investor, invoice_id)
            },
            |(env, client, investor, invoice_id)| {
                let amount = black_box(1_000_000_000i128);
                client.commit_to_invoice(&investor, &invoice_id, &amount)
            },
            criterion::BatchSize::SmallInput,
        )
    });
}

fn bench_repay_invoice(c: &mut Criterion) {
    c.bench_function("repay_invoice", |b| {
        b.iter_batched(
            || {
                let (env, client, admin, usdc_id) = setup_pool_env();
                let investor = Address::generate(&env);
                let sme = Address::generate(&env);

                // Mint USDC to investor and SME
                let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &usdc_id);
                token_client.mint(&investor, &3_000_000_000);
                token_client.mint(&sme, &4_000_000_000);

                // Deposit and fund invoice
                client.deposit(&investor, &3_000_000_000);
                let invoice_id = 1u64;
                let principal = 3_000_000_000i128;
                let due_date = env.ledger().timestamp() + 2_592_000;
                client.init_co_funding(&admin, &invoice_id, &principal, &sme, &due_date);
                client.commit_to_invoice(&investor, &invoice_id, &principal);

                // Advance time by 30 days
                env.ledger().with_mut(|l| l.timestamp += 2_592_000);

                (env, client, invoice_id, sme)
            },
            |(env, client, invoice_id, sme)| {
                client.repay_invoice(&black_box(invoice_id), &black_box(sme))
            },
            criterion::BatchSize::SmallInput,
        )
    });
}

criterion_group!(
    contract_benchmarks,
    bench_create_invoice,
    bench_mark_paid,
    bench_deposit,
    bench_commit_to_invoice,
    bench_repay_invoice
);
criterion_main!(contract_benchmarks);
