import { FREE } from '../data/constants';
import type { GeneratorConfig } from '../types';
import { LETTERS } from './bingo';
import type { GeneratedCard } from './cardgen';

/**
 * Operações de desenho em milímetros. A mesma lista alimenta o PDF (jsPDF) e a
 * prévia na tela (SVG), para a prévia nunca mostrar algo diferente do arquivo.
 */
export type PrintOp =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; lw?: number }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      /** Tamanho da fonte em pontos. */
      size: number;
      bold?: boolean;
      color: string;
      align: 'left' | 'center' | 'right';
    }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; lw: number; dash?: boolean };

export interface PrintPage {
  w: number;
  h: number;
  ops: PrintOp[];
}

export const PAPERS = {
  a4: { w: 210, h: 297, label: 'A4' },
  letter: { w: 215.9, h: 279.4, label: 'Carta' },
} as const;

/** Milímetros por ponto tipográfico. */
export const MM_PER_PT = 25.4 / 72;
const ptFromMm = (mm: number) => mm / MM_PER_PT;

const MARGIN = 10;
/** Espaço entre cartelas na mesma página, com linha tracejada para recortar. */
const CUT_GAP = 6;
/** Tamanho mínimo da célula para o número continuar legível impresso. */
export const MIN_CELL_MM = 6;

const GRAY = '#5a6680';
const LINE = '#9aa6bd';
const INK = '#142037';

export function perPageOptions(kind: GeneratorConfig['kind']): number[] {
  return kind === 'cartelas' ? [1, 2, 4] : [1, 2, 4, 6, 8, 12];
}

/** Arranjo das cartelas na página: colunas e linhas para cada quantidade por página. */
function pageGrid(perPage: number): { cols: number; rows: number } {
  const map: Record<number, { cols: number; rows: number }> = {
    1: { cols: 1, rows: 1 },
    2: { cols: 1, rows: 2 },
    4: { cols: 2, rows: 2 },
    6: { cols: 2, rows: 3 },
    8: { cols: 2, rows: 4 },
    12: { cols: 3, rows: 4 },
  };
  return map[perPage] ?? map[1];
}

