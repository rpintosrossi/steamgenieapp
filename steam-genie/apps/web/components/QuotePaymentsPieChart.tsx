'use client';

import type { QuotePaymentsDashboardMethodStat } from '../lib/types';

const SLICE_COLORS = [
  '#2f6fed',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#db2777',
  '#4f46e5',
  '#65a30d',
  '#ea580c',
  '#0f766e',
  '#9333ea',
];

const UNASSIGNED_COLOR = '#94a3b8';

function colorForMethod(item: QuotePaymentsDashboardMethodStat, index: number) {
  if (!item.paymentMethodId) return UNASSIGNED_COLOR;
  return SLICE_COLORS[index % SLICE_COLORS.length];
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  startAngle: number,
  endAngle: number,
) {
  const large = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polar(cx, cy, outer, startAngle);
  const outerEnd = polar(cx, cy, outer, endAngle);
  const innerStart = polar(cx, cy, inner, endAngle);
  const innerEnd = polar(cx, cy, inner, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function money(value: number) {
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

export function QuotePaymentsPieChart({
  items,
  selectedId,
  onSelect,
}: {
  items: QuotePaymentsDashboardMethodStat[];
  selectedId: string | 'all' | 'unassigned';
  onSelect: (id: string | 'all' | 'unassigned') => void;
}) {
  const total = items.reduce((acc, item) => acc + item.amount, 0);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outer = 96;
  const inner = 56;

  let angle = 0;
  const slices = items
    .filter((item) => item.amount > 0)
    .map((item, index) => {
      const sweep = total > 0 ? (item.amount / total) * 360 : 0;
      const start = angle;
      const end = angle + Math.max(sweep, total > 0 && item.amount > 0 ? 0.4 : 0);
      angle = end;
      const key = item.paymentMethodId ?? 'unassigned';
      return {
        ...item,
        key,
        color: colorForMethod(item, index),
        start,
        end: Math.min(end, 360),
      };
    });

  return (
    <div className="payments-dash-pie">
      <div className="payments-dash-pie-visual">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Deuda pendiente por medio de pago"
        >
          {slices.length === 0 ? (
            <>
              <circle cx={cx} cy={cy} r={outer} fill="#e2e8f0" />
              <circle cx={cx} cy={cy} r={inner} fill="#ffffff" />
            </>
          ) : slices.length === 1 ? (
            <>
              <circle
                cx={cx}
                cy={cy}
                r={outer}
                fill={slices[0].color}
                className={`payments-dash-pie-slice${selectedId === slices[0].key ? ' is-selected' : ''}`}
                onClick={() =>
                  onSelect(
                    selectedId === slices[0].key
                      ? 'all'
                      : (slices[0].key as typeof selectedId),
                  )
                }
              />
              <circle cx={cx} cy={cy} r={inner} fill="#ffffff" />
              <title>
                {slices[0].name}: {money(slices[0].amount)}
              </title>
            </>
          ) : (
            slices.map((slice) => (
              <path
                key={slice.key}
                d={donutSlicePath(cx, cy, inner, outer, slice.start, slice.end)}
                fill={slice.color}
                className={`payments-dash-pie-slice${selectedId === slice.key ? ' is-selected' : ''}`}
                onClick={() =>
                  onSelect(selectedId === slice.key ? 'all' : (slice.key as typeof selectedId))
                }
              >
                <title>
                  {slice.name}: {money(slice.amount)}
                </title>
              </path>
            ))
          )}
        </svg>
        <div className="payments-dash-pie-center">
          <span className="payments-dash-pie-center-value">{money(total)}</span>
          <span className="payments-dash-pie-center-label">Pendiente</span>
        </div>
      </div>
      <ul className="payments-dash-pie-legend">
        {slices.map((slice) => {
          const active = selectedId === slice.key;
          return (
            <li key={slice.key}>
              <button
                type="button"
                className={`payments-dash-legend-btn${active ? ' is-active' : ''}`}
                onClick={() => onSelect(active ? 'all' : (slice.key as typeof selectedId))}
              >
                <span
                  className="payments-dash-legend-dot"
                  style={{ background: slice.color }}
                />
                <span className="payments-dash-legend-name">{slice.name}</span>
                <span className="payments-dash-legend-meta">
                  {money(slice.amount)} · {slice.percent}% · {slice.quoteCount}{' '}
                  {slice.quoteCount === 1 ? 'pto.' : 'ptos.'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
