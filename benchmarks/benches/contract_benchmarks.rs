use criterion::{black_box, criterion_group, criterion_main, Criterion};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String as SorobanString,
};

// Import contract implementations
use invoice::{InvoiceContract, InvoiceContractClient};
use pool::{FundingPool, FundingPoolClient, OpenCoFundingRequest};
use share::{ShareToken, ShareTokenClient};

/// Setup helper for invoice contract benchmarks
fn setup_invoice_env() -> (Env, InvoiceContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    env.ledger().with_mut(|l| l.timestamp = 100_000);

    let contract_id = env.register(InvoiceContract, ());
    let client = InvoiceContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let pool = Address::generate(&env);

    client.initialize(&admin, &pool, &i128::MAX, &2_592_000u64, &7u32);

    (env, client, admin, pool)
}

/// Setup helper for pool contract benchmarks
fn setup_pool_env() -> (Env, FundingPoolClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    env.ledger().with_mut(|l| l.timestamp = 100_000);

    let contract_id = env.register(FundingPool, ());
    let client = FundingPoolClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let usdc_id = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let share_token_id = env.register(ShareToken, ());
    ShareTokenClient::new(&env, &share_token_id).initialize(
        &admin,
        &7u32,
        &SorobanString::from_str(&env, "Pool Shares"),
        &SorobanString::from_str(&env, "POOL"),
    );
    let invoice_contract = Address::generate(&env);

    // Mint USDC for testing
    soroban_sdk::token::StellarAssetClient::new(&env, &usdc_id).mint(&admin, &10_000_000_000);

    client.initialize(&admin, &usdc_id, &share_token_id, &invoice_contract);
    client.set_max_investor_concentration(&admin, &10_000u32);

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
                let verification_hash = SorobanString::from_str(&env, "hash123");
                let metadata_url = SorobanString::from_str(&env, "https://example.com/meta");

                client.create_invoice(
                    &owner,
                    &debtor,
                    &amount,
                    &due_date,
                    &description,
                    &verification_hash,
                    &metadata_url,
                )
            },
            criterion::BatchSize::SmallInput,
        )
    });
}

fn bench_mark_paid(c: &mut Criterion) {
    c.bench_function("mark_paid", |b| {
        b.iter_batched(
            || {
                // mark_paid cross-calls the pool contract's is_invoice_repaid,
                // so this needs a real, fully-repaid pool-funded invoice
                // rather than a bare Address standing in for the pool.
                let env = Env::default();
                env.mock_all_auths_allowing_non_root_auth();
                env.ledger().with_mut(|l| l.timestamp = 100_000);

                let invoice_contract_id = env.register(InvoiceContract, ());
                let invoice_client = InvoiceContractClient::new(&env, &invoice_contract_id);
                let pool_contract_id = env.register(FundingPool, ());
                let pool_client = FundingPoolClient::new(&env, &pool_contract_id);

                let admin = Address::generate(&env);
                let token_admin = Address::generate(&env);
                let investor = Address::generate(&env);
                let usdc_id = env
                    .register_stellar_asset_contract_v2(token_admin)
                    .address();
                let share_token_id = env.register(ShareToken, ());
                ShareTokenClient::new(&env, &share_token_id).initialize(
                    &admin,
                    &7u32,
                    &SorobanString::from_str(&env, "Pool Shares"),
                    &SorobanString::from_str(&env, "POOL"),
                );

                invoice_client.initialize(
                    &admin,
                    &pool_contract_id,
                    &i128::MAX,
                    &2_592_000u64,
                    &7u32,
                );
                pool_client.initialize(&admin, &usdc_id, &share_token_id, &invoice_contract_id);
                pool_client.set_max_investor_concentration(&admin, &10_000u32);

                soroban_sdk::token::StellarAssetClient::new(&env, &usdc_id)
                    .mint(&investor, &5_000_000_000);
                pool_client.deposit(&investor, &usdc_id, &5_000_000_000i128, &None);

                let owner = Address::generate(&env);
                let debtor = SorobanString::from_str(&env, "Acme Corp");
                let amount = 1_000_000_000i128;
                let due_date = env.ledger().timestamp() + 2_592_000;
                let description = SorobanString::from_str(&env, "Invoice for services");
                let verification_hash = SorobanString::from_str(&env, "hash123");
                let metadata_url = SorobanString::from_str(&env, "https://example.com/meta");

                let invoice_id = invoice_client.create_invoice(
                    &owner,
                    &debtor,
                    &amount,
                    &due_date,
                    &description,
                    &verification_hash,
                    &metadata_url,
                );
                pool_client.fund_invoice(&admin, &invoice_id, &amount, &owner, &due_date, &usdc_id);
                let total_due = pool_client.estimate_repayment(&invoice_id, &None);
                soroban_sdk::token::StellarAssetClient::new(&env, &usdc_id)
                    .mint(&owner, &total_due);
                pool_client.repay_invoice(&invoice_id, &owner, &total_due);

                (env, invoice_client, invoice_id, pool_contract_id)
            },
            |(_env, client, invoice_id, pool)| {
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

                (env, client, investor, usdc_id)
            },
            |(_env, client, investor, usdc_id)| {
                let amount = black_box(1_000_000_000i128);
                client.deposit(&investor, &usdc_id, &amount, &None)
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
                client.deposit(&investor, &usdc_id, &3_000_000_000, &None);

                // Open a co-funding round
                let invoice_id = 1u64;
                let principal = 3_000_000_000i128;
                let now = env.ledger().timestamp();
                let due_date = now + 2_592_000;
                let funding_deadline = now + 1_296_000;
                client.open_co_funding(
                    &admin,
                    &OpenCoFundingRequest {
                        invoice_id,
                        token: usdc_id,
                        target_principal: principal,
                        sme,
                        due_date,
                        funding_deadline,
                        min_commitment: 0,
                        max_investor_bps: 10_000,
                    },
                );

                (env, client, investor, invoice_id)
            },
            |(_env, client, investor, invoice_id)| {
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

                // Deposit, open + fill + finalize a co-funding round
                client.deposit(&investor, &usdc_id, &3_000_000_000, &None);
                let invoice_id = 1u64;
                let principal = 3_000_000_000i128;
                let now = env.ledger().timestamp();
                let due_date = now + 2_592_000;
                let funding_deadline = now + 1_296_000;
                client.open_co_funding(
                    &admin,
                    &OpenCoFundingRequest {
                        invoice_id,
                        token: usdc_id,
                        target_principal: principal,
                        sme: sme.clone(),
                        due_date,
                        funding_deadline,
                        min_commitment: 0,
                        max_investor_bps: 10_000,
                    },
                );
                client.commit_to_invoice(&investor, &invoice_id, &principal);
                client.finalize_co_funding(&admin, &invoice_id);

                // Advance time by 30 days
                env.ledger().with_mut(|l| l.timestamp += 2_592_000);

                (env, client, invoice_id, sme)
            },
            |(_env, client, invoice_id, sme)| {
                let amount = black_box(3_000_000_000i128);
                client.repay_invoice(&black_box(invoice_id), &black_box(sme), &amount)
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
