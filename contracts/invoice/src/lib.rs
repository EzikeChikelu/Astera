#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol,
};

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum InvoiceStatus {
    Pending,
    Funded,
    Paid,
    Defaulted,
}

#[contracttype]
#[derive(Clone)]
pub struct Invoice {
    pub id: u64,
    pub owner: Address,
    pub debtor: String,
    pub amount: i128,
    pub due_date: u64,
    pub description: String,
    pub status: InvoiceStatus,
    pub created_at: u64,
    pub funded_at: u64,
    pub paid_at: u64,
    pub pool_contract: Address,
}

#[contracttype]
pub enum DataKey {
    Invoice(u64),
    InvoiceCount,
    Admin,
    Pool,
    Initialized,
}

const EVT: Symbol = symbol_short!("INVOICE");

#[contract]
pub struct InvoiceContract;

#[contractimpl]
impl InvoiceContract {
    pub fn initialize(env: Env, admin: Address, pool: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Pool, &pool);
        env.storage().instance().set(&DataKey::InvoiceCount, &0u64);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// SME creates a new invoice token on-chain
    pub fn create_invoice(
        env: Env,
        owner: Address,
        debtor: String,
        amount: i128,
        due_date: u64,
        description: String,
    ) -> u64 {
        owner.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        if due_date <= env.ledger().timestamp() {
            panic!("due date must be in the future");
        }

        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::InvoiceCount)
            .unwrap_or(0);
        let id = count + 1;

        // Placeholder address — real pool address set on fund_invoice
        let placeholder: Address = env.storage().instance().get(&DataKey::Admin).unwrap();

        let invoice = Invoice {
            id,
            owner: owner.clone(),
            debtor,
            amount,
            due_date,
            description,
            status: InvoiceStatus::Pending,
            created_at: env.ledger().timestamp(),
            funded_at: 0,
            paid_at: 0,
            pool_contract: placeholder,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.storage().instance().set(&DataKey::InvoiceCount, &id);
        env.events()
            .publish((EVT, symbol_short!("created")), (id, owner, amount));

        id
    }

    /// Called by the pool contract when it funds an invoice
    pub fn mark_funded(env: Env, id: u64, pool: Address) {
        pool.require_auth();

        let authorized_pool: Address = env
            .storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized");
        if pool != authorized_pool {
            panic!("unauthorized pool");
        }

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found");

        if invoice.status != InvoiceStatus::Pending {
            panic!("invoice is not pending");
        }

        invoice.status = InvoiceStatus::Funded;
        invoice.funded_at = env.ledger().timestamp();
        invoice.pool_contract = pool;

        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.events().publish((EVT, symbol_short!("funded")), id);
    }

    /// Called by the pool when repayment is confirmed
    pub fn mark_paid(env: Env, id: u64, caller: Address) {
        caller.require_auth();

        let pool: Address = env
            .storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized");
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found");

        if caller != invoice.owner && caller != pool && caller != admin {
            panic!("unauthorized");
        }
        if invoice.status != InvoiceStatus::Funded {
            panic!("invoice is not funded");
        }

        invoice.status = InvoiceStatus::Paid;
        invoice.paid_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.events().publish((EVT, symbol_short!("paid")), id);
    }

    /// Mark invoice as defaulted (missed due date, no repayment)
    pub fn mark_defaulted(env: Env, id: u64, pool: Address) {
        pool.require_auth();

        let authorized_pool: Address = env
            .storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized");
        if pool != authorized_pool {
            panic!("unauthorized pool");
        }

        let mut invoice: Invoice = env
            .storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found");

        if invoice.status != InvoiceStatus::Funded {
            panic!("invoice is not funded");
        }

        invoice.status = InvoiceStatus::Defaulted;
        env.storage()
            .persistent()
            .set(&DataKey::Invoice(id), &invoice);
        env.events().publish((EVT, symbol_short!("default")), id);
    }

    pub fn get_invoice(env: Env, id: u64) -> Invoice {
        env.storage()
            .persistent()
            .get(&DataKey::Invoice(id))
            .expect("invoice not found")
    }

