/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'

const STORAGE_KEY = 'mallard-theme'
const DEFAULT_THEME = 'light'
const VALID_THEMES = new Set(['light', 'dark'])

const ThemeContext = createContext(null)

function readStoredTheme() {
  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY)
    return VALID_THEMES.has(storedTheme) ? storedTheme : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function applyTheme(theme) {
  try {
    document.documentElement.setAttribute('data-theme', theme)
  } catch {
    // document unavailable - non-fatal in non-browser render paths.
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const initialTheme = readStoredTheme()
    applyTheme(initialTheme)
    return initialTheme
  })

  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // localStorage unavailable (private mode / SSR) - theme still applies in memory.
    }
  }, [theme])

  function setTheme(nextTheme) {
    if (!VALID_THEMES.has(nextTheme)) return
    setThemeState(nextTheme)
  }

  function toggleTheme() {
    setThemeState((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }

  return context
}
