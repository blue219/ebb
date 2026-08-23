import type { BrowserWindow } from 'electron'

import { TIKTOK_IPC_CHANNELS } from '../../../shared/platforms/tiktok/contracts.js'
import { TIKTOK_RUNTIME_CONFIG } from '../../shared/platforms/client.js'
import { createPlatformModule } from '../../shared/platforms/module.js'
import { PlatformMutationCoordinator } from '../../shared/platforms/mutation-coordinator.js'
import { ElectronTikTokClient } from './electron-client.js'

export function createTikTokPlatformModule(
  getHostWindow: () => BrowserWindow | undefined,
  mutationCoordinator: PlatformMutationCoordinator = new PlatformMutationCoordinator(),
) {
  return createPlatformModule({
    channels: TIKTOK_IPC_CHANNELS,
    client: new ElectronTikTokClient(getHostWindow),
    getHostWindow,
    mutationCoordinator,
    runtime: TIKTOK_RUNTIME_CONFIG,
  })
}
