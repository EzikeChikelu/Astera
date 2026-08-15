use soroban_sdk::Env;

pub fn calculate_waterfall_split(
    _env: &Env,
    total_due: i128,
    senior_principal: i128,
    senior_target_yield_bps: u32,
    elapsed_secs: u64,
) -> (i128, i128) {
    let yearly = 365u64 * 24 * 60 * 60;

    let interest = senior_principal * senior_target_yield_bps as i128 * elapsed_secs as i128
        / 10_000
        / yearly as i128;

    let senior_cap = senior_principal + interest;

    let senior_amount = if total_due >= senior_cap {
        senior_cap
    } else {
        total_due
    };

    let junior_amount = total_due - senior_amount;

    (senior_amount, junior_amount)
}

pub fn calculate_loss_allocation(shortfall: i128, junior_remaining: i128) -> (i128, i128) {
    if shortfall <= junior_remaining {
        (shortfall, 0)
    } else {
        (junior_remaining, shortfall - junior_remaining)
    }
}
