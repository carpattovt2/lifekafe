import type { Metadata, Viewport } from "next"
import { Press_Start_2P, VT323 } from "next/font/google"
import "./globals.css"
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister"

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
})

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt323",
  display: "swap",
})

export const metadata: Metadata = {
  title: "lifekafe",
  description: "Personal Life Dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "lifekafe",
  },
  icons: {
    apple: "/icon-192.png",
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: "#1a3d3a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pressStart.variable} ${vt323.variable}`}>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}
