export const modules = [
  {
    id: 'investing-foundations',
    title: 'Investing Foundations',
    description: 'Core concepts that make long-term investing work.',
    lessons: [
      {
        id: 'compounding',
        title: 'Compounding turns time into an asset',
        readTime: '4 min',
        sections: [
          'Compounding is the process of earning returns on both your original investment and the returns that investment has already produced. Early on, progress can feel slow. Over long stretches, the reinvested gains begin doing more of the work.',
          'The important inputs are contribution amount, return, fees, taxes, and time. You control some of these directly, especially how consistently you invest and how much cost you allow into the portfolio.',
          'A useful beginner habit is to think in decades, not days. Market prices move constantly, but compounding needs uninterrupted time to become meaningful.',
        ],
        takeaway: 'The earlier money is invested, the longer each dollar has to earn returns on prior returns.',
        sources: [
          {
            label: 'SEC Investor.gov: Compound Interest Calculator',
            url: 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator',
          },
        ],
      },
      {
        id: 'index-funds-vs-stocks',
        title: 'Index funds vs. individual stocks',
        readTime: '5 min',
        sections: [
          'An individual stock gives you ownership in one company. If that company does well, the return can be strong. If it stumbles, your portfolio can feel that damage directly.',
          'An index fund owns many securities at once and attempts to track a market index, such as the S&P 500 or a total-market benchmark. You give up the chance of being exactly right about one winner in exchange for broad exposure and lower single-company risk.',
          'For most investors, a diversified core of low-cost index funds is a more reliable foundation than trying to identify the next standout stock. Individual stocks can still fit, but they should usually be a smaller satellite position around a diversified core.',
        ],
        takeaway: 'Index funds are often the cleanest way to buy broad ownership, reduce concentration risk, and keep costs low.',
        sources: [
          {
            label: 'Bogleheads: Index fund',
            url: 'https://www.bogleheads.org/wiki/Index_fund',
          },
        ],
      },
      {
        id: 'time-in-market',
        title: 'Why time in the market matters',
        readTime: '4 min',
        sections: [
          'Market timing requires two hard decisions: when to get out and when to get back in. Missing a small number of strong recovery days can materially reduce long-term returns.',
          'Staying invested does not mean ignoring risk. It means choosing an allocation you can hold through volatility, then letting the plan work without reacting to every headline.',
          'A long horizon gives you more chances to recover from downturns, absorb temporary losses, and benefit from the market growth created by businesses over time.',
        ],
        takeaway: 'A durable allocation you can actually hold is usually more valuable than a perfect forecast you cannot repeat.',
        sources: [
          {
            label: 'Bogleheads: Market timing',
            url: 'https://www.bogleheads.org/wiki/Market_timing',
          },
        ],
      },
      {
        id: 'fees-matter',
        title: 'Fees quietly drain your returns',
        readTime: '5 min',
        sections: [
          'An expense ratio is the annual cost of owning a fund, expressed as a percentage of the money invested. A 0.50% fund removes 50 cents per year for every $100 invested. A 0.05% fund removes only 5 cents. The difference looks tiny in one year, but it compounds because every dollar paid in fees is a dollar that no longer earns future returns.',
          'Over 30 years, the gap between 0.50% and 0.05% can become meaningful. On a $100,000 portfolio earning 7% before costs with no additional contributions, a 0.50% fee leaves roughly $660,000 after 30 years. A 0.05% fee leaves roughly $760,000. The investor did not take more market risk; they simply kept more of the return.',
          'Low-cost funds matter because costs are one of the few parts of investing you can control before you know future returns. Broad index funds often keep expenses low by tracking a benchmark instead of paying for frequent research, trading, and manager decisions.',
        ],
        takeaway: 'Small fee differences can become large dollar differences when they compound for decades.',
        sources: [
          {
            label: 'Vanguard: The case for low-cost index funds',
            url: 'https://investor.vanguard.com/investor-resources-education/article/case-for-index-fund-investing',
          },
        ],
      },
    ],
  },
  {
    id: 'building-a-portfolio',
    title: 'Building a Portfolio',
    description: 'How to assemble investments into a plan.',
    lessons: [
      {
        id: 'diversification',
        title: 'Diversification is risk control',
        readTime: '4 min',
        sections: [
          'Diversification means spreading money across companies, sectors, countries, and asset types so one bad outcome does not dominate your financial future.',
          'It does not eliminate losses. A diversified stock portfolio can still decline sharply during broad bear markets. What it reduces is the risk that one company, industry, or theme permanently impairs the plan.',
          'Good diversification should feel a little boring. If every holding moves the same way for the same reason, the portfolio may be concentrated even if it contains many positions.',
        ],
        takeaway: 'Diversification helps you survive being wrong about any one investment while still participating in long-term growth.',
        sources: [
          {
            label: 'Bogleheads: Diversification',
            url: 'https://www.bogleheads.org/wiki/Diversification',
          },
        ],
      },
      {
        id: 'asset-allocation',
        title: 'Asset allocation sets the experience',
        readTime: '5 min',
        sections: [
          'Asset allocation is the mix of investments you choose, especially the balance between growth assets like stocks and stabilizing assets like bonds or cash.',
          'Stocks have historically offered higher long-term growth, but with larger drawdowns. Bonds and cash usually lower volatility, but they may not grow enough by themselves for long-term goals.',
          'Your allocation should reflect your time horizon, need for the money, risk tolerance, and ability to keep investing during downturns. The best allocation is not the most aggressive one; it is the one that gives your plan enough return potential without pushing you into bad behavior.',
        ],
        takeaway: 'Allocation is the main dial for balancing growth potential against the emotional and financial cost of volatility.',
        sources: [
          {
            label: 'Bogleheads: Asset allocation',
            url: 'https://www.bogleheads.org/wiki/Asset_allocation',
          },
        ],
      },
      {
        id: 'dollar-cost-averaging',
        title: 'Dollar-cost averaging builds discipline',
        readTime: '3 min',
        sections: [
          'Dollar-cost averaging means investing a fixed amount on a regular schedule, such as every paycheck or every month. When prices are lower, the same contribution buys more shares. When prices are higher, it buys fewer.',
          'This approach does not guarantee better returns than investing a lump sum immediately, especially when markets rise. Its real strength is behavioral: it removes the pressure to find the perfect entry point.',
          'Automating contributions can turn investing from a decision into a system, which is often exactly what long-term investors need.',
        ],
        takeaway: 'A repeatable investing schedule can be more powerful than waiting for confidence that may arrive too late.',
        sources: [
          {
            label: 'Bogleheads: Dollar cost averaging',
            url: 'https://www.bogleheads.org/wiki/Dollar_cost_averaging',
          },
        ],
      },
      {
        id: 'bonds-role',
        title: 'What bonds actually do in a portfolio',
        readTime: '5 min',
        sections: [
          'Bonds are loans made to governments, agencies, or companies. In a portfolio, their job is usually not to beat stocks over long periods. Their job is to add ballast: income, diversification, and a return pattern that can behave differently from stocks.',
          'High-quality bonds often hold up better than stocks during growth scares or recessions, though they are not risk-free. Their prices can fall when interest rates rise, credit quality weakens, or inflation surprises investors. That is why the type of bond fund matters.',
          'Duration is a key bond risk measure. A longer-duration bond fund is usually more sensitive to interest-rate changes than a shorter-duration fund. If rates rise, longer-duration bonds tend to fall more. If rates fall, they tend to benefit more. Mallard treats bonds as a stabilizing sleeve, but the amount and duration should match the investor\'s time horizon and risk capacity.',
        ],
        takeaway: 'Bonds can reduce portfolio turbulence, but duration and credit risk determine how much ballast they really provide.',
        sources: [
          {
            label: 'Vanguard: Bond basics',
            url: 'https://investor.vanguard.com/investor-resources-education/bonds',
          },
        ],
      },
    ],
  },
  {
    id: 'understanding-mallard',
    title: 'Understanding Mallard',
    description: 'How Mallard turns your profile into portfolio decisions.',
    lessons: [
      {
        id: 'greenlight-gate',
        title: 'What the Greenlight gate checks',
        readTime: '4 min',
        sections: [
          'The Greenlight gate is Mallard\'s basic readiness check before it encourages investing. It looks at three practical conditions: whether you have an emergency fund, whether you are carrying high-APR debt, and whether your monthly cash flow has a surplus.',
          'An emergency fund matters because investing is built for money that can stay invested. If every unexpected bill forces a withdrawal, market volatility can turn a temporary decline into a permanent loss. Cash reserves give the portfolio room to work.',
          'High-APR debt often creates a guaranteed negative return that can overwhelm reasonable investment expectations. A monthly surplus matters because new contributions, debt payments, and emergency savings all depend on repeatable cash flow. The gate is not a judgment; it is a sequence check.',
        ],
        takeaway: 'Mallard wants investing dollars to be durable dollars: protected by cash reserves, not fighting expensive debt, and supported by positive cash flow.',
        sources: [],
      },
      {
        id: 'reading-your-portfolio',
        title: 'How to read your portfolio screen',
        readTime: '5 min',
        sections: [
          'Your portfolio screen summarizes the target mix Mallard believes fits your profile. ERC weighting means equal risk contribution: each major sleeve is sized with the goal of contributing a balanced share of total portfolio risk, instead of simply matching dollar weights.',
          'The sleeves group holdings by role. The stock sleeve is the growth engine, the bond sleeve is the stabilizer, and the cash sleeve is liquidity. The exact mix changes with your risk profile and readiness inputs.',
          'The blend_alpha value is Mallard\'s blending control. In plain terms, it shows how strongly the app is leaning from one allocation preference toward another when combining the model\'s risk view with practical constraints. The donut chart is the visual summary: each slice shows the portfolio share assigned to a sleeve or holding.',
        ],
        takeaway: 'Read the portfolio screen by role first: growth, ballast, liquidity, and how much each contributes to the overall plan.',
        sources: [],
      },
      {
        id: 'rebalance-panel',
        title: 'What rebalancing does in Mallard',
        readTime: '4 min',
        sections: [
          'Drift happens when market movement pushes your current portfolio away from its target. If stocks rise faster than bonds, the stock sleeve can become larger and riskier than intended. If stocks fall, the portfolio may become too conservative relative to the plan.',
          'Mallard separates steering from trading. A steer action can direct new money toward underweight sleeves, which may reduce taxes and transaction costs. A trade action sells overweight holdings and buys underweight ones when drift is large enough to justify a more direct correction.',
          'The app rebalances on drift rather than a fixed calendar because the problem is not the date. The problem is how far the portfolio has moved from the risk profile you chose. Drift-based rebalancing keeps the plan responsive without forcing unnecessary trades.',
        ],
        takeaway: 'Rebalancing in Mallard is a risk-control tool that acts when the portfolio has moved far enough from target to matter.',
        sources: [],
      },
      {
        id: 'risk-profile',
        title: 'How Mallard measures your risk',
        readTime: '5 min',
        sections: [
          'Mallard uses a two-axis risk system: tolerance and capacity. Tolerance is your willingness to live with volatility. Capacity is your financial ability to take risk based on horizon, savings stability, liquidity needs, and other constraints.',
          'The questionnaire is designed to separate those two ideas. Some answers describe how you might react emotionally during losses. Others describe whether your finances can withstand losses without forcing bad timing. Both matter because a portfolio can fail either emotionally or financially.',
          'Gamma is Mallard\'s plain-language risk intensity value. A higher gamma means the model is treating losses and uncertainty as more costly for your plan, which generally pulls the portfolio toward a calmer allocation. A lower gamma gives the model more room to accept volatility for long-term growth.',
        ],
        takeaway: 'Mallard\'s risk score is not just about bravery; it combines emotional comfort with financial ability to stay invested.',
        sources: [],
      },
    ],
  },
  {
    id: 'risk-taxes-discipline',
    title: 'Risk, Taxes & Discipline',
    description: 'Protect returns from avoidable mistakes.',
    lessons: [
      {
        id: 'risk-tolerance',
        title: 'Risk tolerance is tested in losses',
        readTime: '4 min',
        sections: [
          'Risk tolerance is not how comfortable you feel when markets are rising. It is how likely you are to stay with the plan when your account value is down and the news sounds alarming.',
          'There are two parts: financial capacity and emotional willingness. A person with a long horizon and stable income may have high capacity for risk, but still need a calmer portfolio if volatility causes panic selling.',
          'Before investing aggressively, define what you would do during a 20% or 30% market decline. A plan written before stress is usually better than a decision made during stress.',
        ],
        takeaway: 'The right risk level is the one you can hold through a real downturn without abandoning your strategy.',
        sources: [
          {
            label: 'Bogleheads: Risk tolerance',
            url: 'https://www.bogleheads.org/wiki/Risk_tolerance',
          },
        ],
      },
      {
        id: 'tax-advantaged-accounts',
        title: 'Use tax-advantaged accounts deliberately',
        readTime: '5 min',
        sections: [
          'Accounts like 401(k)s, IRAs, Roth IRAs, and HSAs can improve after-tax results by changing when and how investment growth is taxed. The account choice can matter nearly as much as the investment choice.',
          'A traditional 401(k) or IRA may reduce taxable income today, with taxes paid later on withdrawals. Roth accounts use after-tax dollars now, but qualified withdrawals can be tax-free. HSAs can be especially valuable when used for eligible medical expenses because they may offer tax benefits on contributions, growth, and withdrawals.',
          'A practical priority order is often: capture any employer match, build emergency reserves, pay down high-interest debt, then increase tax-advantaged and taxable investing based on your goals. Exact choices depend on income, benefits, time horizon, and liquidity needs.',
        ],
        takeaway: 'Tax-advantaged accounts can increase what you keep, but the best account mix depends on your current tax rate, future expectations, and access needs.',
        sources: [
          {
            label: 'IRS: Retirement Topics - Contributions',
            url: 'https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-contributions',
          },
        ],
      },
      {
        id: 'rebalancing',
        title: 'Rebalancing keeps the plan honest',
        readTime: '4 min',
        sections: [
          'Rebalancing means bringing your portfolio back toward its target allocation after market movement pushes it away. If stocks rise sharply, they may become a larger share of the portfolio than intended. If they fall, they may become too small.',
          'You can rebalance on a calendar schedule, such as once or twice a year, or when an asset class drifts beyond a chosen threshold. Using new contributions to buy underweight assets can reduce taxes and trading.',
          'The goal is not to predict winners. It is to maintain the risk profile you chose before market movement changed it for you.',
        ],
        takeaway: 'Rebalancing turns discipline into a repeatable process: trim what has grown too large and refill what has become underweight.',
        sources: [
          {
            label: 'Bogleheads: Rebalancing',
            url: 'https://www.bogleheads.org/wiki/Rebalancing',
          },
        ],
      },
      {
        id: 'tax-loss-harvesting',
        title: 'Tax-loss harvesting: turning losses into savings',
        readTime: '5 min',
        sections: [
          'Tax-loss harvesting means selling an investment in a taxable account after it has declined, realizing the loss, and using that loss to offset taxable gains. If losses exceed gains, investors may also be able to use a limited amount against ordinary income, with unused losses carried forward.',
          'The wash-sale rule is the key constraint. If you sell a security at a loss and buy the same or a substantially identical security within the wash-sale window, the current tax loss can be disallowed and added to the replacement investment\'s basis instead.',
          'Mallard\'s TLH panel surfaces potential opportunities by looking for taxable holdings with unrealized losses. It is meant to help you spot candidates, not replace tax judgment. A good harvest still needs a reasonable replacement holding, attention to wash-sale exposure across accounts, and awareness of your actual tax situation.',
        ],
        takeaway: 'Tax-loss harvesting can turn market declines into tax assets, but the wash-sale rule and replacement choice matter.',
        sources: [
          {
            label: 'IRS: Wash Sales',
            url: 'https://www.irs.gov/publications/p550',
          },
          {
            label: 'Investopedia: Tax-Loss Harvesting',
            url: 'https://www.investopedia.com/articles/taxes/08/tax-loss-harvesting.asp',
          },
        ],
      },
    ],
  },
  {
    id: 'common-investor-mistakes',
    title: 'Common Investor Mistakes',
    description: 'Behavioral traps that quietly damage returns.',
    lessons: [
      {
        id: 'panic-selling',
        title: 'Why panic selling is so costly',
        readTime: '5 min',
        sections: [
          'Panic selling turns a temporary decline into a locked-in loss. The damage is especially severe when selling happens after a sharp drawdown, because the investor may then miss the recovery days that often arrive close to the worst headlines.',
          'The sequence matters. A portfolio can recover from a 25% market decline if it stays invested and the market rebounds. If the investor exits near the bottom, the next problem becomes deciding when to re-enter. Waiting for comfort can mean buying back after prices have already recovered.',
          'Investor behavior studies often compare fund returns with investor returns and find a gap caused by timing decisions. The lesson is not that investors should ignore risk. It is that they should choose a risk level they can hold before stress arrives.',
        ],
        takeaway: 'A portfolio that is slightly less aggressive but holdable can beat a theoretically better portfolio abandoned at the wrong time.',
        sources: [
          {
            label: 'DALBAR: Quantitative Analysis of Investor Behavior',
            url: 'https://www.dalbar.com/QAIB/Index',
          },
          {
            label: 'Morningstar: Mind the Gap',
            url: 'https://www.morningstar.com/lp/mind-the-gap',
          },
        ],
      },
      {
        id: 'chasing-returns',
        title: 'Chasing last year\'s winners',
        readTime: '4 min',
        sections: [
          'Performance chasing means buying what recently performed best because it feels proven. The problem is that recent winners often already reflect high expectations, crowded positioning, or a favorable cycle that may not repeat.',
          'Markets tend to rotate. A sector, style, or fund can lead for a while and then cool off as valuations rise or conditions change. Reversion to the mean does not happen on a schedule, but it is a real risk when investors extrapolate one strong period too far.',
          'A disciplined portfolio can still own strong recent performers if they are part of the target allocation. The mistake is letting last year\'s scoreboard replace a plan built around diversification, costs, taxes, and risk.',
        ],
        takeaway: 'A winning streak is not the same as a durable strategy.',
        sources: [
          {
            label: 'Morningstar: Performance Chasing',
            url: 'https://www.morningstar.com/articles/799161/stop-chasing-performance',
          },
        ],
      },
      {
        id: 'over-trading',
        title: 'The hidden cost of trading too much',
        readTime: '5 min',
        sections: [
          'Trading too often creates visible and invisible costs. Commissions may be lower than they used to be, but bid-ask spreads, market impact, short-term taxes, and time spent reacting to noise can still reduce results.',
          'Frequent trading also invites behavioral drag. Every trade asks the investor to be right twice: when to enter and when to exit. More decisions create more chances for overconfidence, regret, and chasing short-term moves.',
          'Research by Brad Barber and Terrance Odean found that individual investors who traded more actively tended to earn lower net returns. The practical lesson is simple: activity is not the same as progress. A good portfolio often needs monitoring, not constant motion.',
        ],
        takeaway: 'Trading has to overcome costs, taxes, and behavior before it adds value.',
        sources: [
          {
            label: 'Barber & Odean: Trading Is Hazardous to Your Wealth (2000)',
            url: 'https://faculty.haas.berkeley.edu/odean/papers/returns/returns.pdf',
          },
        ],
      },
      {
        id: 'ignoring-fees',
        title: 'The long-term drag of high fees',
        readTime: '4 min',
        sections: [
          'Imagine two investors who each put $100,000 into similar portfolios for 30 years. One pays 1.0% per year in fund and advisory costs. The other pays 0.1%. If the market return before fees is the same, the lower-cost investor keeps a much larger ending balance.',
          'At a 7% gross return, the 1.0% fee portfolio compounds at roughly 6.0% and grows to about $574,000. The 0.1% fee portfolio compounds at roughly 6.9% and grows to about $742,000. The difference is not a one-year nuisance; it is a six-figure lifetime drag in this example.',
          'High fees can be worth paying only when they buy real value that survives after costs. For broad market exposure, that is a hard hurdle. The default question should be: what am I getting for this fee, and is there a simpler low-cost way to get the same exposure?',
        ],
        takeaway: 'Fees are paid every year, in every market, and the lost compounding belongs permanently to someone else.',
        sources: [
          {
            label: 'SEC: How Fees and Expenses Affect Your Investment Portfolio',
            url: 'https://www.sec.gov/investor/alerts/ib_fees_expenses.pdf',
          },
        ],
      },
    ],
  },
]

export const lessonCount = modules.reduce((total, module) => total + module.lessons.length, 0)
