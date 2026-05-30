from config import TAX_BRACKETS, CAPITAL_GAINS_BRACKETS


def get_marginal_rate(income: float, filing_status: str) -> float:
    brackets = TAX_BRACKETS.get(filing_status, TAX_BRACKETS["single"])
    for upper, rate in brackets:
        if income <= upper:
            return rate
    return brackets[-1][1]


def get_capital_gains_rate(income: float, filing_status: str) -> float:
    brackets = CAPITAL_GAINS_BRACKETS.get(filing_status, CAPITAL_GAINS_BRACKETS["single"])
    for upper, rate in brackets:
        if income <= upper:
            return rate
    return brackets[-1][1]
