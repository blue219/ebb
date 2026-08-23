import { useState } from 'react'

import PlatformWorkspace from '@/shared/platforms/PlatformWorkspace'
import type { PlatformId } from '../shared/platforms/contracts'

function App() {
  const [platform, setPlatform] = useState<PlatformId>('douyin')
  return <PlatformWorkspace key={platform} platform={platform} onSelectPlatform={setPlatform} />
}

export default App
