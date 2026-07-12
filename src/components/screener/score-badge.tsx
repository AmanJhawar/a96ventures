import { cn } from '@/lib/utils'

export function ScoreBadge({ score, max, className }: { score: number, max: number, className?: string }) {
  const ratio = score / max
  const variant = ratio >= 0.8 ? 'pass' : ratio >= 0.5 ? 'warn' : 'fail'

  return (
    <span className={cn(
      "inline-flex items-center justify-center px-2 py-1 rounded text-xs font-bold tabular-nums tracking-widest",
      {
        'badge-pass': variant === 'pass',
        'badge-warn': variant === 'warn',
        'badge-fail': variant === 'fail',
      },
      className
    )}>
      {score}/{max}
    </span>
  )
}
