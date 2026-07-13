import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Documentación — Steam Genie',
  description: 'Manuales de usuario de Steam Genie: administrador y técnico/limpiador.',
};

const MANUALS = [
  {
    id: 'admin',
    title: 'Manual Administrador',
    audience: 'Panel web · Admin / Encargado',
    summary:
      'Guía operativa del panel: edificios, usuarios, roles, tareas, trabajos eventuales y recurrentes, presencia, stock, gastos, comisiones y reportes. Incluye glosario, flujo típico, permisos y FAQ.',
    pdfHref: '/documentacion/manual-admin.pdf',
    mdHref: '/documentacion/manual-admin.md',
  },
  {
    id: 'tecnico',
    title: 'Manual Técnico / Limpiador',
    audience: 'App móvil · Técnico / Limpiador',
    summary:
      'Guía de la app: login, fichaje con GPS, servicios y checklist, tareas del día, insumos, perfil y trabajo sin conexión. Incluye glosario, flujo del día, permisos y FAQ.',
    pdfHref: '/documentacion/manual-tecnico.pdf',
    mdHref: '/documentacion/manual-tecnico.md',
  },
] as const;

export default function DocumentacionPage() {
  return (
    <div className="docs-page">
      <header className="docs-hero">
        <div className="docs-hero-inner">
          <Link href="/login" className="docs-brand" aria-label="Steam Genie — Ir al login">
            <Image
              src="/logoFondoAzul.png"
              alt="Steam Genie"
              width={280}
              height={84}
              className="docs-brand-logo"
              priority
            />
          </Link>
          <p className="docs-eyebrow">Documentación de usuario</p>
          <h1 className="docs-title">Manuales Steam Genie</h1>
          <p className="docs-lead">
            Descargá las guías operativas. No hace falta iniciar sesión.
          </p>
        </div>
      </header>

      <main className="docs-main">
        <ul className="docs-list">
          {MANUALS.map((manual) => (
            <li key={manual.id} className="docs-card">
              <div className="docs-card-body">
                <p className="docs-card-audience">{manual.audience}</p>
                <h2 className="docs-card-title">{manual.title}</h2>
                <p className="docs-card-summary">{manual.summary}</p>
              </div>
              <div className="docs-card-actions">
                <a className="docs-btn docs-btn--primary" href={manual.pdfHref} download>
                  Descargar PDF
                </a>
                <a className="docs-btn docs-btn--ghost" href={manual.pdfHref} target="_blank" rel="noreferrer">
                  Abrir PDF
                </a>
                <a className="docs-btn docs-btn--ghost" href={manual.mdHref} download>
                  Markdown
                </a>
              </div>
            </li>
          ))}
        </ul>

        <p className="docs-note">
          Próximamente se pueden sumar manuales de otros roles (cliente, stock, etc.).
        </p>

        <p className="docs-footer-links">
          <Link href="/login">Ir al inicio de sesión</Link>
        </p>
      </main>
    </div>
  );
}
