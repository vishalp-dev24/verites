import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Veritas - Research Intelligence Platform',
  description: 'AI-Powered Research Intelligence Platform for deep, accurate insights',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
