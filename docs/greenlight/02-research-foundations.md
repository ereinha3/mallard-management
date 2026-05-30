# Greenlight — Research Foundations

**Status:** Design v2 (post-review) · **Date:** 2026-05-30

Every design decision is grounded in peer-reviewed research or established professional/regulatory standards. Organized by **decision area**: (a) the decision, (b) the research backing it, (c) how it integrates. Confidence flags: **HIGH** = multiple peer-reviewed sources; **MEDIUM** = single/contested; **PRACTICE** = professional/regulatory consensus.

**v2 changes:** corrected the γ↔volatility↔ERC mapping (§5); added the Black-Litterman equilibrium-prior requirement (§5); added a Monte Carlo / retirement-projection section (§6); added an explicit machine-learning stance (§5.1); committed riskfolio-lib; tightened the backtest section with transaction costs, Deflated Sharpe trial-count, and honest-claim framing (§8).

> **Tax note (§9):** wash-sale and loss-harvesting rules are established U.S. tax law but change over time — validate against current IRS guidance (Publication 550) before non-demo use.

---

## 1. Conversational elicitation: LLM as interface, deterministic engine as brain

**Decision.** The LLM conducts intake and explains results but emits only a validated, typed profile and never computes a number. A deterministic, versioned engine produces every figure.

