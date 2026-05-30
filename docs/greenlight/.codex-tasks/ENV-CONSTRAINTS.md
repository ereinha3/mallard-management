# ENV CONSTRAINTS — read before implementing any package

This sandbox has **NO network** (pip cannot install) and runs **Python 3.14.3**.

## Available (import freely)
`numpy` (2.4), `pandas` (3.0), `pydantic` (2.12), `pytest` (9.0), `fastapi`. Stdlib (`math`, `statistics`, `json`, `dataclasses`, etc.).

## NOT available — DO NOT import (they are not installed and cannot be installed)
`scipy`, `sklearn` / `scikit-learn`, `cvxpy`, `riskfolio` / `riskfolio-lib`.

**Implication:** every computation must be **pure numpy + stdlib**. The live optimizer is the **hand-rolled ERC** already in `engine/optimizer/erc.py` (numpy). Black-Litterman and mean-CVaR are **pre-baked static vectors** (they would need cvxpy on a networked machine) — do NOT compute them live.

## Run tests with system Python (the `.venv` is empty/broken)
```
PYTHONPATH=engine python3 -m pytest engine/tests/<your_test>.py -v
```
Do NOT use `engine/.venv`. Do NOT attempt `pip install`.

## Drop-in replacements for the missing scipy functions

**Normal CDF** (needed by `profiler/tolerance.py`):
```python
from math import erf, sqrt
def norm_cdf(x): return 0.5 * (1.0 + erf(x / sqrt(2.0)))
```

**Normal inverse CDF / quantile** Φ⁻¹ (needed by `backtest/metrics.py` Deflated Sharpe) — Acklam's rational approximation:
```python
import math
def norm_ppf(p):
    a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00]
    b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01]
    c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00]
    d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00]
    plow=0.02425; phigh=1-plow
    if p<plow:
        q=math.sqrt(-2*math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p>phigh:
        q=math.sqrt(-2*math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q=p-0.5; r=q*q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)
```

**Ledoit-Wolf covariance** (needed by `optimizer/erc.py` — replace the `sklearn` import): hand-roll linear shrinkage of the sample covariance toward a **constant-correlation target**:
```python
import numpy as np, pandas as pd
def cov_ledoit_wolf(returns, delta=None):     # returns: T x N DataFrame
    X = returns.values; T, N = X.shape
    S = np.cov(X, rowvar=False)
    var = np.diag(S); std = np.sqrt(var)
    R = S / np.outer(std, std)
    rbar = (R.sum() - N) / (N * (N - 1))      # mean off-diagonal correlation
    F = rbar * np.outer(std, std); np.fill_diagonal(F, var)   # constant-correlation target
    if delta is None:                          # simple, stable intensity; tune if time allows
        delta = 0.2
    Sigma = (1 - delta) * S + delta * F
    return pd.DataFrame(Sigma, index=returns.columns, columns=returns.columns)
```
(A full LW intensity estimate is fine if you implement it in numpy; otherwise the clamped `delta=0.2` is acceptable — document the choice.)

**naive_mvo baseline** (backtest): analytic max-Sharpe via numpy linear algebra (`w ∝ Σ⁻¹ μ`, long-only clip + renormalize) — no cvxpy.
