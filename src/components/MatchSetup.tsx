import { useMemo, useState } from 'react';
import { MODES, MODE_GROUPS, DEFAULT_MODE_IDS } from '../data/modes';
import { cardLabel, gameKey, hasSameNumbers, toMatchGame } from '../lib/cards';
import type { Card, MatchGame } from '../types';
import { BingoGrid, ModePreview } from './BingoGrid';
import { CardEditor } from './CardEditor';
import { IconBall, IconCheck, IconPlus } from './Icons';

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
  /** Salva uma cartela cadastrada nesta tela. */
  onSaveCard: (card: Card) => void;
}

/** Nome sugerido para a partida a partir dos jogos escolhidos. */
export function suggestName(games: MatchGame[]): string {
  const names = [...new Set(games.map((g) => g.gameName.trim()).filter(Boolean))];
  if (names.length === 0) return 'Partida';
  return names.join(' + ');
}

/** Normaliza o nome do jogo para agrupar "Rodada 1" e "rodada 1 " como o mesmo jogo. */
const nameKey = (name: string) => name.trim().toLocaleLowerCase('pt-BR');

export function MatchSetup({ cards, initial, submitLabel, onSubmit, onSaveCard }: MatchSetupProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial?.games.map((g) => g.key) ?? []));
  const [modeIds, setModeIds] = useState<string[]>(initial?.modeIds ?? DEFAULT_MODE_IDS);
  const [name, setName] = useState(initial?.name ?? '');
  const [nameTouched, setNameTouched] = useState(Boolean(initial?.name));
  const [adding, setAdding] = useState(false);
  // Grupos abertos ao carregar: os tradicionais e os que já têm modo escolhido.
  const [openGroups] = useState(() =>
    MODE_GROUPS.filter(
      (g) => g === 'Tradicionais' || MODES.some((m) => m.group === g && (initial?.modeIds ?? []).includes(m.id)),
    ),
  );

  const games = useMemo<MatchGame[]>(() => {
    const previous = new Map(initial?.games.map((g) => [g.key, g]) ?? []);
    return cards.flatMap((card) =>
      card.games
        .filter((g) => selected.has(gameKey(card.id, g.id)))
        .map((g) => previous.get(gameKey(card.id, g.id)) ?? toMatchGame(card, g)),
    );
  }, [cards, selected, initial]);

  const finalName = (nameTouched ? name.trim() : '') || suggestName(games);
  const cardsUsed = new Set(games.map((g) => g.cardId)).size;
  const canSubmit = games.length > 0 && modeIds.length > 0;
  const keysOf = (card: Card) => card.games.map((g) => gameKey(card.id, g.id));

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
      const keys = keysOf(card);
      const allOn = keys.every((k) => next.has(k));
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });

  // Atalho por nome de jogo: o mesmo jogo (ex.: "Rodada 1") em todas as cartelas que o têm.
  const gameNames = useMemo(() => {
    const byKey = new Map<string, { label: string; keys: string[]; cards: Set<string> }>();
    for (const c of cards) {
      for (const g of c.games) {
        const k = nameKey(g.name);
        if (!k) continue;
        const entry = byKey.get(k) ?? { label: g.name.trim(), keys: [], cards: new Set<string>() };
        entry.keys.push(gameKey(c.id, g.id));
        entry.cards.add(c.id);
        byKey.set(k, entry);
      }
    }
    return [...byKey.values()];
  }, [cards]);

  const shortcutActive = (keys: string[]) =>
    keys.length > 0 && keys.length === selected.size && keys.every((k) => selected.has(k));

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
              onClick={() => setSelected(new Set(cards.flatMap(keysOf)))}
            >
              Todos
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Limpar
            </button>
          </div>
        </header>

        {gameNames.length > 0 && (
          <>
            <p className="hint">Atalho: escolha um jogo para usar o jogo com esse nome em todas as cartelas.</p>
            <div className="round-picker" role="group" aria-label="Atalho por jogo">
              {gameNames.map((g) => (
                <button
                  type="button"
                  key={g.label}
                  className={`round-btn ${shortcutActive(g.keys) ? 'is-on' : ''}`}
                  aria-pressed={shortcutActive(g.keys)}
                  onClick={() => setSelected(new Set(g.keys))}
                >
                  <span className="round-num">{g.cards.size} cartela(s)</span>
                  <span className="round-name">{g.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {cards.length === 0 && (
          <p className="empty">Nenhuma cartela cadastrada ainda. Use o botão abaixo para cadastrar a primeira.</p>
        )}

        <div className="setup-cards">
          {cards.map((card) => {
            const keys = keysOf(card);
            const count = keys.filter((k) => selected.has(k)).length;
            const state = count === 0 ? 'off' : count === keys.length ? 'on' : 'some';
            return (
              <article
                key={card.id}
                className={`setup-card ${count > 0 ? 'is-selected' : ''}`}
                data-card={card.number || card.id}
              >
                <button
                  type="button"
                  className="setup-card-head"
                  onClick={() => toggleCard(card)}
                  aria-pressed={state === 'on'}
                >
                  <span className={`checkbox checkbox-${state}`}>{state !== 'off' && <IconCheck size={14} />}</span>
                  <span className="setup-card-title">
                    <strong>{cardLabel(card.name, card.number)}</strong>
                    {card.number && <span className="owner">Cartela {card.number}</span>}
                  </span>
                  <span className="count-badge">
                    {count}/{keys.length} jogo(s)
                  </span>
                </button>
                <div className="setup-card-body">
                  <div>
                    <BingoGrid
                      grid={card.games[0].grid}
                      size="sm"
                      label={`Números de ${cardLabel(card.name, card.number)}`}
                    />
                    {!hasSameNumbers(card) && <small className="muted small">Números do 1º jogo</small>}
                  </div>
                  <div className="game-toggles">
                    {card.games.map((g, i) => {
                      const key = gameKey(card.id, g.id);
                      const on = selected.has(key);
                      return (
                        <button
                          type="button"
                          key={g.id}
                          className={`chip chip-toggle ${on ? 'is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => toggleGame(key)}
                        >
                          {card.games.length > 1 && <span className="chip-round">{i + 1}</span>}
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <button type="button" className="add-tile" onClick={() => setAdding(true)}>
          <IconPlus size={20} />
          Adicionar cartela
        </button>
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

      {adding && (
        <CardEditor
          card={null}
          existingNumbers={cards.map((c) => c.number).filter(Boolean)}
          onClose={() => setAdding(false)}
          onSave={(card) => {
            onSaveCard(card);
            setSelected((prev) => new Set([...prev, ...keysOf(card)]));
            setAdding(false);
          }}
        />
      )}

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
            <IconBall size={20} />
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
