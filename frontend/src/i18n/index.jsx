import { createContext, useContext, useState, useCallback, useMemo } from "react";

const SUPPORTED_LOCALES = ["en", "it", "de", "fr", "es", "zh"];
const DEFAULT_LOCALE = "en";

const I18nContext = createContext(null);

/**
 * Format a number according to the active locale.
 */
function formatNumber(value, locale, options = {}) {
  if (value == null || isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Format a date/time according to the active locale.
 */
function formatDateTime(value, locale, options = {}) {
  if (!value) return "—";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      ...options,
    }).format(date);
  } catch {
    return String(value);
  }
}

/**
 * Format a date-only string according to the active locale.
 */
function formatDate(value, locale, options = {}) {
  if (!value) return "—";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      ...options,
    }).format(date);
  } catch {
    return String(value);
  }
}

/**
 * Format a time-only string according to the active locale.
 */
function formatTime(value, locale, options = {}) {
  if (!value) return "—";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(locale, {
      timeStyle: "medium",
      ...options,
    }).format(date);
  } catch {
    return String(value);
  }
}

/**
 * Format bytes into human-readable strings respecting locale.
 */
function formatBytes(bytes, locale) {
  if (bytes == null || isNaN(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = Math.abs(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: unitIndex === 0 ? 0 : 1,
    maximumFractionDigits: unitIndex === 0 ? 0 : 2,
  }).format(value);
  return `${formatted} ${units[unitIndex]}`;
}

/**
 * Format percentage respecting locale.
 */
function formatPercent(value, locale, decimals = 1) {
  if (value == null || isNaN(value)) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value) + "%";
}

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    const saved = localStorage.getItem("atlas_locale");
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
    // Try browser language
    const browserLang = navigator.language?.split("-")[0];
    if (browserLang && SUPPORTED_LOCALES.includes(browserLang)) return browserLang;
    return DEFAULT_LOCALE;
  });

  const [translations, setTranslations] = useState({});
  const [loadedLocales, setLoadedLocales] = useState(new Set());

  const loadLocale = useCallback(async (loc) => {
    if (loadedLocales.has(loc)) return;
    try {
      const module = await import(`./locales/${loc}.json`);
      setTranslations((prev) => ({ ...prev, [loc]: module.default }));
      setLoadedLocales((prev) => new Set([...prev, loc]));
    } catch (err) {
      console.error(`Failed to load locale "${loc}":`, err);
    }
  }, [loadedLocales]);

  // Load English always (fallback) and current locale
  if (!loadedLocales.has("en")) loadLocale("en");
  if (!loadedLocales.has(locale)) loadLocale(locale);

  const changeLocale = useCallback((newLocale) => {
    if (SUPPORTED_LOCALES.includes(newLocale)) {
      setLocale(newLocale);
      localStorage.setItem("atlas_locale", newLocale);
      loadLocale(newLocale);
    }
  }, [loadLocale]);

  /**
   * Translate a key. Supports interpolation: t("key", { name: "Atlas" })
   * Falls back to English, then to the key itself.
   */
  const t = useCallback((key, params = {}) => {
    const localeStrings = translations[locale] || {};
    const enStrings = translations["en"] || {};
    let str = localeStrings[key] || enStrings[key] || key;

    // Interpolation: replace {{param}} with value
    if (params && typeof params === "object") {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      });
    }
    return str;
  }, [locale, translations]);

  const value = useMemo(() => ({
    locale,
    setLocale: changeLocale,
    t,
    supportedLocales: SUPPORTED_LOCALES,
    fmtNumber: (v, opts) => formatNumber(v, locale, opts),
    fmtDateTime: (v, opts) => formatDateTime(v, locale, opts),
    fmtDate: (v, opts) => formatDate(v, locale, opts),
    fmtTime: (v, opts) => formatTime(v, locale, opts),
    fmtBytes: (v) => formatBytes(v, locale),
    fmtPercent: (v, decimals) => formatPercent(v, locale, decimals),
  }), [locale, changeLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export const LOCALE_LABELS = {
  en: "English",
  it: "Italiano",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  zh: "中文",
};
