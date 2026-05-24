import type { Metadata } from 'next';
import { Geist, Source_Serif_4, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import '@blocknote/mantine/style.css';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { Toaster } from 'sonner';
import { I18nProvider } from '@/lib/i18n/provider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { StagingProvider } from '@/contexts/StagingContext';
import { StudySessionProvider } from '@/contexts/StudySessionContext';
import { NavigationHistoryProvider } from '@/contexts/NavigationHistoryContext';
import { HintQueueProvider } from '@/contexts/HintQueueContext';
import { SessionExpiredProvider } from '@/contexts/SessionExpiredContext';
import { AIStatusProvider } from '@/contexts/AIStatusContext';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const sourceSerif4 = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Synapse',
  description: 'AI-powered study platform — turn your PDFs into a study coach.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${sourceSerif4.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <AIStatusProvider>
                <SessionExpiredProvider>
                  <NavigationHistoryProvider>
                    <HintQueueProvider>
                      <StagingProvider>
                        <StudySessionProvider>
                          {children}
                          <Toaster richColors position="bottom-right" />
                        </StudySessionProvider>
                      </StagingProvider>
                    </HintQueueProvider>
                  </NavigationHistoryProvider>
                </SessionExpiredProvider>
              </AIStatusProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
