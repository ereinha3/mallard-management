"""Backtest runner for docs/greenlight/05 §2.11 and §7.5."""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np
import pandas as pd

from backtest.metrics import calmar, deflated_sharpe, max_drawdown, sortino
from data.loaders import DATA_DIR, load_prices, load_universe
from optimizer import build_target_weights, cov_ledoit_wolf
from schemas.constants import GAMMA_MAX, GAMMA_MIN, TX_COST_BPS
from schemas.models import BacktestMetrics, BacktestResult, BacktestStrategy

STRATEGY_NAMES = ("greenlight_erc", "one_over_n", "sixty_forty", "target_date", "naive_mvo")
# Single-ticker buy-and-hold benchmarks: strategy name -> ticker. These are
# scored against the strategy but are NOT part of the investable universe (the
# ticker carries role='benchmark' in the seed, so the optimizer never sees it).
PRICE_BENCHMARKS = {"spy": "SPY"}
BACKTEST_REPORT_BENCHMARKS = ("one_over_n", "sixty_forty", "target_date", "naive_mvo", "spy")
BACKTEST_REPORT_METRICS = (
    "cagr", "sharpe", "deflated_sharpe", "sortino", "max_drawdown", "calmar", "turnover"
)
WINDOW_MONTHS = 36
PERIODS_PER_YEAR = 12
REBALANCE_MONTHS = {"monthly": 1, "quarterly": 3}
GREENLIGHT_TARGET_VOL_MID = 0.145
GREENLIGHT_GAMMA_MID = (GAMMA_MIN + GAMMA_MAX) / 2.0
GREENLIGHT_DIAGNOSTIC_KEYS = (
    "blend_alpha",
    "risky_weight_share",
    "safe_weight_share",
    "realized_risky_vol",
    "realized_safe_vol",
)


def _monthly_price_frame(prices: Any | None = None) -> pd.DataFrame:
    prices = load_prices().sort_values("date") if prices is None else prices
    if not isinstance(prices, pd.DataFrame):
        prices = pd.DataFrame(prices)
    prices = prices.copy()
    if not {"date", "ticker", "adj_close"}.issubset(prices.columns):
        if "date" in prices.columns:
            prices = prices.set_index("date")
        prices.index = pd.to_datetime(prices.index).to_period("M")
        return prices.sort_index().astype(float).groupby(level=0).tail(1)
    prices["month"] = prices["date"].dt.to_period("M")
    monthly = prices.groupby(["month", "ticker"], as_index=False).tail(1)
    return monthly.pivot(index="month", columns="ticker", values="adj_close").sort_index().astype(float)


def _normalize(weights: Mapping[str, float], columns: pd.Index) -> pd.Series:
    series = pd.Series(weights, dtype=float).reindex(columns).fillna(0.0)
    total = float(series.sum())
    if total <= 0.0:
        return pd.Series(1.0 / len(columns), index=columns, dtype=float)
    return series / total


def _sleeve_to_ticker_weights(universe: Any, by_sleeve: Mapping[str, float]) -> dict[str, float]:
    by_ticker: dict[str, float] = {}
    for sleeve, sleeve_weight in by_sleeve.items():
        tickers = universe.sleeves.get(sleeve, [])
        if not tickers:
            continue
        for ticker in tickers:
            by_ticker[ticker] = by_ticker.get(ticker, 0.0) + float(sleeve_weight) / len(tickers)
    return by_ticker


def _bucket_weights(universe: Any, sleeves: list[str]) -> dict[str, float]:
    # Only sleeves actually present in the universe carry a market weight.
    present = [sleeve for sleeve in sleeves if sleeve in universe.market_weights]
    total = sum(float(universe.market_weights[sleeve]) for sleeve in present)
    if total <= 0.0:
        return {}
    return {sleeve: float(universe.market_weights[sleeve]) / total for sleeve in present}