/** Mistura a cor com branco (0 = cor pura, 1 = branco), para o fundo do espaço livre. */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * amount));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Corta o texto para caber na largura (estimativa de 0,55 da altura da fonte por letra). */
function fit(text: string, sizePt: number, widthMm: number): string {
  const maxChars = Math.floor(widthMm / (sizePt * MM_PER_PT * 0.55));
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

/** Diminui a fonte até o texto caber (no máximo até 70%); só corta com "..." se ainda assim não couber. */
function shrinkToFit(text: string, sizePt: number, widthMm: number): { text: string; size: number } {
  const fitsAt = widthMm / (text.length * MM_PER_PT * 0.55);
  const size = Math.max(sizePt * 0.7, Math.min(sizePt, fitsAt));
  return { text: fit(text, size, widthMm), size };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Melhor arranjo dos jogos dentro da cartela: o que deixa as células maiores. */
function bestGameGrid(n: number, area: Box, nameH: number, gap: number) {
  let best = { cols: 1, rows: n, cell: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const slotW = (area.w - (cols - 1) * gap) / cols;
    const slotH = (area.h - (rows - 1) * gap) / rows;
    // 6 linhas: o cabeçalho B I N G O e as 5 linhas de números
    const cell = Math.min(slotW / 5, (slotH - nameH) / 6);
    if (cell > best.cell) best = { cols, rows, cell };
  }
  return best;
}

interface UnitMetrics {
  header: number;
  idH: number;
  footerH: number;
  nameH: number;
  gap: number;
}

function metrics(config: GeneratorConfig, unit: Box): UnitMetrics {
  const avulso = config.kind === 'avulsos';
  const header = Math.min(avulso ? 11 : 16, Math.max(8, unit.h * (avulso ? 0.13 : 0.1)));
  return {
    header,
    idH: config.identification ? (avulso ? 6 : 8) : 0,
    footerH: config.footer.trim() ? 5 : 0,
    nameH: config.kind === 'cartelas' || config.gameNames[0]?.trim() ? Math.max(4, header * 0.42) : 0,
    gap: avulso ? 3 : 5,
  };
}

function unitBoxes(config: GeneratorConfig): Box[] {
  const paper = PAPERS[config.paper];
  const { cols, rows } = pageGrid(config.perPage);
  const w = (paper.w - 2 * MARGIN - (cols - 1) * CUT_GAP) / cols;
  const h = (paper.h - 2 * MARGIN - (rows - 1) * CUT_GAP) / rows;
  const boxes: Box[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      boxes.push({ x: MARGIN + c * (w + CUT_GAP), y: MARGIN + r * (h + CUT_GAP), w, h });
    }
  }
  return boxes;
}

/** Área dos jogos dentro de uma cartela, já descontando cabeçalho, identificação e rodapé. */
function gamesArea(config: GeneratorConfig, unit: Box, m: UnitMetrics): Box {
  const pad = 3;
  const subtitleH = config.subtitle.trim() ? 5 : 0;
  const top = unit.y + pad + m.header + 2 + subtitleH + m.idH;
  const bottom = unit.y + unit.h - pad - m.footerH;
  return { x: unit.x + pad, y: top, w: unit.w - 2 * pad, h: bottom - top };
}

/** Tamanho da célula (mm) que a configuração atual produz, para avisar quando ficar pequeno demais. */
export function cellSizeMm(config: GeneratorConfig): number {
  const unit = unitBoxes(config)[0];
  const m = metrics(config, unit);
  const n = config.kind === 'avulsos' ? 1 : config.gamesPerCard;
  return bestGameGrid(n, gamesArea(config, unit, m), m.nameH, m.gap).cell;
}

function drawGame(
  ops: PrintOp[],
  name: string,
  grid: number[],
  slot: Box,
  cell: number,
  nameH: number,
  config: GeneratorConfig,
) {
  const tableW = cell * 5;
  const x0 = slot.x + (slot.w - tableW) / 2;
  const usedH = nameH + cell * 6;
  let y = slot.y + Math.max(0, (slot.h - usedH) / 2);
  if (nameH > 0 && name) {
    // o nome pode ocupar a largura toda do espaço do jogo, não só a da tabela
    const label = shrinkToFit(name, Math.min(ptFromMm(nameH * 0.62), 13), Math.max(tableW, slot.w - 2));
    ops.push({
      t: 'text',
      x: x0 + tableW / 2,
      y: y + nameH / 2,
      text: label.text,
      size: label.size,
      bold: true,
      color: config.color,
      align: 'center',
    });
  }
  y += nameH;
  // cabeçalho B I N G O
  ops.push({ t: 'rect', x: x0, y, w: tableW, h: cell, fill: config.color });
  LETTERS.forEach((l, c) => {
    ops.push({
      t: 'text',
      x: x0 + c * cell + cell / 2,
      y: y + cell / 2,
      text: l,
      size: ptFromMm(cell * 0.55),
      bold: true,
      color: '#ffffff',
      align: 'center',
    });
  });
  y += cell;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const n = grid[r * 5 + c];
      const cx = x0 + c * cell;
      const cy = y + r * cell;
      if (n === FREE) {
        ops.push({ t: 'rect', x: cx, y: cy, w: cell, h: cell, fill: tint(config.color, 0.82) });
        ops.push({
          t: 'text',
          x: cx + cell / 2,
          y: cy + cell / 2,
          text: 'LIVRE',
          size: ptFromMm(cell * 0.24),
          bold: true,
          color: config.color,
          align: 'center',
        });
      } else {
        ops.push({
          t: 'text',
          x: cx + cell / 2,
          y: cy + cell / 2,
          text: String(n).padStart(2, '0'),
          size: ptFromMm(cell * 0.46),
          bold: true,
          color: INK,
          align: 'center',
        });
      }
    }
  }
  // grade por cima dos fundos, para as linhas ficarem nítidas
  for (let i = 0; i <= 5; i++) {
    ops.push({ t: 'line', x1: x0, y1: y + i * cell, x2: x0 + tableW, y2: y + i * cell, color: LINE, lw: 0.3 });
    ops.push({ t: 'line', x1: x0 + i * cell, y1: y, x2: x0 + i * cell, y2: y + 5 * cell, color: LINE, lw: 0.3 });
  }
  ops.push({ t: 'rect', x: x0, y: y - cell, w: tableW, h: cell * 6, stroke: config.color, lw: 0.6 });
}

