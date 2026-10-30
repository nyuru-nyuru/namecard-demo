import { lazy, Suspense } from 'react'

const GameApp = lazy(() => import('./game/GameApp'))
const EditorApp = lazy(() => import('./editor/EditorApp'))
const DemoApp = lazy(() => import('./DemoApp'))

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return (
    <Suspense fallback={<p role="status">Loading...</p>}>
      {path === '/editor' ? <EditorApp /> : path === '/demo' ? <DemoApp /> : <GameApp />}
    </Suspense>
  )
}