def _target_date_weights(universe: Any, columns: pd.Index, elapsed_months: int) -> pd.Series:
    years_left = max(0.0, 37.0 - elapsed_months / 12.0)
    risky_fraction = 0.50 + 0.40 * min(1.0, years_left / 37.0)
    safe_fraction = 1.0 - risky_fraction
    risky = _bucket_weights(universe, list(universe.risky_sleeves))
    safe = _bucket_weights(universe, list(universe.safe_sleeves))
    by_sleeve = {
        **{sleeve: risky_fraction * weight for sleeve, weight in risky.items()},
        **{sleeve: safe_fraction * weight for sleeve, weight in safe.items()},
    }
    return _normalize(_sleeve_to_ticker_weights(universe, by_sleeve), columns)


def _naive_mvo_weights(window_returns: pd.DataFrame, columns: pd.Index) -> pd.Series:
    mean = window_returns.mean().reindex(columns).to_numpy(dtype=float)
    cov = cov_ledoit_wolf(window_returns[list(columns)]).to_numpy(dtype=float)
    raw = np.clip(np.linalg.pinv(cov) @ mean, 0.0, None)
    if float(raw.sum()) <= 0.0:
        return pd.Series(1.0 / len(columns), index=columns, dtype=float)
    return pd.Series(raw / raw.sum(), index=columns, dtype=float)


