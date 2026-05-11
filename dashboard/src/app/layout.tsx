import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Veritas — Research Intelligence Platform',
  description: 'AI-Powered Research Intelligence Platform for deep, accurate insights',
  keywords: ['research', 'AI', 'intelligence', 'analytics'],
  authors: [{ name: 'Veritas' }],
  openGraph: {
    title: 'Veritas',
    description: 'AI-Powered Research Intelligence Platform',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
