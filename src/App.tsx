import { lazy, Suspense } from 'react'
import { appPathname } from './urls.ts'

const GameApp = lazy(() => import('./game/GameApp'))
const EditorApp = lazy(() => import('./editor/EditorApp'))
const DemoApp = lazy(() => import('./DemoApp'))

export default function App() {
  const path = appPathname(window.location.pathname)
  return (
    <Suspense fallback={<p role="status">Loading...</p>}>
      {path === '/editor' ? <EditorApp /> : path === '/demo' ? <DemoApp /> : <GameApp />}
    </Suspense>
  )
}