**Research.**
- **Takayanagi et al. (2025). "Are Generative AI Agents Effective Personalized Financial Advisors?" *SIGIR 2025.* [arXiv:2504.05862](https://arxiv.org/abs/2504.05862).** LLM advisors match humans at eliciting preferences but **struggle to resolve conflicting needs** and can steer toward unsuitable assets when elicitation fails; users trusted a **charming-but-worse persona** (sycophancy).
- **Takayanagi et al. (2025). "FinPersona." *ECIR 2025* (demo). [Springer](https://link.springer.com/chapter/10.1007/978-3-031-88720-8_3).** The exact "elicit → structured profile → downstream engine" pattern.
- **Cheng et al. (2025). "ELEPHANT: Measuring Social Sycophancy in LLMs." [arXiv:2505.13995](https://arxiv.org/pdf/2505.13995).** Sycophancy increases when the user states a preference.
- **Kang & Liu (2023). "Deficiency of LLMs in Finance." [arXiv:2311.15548](https://arxiv.org/pdf/2311.15548).** LLMs make **reproducible arithmetic errors** — the core reason the LLM must never compute numbers.
- Regulated-domain engineering consensus: use generative models *non-generatively* (constrained extraction; deterministic code decides) for auditability. *(PRACTICE.)*

**Integration.** Hard LLM↔engine boundary (Design §2); constrained output + Validation Gate (Design §3.1–3.2); anti-sycophancy Explanation Agent (§3.13); contradiction-detection answers the SEC questionnaire critique (§9).

**Confidence: HIGH.**

---

## 2. Measuring risk tolerance (willingness) + the risk number as an interval

**Decision.** A validated psychometric instrument delivered conversationally + a loss-aversion probe, scored to an implied CRRA **γ** reported as a **band**, never a point. The band is propagated through the optimizer to a *range* of allocations/volatility.

**Research.**
- **Grable & Lytton (1999), *Financial Services Review* 8(3):163–181.** 13-item scale; Cronbach's α ≈ 0.75–0.77; **r ≈ 0.60** with actual risky-asset ownership. Re-validated by **Kuzniak et al. (2015), 24(2):177–192.**
- **Kahneman & Tversky (1979), *Econometrica* 47(2)**; **Tversky & Kahneman (1992), *J. Risk & Uncertainty* 5(4).** Value function; original λ = 2.25.
- **Brown, Imai, Vieider & Camerer (2024), *J. Economic Literature* 62(2):485–516.** 607 estimates → **λ ≈ 1.96, CI [1.82, 2.10]. Use λ ≈ 2.0, not 2.25.**
- **Kwak & Grable (2024), *Risks* 12(11):170.** Multi-item psychometric scales predict future allocation best; one-off scenario tasks drift with markets.
- **Kimball, Sahm & Shapiro (2008), *JASA* 103(483):1028–1038.** Income-gamble **bracketing** → CRRA γ; **most variance in a single elicitation is noise** (true-preference SD 1.76 → 0.73 once measurement error is modeled). → elicit redundantly, report **γ ± standard error of measurement**.
- **Cautions:** Espinosa & Ezquerra (2022), *PLoS ONE* 17(9) — framing shifts elicited risk aversion; **Grable (2017), CFA Institute Research Foundation** — single/two/three-item measures inadequate; report the SEM.

**Integration.** Risk Profiler tolerance axis (Design §3.3): score → γ band via Kimball-Sahm-Shapiro logic; band propagated through the optimizer (run at γ_low/mid/high) → an allocation/volatility *range* displayed to the user ("moderate, vol ~9–12%"). Loss-aversion probe flags panic-sell risk. Neutral phrasing/controlled order mitigate framing.

**Confidence: HIGH** on instruments and γ mapping; **MEDIUM** on the specific score→γ table — so we **commit and disclose** a concrete calibration (§2.1) rather than asserting a black-box number.

### 2.1 Committed score → γ calibration

A fully-grounded, disclosed mapping (no free parameters hidden from the user):

1. **Raw tolerance score.** The Grable-Lytton instrument yields a raw score in `[13, 47]`. Standardize against the published distribution (Kuzniak et al. 2015: mean ≈ **28.27**, SD ≈ **4.94**): `z = (score − 28.27) / 4.94`, then percentile `p = Φ(z)`.
2. **Percentile → γ (log-spaced, monotonic).** Risk-aversion effects are multiplicative, so map on a log scale over a defensible individual range `[γ_min, γ_max] = [1.5, 8.0]` (log-utility γ=1 as the aggressive reference; the Kimball-Sahm-Shapiro 2008 population mean ≈ 8.2 anchors the conservative end):
   `ln γ_tol = ln(γ_max) − p · (ln(γ_max) − ln(γ_min))`
   so a high-tolerance percentile → low γ (more equity), low percentile → high γ (more conservative).
3. **Measurement-error band (Grable 2017 requires reporting the SEM).** With reliability α ≈ 0.77, `SEM = 4.94 · √(1 − 0.77) ≈ 2.37` score points. Compute γ at `score − SEM`, `score`, and `score + SEM` to get **(γ_low, γ_mid, γ_high)** — the band we display and propagate through the optimizer.
4. **Capacity cap.** The capacity score maps to an implied `γ_capacity_floor` by the same log map; the usable coefficient is the **more conservative** of the two: `γ_used = max(γ_tol, γ_capacity_floor)` (this is `min(capacity, tolerance)` expressed in γ — higher γ = less risk).
5. **γ → target volatility (labeling device, disclosed).** `σ_target = SR_ref / γ_used`, where `SR_ref` is a **disclosed reference Sharpe constant** (≈ 0.4 for a diversified multi-asset portfolio), *not* a return forecast. Example: γ=2 → σ_target ≈ 20%; γ=8 → ≈ 5%. This is the dial the capital-allocation-line blend targets (§5).

Every constant (28.27, 4.94, 0.77, [1.5, 8.0], SR_ref) is shown in the UI's assumptions panel, satisfying the SEC transparency expectation (§10) and Grable's SEM requirement. These are **defaults to be back-tested/tuned**, not claims of universal truth.

**Confidence: HIGH** on the method and its citations; the specific constants are disclosed, tunable defaults.

---

## 3. Measuring risk capacity (ability) + glide path

**Decision.** A separate objective capacity score (horizon, human-capital beta, emergency-fund months, savings rate, debt burden), combined with tolerance via **`min()`**; translated to an age-appropriate equity glide path. MVP uses a linear age tilt; the U-shaped path is demonstrated (not asserted) via Monte Carlo (§6).

**Research.**
- **Bodie, Merton & Samuelson (1992), *J. Economic Dynamics and Control* 16(3–4):427–449** ([NBER w3954](https://www.nber.org/papers/w3954)). Total wealth = financial + **human capital**; young workers' stable income is **bond-like** → tilt the small financial portfolio to equities; capacity declines as human capital is consumed.
- **Merton (1969), *Rev. Econ. & Stat.* 51(3):247–257.** Merton share **w\* = (μ − r)/(γσ²)**. *(Note: this is the mean-variance optimum that links γ and volatility — and it requires μ. See §5 on why this does NOT apply to ERC.)*
- **Ibbotson, Chen, Milevsky & Zhu (2006/2007), *Financial Analysts Journal* 62(1) / CFA Institute.** Estimate the **beta of labor income to equities**: bond-like income → more equity capacity; stock-like income → more conservative.
- **Estrada (2014), *J. Portfolio Management* 40(5):52–64** ("The Glidepath Illusion") and **Pfau & Kitces (2014), *J. Financial Planning* 27(1):38–45** (U-shaped / rising-equity glide path reduces failure probability). *(Contested — MEDIUM; do not overstate.)*
- **"Capacity caps tolerance":** planning/regulatory consensus (Kitces; Morningstar; CIRO) — usable profile = the **lower** of the two. *(PRACTICE.)*

**Integration.** Risk Profiler capacity axis + `min()` (Design §3.3); the gate is the hard floor of capacity (§5); Glide-Path Adjuster (Design §3.7) + Monte Carlo proof (Design §3.8).

**Confidence: HIGH** (human capital, Merton); **MEDIUM** (glidepath shape); **PRACTICE** (capacity caps tolerance).

---

## 4. Debt-vs-invest decision (the gate's economic core)

**Decision.** Debt above ~8% APR halts investing; the user sees that paydown is a **guaranteed, tax-free return equal to the APR** vs. an **uncertain, taxed** expected market return, plus the **harm prevented**. Low-interest debt (<~5%) is allowed alongside.

**Research / reasoning.** Paying down debt at APR *r* is a **risk-free return of r%** with zero volatility, vs. an uncertain ~7–8% real equity return. Standard thresholds: prioritize debt above ~6–8%; pay first above ~10%. Caveats baked in: capture employer match first; hold a minimal emergency fund before aggressive payoff. *(PRACTICE — mathematically rigorous; professional/institutional consensus.)*

**Integration.** Responsibility Gate (Design §5); the Tax Layer puts the market side **after-tax** using the user's bracket (Design §3.12).

**Confidence: PRACTICE.**

---

## 5. Portfolio optimization (risk budget → weights)

**Decision.** **Equal-Risk-Contribution (risk parity)** core on a **Ledoit-Wolf shrinkage** covariance matrix; hit target volatility by **capital-allocation-line blending with the bond/cash sleeve** (not by feeding γ into the solve); **Black-Litterman** with an explicit market-cap prior for ESG views; **mean-CVaR** toggle on a scenario set; a **light ERC/min-var/max-div ensemble**. Committed library: **riskfolio-lib**. Naive max-Sharpe MVO appears only as the cautionary baseline.

**Research.**
- **Markowitz (1952), *J. Finance* 7(1):77–91**; **Michaud (1989), *FAJ* 45(1):31–42** (MVO is an "estimation-error maximizer"); **DeMiguel, Garlappi & Uppal (2009), *RFS* 22(5):1915–1953** (across 14 models/7 datasets **none consistently beats 1/N out-of-sample**; ~3,000+ months of data needed). → Do **not** ship naive MVO as the headline.
- **Maillard, Roncalli & Teiletche (2010), *J. Portfolio Management* 36(4):60–70.** ERC equalizes marginal risk contributions; **needs no expected-return estimates**; volatility provably between min-variance and 1/N.
- **Black & Litterman (1992), *FAJ* 48(5):28–43.** Start from **market-implied equilibrium returns** (reverse-optimized from **market-cap weights** — a stable prior) and blend views (P, Q, Ω). **Requirement we made explicit:** for an ETF sleeve universe you must define the sleeve "market portfolio" (market-cap weights); without it BL has no prior to tilt from.
- **Rockafellar & Uryasev (2000), *J. Risk* 2(3):21–42.** CVaR is coherent; minimizing it is an LP — **on a return *scenario set*** (historical/bootstrap rows), not the covariance matrix alone.
- **Ledoit & Wolf (2004), *J. Portfolio Management* 30(4):110–119.** Linear shrinkage → well-conditioned covariance, lower error. *(Their **nonlinear** shrinkage — Ledoit & Wolf 2017, *RFS* 30(12) — dominates when assets ≈ observations; for a 6–8 ETF universe with years of daily data, **linear is sufficient**.)*

**The corrected γ ↔ volatility mechanism (this was wrong in v1).** The Merton relation σ_p = (μ − r)/(γσ) = Sharpe/γ ties γ to volatility **only for the mean-variance optimum, and it requires μ** (the Sharpe ratio). ERC has **no γ input and exactly one volatility**. So we do **not** "scale ERC by γ." Instead: γ (a labeled risk dial, with its band) → a **target volatility**; we reach that volatility by **blending the all-risky ERC portfolio with the bond/cash sleeve along the capital-allocation line** (long-only → we can de-risk, not lever, so the range is asymmetric). This keeps the pipeline free of return forecasts. (Merton 1969; capital-allocation-line / two-fund separation.)

### 5.1 Machine learning — a deliberate, narrow stance

**Decision.** ML is confined to (a) the LLM as a *non-generative* preference elicitor (already in the design) and optionally (b) HRP's unsupervised clustering. **Return prediction is deliberately excluded.**

**Research.**
- **Gu, Kelly & Xiu (2020), *RFS* 33(5):2223–2273** ("Empirical Asset Pricing via Machine Learning"). Even the strongest ML asset-pricing result stresses the **low signal-to-noise ratio** of return prediction and heavy overfitting risk; gains come from *cross-sectional* signals on decades of firm-level data with strong regularization — none of which transfers to a 6–8 ETF allocation built in 24h. With DeMiguel et al. (2009) and Michaud (1989), bolting on an ML return predictor would contradict our own "avoid forecasts" thesis. **Refusing to fake alpha is itself a credibility point.**
- **López de Prado (2016), *J. Portfolio Management* 42(4):59–69** ("Building Diversified Portfolios that Outperform Out of Sample"). HRP uses hierarchical clustering + recursive bisection (no covariance inversion, no return forecasts) — the honest "ML" answer if a judge probes. For 6–8 sleeves ERC and HRP give similar results, so ERC stays the core and HRP is a footnote/alternate.

**Ensemble (light).** Average **ERC + min-variance + max-diversification** (all covariance-only); the cross-model weight dispersion feeds the risk band. We **skip Michaud resampled efficiency** — contested: Scherer (2002, "Portfolio Resampling: Review and Critique") shows a perverse artifact and at least one study finds plain Markowitz beats it out-of-sample.

**Integration.** Optimizer / Risk Engine (Design §3.6); risk band (§2); riskfolio-lib (native ERC/CVaR/BL/shrinkage).

**Confidence: HIGH.**

---

## 6. Monte Carlo goal-success & retirement projection

**Decision.** A **Monte Carlo goal-success engine** outputs P(terminal wealth ≥ goal) and a fan chart, using a **stationary block bootstrap** of historical returns — **not** Gaussian GBM. It is the mechanism that *proves* the glide-path choice.

**Research.**
- **Politis & Romano (1994), *JASA* 89(428):1303–1313** ("The Stationary Bootstrap"). Resamples **blocks of geometric random length**, preserving short-horizon serial dependence (momentum, volatility clustering) while remaining stationary, and is **far less sensitive to block-length misspecification** than the fixed-block bootstrap. Block length via **Politis & White (2004)** automatic selection.
- **Pfau (2010) / Kitces.** Gaussian-distribution Monte Carlo produces **optimistically biased** safe-withdrawal results vs. historical/bootstrap methods, with the gap **worst in the left tail** — exactly the region that matters for retirement security. → Gaussian is shown only as the "optimistic" contrast, never the headline number.
- **Sequence-of-returns risk.** Monte Carlo with realistic return paths is how Pfau & Kitces (2014, §3) analyze glide-path/bond-tent failure probabilities — so the MC layer turns our asserted glide-path benefit into a demonstrated one.

**Integration.** Monte Carlo Goal-Success Engine (Design §3.8): block-bootstrap fan chart + P(success); Gaussian toggle as the teaching contrast; consumes glide-adjusted weights + contributions + goal.

**Confidence: HIGH.**

---

## 7. Asset classes & diversification (why gold, bonds, TIPS, REITs)

**Decision.** Sleeves include US equity, international equity, bonds, **TIPS**, **gold**, REITs.

**Research.**
- **Baur & Lucey (2010), *Financial Review* 45(2):217–229.** Gold is a hedge for stocks and a safe haven in crashes, but the safe-haven effect is **short-lived (~15 trading days)**; not a safe haven for bonds.
- **Baur & McDermott (2010), *J. Banking & Finance* 34(8):1886–1898.** Gold is a strong safe haven for **US/European** markets, especially at the 2008–09 peak.
- **60/40 fragility:** relies on negative stock-bond correlation, which **broke in 2022** (60/40 ≈ −17%, worst since 1937) as inflation flipped the correlation positive → add TIPS, gold, REITs as regime-robust diversifiers. *(2022 figures: market data.)*

**Confidence: HIGH** (gold properties); **PRACTICE** (2022 figures).

---

## 8. Backtesting methodology & overfitting

**Decision.** Walk-forward out-of-sample, quarterly rebalance, **transaction costs (~10 bps)**, benchmarked vs. 1/N, 60/40, target-date; report Sharpe + **Deflated Sharpe with the logged trial count N**, Sortino, max drawdown, Calmar. Claim "**better drawdown/Sortino/Calmar and lower turnover**," not "beats 1/N on Sharpe." Computed offline, rendered static.

**Research.**
- **Bailey, Borwein, López de Prado & Zhu (2014), *Notices of the AMS* 61(5):458–471.** The more configurations tried, the more the best backtest is overfit; under autocorrelated markets, overfit backtests yield **negative** OOS returns. Reported Sharpe is uninterpretable without the number of trials.
- **Bailey & López de Prado (2014), *J. Portfolio Management* 40(5):94–107.** Deflated Sharpe Ratio: DSR = Φ((SR̂ − SR₀)/σ_SR), where σ_SR uses **skewness and kurtosis** of returns and SR₀ is the expected max Sharpe under the null **given N trials**. → **count and report N** (every optimizer variant × rebalance freq × window tried).
- **DeMiguel, Garlappi & Uppal (2009)** (see §5) — **1/N is the honest hurdle**; beating it on raw Sharpe usually can't be claimed honestly.
- **Data/ETFs:** VTI/SPY, VEA/EFA, AGG/BND, **TIP** (since 2003), **GLD** (since 2004), **VNQ** — pick the window so all series cover it, or backfill with index proxies and disclose.

**Confidence: HIGH.**

---

## 9. Taxes: debt-vs-invest after-tax math, loss harvesting, wash sales

**Decision.** Two lightweight **advisory (read-only)** functions: fold the bracket into the debt-vs-invest comparison; at year-end flag harvestable losses + surface the wash-sale caveat. No auto-execution. TurboTax export is roadmap.

**Rules** *(established U.S. tax law — validate against current IRS guidance before non-demo use):*
- **Wash-sale rule — IRC §1091; IRS Pub 550.** Loss **disallowed** if a substantially identical security is bought within **30 days before or after** the sale (61-day window); disallowed loss adds to replacement basis. → surface the caveat; suggest a non-substantially-identical replacement to stay invested.
- **Loss harvesting — IRS Pub 550, Topic 409.** Losses offset gains; net losses offset up to **$3,000** ordinary income/yr (**$1,500** MFS), remainder carried forward; long- vs. short-term character matters.
- **After-tax debt-vs-invest:** paydown returns are untaxed; gains are taxed → the gate's comparison puts the market side after-tax.

**Confidence: HIGH on the legal rules** (with the standing change caveat).

---

## 10. Regulatory & fiduciary context (disclaimer posture)

**Decision.** Persistent not-advice disclaimers; transparency about how the engine works; contradiction-follow-up framed as a response to regulator concerns.

**Research.**
- **SEC Guidance Update 2017-02, "Robo-Advisers."** Suitability concern: criticized reliance on questionnaires that don't let clients add context and **don't follow up on inconsistent answers**; required disclosures on how the algorithm works, assumptions/limitations, oversight, conflicts.
- **SEC fiduciary interpretation (IA-5248, 2019) & Reg BI**; **2021 SEC exam risk alert** found deficiencies at nearly all examined robo-advisers.

**Integration.** Disclaimer posture (Design §12); contradiction-detection (Design §3.1) answers the questionnaire critique. *(PRACTICE / regulatory.)*

---

## Citation quick-reference

| Area | Key sources |
|------|-------------|
| LLM-as-interface | Takayanagi SIGIR/ECIR 2025; ELEPHANT 2025; Kang & Liu 2023 |
| Risk tolerance + band | Grable & Lytton 1999; K&T 1979/1992; Brown 2024; Kwak & Grable 2024; Kimball-Sahm-Shapiro 2008; Grable 2017 |
| Risk capacity / glidepath | Bodie-Merton-Samuelson 1992; Merton 1969; Ibbotson-Chen 2006/2007; Estrada 2014; Pfau & Kitces 2014 |
| Debt-vs-invest | Guaranteed-return argument (PRACTICE) |
| Optimization | Markowitz 1952; Michaud 1989; DeMiguel 2009; Maillard 2010; Black-Litterman 1992; Rockafellar-Uryasev 2000; Ledoit-Wolf 2004/2017 |
| ML stance | Gu-Kelly-Xiu 2020; López de Prado 2016 (HRP); Scherer 2002 (why-not-Michaud) |
| Monte Carlo | Politis-Romano 1994; Politis-White 2004; Pfau 2010; Pfau & Kitces 2014 |
| Asset classes | Baur & Lucey 2010; Baur & McDermott 2010; 60/40 2022 |
| Backtesting | Bailey et al. 2014; Bailey & López de Prado 2014; DeMiguel 2009 |
| Taxes | IRC §1091; IRS Pub 550; Topic 409 |
| Regulation | SEC 2017-02; IA-5248; Reg BI; 2021 risk alert |
