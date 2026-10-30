import './styles.css';
import './light-theme.css';
import type { Metadata, Viewport } from 'next';

const title = 'Plot to Ghar | Property & Construction Manager';
const description = 'Privately track plot purchase, registry, construction budgets, expenses, loans, materials, contractors, site progress and reminders in one place.';

export const metadata: Metadata = {
  metadataBase: new URL('https://plot-to-ghar.vercel.app'),
  title: { default: title, template: '%s | Plot to Ghar' },
  description,
  applicationName: 'Plot to Ghar',
  category: 'finance',
  keywords: ['plot purchase tracker', 'home construction budget', 'construction expense manager', 'material inventory', 'loan and contractor payments'],
  alternates: { canonical: '/' },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/icon.svg',
  },
  appleWebApp: { capable: true, title: 'Plot to Ghar', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false, address: false },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: '/',
    siteName: 'Plot to Ghar',
    title,
    description,
    images: [{ url: '/og-preview.png', width: 1200, height: 630, alt: 'Plot to Ghar - Property and construction management' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/og-preview.png'] },
  // This is a personal financial application, not a public indexed directory.
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  themeColor: '#07101e',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
