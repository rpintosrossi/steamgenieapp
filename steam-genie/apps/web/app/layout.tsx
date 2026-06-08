import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Steam Genie — Admin',
  description: 'Panel de administración Steam Genie',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
