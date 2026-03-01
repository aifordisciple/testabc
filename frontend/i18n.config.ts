import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  
  let locale = cookieStore.get('locale')?.value as Locale || defaultLocale;
  
  const acceptLanguage = headerStore.get('accept-language');
  if (!cookieStore.get('locale') && acceptLanguage) {
    const preferredLocale = acceptLanguage.split(',')[0]?.split('-')[0];
    if (preferredLocale && locales.includes(preferredLocale as Locale)) {
      locale = preferredLocale as Locale;
    }
  }
  
  if (!locales.includes(locale)) {
    locale = defaultLocale;
  }
  
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});
