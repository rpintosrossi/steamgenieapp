'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QuoteForm } from '../../../../../components/QuoteForm';
import { api } from '../../../../../lib/api-client';
import type { Quote } from '../../../../../lib/types';

export default function EditQuotePage() {
  const params = useParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .get<Quote>(`/quotes/${params.id}`)
      .then((data) => {
        if (!cancelled) setQuote(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudo cargar el presupuesto');
          setQuote(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" role="status" aria-label="Cargando" />
      </div>
    );
  }

  if (!quote) {
    return (
      <>
        <Link href="/presupuestos" className="back-link">
          ← Volver
        </Link>
        <div className="alert alert-error">{error ?? 'Presupuesto no encontrado'}</div>
      </>
    );
  }

  return <QuoteForm mode="edit" initialQuote={quote} />;
}
