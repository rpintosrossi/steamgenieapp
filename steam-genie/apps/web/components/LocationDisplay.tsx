export interface LocationRefs {
  floor?: { name: string } | null;
  zone?: { name: string } | null;
  subzone?: { name: string } | null;
}

/** Texto plano: Planta Baja · Cocina · Baño */
export function formatLocationLabel(refs: LocationRefs): string {
  const parts = [refs.floor?.name, refs.zone?.name, refs.subzone?.name].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function LocationDisplay({ floor, zone, subzone }: LocationRefs) {
  const segments = [floor?.name, zone?.name, subzone?.name].filter(Boolean) as string[];

  if (segments.length === 0) {
    return <span className="muted">—</span>;
  }

  return (
    <div className="location-breadcrumb" title={formatLocationLabel({ floor, zone, subzone })}>
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} className="location-breadcrumb-item">
          {index > 0 ? <span className="location-breadcrumb-sep" aria-hidden>›</span> : null}
          <span
            className={
              index === segments.length - 1
                ? 'location-breadcrumb-leaf'
                : 'location-breadcrumb-segment'
            }
          >
            {segment}
          </span>
        </span>
      ))}
    </div>
  );
}
