import { useMemo, useState } from 'react';
import { PRIZES, getPrize } from '../data/event';
import { MODES, MODE_GROUPS, DEFAULT_MODE_IDS } from '../data/modes';
import type { Card, MatchGame } from '../types';
import { BingoGrid, ModePreview } from './BingoGrid';
import { IconPlay, IconCheck } from './Icons';

export interface SetupResult {
  name: string;
  games: MatchGame[];
  modeIds: string[];
}

interface MatchSetupProps {
  cards: Card[];
  initial?: SetupResult;
  submitLabel: string;
  onSubmit: (result: SetupResult) => void;
}

export const gameKey = (cardId: string, prizeId: string) => `${cardId}::${prizeId}`;

/** Nome sugerido para a partida a partir dos prêmios escolhidos. */
export function suggestName(games: MatchGame[]): string {
  const prizeIds = [...new Set(games.map((g) => g.prizeId))];
  if (prizeIds.length === 0) return 'Partida';
  if (prizeIds.length === 1) {
    const p = getPrize(prizeIds[0]);
    return p.round ? `${p.round}ª rodada: ${p.name}` : p.name;
  }
  return prizeIds
    .map(getPrize)
    .sort((a, b) => a.round - b.round)
    .map((p) => p.name)
    .join(' + ');
}

