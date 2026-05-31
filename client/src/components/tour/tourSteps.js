const tourSteps = [
  {
    selector: "[data-tour='brand']",
    title: 'Welcome to Mallard',
    body: 'Mallard is a planning workspace for turning your profile, cash flow, risk tolerance, and goals into an investing plan you can actually inspect. The app combines a responsibility gate, portfolio construction, risk analysis, education, and an AI advisor so the plan stays connected to your full financial picture.',
  },
  {
    selector: "[data-tour='net-worth']",
    title: 'Your Financial Snapshot',
    body: 'The dashboard starts with total net worth, assets, liabilities, and cash flow because these numbers set the boundary conditions for every investing decision. Use this area to check whether the plan is working from the right base before you tune allocations or projections.',
    page: 'dashboard',
  },
  {
    selector: "[data-tour='retirement-score']",
    title: 'Retirement Score',
    body: 'The Retirement Score is a quick readiness signal built from the analysis Mallard received during onboarding. It blends practical inputs such as emergency-fund coverage, savings behavior, and debt burden, so treat it as a directional health check rather than a guarantee.',
    page: 'dashboard',
  },
  {
    selector: "[data-tour='savings-rate']",
    title: 'Savings Rate',
    body: 'Savings Rate is the share of income left after expenses: income minus expenses, divided by income. It matters because a higher savings rate gives the plan more contribution power, more flexibility, and a larger buffer when markets or life events do not cooperate.',
    page: 'dashboard',
  },
  {
    selector: "[data-tour='projection']",
    title: 'Projection Chart',
    body: 'The projection turns your portfolio weights, time horizon, capital, and contribution assumptions into a retirement wealth forecast. Use it to compare the plan against your target and to see how uncertainty changes the range of possible outcomes.',
    page: 'dashboard',
  },
  {
    selector: "[data-tour='greenlight-gate']",
    title: 'The Responsibility Gate',
    body: 'Greenlight begins with a readiness gate before it encourages investing. It may halt the flow when an emergency fund is short, high-APR debt should be paid first, or cash flow is not stable enough, because those issues can overwhelm market returns.',
    page: 'greenlight',
  },
  {
    selector: "[data-tour='greenlight-portfolio']",
    title: 'Your Portfolio',
    body: 'Once cleared, Mallard shows the target portfolio built from your profile, risk analysis, capital, and preferences. This section is the map: sleeve weights, ticker breakdowns, risk contribution, and backend-returned horizon data explain what each part of the allocation is supposed to do.',
    page: 'greenlight',
  },
  {
    selector: "[data-tour='greenlight-editor']",
    title: 'Allocation Editor',
    body: 'The editor is where you can tune the plan instead of accepting it blindly. The risk dial shifts the growth-versus-safe split, the grouped sleeve sliders change the mix inside growth and safe buckets, and Apply Allocation saves the updated target after previewing the risk impact.',
    page: 'greenlight',
  },
  {
    selector: "[data-tour='greenlight-rebalance']",
    title: 'Rebalance Check',
    body: 'Rebalance compares current holdings against target weights and focuses on drift rather than a calendar date. Mallard can steer new contributions when drift is modest, and it only points toward trades when a sleeve has moved far enough away from target to matter.',
    page: 'greenlight',
  },
  {
    selector: "[data-tour='ask-mallard-button'], [role='dialog'][aria-label='Ask Mallard']",
    title: 'Ask Mallard',
    body: 'The floating button opens the AI advisor from anywhere in the app. If the advisor is already open, this step anchors to the drawer instead. Ask it to explain a score, compare allocation choices, interpret a lesson, or turn a vague question like “am I taking too much risk?” into a concrete next step based on your profile.',
  },
  {
    selector: "[data-tour='learn-curriculum']",
    title: 'Learn',
    body: 'Learn is the investing curriculum: short lessons, module progress, key takeaways, and source links. Use it when you want the reasoning behind Mallard decisions, then ask Mallard about a lesson to connect the concept back to your own plan.',
    page: 'learn',
  },
  {
    selector: "[data-tour='profile-preferences']",
    title: 'Editable Preferences',
    body: 'Profile is where your financial data, goals, universe preference, ESG exclusions, sector tilts, and risk inputs stay editable after onboarding. Saving changes reweights the portfolio, so this is the place to update the plan when your values, goals, horizon, or constraints change.',
    page: 'profile',
  },
  {
    selector: "[data-tour='accounts-holdings']",
    title: 'Accounts & Holdings',
    body: 'Accounts & Holdings now lives inside Profile and shows the profile-backed balances Mallard is using. Review income, assets, liabilities, APRs, and the account-link demo here before relying on the downstream dashboard, gate, or portfolio outputs.',
    page: 'profile',
  },
  {
    selector: "[data-tour='risk-overview']",
    title: 'Risk Analysis',
    body: 'Risk summarizes the model’s view of your capacity, tolerance, gamma band, target volatility, and estimated one-year loss. Use this tab to understand why the portfolio is aggressive or conservative, and whether the binding constraint is emotional tolerance or financial capacity.',
    page: 'risk',
  },
  {
    selector: "[data-tour='settings-appearance']",
    title: 'Appearance',
    body: 'Settings includes the light and dark appearance controls. The theme switch affects the whole workspace, so choose the mode that makes charts, panels, and long planning sessions easiest to read.',
    page: 'settings',
  },
  {
    selector: "[data-tour='settings-session']",
    title: 'Session Controls',
    body: 'The session section holds account-level actions, including sign out. Use Sign Out when you are done with the current session, especially on a shared machine.',
    page: 'settings',
  },
  {
    selector: "[data-tour='tour-replay']",
    title: 'Replay the Tutorial',
    body: 'You can replay this walkthrough from Settings at any time. A good starting workflow is Dashboard for your baseline, Greenlight for portfolio decisions, Profile for updates, then Ask Mallard whenever a number or tradeoff needs explanation.',
    page: 'settings',
  },
]

export default tourSteps