def _greenlight_risk_profile(elapsed_months: int) -> SimpleNamespace:
    elapsed_years = int(elapsed_months // 12)
    return SimpleNamespace(
        target_vol_band=SimpleNamespace(mid=GREENLIGHT_TARGET_VOL_MID),
        gamma_band=SimpleNamespace(
            aggressive=GAMMA_MIN,
            mid=GREENLIGHT_GAMMA_MID,
            conservative=GAMMA_MAX,
        ),
        age=28 + elapsed_years,
        horizon_years=max(1, 37 - elapsed_years),
    )


def _group_tickers(universe: Any, buckets: list[str], sleeves: list[str]) -> set[str]:
    tickers: set[str] = set()
    universe_buckets = getattr(universe, "buckets", {}) or {}
    for bucket in buckets:
        tickers.update(str(ticker) for ticker in universe_buckets.get(bucket, []))
    if tickers:
        return tickers

    universe_sleeves = getattr(universe, "sleeves", {}) or {}
    for sleeve in sleeves:
        tickers.update(str(ticker) for ticker in universe_sleeves.get(sleeve, []))
    return tickers


def _annualized_group_vol(
    window_returns: pd.DataFrame,
    weights: Mapping[str, float],
    group_tickers: set[str],
) -> float:
    group_weights = {
        ticker: float(weight)
        for ticker, weight in weights.items()
        if ticker in group_tickers and ticker in window_returns.columns and np.isfinite(weight)
    }
    total = float(sum(group_weights.values()))
    if total <= 0.0:
        return 0.0

    normalized = pd.Series(
        {ticker: weight / total for ticker, weight in group_weights.items()},
        dtype=float,
    )
    values = window_returns[list(normalized.index)].fillna(0.0).dot(normalized)
    if values.size <= 1:
        return 0.0
    return _finite(float(values.std(ddof=1) * np.sqrt(PERIODS_PER_YEAR)))


def _greenlight_target_diagnostics(
    universe: Any,
    target: Any,
    window_returns: pd.DataFrame,
) -> dict[str, float]:
    risky_buckets = [str(bucket) for bucket in getattr(universe, "risky_buckets", [])]
    safe_buckets = [str(bucket) for bucket in getattr(universe, "safe_buckets", [])]
    risky_sleeves = [str(sleeve) for sleeve in getattr(universe, "risky_sleeves", [])]
    safe_sleeves = [str(sleeve) for sleeve in getattr(universe, "safe_sleeves", [])]

    by_bucket = {str(bucket): float(weight) for bucket, weight in getattr(target, "by_bucket", {}).items()}
    if by_bucket:
        risky_share = sum(weight for bucket, weight in by_bucket.items() if bucket in risky_buckets)
        safe_share = sum(weight for bucket, weight in by_bucket.items() if bucket in safe_buckets)
    else:
        by_sleeve = {str(sleeve): float(weight) for sleeve, weight in getattr(target, "by_sleeve", {}).items()}
        risky_share = sum(weight for sleeve, weight in by_sleeve.items() if sleeve in risky_sleeves)
        safe_share = sum(weight for sleeve, weight in by_sleeve.items() if sleeve in safe_sleeves)

    risky_tickers = _group_tickers(universe, risky_buckets, risky_sleeves)
    safe_tickers = _group_tickers(universe, safe_buckets, safe_sleeves)
    by_ticker = {str(ticker): float(weight) for ticker, weight in target.by_ticker.items()}
    return {
        "blend_alpha": _finite(float(target.blend_alpha)),
        "risky_weight_share": _finite(float(risky_share)),
        "safe_weight_share": _finite(float(safe_share)),
        "realized_risky_vol": _annualized_group_vol(window_returns, by_ticker, risky_tickers),
        "realized_safe_vol": _annualized_group_vol(window_returns, by_ticker, safe_tickers),
    }


def _summarize_greenlight_diagnostics(samples: list[dict[str, float]]) -> dict[str, float]:
    summary: dict[str, float] = {"rebalance_count": float(len(samples))}
    for key in GREENLIGHT_DIAGNOSTIC_KEYS:
        values = np.asarray([sample[key] for sample in samples if np.isfinite(sample.get(key, np.nan))], dtype=float)
        summary[f"mean_{key}"] = _finite(float(values.mean())) if values.size else 0.0
    return summary


def _print_greenlight_diagnostics(samples: list[dict[str, float]]) -> None:
    summary = _summarize_greenlight_diagnostics(samples)
    fields = ", ".join(
        f"{key}={value:.6f}" if key != "rebalance_count" else f"{key}={int(value)}"
        for key, value in summary.items()
    )
    print(f"greenlight_erc diagnostics: {fields}")


def _greenlight_erc_weights(
    universe: Any,
    price_window: pd.DataFrame,
    window_returns: pd.DataFrame,
    columns: pd.Index,
    elapsed_months: int,
    diagnostics: list[dict[str, float]] | None = None,
) -> pd.Series:
    risk_profile = _greenlight_risk_profile(elapsed_months)
    target = build_target_weights(risk_profile, universe, price_window)
    if diagnostics is not None:
        diagnostics.append(_greenlight_target_diagnostics(universe, target, window_returns))
    return _normalize(target.by_ticker, columns)


def _walk_forward_target(
    name: str,
    universe: Any,
    price_window: pd.DataFrame,
    window_returns: pd.DataFrame,
    columns: pd.Index,
    elapsed_months: int,
    diagnostics: list[dict[str, float]] | None = None,
) -> pd.Series:
    if name == "greenlight_erc":
        return _greenlight_erc_weights(
            universe,
            price_window,
            window_returns,
            columns,
            elapsed_months,
            diagnostics=diagnostics,
        )
    if name == "one_over_n":
        return pd.Series(1.0 / len(columns), index=columns, dtype=float)
    if name == "sixty_forty":
        return _normalize({"VTI": 0.42, "VEA": 0.18, "BND": 0.32, "TIP": 0.08}, columns)
    if name == "target_date":
        return _target_date_weights(universe, columns, elapsed_months)
    if name == "naive_mvo":
        return _naive_mvo_weights(window_returns, columns)
    raise ValueError(f"unknown strategy: {name}")


def _finite(value: float) -> float:
    return float(value) if np.isfinite(value) else 0.0


def _first_investable_index(
    returns: pd.DataFrame,
    window_months: int,
    risky_tickers: set[str],
    safe_tickers: set[str],
) -> int:
    """First index whose trailing window has both a risky and a safe instrument."""

    columns = list(returns.columns)
    for idx in range(window_months, len(returns)):
        window = returns.iloc[idx - window_months : idx]
        available = {col for col in columns if bool(window[col].notna().all())}
        if available & risky_tickers and available & safe_tickers:
            return idx
    return window_months


def _walk_forward_strategy_result(
    name: str,
    universe: Any,
    prices: pd.DataFrame,
    returns: pd.DataFrame,
    window_months: int,
    rebalance_step: int,
    tx_cost_bps: float,
    start_idx: int | None = None,
) -> BacktestStrategy:
    columns = returns.columns
    current = pd.Series(0.0, index=columns, dtype=float)
    value = 10_000.0
    equity_values: list[float] = []
    return_values: list[float] = []
    turnover_values: list[float] = []
    dates = []
    tx_rate = tx_cost_bps / 10_000.0
    invested = False
    loop_start = window_months if start_idx is None else max(window_months, start_idx)
    diagnostics: list[dict[str, float]] | None = [] if name == "greenlight_erc" else None

    for idx in range(loop_start, len(returns)):
        period_start = value
        elapsed_months = idx - loop_start
        window_returns_full = returns.iloc[idx - window_months : idx]
        # Investable assets at this date: those with a complete trailing window
        # (newer funds phase in as they accumulate history).
        available = [col for col in columns if bool(window_returns_full[col].notna().all())]
        if elapsed_months % rebalance_step == 0 and available:
            window_returns = window_returns_full[available]
            price_window = prices.iloc[idx - window_months : idx + 1][available]
            target_avail = _walk_forward_target(
                name,
                universe,
                price_window,
                window_returns,
                pd.Index(available),
                elapsed_months,
                diagnostics=diagnostics,
            )
            target = pd.Series(0.0, index=columns, dtype=float)
            target.loc[target_avail.index] = target_avail.to_numpy(dtype=float)
            gross_turnover = float((target - current).abs().sum())
            value *= max(0.0, 1.0 - tx_rate * gross_turnover)
            turnover_values.append(gross_turnover / 2.0)
            current = target
            invested = True

        if not invested:
            continue

        asset_returns = returns.iloc[idx].fillna(0.0)
        portfolio_return = float((current * asset_returns).sum())
        value *= 1.0 + portfolio_return
        if value <= 0.0:
            raise ValueError(f"{name} portfolio value became non-positive")

        denominator = 1.0 + portfolio_return
        if denominator > 0.0:
            current = current * (1.0 + asset_returns) / denominator
            total = float(current.sum())
            if total > 0.0:
                current = current / total

        dates.append(returns.index[idx].to_timestamp().date())
        equity_values.append(value)
        return_values.append(value / period_start - 1.0)

    strategy = _strategy_from_curves(dates, equity_values, return_values, turnover_values)
    if diagnostics is not None:
        _print_greenlight_diagnostics(diagnostics)
    return strategy


def _strategy_from_curves(
    dates: list[Any],
    equity_values: list[float],
    return_values: list[float],
    turnover_values: list[float],
) -> BacktestStrategy:
    """Assemble a BacktestStrategy (curves + metrics) from raw monthly series."""

    equity = np.asarray(equity_values, dtype=float)
    values = np.asarray(return_values, dtype=float)
    drawdowns = equity / np.maximum.accumulate(equity) - 1.0
    monthly_std = float(values.std(ddof=1)) if values.size > 1 else 0.0
    sharpe = 0.0 if monthly_std == 0.0 else float(values.mean() / monthly_std * np.sqrt(PERIODS_PER_YEAR))

    metrics = BacktestMetrics(
        cagr=_finite((equity[-1] / equity[0]) ** (PERIODS_PER_YEAR / len(equity)) - 1.0),
        sharpe=_finite(sharpe),
        deflated_sharpe=deflated_sharpe(values, sr_hat=_finite(sharpe), n_trials=len(STRATEGY_NAMES)),
        sortino=_finite(sortino(values, periods_per_year=PERIODS_PER_YEAR)),
        max_drawdown=_finite(max_drawdown(equity)),
        calmar=_finite(calmar(values, periods_per_year=PERIODS_PER_YEAR)),
        turnover=float(np.mean(turnover_values)) if turnover_values else 0.0,
    )
    return BacktestStrategy(
        equity_curve=[
            {"date": date, "value": float(value)}
            for date, value in zip(dates, equity_values, strict=True)
        ],
        drawdown_curve=[
            {"date": date, "dd": float(value)}
            for date, value in zip(dates, drawdowns, strict=True)
        ],
        metrics=metrics,
    )


def _buy_and_hold_result(
    ticker: str,
    monthly_prices: pd.DataFrame,
    returns_index: pd.Index,
    loop_start: int,
    tx_cost_bps: float,
) -> BacktestStrategy | None:
    """Buy-and-hold a single benchmark ticker, aligned to the strategy grid.

    Holding 100% of one instrument and "rebalancing" to 100% is a no-op, so the
    only cost is the initial purchase. Returns are aligned to ``returns_index``
    and the curve starts at ``loop_start`` so it overlays the walk-forward
    strategies exactly. Returns None if the ticker has no price history covering
    the window.
    """

    if ticker not in monthly_prices.columns:
        return None
    series = monthly_prices[ticker].reindex(returns_index.union(monthly_prices.index)).sort_index()
    bench_returns = series.pct_change().reindex(returns_index)
    if bench_returns.iloc[loop_start:].notna().sum() == 0:
        return None

    tx_rate = tx_cost_bps / 10_000.0
    value = 10_000.0 * max(0.0, 1.0 - tx_rate)  # one-time entry cost on a full buy
    dates: list[Any] = []
    equity_values: list[float] = []
    return_values: list[float] = []
    for idx in range(loop_start, len(returns_index)):
        period_start = value
        month_return = float(bench_returns.iloc[idx]) if np.isfinite(bench_returns.iloc[idx]) else 0.0
        value *= 1.0 + month_return
        dates.append(returns_index[idx].to_timestamp().date())
        equity_values.append(value)
        return_values.append(value / period_start - 1.0)

    turnover_values = [0.5]  # single entry trade (one-sided turnover)
    return _strategy_from_curves(dates, equity_values, return_values, turnover_values)


def run_backtest(*args: Any, **kwargs: Any) -> BacktestResult:
    """Run the offline backtest and write a static BacktestResult artifact."""

    if args:
        raise TypeError("run_backtest accepts keyword arguments only")
    prices_arg = kwargs.pop("prices", None)
    output_path_arg = kwargs.pop("output_path", DATA_DIR / "backtest.json")
    window_months = int(kwargs.pop("window_months", WINDOW_MONTHS))
    rebalance = kwargs.pop("rebalance", "quarterly")
    tx_cost_bps = float(kwargs.pop("tx_cost_bps", TX_COST_BPS))
    if kwargs:
        unknown = ", ".join(sorted(kwargs))
        raise TypeError(f"unexpected keyword argument(s): {unknown}")
    if not 36 <= window_months <= 60:
        raise ValueError("window_months must be in the contract range [36, 60]")
    if rebalance not in REBALANCE_MONTHS:
        raise ValueError("rebalance must be 'monthly' or 'quarterly'")

    universe = load_universe(["none"])
    monthly = _monthly_price_frame(prices_arg)
    columns = [ticker for ticker in universe.tickers if ticker in monthly.columns]
    # Keep the full ragged panel (newer funds have leading NaNs). The walk-forward
    # selects, at each rebalance, the assets with a complete trailing window, so
    # the investable universe expands as funds list — no common-interval collapse.
    prices = monthly[columns].dropna(how="all")
    returns = prices.pct_change().dropna(how="all")
    if len(returns) <= window_months:
        raise ValueError("cached prices did not produce any monthly returns")

    # Start the backtest once a full trailing window contains at least one risky
    # and one safe instrument (the CAL blend needs both); older funds anchor the
    # early years, newer ones phase in. All strategies share this start so their
    # equity curves align.
    risky_tickers = {t for b in universe.risky_buckets for t in universe.buckets.get(b, [])}
    safe_tickers = {t for b in universe.safe_buckets for t in universe.buckets.get(b, [])}
    start_idx = _first_investable_index(returns, window_months, risky_tickers, safe_tickers)
    loop_start = max(window_months, start_idx)

    strategies: dict[str, BacktestStrategy] = {
        name: _walk_forward_strategy_result(
            name=name,
            universe=universe,
            prices=prices,
            returns=returns,
            window_months=window_months,
            rebalance_step=REBALANCE_MONTHS[rebalance],
            tx_cost_bps=tx_cost_bps,
            start_idx=start_idx,
        )
        for name in STRATEGY_NAMES
    }
    # Single-ticker buy-and-hold benchmarks (e.g. SPY) scored over the same grid.
    for bench_name, bench_ticker in PRICE_BENCHMARKS.items():
        bench = _buy_and_hold_result(
            bench_ticker, monthly, returns.index, loop_start, tx_cost_bps
        )
        if bench is not None:
            strategies[bench_name] = bench
    first_curve = next(iter(strategies.values())).equity_curve
    result = BacktestResult(
        strategies=strategies,
        config={
            "window_months": window_months,
            "rebalance": rebalance,
            "tx_cost_bps": tx_cost_bps,
            "n_trials": len(STRATEGY_NAMES),
            "period": {
                "start": first_curve[0].date,
                "end": first_curve[-1].date,
            },
        },
    )

    if output_path_arg is not None:
        output_path = Path(output_path_arg)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result.model_dump(mode="json"), indent=2) + "\n")
    return result


