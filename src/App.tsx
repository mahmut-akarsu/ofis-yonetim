import { useEffect } from 'react'
import { initializeCommandSystem } from './lib/commands'
import { initializeLanguage } from './i18n/language-init'
import { logger } from './lib/logger'
import './App.css'
import { MainWindow } from './components/layout/MainWindow'
import { ThemeProvider } from './components/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { isDesktopApp } from './lib/pc-api'

function App() {
  useEffect(() => {
    logger.info('Ofis Yonetim baslatiliyor')
    initializeCommandSystem()

    initializeLanguage(null).catch(error => {
      logger.warn('Dil baslatilamadi', { error })
    })
  }, [])

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <MainWindow hideTitleBar={isDesktopApp()} />
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
