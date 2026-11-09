import { FREE } from '../data/constants';
import { LETTERS, pad2 } from '../lib/bingo';
import { IconStar } from './Icons';

interface BingoGridProps {
  grid: number[];
  marked?: Set<number>;
  lastBall?: number | null;
  /** Índices das células que formam um padrão vencedor. */
  winCells?: Set<number>;
  /** Números que completariam algum modo se forem sorteados. */
  targets?: Set<number>;
  size?: 'xs' | 'sm' | 'md';
  label?: string;
}

export function BingoGrid({ grid, marked, lastBall, winCells, targets, size = 'md', label }: BingoGridProps) {
  return (
    <div className={`bingo-grid bingo-grid-${size}`} role="table" aria-label={label ?? 'Cartela'}>
      <div className="bingo-row bingo-head" role="row">
        {LETTERS.map((l) => (
          <div key={l} className="bingo-letter" role="columnheader">
            {l}
          </div>
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((r) => (
        <div className="bingo-row" role="row" key={r}>
          {[0, 1, 2, 3, 4].map((c) => {
            const cell = r * 5 + c;
            const n = grid[cell];
            if (n === FREE) {
              return (
                <div key={cell} role="cell" className={`bingo-cell is-free ${winCells?.has(cell) ? 'is-win' : ''}`}>
                  <IconStar size={size === 'xs' ? 9 : size === 'sm' ? 11 : 18} />
                  <span className="sr-only">Livre</span>
                </div>
              );
            }
            const isMarked = marked?.has(n) ?? false;
            const classes = ['bingo-cell'];
            if (isMarked) classes.push('is-marked');
            if (isMarked && winCells?.has(cell)) classes.push('is-win');
            if (isMarked && lastBall === n) classes.push('is-last');
            if (!isMarked && targets?.has(n)) classes.push('is-target');
            return (
              <div
                key={cell}
                role="cell"
                className={classes.join(' ')}
                aria-label={`${n}${isMarked ? ' marcado' : ''}`}
              >
                {pad2(n)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Miniatura 5x5 que mostra o desenho de um modo de vitória. */
export function ModePreview({ cells }: { cells: number[] }) {
  const set = new Set(cells);
  return (
    <div className="mode-preview" aria-hidden="true">
      {Array.from({ length: 25 }, (_, i) => (
        <span key={i} className={set.has(i) ? 'on' : i === 12 ? 'free' : ''} />
      ))}
    </div>
  );
}
