/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'

const STORAGE_KEY = 'mallard-theme'
const DEFAULT_THEME = 'light'
const VALID_THEMES = new Set(['light', 'dark'])

const ThemeContext = createContext(null)

function getStoredTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME

  const storedTheme = window.localStorage.getItem(STORAGE_KEY)
  return VALID_THEMES.has(storedTheme) ? storedTheme : DEFAULT_THEME
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getStoredTheme)

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, theme)
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
