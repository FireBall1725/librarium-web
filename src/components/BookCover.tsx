// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { useState } from 'react'
import { useAuthenticatedImage } from '../hooks/useAuthenticatedImage'

const COVER_GRADIENTS = [
  'from-blue-500 to-blue-700',
  'from-violet-500 to-violet-700',
  'from-emerald-500 to-emerald-700',
  'from-rose-500 to-rose-700',
  'from-amber-500 to-amber-700',
  'from-cyan-500 to-cyan-700',
  'from-indigo-500 to-indigo-700',
  'from-pink-500 to-pink-700',
  'from-teal-500 to-teal-700',
  'from-orange-500 to-orange-700',
]

function gradient(title: string) {
  return COVER_GRADIENTS[title.charCodeAt(0) % COVER_GRADIENTS.length]
}

interface BookCoverProps {
  title: string
  coverUrl: string | null | undefined
  /** Tailwind class for the outer wrapper — controls size, e.g. "w-28 sm:w-36" */
  className?: string
  /** Extra classes on the inner aspect-ratio box */
  innerClassName?: string
  readStatus?: string
}

export default function BookCover({ title, coverUrl, className = 'w-28 sm:w-36', innerClassName = '', readStatus }: BookCoverProps) {
  const [imgError, setImgError] = useState(false)
  const src = useAuthenticatedImage(coverUrl)
  const showImage = !!src && !imgError

  return (
    <div className={`${className} flex-shrink-0`}>
      <div className={`relative aspect-[2/3] rounded-lg overflow-hidden shadow-lg  ${innerClassName}`}>
        {showImage ? (
          <img
            src={src}
            alt={title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient(title)} flex items-center justify-center`}>
            <span className="text-white text-4xl sm:text-5xl font-bold opacity-40 select-none">
              {title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {readStatus && readStatus !== '' && (
          <div className="absolute top-0 right-0 overflow-hidden w-8 h-8 pointer-events-none">
            <div className={`absolute -top-4 -right-4 w-8 h-8 rotate-45 ${
              readStatus === 'read' ? 'bg-green-500' :
              readStatus === 'reading' ? 'bg-blue-500' :
              'bg-amber-500'
            }`} />
            {readStatus === 'read' && (
              <svg className="absolute top-0.5 right-0.5 w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {readStatus === 'reading' && (
              <svg className="absolute top-0.5 right-0.5 w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>
              </svg>
            )}
            {readStatus === 'did_not_finish' && (
              <svg className="absolute top-0.5 right-0.5 w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Small thumbnail variant for book list rows — fixed size, no shadow. */
export function BookCoverThumb({ title, coverUrl, readStatus }: { title: string; coverUrl: string | null | undefined; readStatus?: string }) {
  const [imgError, setImgError] = useState(false)
  const [hovered, setHovered] = useState(false)
  const src = useAuthenticatedImage(coverUrl)
  const showImage = !!src && !imgError

  const isDark = document.documentElement.classList.contains('dark')
  const border = isDark ? '0 0 0 1px rgba(255,255,255,0.15)' : '0 0 0 1px rgba(0,0,0,0.2)'

  const glowStyle: React.CSSProperties = (() => {
    const intensity = hovered ? '1' : '0.8'
    const spread = hovered ? '4px' : '3px'
    if (readStatus === 'read')           return { boxShadow: `${border}, 0 0 12px ${spread} rgba(34,197,94,${intensity})`,    transition: 'box-shadow 0.2s ease' }
    if (readStatus === 'reading')        return { boxShadow: `${border}, 0 0 12px ${spread} rgba(59,130,246,${intensity})`,   transition: 'box-shadow 0.2s ease' }
    if (readStatus === 'did_not_finish') return { boxShadow: `${border}, 0 0 12px ${spread} rgba(245,158,11,${intensity})`,   transition: 'box-shadow 0.2s ease' }
    if (hovered)                         return { boxShadow: `${border}, ${isDark ? '0 0 12px 3px rgba(255,255,255,0.28)' : '0 0 12px 3px rgba(0,0,0,0.28)'}`, transition: 'box-shadow 0.2s ease' }
    return { boxShadow: border,                                                                                                 transition: 'box-shadow 0.2s ease' }
  })()

  return (
    <div
      className="w-7 flex-shrink-0 rounded"
      style={glowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative aspect-[2/3] rounded overflow-hidden ">
        {showImage ? (
          <img
            src={src}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient(title)} flex items-center justify-center`}>
            <span className="text-white text-xs font-bold opacity-60 select-none">
              {title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {readStatus && readStatus !== '' && (
          <div className="absolute top-0 right-0 overflow-hidden w-7 h-7 pointer-events-none">
            <div className={`absolute -top-3.5 -right-3.5 w-7 h-7 rotate-45 ${
              readStatus === 'read' ? 'bg-green-500' :
              readStatus === 'reading' ? 'bg-blue-500' :
              'bg-amber-500'
            }`} />
            {readStatus === 'read' && (
              <svg className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {readStatus === 'reading' && (
              <svg className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>
              </svg>
            )}
            {readStatus === 'did_not_finish' && (
              <svg className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
