import { useRef, useState } from 'react';
import { FREE, PRIZES, getPrize } from '../data/event';
import { LETTERS, columnRange, validateGrid } from '../lib/bingo';
import { hasSameNumbers, parseGridText } from '../lib/cards';
import { newId } from '../state';
import type { Card, CardGame } from '../types';
import { Modal } from './Dialog';
import { IconPlus, IconStar, IconTrash } from './Icons';

export type SaveIntent = 'save' | 'play';

interface CardEditorProps {
  card: Card | null;
  existingNumbers: string[];
  onSave: (card: Card, intent: SaveIntent) => void;
  onDelete?: (card: Card) => void;
  onClose: () => void;
  /** Texto do botão que salva e já usa a cartela (ex.: "Salvar e jogar"). */
  playLabel?: string;
}

interface EditorGame {
  id: string;
  prizeId: string | null;
  name: string;
  cells: string[];
}

const emptyCells = () => Array.from({ length: 25 }, (_, i) => (i === 12 ? String(FREE) : ''));
const toCells = (grid: number[]) => grid.map((n, i) => (i === 12 ? String(FREE) : String(n)));
const toValues = (cells: string[]) => cells.map((v, i) => (i === 12 ? FREE : v === '' ? null : Number(v)));

function fromCard(card: Card): EditorGame[] {
  return card.games.map((g) => ({ id: g.id, prizeId: g.prizeId, name: g.name, cells: toCells(g.grid) }));
}

const showPreset = (cells: string[]): EditorGame[] =>
  PRIZES.map((p) => ({ id: p.id, prizeId: p.id, name: p.name, cells: [...cells] }));

const customGame = (index: number, cells: string[]): EditorGame => ({
  id: newId('jogo'),
  prizeId: null,
  name: `Jogo ${index}`,
  cells: [...cells],
});

