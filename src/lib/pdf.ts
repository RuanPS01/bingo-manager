import type { PrintPage } from './printLayout';

/**
 * Desenha as páginas com o jsPDF. Fontes padrão do PDF (Helvetica), que já
 * existem em qualquer leitor: o arquivo fica pequeno e os acentos saem certos.
 */
export async function renderPdf(
  pages: PrintPage[],
  meta: { title: string },
  options: { compress?: boolean } = {},
): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf');
  const first = pages[0];
  const doc = new jsPDF({
    unit: 'mm',
    format: [first.w, first.h],
    orientation: 'portrait',
    compress: options.compress ?? true,
  });
  doc.setProperties({ title: meta.title, creator: 'Bingo Manager' });
  pages.forEach((page, index) => {
    if (index > 0) doc.addPage([page.w, page.h], 'portrait');
    for (const op of page.ops) {
      if (op.t === 'rect') {
        if (op.fill) doc.setFillColor(op.fill);
        if (op.stroke) doc.setDrawColor(op.stroke);
        doc.setLineWidth(op.lw ?? 0.3);
        const style = op.fill && op.stroke ? 'FD' : op.fill ? 'F' : 'S';
        if (op.r) doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, style);
        else doc.rect(op.x, op.y, op.w, op.h, style);
      } else if (op.t === 'line') {
        doc.setDrawColor(op.color);
        doc.setLineWidth(op.lw);
        doc.setLineDashPattern(op.dash ? [1.5, 1.5] : [], 0);
        doc.line(op.x1, op.y1, op.x2, op.y2);
        doc.setLineDashPattern([], 0);
      } else {
        doc.setFont('helvetica', op.bold ? 'bold' : 'normal');
        doc.setFontSize(op.size);
        doc.setTextColor(op.color);
        doc.text(op.text, op.x, op.y, { align: op.align, baseline: 'middle' });
      }
    }
  });
  return doc.output('arraybuffer');
}
