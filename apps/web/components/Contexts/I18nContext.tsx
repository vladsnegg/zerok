'use client'

import React, { useEffect, useState } from 'react'
import i18n, { changeLanguage, detectLanguage } from '../../lib/i18n'
import { applyDocumentDirection } from '../../lib/direction'

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [, setLang] = useState(i18n.language)

  // Detection runs after hydration on purpose: the server cannot know the
  // visitor's browser locale, so both sides start from the bundled English
  // bundle and the visitor's language is applied here. This is what keeps the
  // SSR markup and the first client render identical.
  //
  // This is also where <html lang/dir> is kept in sync. public/dir-init.js sets
  // it before first paint; the mount-time call below reconciles the two in case
  // that script was blocked, or a parent (OrgLanguageSync) already switched.
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      applyDocumentDirection(lng)
      setLang(lng)
    }
    i18n.on('languageChanged', handleLanguageChanged)

    // Let an organization's default language win when it already switched
    // during this effect pass (OrgLanguageSync runs before this provider's
    // effect because it is a child). Otherwise fall back to the visitor's
    // stored pick, cookie, ?lng= or browser language.
    if (i18n.language.split('-')[0] === 'en') {
      const detected = detectLanguage()
      if (detected.split('-')[0] !== 'en') {
        changeLanguage(detected)
      }
    }

    applyDocumentDirection(i18n.language)

    return () => {
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [])

  return <>{children}</>
}