export function MatchSetup({ cards, initial, submitLabel, onSubmit }: MatchSetupProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial?.games.map((g) => g.key) ?? []));
  const [modeIds, setModeIds] = useState<string[]>(initial?.modeIds ?? DEFAULT_MODE_IDS);
  const [name, setName] = useState(initial?.name ?? '');
  const [nameTouched, setNameTouched] = useState(Boolean(initial));
  // Grupos abertos ao carregar: os tradicionais e os que já têm modo escolhido.
  const [openGroups] = useState(() =>
    MODE_GROUPS.filter(
      (g) => g === 'Tradicionais' || MODES.some((m) => m.group === g && (initial?.modeIds ?? []).includes(m.id)),
    ),
  );

  const games = useMemo<MatchGame[]>(() => {
    const previous = new Map(initial?.games.map((g) => [g.key, g]) ?? []);
    return cards.flatMap((card) =>
      card.prizeIds
        .filter((pid) => selected.has(gameKey(card.id, pid)))
        .map((pid) => {
          const key = gameKey(card.id, pid);
          return (
            previous.get(key) ?? {
              key,
              cardId: card.id,
              cardNumber: card.number,
              owner: card.owner,
              prizeId: pid,
              grid: [...card.grid],
            }
          );
        }),
    );
  }, [cards, selected, initial]);

  const finalName = (nameTouched ? name.trim() : '') || suggestName(games);
  const cardsUsed = new Set(games.map((g) => g.cardId)).size;
  const canSubmit = games.length > 0 && modeIds.length > 0;

  const toggleGame = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleCard = (card: Card) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const keys = card.prizeIds.map((pid) => gameKey(card.id, pid));
      const allOn = keys.every((k) => next.has(k));
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });

  const selectRound = (prizeId: string) =>
    setSelected(new Set(cards.filter((c) => c.prizeIds.includes(prizeId)).map((c) => gameKey(c.id, prizeId))));

  const roundActive = (prizeId: string) => {
    const keys = cards.filter((c) => c.prizeIds.includes(prizeId)).map((c) => gameKey(c.id, prizeId));
    return keys.length > 0 && keys.length === selected.size && keys.every((k) => selected.has(k));
  };

  const toggleMode = (id: string) =>
    setModeIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  return (
    <div className="setup">
      <section className="panel">
        <header className="panel-head">
          <div>
            <span className="step">1</span>
            <h2>Cartelas e jogos</h2>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelected(new Set(cards.flatMap((c) => c.prizeIds.map((p) => gameKey(c.id, p)))))}
            >
              Todos
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Limpar
            </button>
          </div>
        </header>

        <p className="hint">Atalho: escolha a rodada para usar o mesmo jogo em todas as cartelas.</p>
        <div className="round-picker">
          {PRIZES.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`round-btn ${roundActive(p.id) ? 'is-on' : ''}`}
              aria-pressed={roundActive(p.id)}
              onClick={() => selectRound(p.id)}
            >
              <span className="round-num">{p.round}ª rodada</span>
              <span className="round-name">{p.name}</span>
            </button>
          ))}
        </div>

        {cards.length === 0 && <p className="empty">Nenhuma cartela cadastrada. Volte ao início para adicionar.</p>}

        <div className="setup-cards">
          {cards.map((card) => {
            const keys = card.prizeIds.map((pid) => gameKey(card.id, pid));
            const count = keys.filter((k) => selected.has(k)).length;
            const state = count === 0 ? 'off' : count === keys.length ? 'on' : 'some';
            return (
              <article key={card.id} className={`setup-card ${count > 0 ? 'is-selected' : ''}`}>
                <button
                  type="button"
                  className="setup-card-head"
                  onClick={() => toggleCard(card)}
                  aria-pressed={state === 'on'}
                >
                  <span className={`checkbox checkbox-${state}`}>{state !== 'off' && <IconCheck size={14} />}</span>
                  <span className="setup-card-title">
                    <strong>Cartela {card.number}</strong>
                    {card.owner && <span className="owner">{card.owner}</span>}
                  </span>
                  <span className="count-badge">
                    {count}/{keys.length} jogos
                  </span>
                </button>
                <div className="setup-card-body">
                  <BingoGrid grid={card.grid} size="sm" label={`Números da cartela ${card.number}`} />
                  <div className="game-toggles">
                    {card.prizeIds.map((pid) => {
                      const p = getPrize(pid);
                      const on = selected.has(gameKey(card.id, pid));
                      return (
                        <button
                          type="button"
                          key={pid}
                          className={`chip chip-toggle ${on ? 'is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => toggleGame(gameKey(card.id, pid))}
                        >
                          <span className="chip-round">{p.round}</span>
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <span className="step">2</span>
            <h2>Modos que valem</h2>
          </div>
          <div className="panel-actions">
            <span className="muted small">{modeIds.length} selecionado(s)</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModeIds([])}>
              Limpar
            </button>
          </div>
        </header>
        <p className="hint">
          Pode marcar mais de um. O espaço livre do centro sempre conta como marcado. Toque em Linhas ou Figuras para
          ver mais opções.
        </p>
        {MODE_GROUPS.map((group) => (
          <details key={group} className="mode-group" open={openGroups.includes(group)}>
            <summary>
              <h3>{group}</h3>
              <span className="muted small">
                {MODES.filter((m) => m.group === group && modeIds.includes(m.id)).length} de{' '}
                {MODES.filter((m) => m.group === group).length}
              </span>
            </summary>
            <div className="mode-list">
              {MODES.filter((m) => m.group === group).map((m) => {
                const on = modeIds.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    className={`mode-option ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggleMode(m.id)}
                  >
                    <ModePreview cells={m.preview} />
                    <span className="mode-text">
                      <strong>{m.name}</strong>
                      <small>{m.description}</small>
                    </span>
                    <span className={`checkbox checkbox-${on ? 'on' : 'off'}`}>{on && <IconCheck size={14} />}</span>
                  </button>
                );
              })}
            </div>
          </details>
        ))}
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <span className="step">3</span>
            <h2>Nome da partida</h2>
          </div>
        </header>
        <label className="field">
          <span className="sr-only">Nome da partida</span>
          <input
            value={nameTouched ? name : ''}
            placeholder={suggestName(games)}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
          />
        </label>
      </section>

      <div className="action-bar">
        <div className="action-bar-inner">
          <div className="action-summary">
            {canSubmit ? (
              <>
                <strong>{finalName}</strong>
                <span>
                  {games.length} jogo(s) em {cardsUsed} cartela(s), {modeIds.length} modo(s)
                </span>
              </>
            ) : (
              <span>{games.length === 0 ? 'Selecione pelo menos um jogo.' : 'Selecione pelo menos um modo.'}</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!canSubmit}
            onClick={() => onSubmit({ name: finalName, games, modeIds })}
          >
            <IconPlay size={18} />
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
