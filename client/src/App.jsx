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
import PageTransition from './components/visual/PageTransition'
import TopoBackground from './components/visual/TopoBackground'
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
  const [topoPhase, setTopoPhase] = useState('enter')

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

  useEffect(() => {
    if (topoPhase !== 'exit') return undefined

    const timeout = window.setTimeout(() => {
      setTopoPhase('idle')
    }, 3500)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [topoPhase])

  const activeContent = (
    <>
      {activePage === 'dashboard' && <Dashboard onboardResult={onboardResult} />}
      {activePage === 'greenlight' && <GreenlightFlow onboardResult={onboardResult} />}
      {activePage === 'advisor' && <AdvisorChat context={onboardResult} user={user} />}
      {activePage === 'learn' && <LearnView onboardResult={onboardResult} />}
      {activePage === 'accounts' && <AccountsTab onboardResult={onboardResult} />}
      {activePage === 'portfolio' && <PortfolioView onboardResult={onboardResult} onApplied={setOnboardResult} />}
      {activePage === 'risk' && <RiskView onboardResult={onboardResult} />}
      {activePage === 'alerts' && <AlertsView onboardResult={onboardResult} />}
      {activePage === 'settings' && <SettingsView onboardResult={onboardResult} user={user} />}

      {!PAGES_WITH_CONTENT.includes(activePage) && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: 'transparent' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 64, color: 'var(--text-muted)', lineHeight: 1 }}>
            {activePage}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Coming soon</div>
        </div>
      )}
    </>
  )

  let screen

  // Stage 1: not logged in
  if (!user) {
    screen = (
      <AuthScreen
        onAuth={(u) => {
          setTopoPhase('exit')
          setUser(u)
        }}
        onDevSkip={() => {
          // Developer shortcut: bypass login + onboarding, land in the app with demo data
          setTopoPhase('exit')
          setOnboardResult(DUMMY_ONBOARD_RESULT)
          setOnboardingDone(true)
          setUser(DUMMY_USER)
        }}
      />
    )
  } else if (loadingProfile) {
    screen = (
      <div className="mallard-loading-screen" style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, color: 'var(--text-primary)', marginBottom: 8 }}>Mallard</div>
          <div style={{ fontSize: 13 }}>Retrieving your financial profile...</div>
        </div>
      </div>
    )
  } else if (!onboardingDone) {
    screen = (
      <div className="mallard-onboarding-shell" style={{ height: '100vh', width: '100vw' }}>
        <OnboardingChat
          user={user}
          onComplete={(result) => {
            setOnboardResult(result)
            setOnboardingDone(true)
          }}
        />
      </div>
    )
  } else {
    screen = (
      <TourProvider onNavigate={setActivePage}>
        <div className="mallard-app-frame" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'transparent' }}>
          <Sidebar active={activePage} onNavigate={setActivePage} user={user} onboardResult={onboardResult} />
          <main className="mallard-main-surface" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
            <PageTransition key={activePage} pageKey={activePage}>
              {activeContent}
            </PageTransition>
          </main>
        </div>
      </TourProvider>
    )
  }

  return (
    <>
      <TopoBackground phase={topoPhase} />
      {screen}
    </>
  )
}
