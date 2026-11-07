import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  meta?: ReactNode
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-5 animate-fade-in-down lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p className="section-label mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.15rem] sm:leading-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dark-400 sm:text-[15px]">
            {description}
          </p>
        )}
        {meta && <div className="mt-4">{meta}</div>}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">{actions}</div>
      )}
    </div>
  )
}
