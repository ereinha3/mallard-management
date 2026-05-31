import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import GreenlightFlow from './components/greenlight/GreenlightFlow'
import AuthScreen from './components/AuthScreen'
import OnboardingChat from './components/OnboardingChat'
import AdvisorChat from './components/AdvisorChat'
import AccountsTab from './components/AccountsTab'
import PortfolioView from './components/greenlight/PortfolioView'
import RiskView from './components/RiskView'
import AlertsView from './components/AlertsView'
import SettingsView from './components/SettingsView'
import LearnView from './components/learn/LearnView'
import { TourProvider } from './components/tour/TourProvider'
import { DUMMY_USER, DUMMY_ONBOARD_RESULT } from './data/dummyProfile'
import { getProfile } from './api/greenlightClient'

const PAGES_WITH_CONTENT = ['dashboard', 'greenlight', 'advisor', 'learn', 'accounts', 'portfolio', 'risk', 'alerts', 'settings']

export default function App() {
  const [user, setUser] = useState(null)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [onboardResult, setOnboardResult] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [loadingProfile, setLoadingProfile] = useState(false)

  // When user logs in, try to fetch their existing profile
  useEffect(() => {
    if (user && !onboardResult) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingProfile(true)
      getProfile(user.email).then(profile => {
        if (profile && profile.status !== 'no_profile') {
          setOnboardResult(profile)
          setOnboardingDone(true)
        }
      }).finally(() => {
        setLoadingProfile(false)
      })
    }
  }, [user, onboardResult])

  // Stage 1: not logged in
  if (!user) {
    return (
      <AuthScreen
        onAuth={(u) => {
          setUser(u)
        }}
        onDevSkip={() => {
          // Developer shortcut: bypass login + onboarding, land in the app with demo data
          setOnboardResult(DUMMY_ONBOARD_RESULT)
          setOnboardingDone(true)
          setUser(DUMMY_USER)
        }}
      />
    )
  }

  // Loading state while checking for profile
  if (loadingProfile) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, color: 'var(--text-primary)', marginBottom: 8 }}>Mallard</div>
          <div style={{ fontSize: 13 }}>Retrieving your financial profile...</div>
        </div>
      </div>
    )
  }

  // Stage 2: new user goes through Mallard AI onboarding
  if (!onboardingDone) {
    return (
      <OnboardingChat
        user={user}
        onComplete={(result) => {
          setOnboardResult(result)
          setOnboardingDone(true)
        }}
      />
    )
  }

  // Stage 3: full app
  return (
    <TourProvider onNavigate={setActivePage}>
      <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)' }}>
        <Sidebar active={activePage} onNavigate={setActivePage} user={user} onboardResult={onboardResult} />
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activePage === 'dashboard' && <Dashboard onboardResult={onboardResult} />}
          {activePage === 'greenlight' && <GreenlightFlow onboardResult={onboardResult} />}
          {activePage === 'advisor' && <AdvisorChat context={onboardResult} user={user} />}
          {activePage === 'learn' && <LearnView onboardResult={onboardResult} />}
          {activePage === 'accounts' && <AccountsTab onboardResult={onboardResult} />}
          {activePage === 'portfolio' && <PortfolioView onboardResult={onboardResult} />}
          {activePage === 'risk' && <RiskView onboardResult={onboardResult} />}
          {activePage === 'alerts' && <AlertsView onboardResult={onboardResult} />}
          {activePage === 'settings' && <SettingsView onboardResult={onboardResult} user={user} />}

          {!PAGES_WITH_CONTENT.includes(activePage) && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 64, color: 'var(--text-muted)', lineHeight: 1 }}>
                {activePage}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Coming soon</div>
            </div>
          )}
        </main>
      </div>
    </TourProvider>
  )
}
