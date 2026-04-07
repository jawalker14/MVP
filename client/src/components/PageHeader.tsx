import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

interface Props {
  title: string
  showBack?: boolean
  onBack?: () => void
  rightAction?: React.ReactNode
}

export default function PageHeader({ title, showBack = false, onBack, rightAction }: Props) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-3 px-4 py-4">
      {showBack && (
        <button
          onClick={() => (onBack ? onBack() : navigate(-1))}
          className="w-12 h-12 flex items-center justify-center rounded-xl bg-surface-raised text-text-secondary active:scale-95 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <h1 className="flex-1 text-text-primary font-bold text-xl">{title}</h1>
      {rightAction}
    </div>
  )
}
