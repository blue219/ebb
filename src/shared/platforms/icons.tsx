export type IconName = 'check' | 'chevron' | 'globe' | 'heart' | 'loader' | 'logout' | 'pause' | 'play' | 'refresh' | 'shield' | 'stop' | 'users' | 'warning' | 'x'

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const props = { className: `inline-block shrink-0 ${className}`, fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'check') return <svg {...props}><path d="m5 12 4 4L19 6" /></svg>
  if (name === 'chevron') return <svg {...props}><path d="m8 10 4 4 4-4" /></svg>
  if (name === 'globe') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.2 2.2 3.2 5 3.2 8S14.2 17.8 12 20c-2.2-2.2-3.2-5-3.2-8S9.8 6.2 12 4" /></svg>
  if (name === 'heart') return <svg {...props}><path d="M20.8 8.6c0 5.2-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9ZM4 4l16 16" /></svg>
  if (name === 'loader') return <svg {...props}><path d="M20 12a8 8 0 1 1-2.3-5.7" /></svg>
  if (name === 'logout') return <svg {...props}><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9" /></svg>
  if (name === 'pause') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M10 9v6M14 9v6" /></svg>
  if (name === 'play') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="m10 9 5 3-5 3Z" /></svg>
  if (name === 'refresh') return <svg {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M18.1 9A7 7 0 0 0 6.7 6.7L4 9M5.9 15A7 7 0 0 0 17.3 17.3L20 15" /></svg>
  if (name === 'shield') return <svg {...props}><path d="M12 3 19 6v5c0 4.6-3 7.8-7 10-4-2.2-7-5.4-7-10V6l7-3Z" /><path d="m8.7 12 2.1 2.1 4.5-4.4" /></svg>
  if (name === 'stop') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M9 9h6v6H9z" /></svg>
  if (name === 'users') return <svg {...props}><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20" /><circle cx="10" cy="7" r="3" /><path d="M18 9v6M15 12h6" /></svg>
  if (name === 'warning') return <svg {...props}><path d="m12 4 8 15H4L12 4Z" /><path d="M12 9v4M12 16h.01" /></svg>
  return <svg {...props}><path d="m7 7 10 10M17 7 7 17" /></svg>
}
