import { useRef, useState } from 'react';
import { FREE, PRIZES } from '../data/event';
import { LETTERS, columnRange, validateGrid } from '../lib/bingo';
import { newId } from '../state';
import type { Card } from '../types';
import { Modal } from './Dialog';
import { IconStar } from './Icons';

interface CardEditorProps {
  card: Card | null;
  existingNumbers: string[];
  onSave: (card: Card) => void;
  onDelete?: (card: Card) => void;
  onClose: () => void;
}

const emptyCells = () => Array.from({ length: 25 }, (_, i) => (i === 12 ? String(FREE) : ''));

/** Formulário para cadastrar ou editar uma cartela. */
export function CardEditor({ card, existingNumbers, onSave, onDelete, onClose }: CardEditorProps) {
  const [number, setNumber] = useState(card?.number ?? '');
  const [owner, setOwner] = useState(card?.owner ?? '');
  const [prizeIds, setPrizeIds] = useState<string[]>(card?.prizeIds ?? PRIZES.map((p) => p.id));
  const [cells, setCells] = useState<string[]>(card ? card.grid.map(String) : emptyCells());
  const [submitted, setSubmitted] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const values = cells.map((v, i) => (i === 12 ? FREE : v === '' ? null : Number(v)));
  const gridErrors = validateGrid(values);
  const trimmedNumber = number.trim();
  const numberError = !trimmedNumber
    ? 'Informe o número da cartela'
    : existingNumbers.includes(trimmedNumber)
      ? 'Já existe uma cartela com esse número'
      : null;
  const prizeError = prizeIds.length === 0 ? 'Selecione pelo menos um jogo' : null;
  const valid = !numberError && !prizeError && gridErrors.size === 0;

  const focusNext = (cell: number) => {
    let next = cell + 1;
    if (next === 12) next = 13;
    inputs.current[next]?.focus();
    inputs.current[next]?.select();
  };

  const setCell = (cell: number, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setCells((prev) => prev.map((v, i) => (i === cell ? digits : v)));
    if (digits.length === 2 && cell < 24) focusNext(cell);
  };

  const submit = () => {
    setSubmitted(true);
    if (!valid) return;
    onSave({
      id: card?.id ?? newId('cartela'),
      number: trimmedNumber,
      owner: owner.trim(),
      prizeIds: PRIZES.map((p) => p.id).filter((id) => prizeIds.includes(id)),
      grid: values.map((v) => v ?? FREE),
    });
  };

  const togglePrize = (id: string) =>
    setPrizeIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  return (
    <Modal
      open
      onClose={onClose}
      title={card ? `Editar cartela ${card.number}` : 'Nova cartela'}
      size="md"
      footer={
        <>
          {card && onDelete && (
            <button type="button" className="btn btn-ghost btn-danger-text push-left" onClick={() => onDelete(card)}>
              Excluir cartela
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            Salvar
          </button>
        </>
      }
    >
      <form
        className="card-editor"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="form-row">
          <label className="field">
            <span>Número da cartela</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              inputMode="numeric"
              placeholder="Ex.: 01066"
              data-autofocus
            />
            {submitted && numberError && <small className="field-error">{numberError}</small>}
          </label>
          <label className="field">
            <span>Dono(a)</span>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Nome escrito na cartela" />
          </label>
        </div>

        <fieldset className="field">
          <legend>Jogos (prêmios) desta cartela</legend>
          <div className="chip-row">
            {PRIZES.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`chip chip-toggle ${prizeIds.includes(p.id) ? 'is-on' : ''}`}
                aria-pressed={prizeIds.includes(p.id)}
                onClick={() => togglePrize(p.id)}
              >
                <span className="chip-round">{p.round}</span> {p.name}
              </button>
            ))}
          </div>
          {submitted && prizeError && <small className="field-error">{prizeError}</small>}
        </fieldset>

        <fieldset className="field">
          <legend>Números (iguais em todos os jogos da cartela)</legend>
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
                  className={submitted && gridErrors.has(cell) ? 'has-error' : ''}
                  value={v}
                  onChange={(e) => setCell(cell, e.target.value)}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  maxLength={2}
                  aria-label={`Linha ${Math.floor(cell / 5) + 1}, coluna ${LETTERS[cell % 5]}`}
                  title={gridErrors.get(cell)}
                />
              ),
            )}
          </div>
          {submitted && gridErrors.size > 0 && (
            <small className="field-error">
              Corrija os números destacados: {[...new Set(gridErrors.values())].join('; ')}.
            </small>
          )}
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
