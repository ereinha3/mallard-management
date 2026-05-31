const tourSteps = [
  {
    selector: "[data-tour='brand']",
    title: 'Welcome to Mallard',
    body: 'Take a quick lap through the tools that help you understand, plan, and manage your investing life.',
  },
  {
    selector: "[data-tour='nav-dashboard']",
    title: 'Dashboard',
    body: 'See your investing picture at a glance, including priorities, progress, and the next items that need attention.',
    page: 'dashboard',
  },
  {
    selector: "[data-tour='nav-greenlight']",
    title: 'Greenlight',
    body: 'Use Mallard’s stock screening workflow to evaluate ideas with structured checks before you act.',
    page: 'greenlight',
  },
  {
    selector: "[data-tour='nav-advisor']",
    title: 'Ask Mallard',
    body: 'Ask the AI investing advisor questions grounded in your profile, goals, and current planning context.',
    page: 'advisor',
  },
  {
    selector: "[data-tour='nav-learn']",
    title: 'Learn',
    body: 'Build investing confidence with lessons that explain core concepts in plain language.',
    page: 'learn',
  },
  {
    selector: "[data-tour='nav-accounts']",
    title: 'Accounts',
    body: 'Review linked brokerage accounts and keep your account picture organized in one place.',
    page: 'accounts',
  },
  {
    selector: "[data-tour='nav-portfolio']",
    title: 'Portfolio',
    body: 'Explore holdings, allocation, and performance so you can understand what you own and how it is moving.',
    page: 'portfolio',
  },
  {
    selector: "[data-tour='nav-risk']",
    title: 'Risk',
    body: 'Use risk analysis tools to spot concentration, volatility, and planning issues before they become surprises.',
    page: 'risk',
  },
  {
    selector: "[data-tour='nav-settings']",
    title: 'Settings',
    body: 'Manage preferences, profile details, and the information Mallard uses to personalize your experience.',
    page: 'settings',
  },
]

export default tourSteps
