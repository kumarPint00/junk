import './styles.css';
import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = {
  title: 'Plot to Ghar',
  description: 'Plot purchase to construction finance manager',
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#0b1220', width: 'device-width', initialScale: 1 };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
