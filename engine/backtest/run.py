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
from schemas.constants import TX_COST_BPS
from schemas.models import BacktestMetrics, BacktestResult, BacktestStrategy

STRATEGY_NAMES = ("greenlight_erc", "one_over_n", "sixty_forty", "target_date", "naive_mvo")
BACKTEST_REPORT_BENCHMARKS = ("one_over_n", "sixty_forty", "target_date")
BACKTEST_REPORT_METRICS = ("sharpe", "sortino", "max_drawdown", "calmar", "turnover")
WINDOW_MONTHS = 36
PERIODS_PER_YEAR = 12
REBALANCE_MONTHS = {"monthly": 1, "quarterly": 3}


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
        for ticker in universe.sleeves[sleeve]:
            by_ticker[ticker] = by_ticker.get(ticker, 0.0) + float(sleeve_weight) / len(universe.sleeves[sleeve])
    return by_ticker


def _bucket_weights(universe: Any, sleeves: list[str]) -> dict[str, float]:
    total = sum(float(universe.market_weights[sleeve]) for sleeve in sleeves)
    return {sleeve: float(universe.market_weights[sleeve]) / total for sleeve in sleeves}


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


def _greenlight_erc_weights(
    universe: Any,
    price_window: pd.DataFrame,
    window_returns: pd.DataFrame,
    columns: pd.Index,
    elapsed_months: int,
) -> pd.Series:
    _ = window_returns
    elapsed_years = int(elapsed_months // 12)
    risk_profile = SimpleNamespace(
        target_vol_band=SimpleNamespace(mid=0.145),
        age=28 + elapsed_years,
        horizon_years=max(1, 37 - elapsed_years),
    )
    target = build_target_weights(risk_profile, universe, price_window)
    return _normalize(target.by_ticker, columns)


def _walk_forward_target(
    name: str,
    universe: Any,
    price_window: pd.DataFrame,
    window_returns: pd.DataFrame,
    columns: pd.Index,
    elapsed_months: int,
) -> pd.Series:
    if name == "greenlight_erc":
        return _greenlight_erc_weights(universe, price_window, window_returns, columns, elapsed_months)
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


def _walk_forward_strategy_result(
    name: str,
    universe: Any,
    prices: pd.DataFrame,
    returns: pd.DataFrame,
    window_months: int,
    rebalance_step: int,
    tx_cost_bps: float,
) -> BacktestStrategy:
    columns = returns.columns
    current = pd.Series(0.0, index=columns, dtype=float)
    value = 10_000.0
    equity_values: list[float] = []
    return_values: list[float] = []
    turnover_values: list[float] = []
    dates = []
    tx_rate = tx_cost_bps / 10_000.0

    for idx in range(window_months, len(returns)):
        period_start = value
        elapsed_months = idx - window_months
        if elapsed_months % rebalance_step == 0:
            window_returns = returns.iloc[idx - window_months : idx]
            price_window = prices.iloc[idx - window_months : idx + 1][columns]
            target = _walk_forward_target(
                name,
                universe,
                price_window,
                window_returns,
                columns,
                elapsed_months,
            )
            gross_turnover = float((target - current).abs().sum())
            value *= max(0.0, 1.0 - tx_rate * gross_turnover)
            turnover_values.append(gross_turnover / 2.0)
            current = target

        asset_returns = returns.iloc[idx]
        portfolio_return = float((current * asset_returns).sum())
        value *= 1.0 + portfolio_return
        if value <= 0.0:
            raise ValueError(f"{name} portfolio value became non-positive")

        denominator = 1.0 + portfolio_return
        if denominator > 0.0:
            current = current * (1.0 + asset_returns) / denominator
            current = current / current.sum()

        dates.append(returns.index[idx].to_timestamp().date())
        equity_values.append(value)
        return_values.append(value / period_start - 1.0)

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
    prices = _monthly_price_frame(prices_arg)
    columns = [ticker for ticker in universe.tickers if ticker in prices.columns]
    prices = prices[columns].dropna(how="any")
    returns = prices.pct_change().dropna(how="any")
    if len(returns) <= window_months:
        raise ValueError("cached prices did not produce any monthly returns")

    strategies = {
        name: _walk_forward_strategy_result(
            name=name,
            universe=universe,
            prices=prices,
            returns=returns,
            window_months=window_months,
            rebalance_step=REBALANCE_MONTHS[rebalance],
            tx_cost_bps=tx_cost_bps,
        )
        for name in STRATEGY_NAMES
    }
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
