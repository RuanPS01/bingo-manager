import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/**
 * QR code em SVG. As cores vêm de tokens que não mudam no tema escuro: leitores
 * de QR code esperam módulos escuros sobre fundo claro.
 */
export function QrCode({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const { d, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const margin = 3;
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
      }
    }
    return { d: path, size: count + margin * 2 };
  }, [text]);

  return (
    <svg
      className={`qr-code ${className}`}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      data-qr-text={text}
    >
      <rect className="qr-code-bg" width={size} height={size} />
      <path className="qr-code-fg" d={d} />
    </svg>
  );
}
