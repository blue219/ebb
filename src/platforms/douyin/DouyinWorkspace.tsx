import PlatformWorkspace, { type PlatformWorkspaceProps } from '@/shared/platforms/PlatformWorkspace'

export default function DouyinWorkspace(props: PlatformWorkspaceProps) {
  return <PlatformWorkspace {...props} platform={props.platform ?? 'douyin'} />
}
