import type { Metadata } from 'next';
import { Inter, Silkscreen } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Pixel font for the wordmark, as in the Figma
const pixel = Silkscreen({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-pixel' });

export const metadata: Metadata = {
  title: 'ReachInbox Scheduler',
  description: 'Schedule and track cold emails',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${pixel.variable}`}>
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
