"""
Gilbert's tax strategy engines — Python port of reference/lib/tax/.

Legal basis:
  - IRC §1091 (wash-sale), §1211–§1212 (loss deduction)      → tax_loss_harvesting
  - IRC §408A(d)(3) (Roth conversion)                         → roth_conversion
  - IRC §1(h), §1222, §1411 (LTCG rates and NIIT)            → capital_gains_timing

DISCLAIMER: Informational tax-planning analysis only.
Not personalized tax advice. Users should consult a CPA.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Literal

# ── 2026 Tax Constants (IRS Rev. Proc. 2025-32) ───────────────────────────────

TAX_YEAR = 2026

FilingStatus = Literal[
    "single", "married_joint", "married_separate", "head_of_household"
]

# Normalize engine FilingStatus → canonical keys used internally
_FS_NORM: dict[str, str] = {
    "single": "single",
    "married_joint": "married_filing_jointly",
    "married_jointly": "married_filing_jointly",
    "married_filing_jointly": "married_filing_jointly",
    "married_separate": "married_filing_separately",
    "married_filing_separately": "married_filing_separately",
    "head_of_household": "head_of_household",
}


def _norm_fs(fs: str) -> str:
    return _FS_NORM.get(fs, "single")


FEDERAL_BRACKETS: dict[str, list[tuple[float, float]]] = {
    "single": [
        (0.10, 0), (0.12, 12_400), (0.22, 50_400),
        (0.24, 105_700), (0.32, 201_775), (0.35, 256_225), (0.37, 640_600),
    ],
    "married_filing_jointly": [
        (0.10, 0), (0.12, 24_800), (0.22, 100_800),
        (0.24, 211_400), (0.32, 403_550), (0.35, 512_450), (0.37, 768_700),
    ],
    "married_filing_separately": [
        (0.10, 0), (0.12, 12_400), (0.22, 50_400),
        (0.24, 105_700), (0.32, 201_775), (0.35, 256_225), (0.37, 384_350),
    ],
    "head_of_household": [
        (0.10, 0), (0.12, 17_700), (0.22, 67_450),
        (0.24, 105_700), (0.32, 201_775), (0.35, 256_200), (0.37, 640_600),
    ],
}

STANDARD_DEDUCTIONS: dict[str, float] = {
    "single": 16_100,
    "married_filing_jointly": 32_200,
    "married_filing_separately": 16_100,
    "head_of_household": 24_150,
}

LTCG_BRACKETS: dict[str, list[tuple[float, float]]] = {
    "single": [(0.00, 0), (0.15, 49_450), (0.20, 545_500)],
    "married_filing_jointly": [(0.00, 0), (0.15, 98_900), (0.20, 613_700)],
    "married_filing_separately": [(0.00, 0), (0.15, 49_450), (0.20, 306_850)],
    "head_of_household": [(0.00, 0), (0.15, 66_200), (0.20, 579_600)],
}

NIIT_RATE = 0.038
NIIT_THRESHOLD: dict[str, float] = {
    "single": 200_000,
    "married_filing_jointly": 250_000,
    "married_filing_separately": 125_000,
    "head_of_household": 200_000,
}

WASH_SALE_REPLACEMENTS: dict[str, list[dict]] = {
    "VTI":  [{"ticker": "SCHB", "name": "Schwab U.S. Broad Market ETF"},
              {"ticker": "ITOT", "name": "iShares Core S&P Total U.S. Stock Market ETF"}],
    "VOO":  [{"ticker": "IVV",  "name": "iShares Core S&P 500 ETF"},
              {"ticker": "SPLG", "name": "SPDR Portfolio S&P 500 ETF"}],
    "SPY":  [{"ticker": "IVV",  "name": "iShares Core S&P 500 ETF"},
              {"ticker": "VOO",  "name": "Vanguard S&P 500 ETF"}],
    "VXUS": [{"ticker": "IXUS", "name": "iShares Core MSCI Total International Stock ETF"},
              {"ticker": "SCHI", "name": "Schwab International Equity ETF"}],
    "BND":  [{"ticker": "AGG",  "name": "iShares Core U.S. Aggregate Bond ETF"},
              {"ticker": "SCHZ", "name": "Schwab U.S. Aggregate Bond ETF"}],
    "VNQ":  [{"ticker": "SCHH", "name": "Schwab U.S. REIT ETF"},
              {"ticker": "IYR",  "name": "iShares U.S. Real Estate ETF"}],
    "VWO":  [{"ticker": "IEMG", "name": "iShares Core MSCI Emerging Markets ETF"},
              {"ticker": "SCHE", "name": "Schwab Emerging Markets Equity ETF"}],
    "QQQ":  [{"ticker": "QQQM", "name": "Invesco NASDAQ 100 ETF",
               "note": "Same index — gray area; confirm with CPA"},
              {"ticker": "ONEQ", "name": "Fidelity NASDAQ Composite Index ETF"}],
    "GLD":  [{"ticker": "IAU",  "name": "iShares Gold Trust"},
              {"ticker": "GLDM", "name": "SPDR Gold MiniShares"}],
    "AGG":  [{"ticker": "BND",  "name": "Vanguard Total Bond Market ETF"},
              {"ticker": "SCHZ", "name": "Schwab U.S. Aggregate Bond ETF"}],
    "SCHP": [{"ticker": "TIP",  "name": "iShares TIPS Bond ETF"}],
    "USRT": [{"ticker": "VNQ",  "name": "Vanguard Real Estate ETF"},
              {"ticker": "SCHH", "name": "Schwab U.S. REIT ETF"}],
}

MAX_ORDINARY_INCOME_DEDUCTION = 3_000
MAX_ORDINARY_INCOME_DEDUCTION_MFS = 1_500


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _days_between(d1: str, d2: str) -> int:
    a = datetime.fromisoformat(d1).date() if isinstance(d1, str) else d1
    b = datetime.fromisoformat(d2).date() if isinstance(d2, str) else d2
    return abs((b - a).days)


def _is_long_term(purchase_date: str, as_of_date: str) -> bool:
    return _days_between(purchase_date, as_of_date) > 365


def _get_marginal_rate(taxable_income: float, filing_status: str) -> float:
    brackets = FEDERAL_BRACKETS[_norm_fs(filing_status)]
    rate = brackets[0][0]
    for r, min_income in brackets:
        if taxable_income >= min_income:
            rate = r
        else:
            break
    return rate


def _get_next_bracket(taxable_income: float, filing_status: str) -> tuple[float, float]:
    """Returns (next_rate, room_to_next_bracket)."""
    brackets = FEDERAL_BRACKETS[_norm_fs(filing_status)]
    for i in range(len(brackets) - 1):
        r, lo = brackets[i]
        _, hi = brackets[i + 1]
        if lo <= taxable_income < hi:
            return brackets[i + 1][0], hi - taxable_income
    return brackets[-1][0], math.inf


def _calc_tax_on_slice(start: float, amount: float, filing_status: str) -> float:
    """Tax owed on `amount` of income starting at position `start`."""
    brackets = FEDERAL_BRACKETS[_norm_fs(filing_status)]
    remaining = amount
    tax = 0.0
    position = start
    for i, (rate, lo) in enumerate(brackets):
        hi = brackets[i + 1][1] if i + 1 < len(brackets) else math.inf
        if position >= hi:
            continue
        room = hi - max(position, lo)
        taxed = min(remaining, room)
        tax += taxed * rate
        remaining -= taxed
        position += taxed
        if remaining <= 0:
            break
    return tax


def _get_ltcg_rate(total_taxable_income: float, filing_status: str) -> float:
    brackets = LTCG_BRACKETS[_norm_fs(filing_status)]
    rate = 0.0
    for r, min_income in brackets:
        if total_taxable_income >= min_income:
            rate = r
        else:
            break
    return rate


def _get_next_ltcg_bracket(total_taxable_income: float, filing_status: str) -> tuple[float, float]:
    brackets = LTCG_BRACKETS[_norm_fs(filing_status)]
    for i in range(len(brackets) - 1):
        r, lo = brackets[i]
        _, hi = brackets[i + 1]
        if lo <= total_taxable_income < hi:
            return brackets[i + 1][0], hi - total_taxable_income
    return brackets[-1][0], math.inf


# ── 1. Tax-Loss Harvesting ─────────────────────────────────────────────────────

def analyze_tax_loss_harvesting(
    holdings: list[dict],
    filing_status: str,
    ordinary_marginal_rate: float,
    ltcg_rate: float,
    realized_st_gains_ytd: float = 0.0,
    realized_lt_gains_ytd: float = 0.0,
    st_loss_carryforward: float = 0.0,
    lt_loss_carryforward: float = 0.0,
    trade_cost_dollars: float = 0.0,
    as_of_date: str | None = None,
) -> dict:
    """
    Identify tax-loss harvesting candidates in a portfolio.

    Each holding dict requires:
      ticker, shares, cost_basis_per_share, current_price_per_share,
      purchase_date (ISO "YYYY-MM-DD"), name (optional)
    """
    if as_of_date is None:
        as_of_date = date.today().isoformat()

    fs = _norm_fs(filing_status)
    max_ordinary_offset = (
        MAX_ORDINARY_INCOME_DEDUCTION_MFS
        if fs == "married_filing_separately"
        else MAX_ORDINARY_INCOME_DEDUCTION
    )

    candidates = []

    for h in holdings:
        cost_basis = h["shares"] * h["cost_basis_per_share"]
        current_value = h["shares"] * h["current_price_per_share"]
        unrealized_loss = current_value - cost_basis

        if unrealized_loss >= 0:
            continue

        long_term = _is_long_term(h["purchase_date"], as_of_date)
        holding_days = _days_between(h["purchase_date"], as_of_date)

        savings_rate = ltcg_rate if long_term else ordinary_marginal_rate
        loss_abs = abs(unrealized_loss)
        estimated_tax_savings = loss_abs * savings_rate
        net_benefit = estimated_tax_savings - trade_cost_dollars * 2

        wash_sale_warning = None
        if holding_days <= 30:
            wash_sale_warning = (
                f"Purchased {holding_days} days ago. If you bought this or a substantially "
                f"identical security within 30 days before today, selling now would trigger "
                f"the wash-sale rule (IRC §1091) and disallow this loss."
            )

        replacements = WASH_SALE_REPLACEMENTS.get(h["ticker"], [])

        candidates.append({
            "ticker": h["ticker"],
            "name": h.get("name", h["ticker"]),
            "shares": h["shares"],
            "cost_basis": round(cost_basis, 2),
            "current_value": round(current_value, 2),
            "unrealized_loss": round(unrealized_loss, 2),
            "is_long_term": long_term,
            "holding_days": holding_days,
            "estimated_tax_savings": round(estimated_tax_savings, 2),
            "net_benefit": round(net_benefit, 2),
            "worth_harvesting": net_benefit > 0,
            "replacements": replacements,
            "wash_sale_warning": wash_sale_warning,
        })

    candidates.sort(key=lambda c: c["net_benefit"], reverse=True)

    st_losses = sum(abs(c["unrealized_loss"]) for c in candidates if not c["is_long_term"] and c["worth_harvesting"])
    lt_losses = sum(abs(c["unrealized_loss"]) for c in candidates if c["is_long_term"] and c["worth_harvesting"])
    total_harvestable = st_losses + lt_losses

    net_st = realized_st_gains_ytd - st_losses - st_loss_carryforward
    net_lt = realized_lt_gains_ytd - lt_losses - lt_loss_carryforward

    net_st_pos = net_st
    net_lt_pos = net_lt
    if net_st < 0 and net_lt > 0:
        cross = min(abs(net_st), net_lt)
        net_st_pos = net_st + cross
        net_lt_pos = net_lt - cross
    elif net_lt < 0 and net_st > 0:
        cross = min(abs(net_lt), net_st)
        net_lt_pos = net_lt + cross
        net_st_pos = net_st - cross

    combined_net_loss = min(0, net_st_pos) + min(0, net_lt_pos)
    ordinary_income_offset = min(max_ordinary_offset, abs(min(0.0, combined_net_loss)))
    loss_carryforward = max(0.0, abs(min(0.0, combined_net_loss)) - ordinary_income_offset)

    est_savings_this_year = (
        sum(c["estimated_tax_savings"] for c in candidates if c["worth_harvesting"])
        + ordinary_income_offset * ordinary_marginal_rate
    )
    est_savings_carryforward = loss_carryforward * ltcg_rate

    legal_notices = [
        "Wash-sale rule (IRC §1091): Do NOT repurchase the same or substantially identical security within 30 days before or after the sale, in any account including IRAs (Rev. Rul. 2008-5). Violation disallows the loss.",
        f"Maximum ordinary income offset: ${max_ordinary_offset:,}/year. Excess losses carry forward indefinitely (IRC §1212).",
        "Short-term losses (held ≤1 year) offset short-term gains first; long-term losses offset long-term gains first. Remaining net losses cross-offset (IRS Pub. 550).",
        "Replacement ETF suggestions are based on common practitioner guidance. 'Substantially identical' is a facts-and-circumstances test — confirm choices with a CPA before executing.",
        "This analysis is informational only and does not constitute personalized tax advice. Consult a CPA before executing any harvesting strategy.",
    ]

    return {
        "candidates": candidates,
        "total_harvestable_loss": round(total_harvestable, 2),
        "short_term_losses_available": round(st_losses, 2),
        "long_term_losses_available": round(lt_losses, 2),
        "net_short_term_position": round(net_st_pos, 2),
        "net_long_term_position": round(net_lt_pos, 2),
        "ordinary_income_offset": round(ordinary_income_offset, 2),
        "loss_carryforward": round(loss_carryforward, 2),
        "estimated_tax_savings_this_year": round(est_savings_this_year, 2),
        "estimated_tax_savings_from_carryforward": round(est_savings_carryforward, 2),
        "legal_notices": legal_notices,
    }


# ── 2. Roth Conversion ─────────────────────────────────────────────────────────

def analyze_roth_conversion(
    ordinary_income_this_year: float,
    filing_status: str,
    age: int,
    traditional_ira_balance: float,
    roth_ira_balance: float = 0.0,
    non_deductible_ira_basis: float = 0.0,
    expected_retirement_marginal_rate: float = 0.22,
    itemized_deductions: float = 0.0,
    years_to_retirement: int = 30,
    expected_annual_return: float = 0.07,
) -> dict:
    """
    Analyze Roth IRA conversion scenarios.
    Returns scenarios, recommendation, and legal notices.
    """
    fs = _norm_fs(filing_status)
    deduction = max(STANDARD_DEDUCTIONS[fs], itemized_deductions)
    current_taxable_income = max(0.0, ordinary_income_this_year - deduction)
    current_marginal_rate = _get_marginal_rate(current_taxable_income, fs)
    next_rate, room_to_next = _get_next_bracket(current_taxable_income, fs)

    # RMD gate
    rmd_required = age >= 73
    rmd_divisors = {
        73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
        79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8,
        85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2,
    }
    rmd_estimate = (
        round(traditional_ira_balance / rmd_divisors.get(age, 12.2))
        if rmd_required else None
    )

    pro_rata_warning = (
        f"You have ${non_deductible_ira_basis:,.0f} in non-deductible (after-tax) IRA basis. "
        "Conversions must be pro-rated across ALL traditional IRA funds — you cannot convert "
        "only the pre-tax dollars. The taxable portion = (pre-tax balance / total balance) × "
        "conversion amount. Consult a CPA to calculate this correctly (IRC §408(d)(2))."
        if non_deductible_ira_basis > 0 else None
    )

    five_year_rule_note = (
        "You are under 59½. Each Roth conversion starts its own 5-year clock from "
        "January 1 of the conversion year. Withdrawing converted principal before 5 years "
        "triggers a 10% penalty (IRC §408A(d)(3)(F)). Plan to leave converted funds untouched "
        "for at least 5 years, or until age 59½ — whichever is later for penalty-free access."
        if age < 59 else None
    )

    scenarios = []
    niit_threshold = NIIT_THRESHOLD[fs]
    brackets = FEDERAL_BRACKETS[fs]

    conversion_amounts: list[tuple[float, str]] = []

    if room_to_next > 0 and room_to_next < math.inf:
        fill_current = min(room_to_next, traditional_ira_balance)
        if fill_current > 1_000:
            conversion_amounts.append((
                fill_current,
                f"Fill current {current_marginal_rate*100:.0f}% bracket (stay under {next_rate*100:.0f}%)"
            ))

    for i in range(len(brackets) - 1):
        rate, min_b = brackets[i + 1]
        if min_b > current_taxable_income:
            next_next_min = brackets[i + 2][1] if i + 2 < len(brackets) else math.inf
            fill_through = min(
                (next_next_min if next_next_min < math.inf else min_b + 200_000) - current_taxable_income,
                traditional_ira_balance
            )
            if fill_through > room_to_next + 1_000:
                conversion_amounts.append((
                    min(fill_through, traditional_ira_balance),
                    f"Convert through {rate*100:.0f}% bracket"
                ))
            if len(conversion_amounts) >= 3:
                break

    if traditional_ira_balance > 0:
        if not any(amt >= traditional_ira_balance for amt, _ in conversion_amounts):
            conversion_amounts.append((traditional_ira_balance, "Full conversion (entire traditional IRA balance)"))

    for amount, label in conversion_amounts:
        income_after = current_taxable_income + amount
        tax_cost = _calc_tax_on_slice(current_taxable_income, amount, fs)
        marginal_on_conversion = _get_marginal_rate(income_after, fs)

        fv_roth = amount * (1 + expected_annual_return) ** years_to_retirement
        effective_rate = tax_cost / amount if amount > 0 else 0
        worth_converting = (
            marginal_on_conversion <= expected_retirement_marginal_rate
            or effective_rate < expected_retirement_marginal_rate
        )

        # Break-even years
        break_even_years = None
        if marginal_on_conversion < expected_retirement_marginal_rate:
            break_even_years = 0
        elif effective_rate < expected_retirement_marginal_rate:
            break_even_years = 0

        # Bracket warning
        bracket_warning = None
        final_rate = _get_marginal_rate(income_after, fs)
        if final_rate > current_marginal_rate:
            bracket_warning = (
                f"This conversion crosses into the {final_rate*100:.0f}% bracket. "
                f"Dollars above ${current_taxable_income + room_to_next:,.0f} are taxed at "
                f"{final_rate*100:.0f}% instead of {current_marginal_rate*100:.0f}%. "
                f"Consider limiting conversion to ${room_to_next:,.0f} to avoid this."
            )

        # NIIT warning
        niit_warning = None
        if (ordinary_income_this_year < niit_threshold
                and ordinary_income_this_year + amount > niit_threshold):
            niit_warning = (
                f"This conversion pushes total income above the ${niit_threshold:,} NIIT threshold. "
                f"Investment income above this level is subject to an additional {NIIT_RATE*100:.1f}% "
                "Net Investment Income Tax (IRC §1411)."
            )

        scenarios.append({
            "conversion_amount": round(amount),
            "label": label,
            "income_after_conversion": round(income_after),
            "marginal_rate_on_conversion": marginal_on_conversion,
            "tax_cost_this_year": round(tax_cost),
            "projected_future_value": round(fv_roth),
            "break_even_years": break_even_years,
            "worth_converting": worth_converting,
            "bracket_warning": bracket_warning,
            "niit_warning": niit_warning,
        })

    worthwhile = [s for s in scenarios if s["worth_converting"] and not s["bracket_warning"]]
    recommended = worthwhile[0] if worthwhile else (scenarios[0] if scenarios else None)

    if not recommended:
        recommended_reason = "No traditional IRA balance to convert."
        recommended_amount = 0
    elif recommended["worth_converting"] and recommended["marginal_rate_on_conversion"] <= expected_retirement_marginal_rate:
        recommended_reason = (
            f"Converting at {recommended['marginal_rate_on_conversion']*100:.0f}% today beats "
            f"your expected {expected_retirement_marginal_rate*100:.0f}% retirement rate. "
            f"Tax-free growth for {years_to_retirement} years projects to "
            f"${recommended['projected_future_value']:,}."
        )
        recommended_amount = recommended["conversion_amount"]
    else:
        recommended_reason = (
            f"Converting at {recommended['marginal_rate_on_conversion']*100:.0f}% today may not beat "
            f"your expected {expected_retirement_marginal_rate*100:.0f}% retirement rate. "
            "Consider a smaller conversion to hedge tax-rate uncertainty."
        )
        recommended_amount = recommended["conversion_amount"]

    legal_notices = [
        "Roth conversions are irrevocable since 2018 (re-characterization eliminated by TCJA). You cannot undo a conversion.",
        (
            f"You are 73+. RMDs (~${rmd_estimate:,}) must be distributed BEFORE converting (IRC §401(a)(9)). "
            "You cannot convert your RMD amount."
            if rmd_required else
            "No RMD required — you may convert freely."
        ),
        "Conversion income may affect Medicare IRMAA surcharges, Roth IRA contribution eligibility, and ACA premium tax credits.",
        "State income tax applies to conversions in most states — factor in your state rate.",
        "This analysis is informational only and does not constitute personalized tax advice. Consult a CPA before executing a Roth conversion.",
    ]

    return {
        "current_marginal_rate": current_marginal_rate,
        "current_bracket_remaining_room": round(min(room_to_next, traditional_ira_balance or 999_999)),
        "next_bracket_rate": next_rate,
        "rmd_required": rmd_required,
        "rmd_estimate": rmd_estimate,
        "pro_rata_warning": pro_rata_warning,
        "five_year_rule_note": five_year_rule_note,
        "scenarios": scenarios,
        "recommended_conversion_amount": recommended_amount,
        "recommended_reason": recommended_reason,
        "legal_notices": legal_notices,
    }


# ── 3. Capital Gains Timing ────────────────────────────────────────────────────

def analyze_capital_gains_timing(
    ordinary_taxable_income: float,
    filing_status: str,
    positions: list[dict],
    realized_ltcg_ytd: float = 0.0,
    realized_stcg_ytd: float = 0.0,
    state_ltcg_rate: float = 0.0,
    as_of_date: str | None = None,
) -> dict:
    """
    Analyze capital gains timing for a set of positions.

    Each position dict requires:
      id, ticker, shares, cost_basis_per_share, current_price_per_share,
      purchase_date (ISO "YYYY-MM-DD"), name (optional),
      is_real_estate (optional bool), depreciation_taken (optional float)
    """
    if as_of_date is None:
        as_of_date = date.today().isoformat()

    fs = _norm_fs(filing_status)
    niit_threshold = NIIT_THRESHOLD[fs]
    income_base = ordinary_taxable_income + realized_ltcg_ytd + realized_stcg_ytd
    current_ltcg_rate = _get_ltcg_rate(income_base, fs)
    next_ltcg_rate, room_until_next = _get_next_ltcg_bracket(income_base, fs)

    # 0% opportunity
    zero_rate_end = next(
        (min_b for r, min_b in LTCG_BRACKETS[fs] if r == 0.15), 0
    )
    zero_rate_room = max(0.0, zero_rate_end - income_base)
    zero_rate_opportunity = current_ltcg_rate == 0.0 and zero_rate_room > 0

    analyzed_positions = []
    for pos in positions:
        cost_basis = pos["shares"] * pos["cost_basis_per_share"]
        current_value = pos["shares"] * pos["current_price_per_share"]
        unrealized_gain = current_value - cost_basis

        holding_days = _days_between(pos["purchase_date"], as_of_date)
        is_long_term = holding_days > 365
        days_until_lt = None if is_long_term else max(0, 366 - holding_days)

        income_with_gain = income_base + (unrealized_gain if is_long_term else 0)
        federal_ltcg_rate = _get_ltcg_rate(income_with_gain, fs) if is_long_term else 0.0
        niit_applies = is_long_term and income_with_gain > niit_threshold
        effective_fed_rate = federal_ltcg_rate + (NIIT_RATE if niit_applies else 0) if is_long_term else 0.0

        lt_gain_tax = unrealized_gain * effective_fed_rate if is_long_term else 0.0
        state_tax = unrealized_gain * state_ltcg_rate if is_long_term else 0.0
        total_tax = lt_gain_tax + state_tax

        _, room_before = _get_next_ltcg_bracket(income_base, fs)
        would_cross = is_long_term and unrealized_gain > room_before and room_before < math.inf
        gain_crossing = max(0.0, unrealized_gain - room_before) if would_cross else 0.0

        bracket_warning = None
        if would_cross:
            next_r, _ = _get_next_ltcg_bracket(income_with_gain, fs)
            bracket_warning = (
                f"Selling this position pushes ${gain_crossing:,.0f} of gains "
                f"into the {next_r*100:.0f}% LTCG bracket. "
                f"Consider selling only ${room_before:,.0f} in gains this year "
                f"and the remainder next year to stay in the {current_ltcg_rate*100:.0f}% bracket."
            )

        depr_warning = None
        if pos.get("is_real_estate") and pos.get("depreciation_taken", 0) > 0:
            depr = pos["depreciation_taken"]
            depr_warning = (
                f"Real estate §1250 depreciation recapture: ${depr:,.0f} of your gain "
                "is taxed at a maximum 25% rate (not the LTCG rate), regardless of your bracket. "
                "Consult a CPA for the full calculation."
            )

        if not is_long_term and days_until_lt is not None and days_until_lt <= 90:
            recommendation = "wait_for_long_term"
            detail = (
                f"{days_until_lt} days until long-term treatment (366-day threshold). "
                f"Waiting converts ordinary-income tax to LTCG rate."
            )
        elif is_long_term and current_ltcg_rate == 0.0 and unrealized_gain > 0:
            recommendation = "sell_now_0pct"
            detail = (
                f"Your LTCG rate is currently 0%. Gain-harvesting opportunity — you can realize "
                f"${min(unrealized_gain, zero_rate_room):,.0f} in gains tax-free federally. "
                "Step up your cost basis now to reduce future taxable gains."
            )
        elif is_long_term and federal_ltcg_rate <= 0.15 and not would_cross:
            recommendation = "sell_now_acceptable"
            detail = f"15% LTCG rate (+ {state_ltcg_rate*100:.1f}% state). No bracket crossing. Total tax: ${total_tax:,.0f}."
        elif is_long_term and federal_ltcg_rate == 0.20:
            recommendation = "wait_for_lower_income_year"
            detail = (
                "Your income puts you in the 20% LTCG bracket. If income will be lower next year, "
                f"deferring this sale could drop the rate to 15%, saving ~${unrealized_gain*0.05:,.0f}."
            )
        else:
            recommendation = "caution_high_rate"
            detail = (
                f"Short-term gain — taxed as ordinary income. "
                f"Consider holding until long-term if investment thesis is intact."
            )

        analyzed_positions.append({
            "id": pos.get("id", pos["ticker"]),
            "ticker": pos["ticker"],
            "name": pos.get("name", pos["ticker"]),
            "shares": pos["shares"],
            "cost_basis": round(cost_basis, 2),
            "current_value": round(current_value, 2),
            "unrealized_gain": round(unrealized_gain, 2),
            "is_long_term": is_long_term,
            "holding_days": holding_days,
            "days_until_long_term": days_until_lt,
            "federal_ltcg_rate": federal_ltcg_rate,
            "niit_applies": niit_applies,
            "effective_federal_rate": effective_fed_rate,
            "total_federal_tax": round(lt_gain_tax, 2),
            "total_state_tax": round(state_tax, 2),
            "total_tax_if_sold_now": round(total_tax, 2),
            "recommendation": recommendation,
            "recommendation_detail": detail,
            "would_cross_bracket_boundary": would_cross,
            "gain_that_crosses_boundary": round(gain_crossing, 2),
            "bracket_warning": bracket_warning,
            "depreciation_recapture_warning": depr_warning,
        })

    priority = {
        "sell_now_0pct": 0,
        "sell_now_acceptable": 1,
        "wait_for_lower_income_year": 2,
        "wait_for_long_term": 3,
        "caution_high_rate": 4,
    }
    suggested_sell_order = [
        p["id"] for p in sorted(
            analyzed_positions,
            key=lambda p: (priority.get(p["recommendation"], 5), p["total_tax_if_sold_now"])
        )
    ]

    projected_ltcg = (
        realized_ltcg_ytd
        + sum(p["unrealized_gain"] for p in analyzed_positions if p["is_long_term"] and p["unrealized_gain"] > 0)
    )
    projected_rate = _get_ltcg_rate(ordinary_taxable_income + projected_ltcg, fs)

    legal_notices = [
        "Long-term capital gains treatment requires holding MORE than 365 days. Short-term gains are taxed as ordinary income at rates up to 37%.",
        "LTCG brackets are based on total taxable income including the gains ('stacking' rules).",
        *(
            [f"You currently have ${zero_rate_room:,.0f} of room at the 0% LTCG rate. Gain harvesting (realizing gains at 0% to reset cost basis) is legal and has no wash-sale equivalent."]
            if zero_rate_opportunity else []
        ),
        "NIIT (3.8%) applies to net investment income above $200,000 (single) / $250,000 (MFJ) MAGI (IRC §1411).",
        "Most states tax capital gains as ordinary income — factor in your state rate.",
        "This analysis is informational only. Consult a CPA before executing any sale.",
    ]

    return {
        "current_ltcg_rate": current_ltcg_rate,
        "room_until_next_ltcg_bracket": round(min(room_until_next, 1_000_000)),
        "next_ltcg_rate": next_ltcg_rate,
        "zero_rate_opportunity": zero_rate_opportunity,
        "zero_rate_room_remaining": round(zero_rate_room),
        "zero_rate_explanation": (
            f"You are in the 0% LTCG bracket with ${zero_rate_room:,.0f} of headroom. "
            "Selling appreciated positions now realizes gains TAX-FREE federally. "
            "This resets your cost basis at zero tax cost — legal with no wash-sale restrictions."
            if zero_rate_opportunity else
            f"You are not in the 0% LTCG bracket. Your current rate is {current_ltcg_rate*100:.0f}%."
        ),
        "positions": analyzed_positions,
        "projected_total_ltcg": round(projected_ltcg),
        "projected_ltcg_rate": projected_rate,
        "suggested_sell_order": suggested_sell_order,
        "legal_notices": legal_notices,
    }


# ── 4. Comprehensive Tax Analysis (combines all three) ────────────────────────

def full_tax_analysis(
    profile: dict,
    portfolio_positions: list[dict] | None = None,
    traditional_ira_balance: float = 0.0,
    roth_ira_balance: float = 0.0,
    non_deductible_ira_basis: float = 0.0,
    expected_retirement_marginal_rate: float | None = None,
    state_ltcg_rate: float = 0.0,
    trade_cost_dollars: float = 0.0,
) -> dict:
    """
    Run all three tax strategies against a user profile.

    profile: ValidatedProfile dict (from onboard response)
    portfolio_positions: list of position dicts (optional, for harvesting & gains timing)
    """
    filing_status = profile.get("filing_status", "single")
    income = float(profile.get("household_income", 0))
    age = int(profile.get("age", 30))
    horizon = int(profile.get("horizon_years", 30))

    # Estimate marginal rate from income + filing status
    fs_norm = _norm_fs(filing_status)
    std_ded = STANDARD_DEDUCTIONS[fs_norm]
    taxable = max(0.0, income - std_ded)
    marginal_rate = _get_marginal_rate(taxable, fs_norm)
    ltcg_rate = _get_ltcg_rate(taxable, fs_norm)

    if expected_retirement_marginal_rate is None:
        # Default: assume 22% retirement rate (typical)
        expected_retirement_marginal_rate = 0.22

    # ── Harvesting ────────────────────────────────────────────────────────
    harvest_result = None
    if portfolio_positions:
        loss_positions = [p for p in portfolio_positions if p.get("cost_basis_per_share", 0) > 0]
        if loss_positions:
            harvest_result = analyze_tax_loss_harvesting(
                holdings=loss_positions,
                filing_status=filing_status,
                ordinary_marginal_rate=marginal_rate,
                ltcg_rate=ltcg_rate,
                trade_cost_dollars=trade_cost_dollars,
            )

    # ── Roth Conversion ───────────────────────────────────────────────────
    roth_result = analyze_roth_conversion(
        ordinary_income_this_year=income,
        filing_status=filing_status,
        age=age,
        traditional_ira_balance=traditional_ira_balance,
        roth_ira_balance=roth_ira_balance,
        non_deductible_ira_basis=non_deductible_ira_basis,
        expected_retirement_marginal_rate=expected_retirement_marginal_rate,
        years_to_retirement=horizon,
    )

    # ── Capital Gains Timing ──────────────────────────────────────────────
    gains_positions = portfolio_positions or []
    gains_result = analyze_capital_gains_timing(
        ordinary_taxable_income=taxable,
        filing_status=filing_status,
        positions=gains_positions,
        state_ltcg_rate=state_ltcg_rate,
    )

    # ── Summary insights ──────────────────────────────────────────────────
    insights = []

    # Roth conversion opportunity
    if traditional_ira_balance > 0:
        if roth_result["recommended_conversion_amount"] > 0:
            insights.append({
                "type": "roth",
                "severity": "info",
                "title": "Roth Conversion Opportunity",
                "message": roth_result["recommended_reason"],
            })
    else:
        insights.append({
            "type": "roth",
            "severity": "info",
            "title": "Roth IRA Strategy",
            "message": (
                f"At your income of ${income:,.0f} with {filing_status.replace('_', ' ')} filing, "
                f"your marginal rate is {marginal_rate*100:.0f}%. "
                f"If this is lower than your expected retirement rate ({expected_retirement_marginal_rate*100:.0f}%), "
                "contributing to a Roth IRA now locks in today's rate for tax-free growth. "
                f"The {TAX_YEAR} Roth IRA contribution limit is $7,500 (+ $1,100 catch-up if 50+)."
            ),
        })

    if gains_result["zero_rate_opportunity"]:
        insights.append({
            "type": "gains_timing",
            "severity": "positive",
            "title": "0% Capital Gains Opportunity",
            "message": gains_result["zero_rate_explanation"],
        })
    else:
        insights.append({
            "type": "gains_timing",
            "severity": "info",
            "title": "Capital Gains Rate",
            "message": gains_result["zero_rate_explanation"],
        })

    if harvest_result and harvest_result["total_harvestable_loss"] > 0:
        insights.append({
            "type": "harvesting",
            "severity": "positive",
            "title": f"${harvest_result['total_harvestable_loss']:,.0f} Harvestable Loss Identified",
            "message": (
                f"Realizing these losses could save ~${harvest_result['estimated_tax_savings_this_year']:,.0f} "
                f"in taxes this year, offsetting gains and up to $3,000 of ordinary income. "
                "Review wash-sale replacement options before executing."
            ),
        })

    # Debt-vs-invest insight
    debts = profile.get("debts", [])
    high_apr_debts = [d for d in debts if float(d.get("apr", 0)) > 0.08]
    if high_apr_debts:
        total_high = sum(float(d.get("balance", 0)) for d in high_apr_debts)
        max_apr = max(float(d.get("apr", 0)) for d in high_apr_debts)
        insights.append({
            "type": "debt",
            "severity": "warning",
            "title": f"High-Interest Debt: {max_apr*100:.0f}% APR",
            "message": (
                f"${total_high:,.0f} in debt at {max_apr*100:.0f}%+ APR — paying this down "
                f"is a guaranteed after-tax return of {max_apr*100:.0f}%, which likely exceeds "
                "expected market returns after tax. Prioritize payoff before additional investing."
            ),
        })

    return {
        "tax_year": TAX_YEAR,
        "filing_status": filing_status,
        "marginal_rate": marginal_rate,
        "ltcg_rate": ltcg_rate,
        "insights": insights,
        "harvest": harvest_result,
        "roth_conversion": roth_result,
        "capital_gains_timing": gains_result,
    }