/** Formulário para cadastrar ou editar uma cartela e seus jogos. */
export function CardEditor({ card, existingNumbers, onSave, onDelete, onClose, playLabel }: CardEditorProps) {
  const [kind, setKind] = useState<'show' | 'avulso'>('show');
  const [number, setNumber] = useState(card?.number ?? '');
  const [name, setName] = useState(card?.name ?? '');
  const [games, setGames] = useState<EditorGame[]>(() => (card ? fromCard(card) : showPreset(emptyCells())));
  const [same, setSame] = useState(card ? hasSameNumbers(card) : true);
  const [shared, setShared] = useState<string[]>(() => (card ? toCells(card.games[0].grid) : emptyCells()));
  const [activeId, setActiveId] = useState<string | null>(games[0]?.id ?? null);
  const [submitted, setSubmitted] = useState(false);

  const multi = games.length > 1;
  const sharedMode = same || !multi;
  const active = games.find((g) => g.id === activeId) ?? games[0];
  const cellsOf = (g: EditorGame) => (sharedMode ? shared : g.cells);

  const gridErrors = new Map(games.map((g) => [g.id, validateGrid(toValues(cellsOf(g)))]));
  const trimmedNumber = number.trim();
  const identityError =
    !trimmedNumber && !name.trim()
      ? 'Informe o nome ou o número da cartela'
      : trimmedNumber && existingNumbers.includes(trimmedNumber)
        ? 'Já existe uma cartela com esse número'
        : null;
  const gamesError = games.length === 0 ? 'Inclua pelo menos um jogo' : null;
  const namesError = games.some((g) => !g.name.trim()) ? 'Dê um nome a cada jogo avulso' : null;
  const invalidGames = games.filter((g) => (gridErrors.get(g.id)?.size ?? 0) > 0);
  const valid = !identityError && !gamesError && !namesError && invalidGames.length === 0;

  const choosePreset = (next: 'show' | 'avulso') => {
    setKind(next);
    setSame(true);
    const list = next === 'show' ? showPreset(shared) : [customGame(1, shared)];
    setGames(list);
    setActiveId(list[0].id);
  };

  const order = (g: EditorGame) => (g.prizeId ? getPrize(g.prizeId).round : 99);

  /** Troca a lista de jogos. Com um jogo só, volta a usar uma grade única. */
  const replaceGames = (next: EditorGame[]) => {
    if (next.length <= 1 && !same) {
      if (next[0]) setShared([...next[0].cells]);
      setSame(true);
    }
    setGames(next);
    if (!next.some((g) => g.id === activeId)) setActiveId(next[0]?.id ?? null);
  };

  const togglePrize = (prizeId: string) => {
    if (games.some((g) => g.prizeId === prizeId)) {
      replaceGames(games.filter((g) => g.prizeId !== prizeId));
      return;
    }
    const p = getPrize(prizeId);
    const added: EditorGame = { id: p.id, prizeId: p.id, name: p.name, cells: sharedMode ? [...shared] : emptyCells() };
    // mantém a ordem das rodadas, com os jogos avulsos no fim
    replaceGames([...games, added].sort((a, b) => order(a) - order(b)));
    if (!sharedMode) setActiveId(added.id);
  };

  const addCustom = () => {
    const count = games.filter((g) => !g.prizeId).length + 1;
    const game = customGame(count, sharedMode ? shared : emptyCells());
    replaceGames([...games, game]);
    if (!sharedMode) setActiveId(game.id);
  };

  const updateGame = (id: string, patch: Partial<EditorGame>) =>
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const removeGame = (id: string) => replaceGames(games.filter((g) => g.id !== id));

  const setCells = (cells: string[]) => {
    if (sharedMode) setShared(cells);
    else if (active) updateGame(active.id, { cells });
  };

  const changeSame = (value: boolean) => {
    if (!value) {
      // cada jogo começa com os números compartilhados e pode ser alterado
      setGames((prev) => prev.map((g) => ({ ...g, cells: [...shared] })));
    } else if (active) {
      setShared([...active.cells]);
    }
    setSame(value);
  };

  const submit = (intent: SaveIntent) => {
    setSubmitted(true);
    if (!valid) {
      if (!sharedMode && invalidGames[0]) setActiveId(invalidGames[0].id);
      return;
    }
    const savedGames: CardGame[] = games.map((g) => ({
      id: g.id,
      prizeId: g.prizeId,
      name: g.name.trim(),
      grid: toValues(cellsOf(g)).map((v) => v ?? FREE),
    }));
    onSave(
      {
        id: card?.id ?? newId('cartela'),
        number: trimmedNumber,
        name: name.trim(),
        games: savedGames,
      },
      intent,
    );
  };

  const customGames = games.filter((g) => !g.prizeId);
  const currentCells = active ? cellsOf(active) : shared;
  const currentErrors = active ? (gridErrors.get(active.id) ?? new Map<number, string>()) : new Map<number, string>();

  return (
    <Modal
      open
      onClose={onClose}
      title={card ? `Editar ${card.name || `cartela ${card.number}`}` : 'Adicionar cartela ou jogo'}
      size="md"
      footer={
        <>
          {card && onDelete && (
            <button type="button" className="btn btn-ghost btn-danger-text push-left" onClick={() => onDelete(card)}>
              Excluir
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${playLabel ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => submit('save')}
          >
            {playLabel ? 'Só salvar' : 'Salvar'}
          </button>
          {playLabel && (
            <button type="button" className="btn btn-primary" onClick={() => submit('play')}>
              {playLabel}
            </button>
          )}
        </>
      }
    >
      <form
        className="card-editor"
        onSubmit={(e) => {
          e.preventDefault();
          submit(playLabel ? 'play' : 'save');
        }}
      >
        {!card && (
          <div className="segmented segmented-block" role="group" aria-label="Tipo de cadastro">
            <button
              type="button"
              className={kind === 'show' ? 'is-on' : ''}
              aria-pressed={kind === 'show'}
              onClick={() => choosePreset('show')}
            >
              Cartela do Show (5 jogos)
            </button>
            <button
              type="button"
              className={kind === 'avulso' ? 'is-on' : ''}
              aria-pressed={kind === 'avulso'}
              onClick={() => choosePreset('avulso')}
            >
              Jogo avulso
            </button>
          </div>
        )}

        <div className="form-row">
          <label className="field">
            <span>Nome da cartela</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'avulso' ? 'Ex.: Binguinho da Ana' : 'Ex.: Bruna'}
              maxLength={40}
              data-autofocus
            />
          </label>
          <label className="field">
            <span>Número (opcional)</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              inputMode="numeric"
              placeholder="Ex.: 01066"
            />
          </label>
        </div>
        {submitted && identityError && <p className="field-error form-error">{identityError}</p>}

        <fieldset className="field">
          <legend>Jogos desta cartela</legend>
          <div className="chip-row">
            {PRIZES.map((p) => {
              const on = games.some((g) => g.prizeId === p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`chip chip-toggle ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => togglePrize(p.id)}
                >
                  <span className="chip-round">{p.round}</span> {p.name}
                </button>
              );
            })}
          </div>
          {customGames.length > 0 && (
            <ul className="custom-games">
              {customGames.map((g) => (
                <li key={g.id}>
                  <input
                    value={g.name}
                    onChange={(e) => updateGame(g.id, { name: e.target.value })}
                    maxLength={40}
                    placeholder="Ex.: Binguinho"
                    aria-label="Nome do jogo avulso"
                    className={submitted && !g.name.trim() ? 'has-error' : ''}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeGame(g.id)}
                    aria-label={`Remover o jogo ${g.name || 'avulso'}`}
                  >
                    <IconTrash size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-ghost btn-sm add-custom" onClick={addCustom}>
            <IconPlus size={16} />
            Adicionar jogo avulso
          </button>
          {submitted && (gamesError || namesError) && <small className="field-error">{gamesError ?? namesError}</small>}
        </fieldset>

        <fieldset className="field">
          <legend>Números</legend>
          {multi && (
            <label className="check-line">
              <input type="checkbox" checked={same} onChange={(e) => changeSame(e.target.checked)} />
              <span>Mesmos números em todos os jogos (como na cartela impressa)</span>
            </label>
          )}
          {!sharedMode && (
            <div className="game-tabs" role="tablist" aria-label="Jogo que está sendo editado">
              {games.map((g) => {
                const hasError = submitted && (gridErrors.get(g.id)?.size ?? 0) > 0;
                return (
                  <button
                    type="button"
                    role="tab"
                    key={g.id}
                    aria-selected={active?.id === g.id}
                    className={`${active?.id === g.id ? 'is-on' : ''} ${hasError ? 'has-error' : ''}`}
                    onClick={() => setActiveId(g.id)}
                  >
                    {g.prizeId && <span className="chip-round">{getPrize(g.prizeId).round}</span>}
                    {g.name || 'Jogo avulso'}
                  </button>
                );
              })}
            </div>
          )}
          {games.length > 0 && (
            <GridEditor
              key={sharedMode ? 'shared' : active?.id}
              cells={currentCells}
              errors={currentErrors}
              showErrors={submitted}
              onChange={setCells}
            />
          )}
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

interface GridEditorProps {
  cells: string[];
  errors: Map<number, string>;
  showErrors: boolean;
  onChange: (cells: string[]) => void;
}

/** Grade 5x5 para digitar os números, com opção de digitar todos de uma vez. */
function GridEditor({ cells, errors, showErrors, onChange }: GridEditorProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [quick, setQuick] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);

  const focusNext = (cell: number) => {
    const next = cell + 1 === 12 ? 13 : cell + 1;
    inputs.current[next]?.focus();
    inputs.current[next]?.select();
  };

  const setCell = (cell: number, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    onChange(cells.map((v, i) => (i === cell ? digits : v)));
    if (digits.length === 2 && cell < 24) focusNext(cell);
  };

  const fillAll = () => {
    const values = parseGridText(quick);
    if (!values) {
      const found = (quick.match(/\d+/g) ?? []).length;
      setQuickError(`Encontrei ${found} número(s). Digite os 24 números, linha por linha.`);
      return;
    }
    onChange(values.map((v, i) => (i === 12 ? String(FREE) : String(v))));
    setQuick('');
    setQuickError(null);
  };

  return (
    <div className="grid-editor-wrap">
      <div className="quick-fill">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              fillAll();
            }
          }}
          inputMode="numeric"
          placeholder="Digite os 24 números de uma vez"
          aria-label="Digitar todos os números de uma vez"
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={fillAll}>
          Preencher
        </button>
      </div>
      <small className="hint quick-hint">Linha por linha, de cima para baixo, separados por espaço.</small>
      {quickError && <small className="field-error">{quickError}</small>}

      <div className="grid-editor">
        {LETTERS.map((l, c) => {
          const [lo, hi] = columnRange(c);
          return (
            <div key={l} className="grid-editor-head">
              <strong>{l}</strong>
              <small>
                {lo} a {hi}
              </small>
            </div>
          );
        })}
        {cells.map((v, cell) =>
          cell === 12 ? (
            <div key={cell} className="grid-editor-free" aria-label="Espaço livre">
              <IconStar size={18} />
            </div>
          ) : (
            <input
              key={cell}
              ref={(el) => {
                inputs.current[cell] = el;
              }}
              className={showErrors && errors.has(cell) ? 'has-error' : ''}
              value={v}
              onChange={(e) => setCell(cell, e.target.value)}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              maxLength={2}
              aria-label={`Linha ${Math.floor(cell / 5) + 1}, coluna ${LETTERS[cell % 5]}`}
              title={errors.get(cell)}
            />
          ),
        )}
      </div>
      {showErrors && errors.size > 0 && (
        <small className="field-error">
          Corrija os números destacados: {[...new Set(errors.values())].join('; ')}.
        </small>
      )}
    </div>
  );
}
