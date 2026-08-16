// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: Crumb[]
  actions?: React.ReactNode
}

export default function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex-shrink-0 bg-surface border-b border-line px-8 py-4">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-sm flex-wrap mb-1" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-content-faint ">/</span>}
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="text-content-muted hover:text-content-secondary transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-content-muted truncate max-w-xs">{crumb.label}</span>
              )}
            </Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-content ">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-content-muted ">{description}</p>
          )}
        </div>
        {actions && <div className="flex-shrink-0 flex items-center gap-2 pt-0.5">{actions}</div>}
      </div>
    </div>
  )
}