def _strategy_report(strategy: BacktestStrategy) -> dict[str, Any]:
    payload = strategy.model_dump(mode="json")
    return {
        "equity_curve": payload["equity_curve"],
        "drawdown_curve": payload["drawdown_curve"],
        "metrics": {
            key: payload["metrics"][key]
            for key in BACKTEST_REPORT_METRICS
        },
    }


def _load_or_build_backtest_result(source_path: Path | str | None) -> BacktestResult:
    if source_path is not None:
        path = Path(source_path)
        if path.exists():
            return BacktestResult.model_validate(json.loads(path.read_text()))
    return run_backtest(output_path=source_path)


def run_backtest_report(*args: Any, **kwargs: Any) -> dict[str, Any]:
    """Return the API-facing backtest payload, cached as JSON for fast serving."""

    if args:
        raise TypeError("run_backtest_report accepts keyword arguments only")
    cache_path_arg = kwargs.pop("cache_path", DATA_DIR / "backtest_api.json")
    source_path = kwargs.pop("source_path", DATA_DIR / "backtest.json")
    force = bool(kwargs.pop("force", False))
    # Accepted for the POST contract. The MVP serves a precomputed walk-forward report.
    kwargs.pop("profile", None)
    kwargs.pop("weights", None)
    kwargs.pop("start", None)
    kwargs.pop("end", None)
    if kwargs:
        unknown = ", ".join(sorted(kwargs))
        raise TypeError(f"unexpected keyword argument(s): {unknown}")

    cache_path = Path(cache_path_arg)
    if not force and cache_path.exists():
        return json.loads(cache_path.read_text())

    result = _load_or_build_backtest_result(source_path)
    primary = _strategy_report(result.strategies["greenlight_erc"])
    report = {
        "equity_curve": primary["equity_curve"],
        "drawdown_curve": primary["drawdown_curve"],
        "metrics": primary["metrics"],
        "benchmarks": {
            name: _strategy_report(result.strategies[name])
            for name in BACKTEST_REPORT_BENCHMARKS
        },
    }

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(report, indent=2) + "\n")
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Greenlight offline backtest.")
    parser.add_argument("--output-path", default=DATA_DIR / "backtest.json", help="Path to write BacktestResult JSON")
    parser.add_argument("--window-months", type=int, default=WINDOW_MONTHS, help="Lookback window in months")
    parser.add_argument(
        "--rebalance",
        choices=sorted(REBALANCE_MONTHS),
        default="quarterly",
        help="Rebalance cadence",
    )
    parser.add_argument("--tx-cost-bps", type=float, default=TX_COST_BPS, help="Transaction cost in basis points")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    result = run_backtest(
        output_path=args.output_path,
        window_months=args.window_months,
        rebalance=args.rebalance,
        tx_cost_bps=args.tx_cost_bps,
    )
    summary = {
        name: strategy.metrics.model_dump(mode="json")
        for name, strategy in result.strategies.items()
    }
    print(json.dumps({"config": result.config.model_dump(mode="json"), "metrics": summary}, indent=2))


if __name__ == "__main__":
    main()
