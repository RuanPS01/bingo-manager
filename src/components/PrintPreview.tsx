import { MM_PER_PT, type PrintPage } from '../lib/printLayout';

/** Prévia de uma página do PDF, desenhada em SVG com as mesmas operações do arquivo. */
export function PrintPreview({ page, label }: { page: PrintPage; label: string }) {
  return (
    <svg
      className="print-preview"
      viewBox={`0 0 ${page.w} ${page.h}`}
      role="img"
      aria-label={label}
      fontFamily="Helvetica, Arial, sans-serif"
    >
      <rect x={0} y={0} width={page.w} height={page.h} fill="#ffffff" />
      {page.ops.map((op, i) => {
        if (op.t === 'rect') {
          return (
            <rect
              key={i}
              x={op.x}
              y={op.y}
              width={op.w}
              height={op.h}
              rx={op.r ?? 0}
              fill={op.fill ?? 'none'}
              stroke={op.stroke ?? 'none'}
              strokeWidth={op.lw ?? 0.3}
            />
          );
        }
        if (op.t === 'line') {
          return (
            <line
              key={i}
              x1={op.x1}
              y1={op.y1}
              x2={op.x2}
              y2={op.y2}
              stroke={op.color}
              strokeWidth={op.lw}
              strokeDasharray={op.dash ? '1.5 1.5' : undefined}
            />
          );
        }
        return (
          <text
            key={i}
            x={op.x}
            y={op.y}
            fontSize={op.size * MM_PER_PT}
            fontWeight={op.bold ? 700 : 400}
            fill={op.color}
            textAnchor={op.align === 'left' ? 'start' : op.align === 'right' ? 'end' : 'middle'}
            dominantBaseline="central"
          >
            {op.text}
          </text>
        );
      })}
    </svg>
  );
}
