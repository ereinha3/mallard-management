# Greenlight — Research Foundations

**Status:** Design (pre-implementation) · **Date:** 2026-05-30

Every design decision in Greenlight is grounded in peer-reviewed research or established professional/regulatory standards. This document is organized by **decision area**. For each area it states (a) **the decision we made**, (b) **the research backing it**, and (c) **how it integrates** into the system. This is the material we cite to judges.

A confidence flag accompanies each area: **HIGH** = multiple peer-reviewed sources; **MEDIUM** = single paper or contested; **PRACTICE** = professional/regulatory consensus rather than a single peer-reviewed result.

> **Note on the tax section (§8):** the wash-sale and tax-loss-harvesting rules are well-established U.S. tax law, but tax law changes — validate against current IRS guidance (Publication 550) before any non-demo use.

---

## 1. Conversational elicitation: LLM as interface, deterministic engine as brain

**Decision.** The LLM conducts the intake conversation and explains results, but emits only a validated, typed profile and never computes a number or an allocation. A deterministic, versioned engine produces every figure.

**Research.**
- **Takayanagi, Izumi, Sanz-Cruzado, McCreadie & Ounis (2025). "Are Generative AI Agents Effective Personalized Financial Advisors?" *SIGIR 2025.* [arXiv:2504.05862](https://arxiv.org/abs/2504.05862).** User study (n=64): LLM advisors *match human advisors at eliciting preferences* through conversation, but **struggle to resolve conflicting needs** and, when elicitation fails, "can direct the investor toward unsuitable assets." Users reported higher trust in an **extroverted persona that gave worse advice** — direct evidence of sycophancy risk.
- **Takayanagi et al. (2025). "FinPersona: An LLM-Driven Conversational Agent for Personalized Financial Advising." *ECIR 2025* (demo). [Springer](https://link.springer.com/chapter/10.1007/978-3-031-88720-8_3).** The exact modular pattern we use: a preference-elicitation stage builds a **structured user profile** that feeds a separate downstream assessment module. Published support for "elicit → structured profile → deterministic engine."
- **Cheng, Yu, Lee, Khadpe, Ibrahim & Jurafsky (2025). "ELEPHANT: Measuring Social Sycophancy in LLMs." [arXiv:2505.13995](https://arxiv.org/pdf/2505.13995).** Sycophancy (agreement/flattery regardless of accuracy) is measurable across frontier models and **increases when the user states a preference** — dangerous for advice.
- **Kang & Liu (2023). "Deficiency of Large Language Models in Finance: An Empirical Examination of Hallucination." [arXiv:2311.15548](https://arxiv.org/pdf/2311.15548).** LLMs make **reproducible arithmetic errors** in financial calculations — the single strongest reason the LLM must never compute the numbers.
- **Regulated-domain engineering pattern.** Industry consensus (AWS ML Blog on LLM hallucinations in regulated industries; policy-engine / LLM-generated-rules-engine literature): use generative models *non-generatively* — constrained extraction into typed schemas, deterministic code makes decisions, for auditability and explainability. *(PRACTICE.)*

**Integration.** The hard LLM↔engine boundary (E2E design §2); constrained schema output and the Profile Validation Gate (§3.1–3.2); anti-sycophancy system prompt on the Explanation Agent (§3.12). The contradiction-detection follow-up doubles as our answer to the SEC's questionnaire critique (§9).

**Confidence: HIGH** (architecture is the recognized correct pattern; sycophancy/hallucination risks are documented).

---

## 2. Measuring risk tolerance (willingness)

**Decision.** Backbone is a validated psychometric instrument delivered conversationally, supplemented by scenario questions and a loss-aversion probe, scored to an implied CRRA risk-aversion coefficient **γ** with an explicit confidence band — never a bare point estimate.

**Research.**
- **Grable, J. & Lytton, R. H. (1999). "Financial risk tolerance revisited: the development of a risk assessment instrument." *Financial Services Review*, 8(3), 163–181.** The 13-item scale. Cronbach's α ≈ 0.75–0.77; scores 13–47; **correlates r ≈ 0.60 with actual risky-asset ownership.** Re-validated by **Kuzniak et al. (2015), *Financial Services Review* 24(2), 177–192** ("15-year retrospective").
- **Kahneman & Tversky (1979). "Prospect Theory." *Econometrica* 47(2), 263–291**; **Tversky & Kahneman (1992). "Advances in Prospect Theory." *J. Risk & Uncertainty* 5(4), 297–323.** Value function concave for gains, convex for losses, steeper for losses; original loss-aversion λ = 2.25.
- **Brown, Imai, Vieider & Camerer (2024). "Meta-analysis of Empirical Estimates of Loss Aversion." *J. Economic Literature* 62(2), 485–516.** Pooled 607 estimates → **λ ≈ 1.96, 95% CI [1.82, 2.10].** → **Use λ ≈ 2.0, not 2.25, in production.**
- **Kwak & Grable (2024). "A Comparison of Financial Risk-Tolerance Assessment Methods…" *Risks* 12(11), 170.** Multi-item **psychometric scales predict future risk-taking and portfolio choices most accurately**; one-off scenario/lottery tasks capture a transient state that drifts with markets.
- **Kimball, Sahm & Shapiro (2008). "Imputing Risk Tolerance from Survey Responses." *JASA* 103(483), 1028–1038.** The income-gamble **bracketing** method maps responses to CRRA γ (= 1/relative-risk-tolerance). Population mean γ ≈ 8.2; **most variance in a single elicitation is noise** (true-preference SD falls 1.76 → 0.73 once measurement error is modeled) → elicit redundantly and report a band.
- **Cautions — Espinosa & Ezquerra (2022), *PLoS ONE* 17(9):e0267696** (framing significantly shifts elicited risk aversion); **Grable (2017), *Financial Risk Tolerance: A Psychometric Review*, CFA Institute Research Foundation** (single/two/three-item measures are inadequate; report standard error of measurement).

**Integration.** Risk Profiler tolerance axis (E2E §3.3): score the instrument → γ + γ_band via Kimball-Sahm-Shapiro logic; loss-aversion probe flags panic-sell risk; neutral phrasing and controlled question order in the Elicitation Agent mitigate framing/order effects; scenario answers corroborate but never solely determine the score.

**Confidence: HIGH** on the instruments and γ mapping; **MEDIUM** on any specific score→γ table (must be calibrated and disclosed, not asserted).

---

## 3. Measuring risk capacity (ability) + glide path

**Decision.** A separate objective capacity score from horizon, **human-capital beta**, emergency-fund months, savings rate, and debt burden; combined with tolerance via **`min()`**; translated to an age-appropriate equity glide path (U-shaped near retirement).

**Research.**
- **Bodie, Merton & Samuelson (1992). "Labor Supply Flexibility and Portfolio Choice in a Life-Cycle Model." *J. Economic Dynamics and Control* 16(3–4), 427–449** ([NBER w3954](https://www.nber.org/papers/w3954)). Total wealth = financial + **human capital** (PV of future labor income). Young workers' stable income is **bond-like**, so their (small) financial portfolio should tilt heavily to equities; capacity declines as human capital is consumed. Labor-supply flexibility itself increases the risk one can bear.
- **Merton (1969). "Lifetime Portfolio Selection under Uncertainty." *Rev. Econ. & Stat.* 51(3), 247–257** (and Samuelson 1969, discrete-time). The **Merton share**: optimal risky weight **w\* = (μ − r) / (γσ²)**. Wealth- and (under these assumptions) horizon-independent — the closed-form benchmark the human-capital literature refines.
- **Ibbotson, Chen, Milevsky & Zhu (2007). "Lifetime Financial Advice: Human Capital, Asset Allocation, and Insurance." CFA Institute Research Foundation** (and *Financial Analysts Journal* 62(1), 2006). Estimate the **correlation/beta of labor income with equities**: bond-like income (tenured, government, essential services) → more financial-portfolio equity capacity; stock-like income (commission, founder, cyclical sectors) → more conservative, to diversify the household balance sheet.
- **Glide-path shape — Estrada (2014). "The Glidepath Illusion: An International Perspective." *J. Portfolio Management* 40(5), 52–64.** 110 years, 19 countries: naive declining-equity glidepaths are largely an "illusion" of safety; contrarian paths often deliver better terminal wealth. **Pfau & Kitces (2014). "Reducing Retirement Risk with a Rising Equity Glide Path." *J. Financial Planning* 27(1), 38–45.** A **U-shaped** path (lowest equity *at* the retirement date, rising after) reduces both probability and magnitude of failure (the "bond tent" defends against sequence-of-returns risk).
- **"Capacity caps tolerance."** Planning-profession and regulatory consensus (Kitces; Morningstar; CIRO "Understanding Risk"): usable risk profile = the **lower** of capacity and tolerance — never recommend more risk than the client can afford. *(PRACTICE.)*

**Integration.** Risk Profiler capacity axis and the `min()` combination (E2E §3.3); the responsibility gate is the *hard floor* of capacity (§5); Glide-Path Adjuster uses age + human-capital beta and a U-shaped path near retirement (§3.7). The human-capital adjustment is what makes Greenlight more rigorous than a "120 − age" rule.

**Confidence: HIGH** for the human-capital and Merton results; **MEDIUM** on glidepath shape (contested); **PRACTICE** for capacity-caps-tolerance.

---

## 4. Debt-vs-invest decision (the gate's economic core)

**Decision.** Any debt above ~8% APR halts investing; the user is shown that paydown is a **guaranteed, tax-free return equal to the APR**, compared against the **uncertain, taxed** expected market return. Low-interest debt (<~5%) is allowed alongside investing.

**Research / reasoning.** Paying down debt yielding APR *r* is mathematically a **risk-free return of r%** with zero volatility, versus an uncertain ~7–8% real equity return. Articulated across the personal-finance literature (e.g., White Coat Investor, "Paying Off Debt Is a Guaranteed Return"; Fidelity, "Pay down debt vs. invest"). Standard thresholds: debt above ~6–8% generally prioritized before non-matched investing; above ~10% paid first. **Caveats baked into the gate:** (a) capture any employer match first, (b) hold a minimal emergency fund before aggressive payoff so a shock doesn't force *new* high-APR borrowing. *(PRACTICE — professional/institutional consensus, not a single peer-reviewed paper.)*

**Integration.** Responsibility Gate ordered checks (E2E §5); the Tax Layer folds the user's bracket into the comparison so the market side is shown **after-tax** (§3.11). Thresholds are configurable constants.

**Confidence: PRACTICE** (mathematically rigorous; widely endorsed; not a single peer-reviewed result).

---

## 5. Portfolio optimization (risk budget → weights)

**Decision.** **Equal-Risk-Contribution (risk parity)** core on a **Ledoit-Wolf shrinkage** covariance matrix, scaled to a target volatility; **Black-Litterman** as the preferences/views layer; **mean-CVaR** as a downside-risk toggle. Naive max-Sharpe mean-variance appears only as the cautionary backtest baseline.

**Research.**
- **Markowitz (1952). "Portfolio Selection." *J. Finance* 7(1), 77–91.** Founding MVO. **Michaud (1989). "The Markowitz Optimization Enigma: Is 'Optimized' Optimal?" *Financial Analysts Journal* 45(1), 31–42** — MVO is an "estimation-error maximizer." **DeMiguel, Garlappi & Uppal (2009). "Optimal Versus Naive Diversification." *Review of Financial Studies* 22(5), 1915–1953** — across 14 models and 7 datasets, **none consistently beats 1/N out-of-sample**; you'd need ~250 years of data to estimate parameters well enough. → Do **not** ship naive MVO as the headline.
- **Maillard, Roncalli & Teiletche (2010). "The Properties of Equally Weighted Risk Contribution Portfolios." *J. Portfolio Management* 36(4), 60–70.** ERC equalizes each asset's marginal risk contribution; **needs no expected-return estimates** (only covariance) — robust by construction. Volatility provably sits between minimum-variance and 1/N.
- **Black & Litterman (1992). "Global Portfolio Optimization." *Financial Analysts Journal* 48(5), 28–43.** Start from market-implied equilibrium returns (a stable Bayesian prior), blend investor **views** (matrices P, Q, Ω; scalar τ). Absent views → market weights; views pull weights gently in proportion to confidence — ideal for honoring **ESG/asset-class preferences** without extreme tilts.
- **Rockafellar & Uryasev (2000). "Optimization of Conditional Value-at-Risk." *J. Risk* 2(3), 21–42.** CVaR (expected shortfall) is a **coherent** risk measure; minimizing it is a **linear program**; optimizes *tail* risk and handles fat tails — the natural fit for "minimize the loss you actually fear."
- **Ledoit & Wolf (2004). "Honey, I Shrunk the Sample Covariance Matrix." *J. Portfolio Management* 30(4), 110–119.** Shrinkage toward a structured target produces a well-conditioned, lower-error covariance estimate — improves *every* method above, directly attacking the estimation-error problem.
- **γ ↔ target-volatility mapping.** Solve `max_w wᵀμ − (γ/2)wᵀΣw`, or equivalently fix `wᵀΣw ≤ σ_target²`; each target-vol level maps one-to-one to a γ, so the user sets either an intuitive "target volatility" or a risk dial. (Present γ as a *risk dial*, not a literal utility claim.)

**Integration.** Optimizer / Risk Engine (E2E §3.6); risk sizing to target vol from γ; BL views from ESG/universe preferences; CVaR toggle for the downside-risk narrative.

**Confidence: HIGH.**

---

## 6. Asset classes & diversification (why gold, bonds, TIPS, REITs)

**Decision.** Investable sleeves include US equity, international equity, bonds, **TIPS**, **gold**, and **REITs** — not just stocks/bonds.

**Research.**
- **Baur & Lucey (2010). "Is Gold a Hedge or a Safe Haven? An Analysis of Stocks, Bonds and Gold." *Financial Review* 45(2), 217–229.** Defines hedge (uncorrelated on average) vs. safe haven (uncorrelated/negative *during crashes*). Gold is both for stocks, though the safe-haven effect is **short-lived (~15 trading days)**; gold is **not** a safe haven for bonds.
- **Baur & McDermott (2010). "Is Gold a Safe Haven? International Evidence." *J. Banking & Finance* 34(8), 1886–1898.** Gold is a strong safe haven for **US and European** markets (the markets we target), especially at the peak of the 2008–09 crisis — it works when most needed.
- **The 60/40 fragility.** The classic 60/40 relies on negative stock-bond correlation, which **broke in 2022** (stocks ≈ −19%, Agg bonds ≈ −13%, 60/40 ≈ −17%, worst since 1937) as inflation flipped the correlation positive. → Add **TIPS** (inflation protection), **gold**, and **REITs** as regime-robust diversifiers rather than relying on bonds alone. *(2022 figures: practitioner/market data — Morningstar, CNBC.)*

**Integration.** Universe Builder sleeves (E2E §3.5); diversification across regimes feeds the ERC/CVaR optimizer.

**Confidence: HIGH** for gold's hedge/safe-haven properties; **PRACTICE** for the 2022 60/40 figures.

---

## 7. Backtesting methodology & overfitting

**Decision.** Walk-forward out-of-sample testing, quarterly rebalance, benchmarked against 1/N, 60/40, and a target-date fund; report Sharpe + **Deflated Sharpe**, Sortino, max drawdown, Calmar; keep tried-configuration count small and state it.

**Research.**
- **Bailey, Borwein, López de Prado & Zhu (2014). "Pseudo-Mathematics and Financial Charlatanism: The Effects of Backtest Overfitting on Out-of-Sample Performance." *Notices of the AMS* 61(5), 458–471.** The more configurations tried, the more the best backtest is overfit; under autocorrelated markets, overfit backtests yield **negative** OOS returns. Reported Sharpe ratios are uninterpretable without the number of trials.
- **Bailey & López de Prado (2014). "The Deflated Sharpe Ratio." *J. Portfolio Management* 40(5).** Adjusts an observed Sharpe down for number of trials, sample length, and non-normality. Reporting it signals awareness of multiple-testing bias. (Companion: the **Probability of Backtest Overfitting**, CSCV.)
- **DeMiguel, Garlappi & Uppal (2009)** (see §5) — establishes **1/N as the honest benchmark** to beat.

**Integration.** Backtest is a first-class engine feature (E2E §9); ERC's parameter-light design minimizes overfitting surface.

**Confidence: HIGH.**

---

## 8. Taxes: debt-vs-invest after-tax math, loss harvesting, wash sales

**Decision.** Two lightweight, **advisory (read-only)** tax functions: (1) fold the user's bracket into the debt-vs-invest comparison; (2) at rebalance/year-end, flag harvestable losses and surface the wash-sale caveat. No auto-execution. TurboTax export is roadmap.

**Research / rules** *(well-established U.S. tax law — validate against current IRS guidance before non-demo use):*
- **Wash-sale rule — IRC §1091; IRS Publication 550.** A loss is **disallowed** if a substantially identical security is purchased within **30 days before or after** the sale (a 61-day window). The disallowed loss is added to the basis of the replacement security. → Greenlight surfaces the caveat ("don't rebuy within 30 days") and never auto-harvests into a wash sale.
- **Tax-loss harvesting / capital-loss treatment — IRS Publication 550, Topic 409.** Realized capital losses offset capital gains; net losses offset up to **$3,000** of ordinary income per year (**$1,500** married filing separately), with the remainder carried forward indefinitely. Long-term vs. short-term character matters for the rate applied.
- **After-tax debt-vs-invest reasoning** (see §4): debt paydown returns are **not taxed**; investment gains are. The gate's comparison therefore puts the market side on an **after-tax** basis using the user's bracket and filing status — making the guaranteed-paydown side even more favorable for high-APR debt.

**Integration.** Tax Layer (E2E §3.11); gate math (§5); cost-basis tracking in the State Store.

**Confidence: HIGH on the legal rules** (statutory/IRS), with the standing caveat that tax law changes.

---

## 9. Regulatory & fiduciary context (disclaimer posture)

**Decision.** Persistent not-advice disclaimers; transparency about how the engine works; the conversational contradiction-follow-up framed as a direct response to regulator concerns.

**Research.**
- **SEC Division of Investment Management, Guidance Update 2017-02, "Robo-Advisers" (Feb 2017)** + Investor Bulletin. Three focus areas: disclosure, suitability, compliance. The **suitability** concern is directly relevant: the SEC criticized advisers relying "primarily, if not solely, on client responses to an online questionnaire" that don't let clients add context and **don't follow up on inconsistent/contradictory answers.** Required disclosures include how the algorithm works, its assumptions/limitations/risks, degree of human oversight, and conflicts of interest — "clear and effective, not buried."
- **SEC fiduciary interpretation (IA-5248, 2019) & Regulation Best Interest.** RIAs owe a fiduciary duty (best interest at all times); broker-dealers fall under Reg BI. Background: Columbia Law Review, "Are Robots Good Fiduciaries?" The **2021 SEC exam risk alert** found deficiencies at nearly all examined robo-advisers (advice on insufficient information; inaccurate disclosures).

**Integration.** Compliance & disclaimer posture (E2E §12); the contradiction-detection follow-up (research §1, design §3.1) is our citable answer to the SEC questionnaire critique. *(PRACTICE / regulatory.)*

**Confidence: PRACTICE** (regulatory guidance, not academic research).

---

## Citation quick-reference

| Area | Key sources |
|------|-------------|
| LLM-as-interface | Takayanagi et al. SIGIR 2025; FinPersona ECIR 2025; ELEPHANT 2025; Kang & Liu 2023 |
| Risk tolerance | Grable & Lytton 1999; Kahneman & Tversky 1979/1992; Brown et al. 2024; Kwak & Grable 2024; Kimball-Sahm-Shapiro 2008; Grable 2017 |
| Risk capacity / glidepath | Bodie-Merton-Samuelson 1992; Merton 1969; Ibbotson-Chen 2006/2007; Estrada 2014; Pfau & Kitces 2014 |
| Debt-vs-invest | Personal-finance consensus (guaranteed-return argument) |
| Optimization | Markowitz 1952; Michaud 1989; DeMiguel et al. 2009; Maillard et al. 2010; Black-Litterman 1992; Rockafellar-Uryasev 2000; Ledoit-Wolf 2004 |
| Asset classes | Baur & Lucey 2010; Baur & McDermott 2010; 60/40 2022 break |
| Backtesting | Bailey et al. 2014 (overfitting); Bailey & López de Prado 2014 (Deflated Sharpe) |
| Taxes | IRC §1091; IRS Pub 550; Topic 409 |
| Regulation | SEC Robo-Adviser Guidance 2017-02; IA-5248; Reg BI; 2021 risk alert |