function drawUnit(ops: PrintOp[], unit: Box, card: GeneratedCard, config: GeneratorConfig) {
  const m = metrics(config, unit);
  const pad = 3;
  ops.push({ t: 'rect', x: unit.x, y: unit.y, w: unit.w, h: unit.h, r: 3, stroke: config.color, lw: 0.6 });
  // faixa do título com o número da cartela
  const band = { x: unit.x + 1.5, y: unit.y + 1.5, w: unit.w - 3, h: m.header };
  ops.push({ t: 'rect', ...band, r: 2, fill: config.color });
  const titleSize = Math.min(ptFromMm(m.header * 0.45), 22);
  const numberText = `Nº ${card.number}`;
  const numberSize = Math.min(ptFromMm(m.header * 0.36), 16);
  const numberW = numberText.length * numberSize * MM_PER_PT * 0.6;
  ops.push({
    t: 'text',
    x: band.x + 3,
    y: band.y + band.h / 2,
    text: fit(config.title.trim() || 'Bingo', titleSize, band.w - numberW - 9),
    size: titleSize,
    bold: true,
    color: '#ffffff',
    align: 'left',
  });
  ops.push({
    t: 'text',
    x: band.x + band.w - 3,
    y: band.y + band.h / 2,
    text: numberText,
    size: numberSize,
    bold: true,
    color: '#ffffff',
    align: 'right',
  });

  let y = band.y + band.h + 2;
  if (config.subtitle.trim()) {
    ops.push({
      t: 'text',
      x: unit.x + pad,
      y: y + 2.5,
      text: fit(config.subtitle.trim(), 9, unit.w - 2 * pad),
      size: 9,
      color: GRAY,
      align: 'left',
    });
    y += 5;
  }
  if (config.identification) {
    const size = config.kind === 'avulsos' ? 7.5 : 9;
    const lineY = y + m.idH - 1.8;
    const half = (unit.w - 2 * pad) / 2;
    const fields =
      config.kind === 'avulsos'
        ? [['Nome', unit.w - 2 * pad]]
        : [
            ['Nome', half + 10],
            ['Telefone', half - 10],
          ];
    let x = unit.x + pad;
    for (const [label, width] of fields as [string, number][]) {
      ops.push({ t: 'text', x, y: lineY - 1.6, text: `${label}:`, size, color: GRAY, align: 'left' });
      const labelW = (label.length + 2) * size * MM_PER_PT * 0.55;
      ops.push({ t: 'line', x1: x + labelW, y1: lineY, x2: x + width - 3, y2: lineY, color: LINE, lw: 0.3 });
      x += width;
    }
  }

  const area = gamesArea(config, unit, m);
  const games = card.games;
  const { cols, cell } = bestGameGrid(games.length, area, m.nameH, m.gap);
  const rows = Math.ceil(games.length / cols);
  const slotW = (area.w - (cols - 1) * m.gap) / cols;
  const slotH = (area.h - (rows - 1) * m.gap) / rows;
  games.forEach((game, i) => {
    const slot = {
      x: area.x + (i % cols) * (slotW + m.gap),
      y: area.y + Math.floor(i / cols) * (slotH + m.gap),
      w: slotW,
      h: slotH,
    };
    drawGame(ops, game.name, game.grid, slot, cell, m.nameH, config);
  });

  if (m.footerH) {
    ops.push({
      t: 'text',
      x: unit.x + unit.w / 2,
      y: unit.y + unit.h - pad - 1.8,
      text: fit(config.footer.trim(), 8, unit.w - 2 * pad),
      size: 8,
      color: GRAY,
      align: 'center',
    });
  }
}

/** Monta todas as páginas do PDF a partir das cartelas geradas. */
export function layoutPages(config: GeneratorConfig, cards: GeneratedCard[]): PrintPage[] {
  const paper = PAPERS[config.paper];
  const boxes = unitBoxes(config);
  const pages: PrintPage[] = [];
  for (let i = 0; i < cards.length; i += boxes.length) {
    const ops: PrintOp[] = [];
    const chunk = cards.slice(i, i + boxes.length);
    chunk.forEach((card, k) => drawUnit(ops, boxes[k], card, config));
    // linhas de corte entre as cartelas da página
    if (boxes.length > 1) {
      const { cols, rows } = pageGrid(config.perPage);
      for (let c = 1; c < cols; c++) {
        const x = boxes[c].x - CUT_GAP / 2;
        ops.push({
          t: 'line',
          x1: x,
          y1: MARGIN / 2,
          x2: x,
          y2: paper.h - MARGIN / 2,
          color: LINE,
          lw: 0.2,
          dash: true,
        });
      }
      for (let r = 1; r < rows; r++) {
        const y = boxes[r * cols].y - CUT_GAP / 2;
        ops.push({
          t: 'line',
          x1: MARGIN / 2,
          y1: y,
          x2: paper.w - MARGIN / 2,
          y2: y,
          color: LINE,
          lw: 0.2,
          dash: true,
        });
      }
    }
    pages.push({ w: paper.w, h: paper.h, ops });
  }
  return pages;
}
