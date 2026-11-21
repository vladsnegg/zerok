'use client'

import React, { useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { THEMES, applyTheme, getStoredTheme, type ThemeId } from '@/lib/theme'

/**
 * Appearance settings: one of several themes. Stored per browser for now;
 * `theme-init.js` reapplies it before paint on the next load.
 */
export default function AccountAppearance() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<ThemeId>(() => getStoredTheme())

  const select = (id: ThemeId) => {
    applyTheme(id)
    setTheme(id)
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Palette size={18} className="text-black/45" />
        <h2 className="text-base font-bold text-black">
          {t('account.appearance', { defaultValue: 'Appearance' })}
        </h2>
      </div>
      <p className="mt-1 text-sm text-black/45">
        {t('account.appearance_subtitle', {
          defaultValue: 'Pick the palette that feels right. The choice is saved in this browser.',
        })}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {THEMES.map((option) => {
          const selected = theme === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => select(option.id)}
              aria-pressed={selected}
              className={`group relative overflow-hidden rounded-2xl border bg-white p-3 text-start transition-colors ${
                selected ? 'border-black/70 ring-2 ring-black/10' : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              {/* Mini cabinet preview */}
              <div
                className="flex h-20 items-end gap-2 rounded-xl p-2.5"
                style={{ backgroundColor: option.preview.bg }}
              >
                <div
                  className="h-10 flex-1 rounded-lg border"
                  style={{
                    backgroundColor: option.preview.surface,
                    borderColor: option.id === 'night' ? '#262728' : '#e5e5e5',
                  }}
                />
                <div
                  className="h-6 w-6 rounded-lg"
                  style={{ backgroundColor: option.preview.accent }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-black">
                  {t(option.labelKey, { defaultValue: option.id })}
                </span>
                {selected && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-black text-white">
                    <Check size={12} />
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <p className="mt-5 text-xs text-black/35">
        {t('account.appearance_note', {
          defaultValue: 'More themes are on the way; dark mode is ready to try.',
        })}
      </p>
    </div>
  )
}
