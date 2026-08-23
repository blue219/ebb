import PlatformWorkspace, { type PlatformWorkspaceProps } from '@/shared/platforms/PlatformWorkspace'

export type TikTokWorkspaceProps = Omit<PlatformWorkspaceProps, 'platform'>

export default function TikTokWorkspace(props: TikTokWorkspaceProps) {
  return <PlatformWorkspace {...props} platform="tiktok" />
}
