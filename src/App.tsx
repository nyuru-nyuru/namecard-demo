import { lazy, Suspense } from 'react'
import LanguageToggle from './components/LanguageToggle.tsx'
import { useI18n } from './i18n/context.ts'
import { appPathname } from './urls.ts'

const GameApp = lazy(() => import('./game/GameApp'))
const EditorApp = lazy(() => import('./editor/EditorApp'))
const DemoApp = lazy(() => import('./DemoApp'))

export default function App() {
  const { t } = useI18n()
  const path = appPathname(window.location.pathname)
  return (
    <>
      <LanguageToggle />
      <Suspense fallback={<p role="status">{t('app.loading')}</p>}>
        {path === '/editor' ? <EditorApp /> : path === '/demo' ? <DemoApp /> : <GameApp />}
      </Suspense>
    </>
  )
}