    pub fn get_invoice_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::InvoiceCount)
            .unwrap_or(0)
    }

    /// Update authorized pool address (admin only)
    pub fn set_pool(env: Env, admin: Address, pool: Address) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        if admin != stored_admin {
            panic!("unauthorized");
        }
        env.storage().instance().set(&DataKey::Pool, &pool);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Env,
    };

    fn setup(env: &Env) -> (InvoiceContractClient<'_>, Address, Address, Address) {
        let contract_id = env.register(InvoiceContract, ());
        let client = InvoiceContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let pool = Address::generate(env);
        let sme = Address::generate(env);
        client.initialize(&admin, &pool);
        (client, admin, pool, sme)
    }

    #[test]
    fn test_create_and_fund_invoice() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, pool, sme) = setup(&env);

        let id = client.create_invoice(
            &sme,
            &String::from_str(&env, "ACME Corp"),
            &1_000_000_000i128,                      // 1000 USDC (7 decimals)
            &(env.ledger().timestamp() + 2_592_000), // 30 days
            &String::from_str(&env, "Invoice #001 - Goods delivery"),
        );

        assert_eq!(id, 1);

        let invoice = client.get_invoice(&id);
        assert!(matches!(invoice.status, InvoiceStatus::Pending));

        client.mark_funded(&id, &pool);
        let invoice = client.get_invoice(&id);
        assert!(matches!(invoice.status, InvoiceStatus::Funded));

        client.mark_paid(&id, &sme);
        let invoice = client.get_invoice(&id);
        assert!(matches!(invoice.status, InvoiceStatus::Paid));
    }

    #[test]
    fn test_full_lifecycle_create_fund_pay() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 100_000);
        let (client, _admin, pool, owner) = setup(&env);

        let due = env.ledger().timestamp() + 86_400;
        let id = client.create_invoice(
            &owner,
            &String::from_str(&env, "Debtor"),
            &500_000_000i128,
            &due,
            &String::from_str(&env, "Lifecycle"),
        );
        assert_eq!(id, 1);
        assert!(matches!(
            client.get_invoice(&id).status,
            InvoiceStatus::Pending
        ));

        client.mark_funded(&id, &pool);
        let inv = client.get_invoice(&id);
        assert!(matches!(inv.status, InvoiceStatus::Funded));
        assert_ne!(inv.funded_at, 0);

        client.mark_paid(&id, &pool);
        let inv = client.get_invoice(&id);
        assert!(matches!(inv.status, InvoiceStatus::Paid));
        assert_ne!(inv.paid_at, 0);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_create_invoice_zero_amount_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _pool, sme) = setup(&env);

        client.create_invoice(
            &sme,
            &String::from_str(&env, "X"),
            &0i128,
            &(env.ledger().timestamp() + 1),
            &String::from_str(&env, "d"),
        );
    }

    #[test]
    #[should_panic(expected = "due date must be in the future")]
    fn test_create_invoice_past_due_date_panics() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);
        let (client, _admin, _pool, sme) = setup(&env);

        client.create_invoice(
            &sme,
            &String::from_str(&env, "X"),
            &100i128,
            &999_999, // strictly before ledger timestamp
            &String::from_str(&env, "d"),
        );
    }

    #[test]
    #[should_panic(expected = "unauthorized pool")]
    fn test_mark_funded_unauthorized_pool_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _pool, sme) = setup(&env);

        let id = client.create_invoice(
            &sme,
            &String::from_str(&env, "D"),
            &1_000i128,
            &(env.ledger().timestamp() + 10_000),
            &String::from_str(&env, "x"),
        );
        let rogue_pool = Address::generate(&env);
        client.mark_funded(&id, &rogue_pool);
    }

    #[test]
    #[should_panic(expected = "invoice is not pending")]
    fn test_mark_funded_already_funded_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, pool, sme) = setup(&env);

        let id = client.create_invoice(
            &sme,
            &String::from_str(&env, "D"),
            &1_000i128,
            &(env.ledger().timestamp() + 10_000),
            &String::from_str(&env, "x"),
        );
        client.mark_funded(&id, &pool);
        client.mark_funded(&id, &pool);
    }

    #[test]
    #[should_panic(expected = "invoice is not funded")]
    fn test_mark_paid_while_pending_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _pool, sme) = setup(&env);

        let id = client.create_invoice(
            &sme,
            &String::from_str(&env, "D"),
            &1_000i128,
            &(env.ledger().timestamp() + 10_000),
            &String::from_str(&env, "x"),
        );
        client.mark_paid(&id, &sme);
    }

    #[test]
    #[should_panic(expected = "invoice is not funded")]
    fn test_mark_defaulted_on_paid_invoice_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, pool, sme) = setup(&env);

        let id = client.create_invoice(
            &sme,
            &String::from_str(&env, "D"),
            &1_000i128,
            &(env.ledger().timestamp() + 10_000),
            &String::from_str(&env, "x"),
        );
        client.mark_funded(&id, &pool);
        client.mark_paid(&id, &sme);
        client.mark_defaulted(&id, &pool);
    }

    #[test]
    #[should_panic(expected = "invoice not found")]
    fn test_get_invoice_nonexistent_id_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _pool, _sme) = setup(&env);

        client.get_invoice(&999u64);
    }

    #[test]
    #[should_panic(expected = "unauthorized")]
    fn test_set_pool_non_admin_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _pool, _sme) = setup(&env);

        let intruder = Address::generate(&env);
        let new_pool = Address::generate(&env);
        client.set_pool(&intruder, &new_pool);
    }

    #[test]
    fn test_invoice_count_increments_across_creates() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _pool, sme) = setup(&env);

        let due = env.ledger().timestamp() + 50_000;
        let d = String::from_str(&env, "D");
        let desc = String::from_str(&env, "i");

        let id1 = client.create_invoice(&sme, &d, &100i128, &due, &desc);
        let id2 = client.create_invoice(&sme, &d, &200i128, &due, &desc);
        let id3 = client.create_invoice(&sme, &d, &300i128, &due, &desc);

        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(id3, 3);
        assert_eq!(client.get_invoice_count(), 3);
    }
}
