import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Hanz Mini Store',
  description: 'Hanz Mini Store inventory & POS system',
  manifest: '/manifest.json',
  applicationName: 'Hanz Mini Store',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Hanz Mini Store',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // maximumScale removed: blocking pinch-zoom is an a11y violation and
  // Android 15 / Chrome warn about it. User can still scale.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#080b12' },
    { media: '(prefers-color-scheme: dark)', color: '#080b12' },
  ],
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="application-name" content="Hanz Mini Store" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="msapplication-TileColor" content="#080b12" />
      </head>
      <body className={inter.className}>
        {children}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js')
                  .then(function (reg) {
                    // Poll for updates every 60s and on tab focus so installed
                    // PWAs pick up new deploys without a manual force-stop.
                    setInterval(function () { reg.update().catch(function () {}) }, 60000)
                    document.addEventListener('visibilitychange', function () {
                      if (document.visibilityState === 'visible') reg.update().catch(function () {})
                    })
                  })
                  .catch(function () {})
                var reloaded = false
                navigator.serviceWorker.addEventListener('message', function (event) {
                  if (event.data && event.data.type === 'SW_UPDATED' && !reloaded) {
                    reloaded = true
                    window.location.reload()
                  }
                })
              })
            }
          `}
        </Script>
      </body>
    </html>
  )
}
