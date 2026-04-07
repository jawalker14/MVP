interface Props {
  height?: string
  width?: string
  className?: string
}

export default function LoadingSkeleton({
  height = 'h-4',
  width = 'w-full',
  className = '',
}: Props) {
  return (
    <div className={`bg-surface-raised rounded animate-pulse ${height} ${width} ${className}`} />
  )
}
