import React from 'react'

interface Props {
  icon: React.ElementType
  title: string
  description: string
  cta?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon: Icon, title, description, cta }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-raised flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-text-muted" />
      </div>
      <h3 className="text-text-primary font-bold text-lg mb-2">{title}</h3>
      <p className="text-text-secondary text-sm mb-6">{description}</p>
      {cta && (
        <button
          onClick={cta.onClick}
          className="h-12 px-6 bg-accent text-primary font-bold rounded-xl active:bg-accent-hover"
        >
          {cta.label}
        </button>
      )}
    </div>
  )
}
