import type { BrowserWindow } from 'electron'

import { DOUYIN_IPC_CHANNELS } from '../../../shared/platforms/douyin/contracts.js'
import { DOUYIN_RUNTIME_CONFIG } from '../../shared/platforms/client.js'
import { createPlatformModule } from '../../shared/platforms/module.js'
import { PlatformMutationCoordinator } from '../../shared/platforms/mutation-coordinator.js'
import { ElectronDouyinClient } from './electron-client.js'

export function createDouyinPlatformModule(
  getHostWindow: () => BrowserWindow | undefined,
  mutationCoordinator: PlatformMutationCoordinator = new PlatformMutationCoordinator(),
) {
  return createPlatformModule({
    channels: DOUYIN_IPC_CHANNELS,
    client: new ElectronDouyinClient(getHostWindow),
    getHostWindow,
    mutationCoordinator,
    runtime: DOUYIN_RUNTIME_CONFIG,
  })
}
