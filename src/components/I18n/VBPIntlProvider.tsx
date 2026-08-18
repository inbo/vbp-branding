import { useEffect, useState } from "react";
import { IntlProvider, useIntl } from "react-intl";
import { useCookies } from "react-cookie";

export const enum SUPPORTED_LOCALE {
  EN = "en",
  NL = "nl",
}
export const LANGUAGE_COOKIE_NAME = "vbp-lang";

export function useVBPLocale(): [
  SUPPORTED_LOCALE,
  (l: SUPPORTED_LOCALE) => void,
] {
  const { locale } = useIntl();
  const [, setCookie] = useCookies([LANGUAGE_COOKIE_NAME]);
  return [
    locale as SUPPORTED_LOCALE,
    (l) => setCookie(LANGUAGE_COOKIE_NAME, l, { path: "/" }),
  ];
}

interface VBPIntlProviderWrapperProps {
  defaultLocale?: SUPPORTED_LOCALE;
  initialMessages: Record<string, string>;
  messagesLoader?: (
    locale: SUPPORTED_LOCALE,
  ) => Promise<Record<string, string>>;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function VBPIntlProviderWrapper({
  defaultLocale = SUPPORTED_LOCALE.NL,
  initialMessages,
  messagesLoader,
  fallback = null,
  children,
}: VBPIntlProviderWrapperProps) {
  const [cookies, setCookie] = useCookies([LANGUAGE_COOKIE_NAME]);
  const locale = (cookies["vbp-lang"] as SUPPORTED_LOCALE) || defaultLocale;

  // ponytail: assume initialMessages is for defaultLocale (NL) — caller contract
  const [messages, setMessages] =
    useState<Record<string, string>>(initialMessages);

  useEffect(() => {
    if (locale === defaultLocale) {
      setMessages(initialMessages);
      return;
    }
    if (!messagesLoader) return;
    let cancelled = false;
    messagesLoader(locale).then((m) => {
      if (!cancelled) setMessages(m);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, messagesLoader, defaultLocale, initialMessages]);

  useEffect(() => {
    document.documentElement.lang = locale;
    setCookie(LANGUAGE_COOKIE_NAME, locale);
  }, [locale, setCookie]);

  if (!messages) return <>{fallback}</>;

  return (
    <IntlProvider locale={locale} messages={messages}>
      {children}
    </IntlProvider>
  );
}
