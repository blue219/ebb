import { useState } from 'react'

import PlatformWorkspace from '@/shared/platforms/PlatformWorkspace'
import type { AppPage } from '@/components/AppNavigation'
import SpaceXWorkspace from '@/spacex/SpaceXWorkspace'

function App() {
  const [page, setPage] = useState<AppPage>('douyin')
  if (page === 'spacex') return <SpaceXWorkspace onSelectPage={setPage} />
  return <PlatformWorkspace key={page} platform={page} onSelectPlatform={setPage} onOpenSpaceX={() => setPage('spacex')} />
}

export default App
