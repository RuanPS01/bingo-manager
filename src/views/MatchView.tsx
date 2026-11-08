import { useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent } from 'react';
import { BingoGrid } from '../components/BingoGrid';
import { useConfirm } from '../components/Dialog';
import { CardName, cardLabel } from '../components/CardName';
import {
  IconClose,
  IconEdit,
  IconEraser,
  IconFlag,
  IconGrid,
  IconHome,
  IconList,
  IconPlus,
  IconSound,
  IconSun,
  IconTrash,
  IconTrophy,
} from '../components/Icons';
import { roundOf } from '../data/event';
import { CardEditor } from '../components/CardEditor';
import { toMatchGame } from '../lib/cards';
import { getMode } from '../data/modes';
import {
  LETTERS,
  MAX_BALL,
  evaluateMatch,
  formatBall,
  gamesWithNumber,
  letterFor,
  pad2,
  parseBall,
  type Achievement,
  type GameResult,
} from '../lib/bingo';
import { playMark, playWin, unlockAudio, vibrate } from '../lib/feedback';
import { useWakeLock } from '../lib/useWakeLock';
import type { Action } from '../state';
import type { Card, Match, Settings } from '../types';
import { formatDateTime } from './HomeView';

interface MatchViewProps {
  match: Match;
  cards: Card[];
  readOnly: boolean;
  settings: Settings;
  canReopen: boolean;
  dispatch: Dispatch<Action>;
  navigate: (path: string) => void;
}

type Feedback = { kind: 'hit' | 'miss' | 'error' | 'win' | 'info'; text: string };

const modeName = (id: string) => getMode(id)?.name ?? id;

/** Quantos números o aviso de BINGO fica na tela antes de sumir sozinho. */
const BANNER_DRAWS = 3;

export function MatchView({ match, cards, readOnly, settings, canReopen, dispatch, navigate }: MatchViewProps) {
  const confirm = useConfirm();
  const evaluation = useMemo(() => evaluateMatch(match), [match]);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // Aviso de BINGO que não bloqueia a tela: a partida segue normalmente.
  const [banner, setBanner] = useState<{ at: number; items: Achievement[] } | null>(null);
  const [drawView, setDrawView] = useState<'order' | 'board'>('order');
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useWakeLock(!readOnly && settings.keepAwake);

  useEffect(() => {
    if (!readOnly && window.matchMedia?.('(pointer: fine)').matches) inputRef.current?.focus();
  }, [readOnly]);

  const lastBall = match.draws[match.draws.length - 1] ?? null;
  const myNumbers = useMemo(() => new Set(match.games.flatMap((g) => g.grid)), [match.games]);

  const pending = useMemo(
    () =>
      evaluation.results.flatMap((r) =>
        r.modes.filter((m) => m.completedAt === null && m.needed === 1).map((m) => ({ result: r, mode: m })),
      ),
    [evaluation],
  );
  const targetNumbers = useMemo(() => new Set(pending.flatMap((p) => p.mode.oneAway)), [pending]);
  const allClosed =
    evaluation.results.length > 0 &&
    evaluation.results.every((r) => r.modes.length > 0 && r.modes.every((m) => m.completedAt !== null));

  // Jogos agrupados por cartela, na ordem da partida ou dos mais perto de completar.
  const groups = useMemo(() => {
    const byCard = new Map<string, GameResult[]>();
    for (const r of evaluation.results) {
      const list = byCard.get(r.game.cardId) ?? [];
      list.push(r);
      byCard.set(r.game.cardId, list);
    }
    const list = [...byCard.entries()].map(([cardId, results]) => ({
      cardId,
      first: results[0].game,
      results: settings.sortByProgress
        ? [...results].sort((a, b) => a.closest - b.closest || b.marked.size - a.marked.size)
        : results,
      closest: Math.min(...results.map((r) => r.closest)),
    }));
    return settings.sortByProgress ? list.sort((a, b) => a.closest - b.closest) : list;
  }, [evaluation, settings.sortByProgress]);

  const drawBall = (ball: number) => {
    if (readOnly) return;
    unlockAudio();
    const position = match.draws.indexOf(ball);
    if (position >= 0) {
      setFeedback({ kind: 'error', text: `${formatBall(ball)} já foi sorteado (${position + 1}º número).` });
      return;
    }
    const draws = [...match.draws, ball];
    const after = evaluateMatch({ ...match, draws });
    const fresh = after.achievements.filter((a) => a.completedAt === draws.length);
    dispatch({ type: 'match/draw', ball });

    const hits = gamesWithNumber(match.games, ball);
    const cardNames = [...new Set(hits.map((g) => cardLabel(g.cardName, g.cardNumber)))];
    // O aviso some sozinho depois de mais alguns números (ou com o X).
    setBanner((b) =>
      fresh.length > 0 ? { at: draws.length, items: fresh } : b && draws.length >= b.at + BANNER_DRAWS ? null : b,
    );
    if (fresh.length > 0) {
      setFeedback({ kind: 'win', text: `${formatBall(ball)} completou ${fresh.length} conquista(s)!` });
      if (settings.sound) playWin();
      if (settings.vibration) vibrate([200, 100, 200, 100, 400]);
    } else if (hits.length > 0) {
      setFeedback({
        kind: 'hit',
        text: `${formatBall(ball)} marcado em ${hits.length} jogo(s): ${cardNames.join(', ')}.`,
      });
      if (settings.sound) playMark();
      if (settings.vibration) vibrate(60);
    } else {
      setFeedback({ kind: 'miss', text: `${formatBall(ball)} registrado. Não está nas cartelas desta partida.` });
    }
  };

  const submit = () => {
    const ball = parseBall(input);
    if (ball === null) {
      setFeedback({
        kind: 'error',
        text: input.trim() ? `Digite um número de 1 a ${MAX_BALL}.` : 'Digite o número sorteado.',
      });
    } else {
      drawBall(ball);
    }
    setInput('');
    inputRef.current?.focus();
  };

  const undo = () => {
    if (!lastBall) return;
    dispatch({ type: 'match/undo' });
    setBanner(null);
    setFeedback({ kind: 'info', text: `${formatBall(lastBall)} foi desfeito.` });
    inputRef.current?.focus();
  };

  const removeBall = async (ball: number) => {
    if (readOnly) return;
    const ok = await confirm({
      title: `Remover ${formatBall(ball)}?`,
      message: 'O número sai da lista de sorteados e as marcações são recalculadas.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok) {
      dispatch({ type: 'match/remove-ball', ball });
      setBanner(null);
      setFeedback({ kind: 'info', text: `${formatBall(ball)} removido dos sorteados.` });
    }
  };

  const finish = async () => {
    const ok = await confirm({
      title: 'Finalizar partida?',
      message:
        evaluation.achievements.length > 0
          ? `A partida vai para o histórico com ${evaluation.achievements.length} conquista(s) registrada(s).`
          : 'A partida vai para o histórico com todos os números sorteados.',
      confirmLabel: 'Finalizar',
    });
    if (ok) {
      dispatch({ type: 'match/finish' });
      navigate('/');
    }
  };

  const removeFromHistory = async () => {
    const ok = await confirm({
      title: 'Excluir do histórico?',
      message: 'Essa partida e seus números sorteados serão apagados.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) {
      dispatch({ type: 'history/remove', id: match.id });
      navigate('/');
    }
  };

  const reopen = () => {
    dispatch({ type: 'match/reopen', id: match.id });
    navigate('/partida');
  };

  // Mantém o foco no campo ao tocar nos botões (evita fechar o teclado do celular).
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <div className="page match-page">
      <header className="match-bar">
        <div className="match-bar-inner">
          <div className="match-bar-top">
            <button
              type="button"
              className="icon-btn icon-btn-dark"
              onClick={() => navigate('/')}
              aria-label="Ir para o início"
              title="Início"
            >
              <IconHome />
            </button>
            <div className="match-title">
              <small>{readOnly ? 'Partida finalizada' : 'Partida em andamento'}</small>
              <strong>{match.name}</strong>
            </div>
            {!readOnly && (
              <>
                <button
                  type="button"
                  className={`icon-btn icon-btn-dark ${settings.keepAwake ? 'is-on' : ''}`}
                  onClick={() => dispatch({ type: 'settings', patch: { keepAwake: !settings.keepAwake } })}
                  aria-label={settings.keepAwake ? 'Tela sempre ligada: ativado' : 'Tela sempre ligada: desativado'}
                  title="Manter a tela ligada"
                  aria-pressed={settings.keepAwake}
                >
                  <IconSun />
                </button>
                <button
                  type="button"
                  className={`icon-btn icon-btn-dark ${settings.sound ? 'is-on' : ''}`}
                  onClick={() => {
                    unlockAudio();
                    dispatch({ type: 'settings', patch: { sound: !settings.sound } });
                  }}
                  aria-label={settings.sound ? 'Som ativado' : 'Som desativado'}
                  title="Som"
                  aria-pressed={settings.sound}
                >
                  <IconSound off={!settings.sound} />
                </button>
              </>
            )}
          </div>

          {readOnly ? (
            <div className="readonly-bar">
              <span>
                {match.finishedAt ? `Finalizada em ${formatDateTime(match.finishedAt)}. ` : ''}
                {match.draws.length} números sorteados.
              </span>
            </div>
          ) : (
            <form
              className="draw-form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className={`last-ball ${lastBall ? '' : 'is-empty'}`} aria-label="Último número sorteado">
                {lastBall ? (
                  <>
                    <span className="last-ball-letter">{letterFor(lastBall)}</span>
                    <span className="last-ball-num">{pad2(lastBall)}</span>
                  </>
                ) : (
                  <span className="last-ball-num">--</span>
                )}
              </div>
              <input
                ref={inputRef}
                className="draw-input"
                value={input}
                onChange={(e) => setInput(e.target.value.replace(/[^0-9a-zA-Z-]/g, '').slice(0, 4))}
                inputMode="numeric"
                enterKeyHint="enter"
                autoComplete="off"
                placeholder="Nº sorteado"
                aria-label="Número sorteado"
              />
              <button type="submit" className="btn btn-gold draw-submit" onMouseDown={keepFocus}>
                Marcar
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-dark"
                onMouseDown={keepFocus}
                onClick={undo}
                disabled={!lastBall}
                aria-label="Desfazer último número"
                title="Desfazer último número"
              >
                <IconEraser />
              </button>
            </form>
          )}

          <div className={`feedback feedback-${feedback?.kind ?? 'idle'}`} role="status" aria-live="polite">
            {feedback?.text ??
              (match.draws.length
                ? `${match.draws.length} de ${MAX_BALL} números sorteados.`
                : 'Digite o primeiro número sorteado e toque em Marcar.')}
          </div>

          {banner && !readOnly && (
            <div className="win-banner" role="status" aria-live="assertive">
              <IconTrophy size={26} />
              <div className="win-banner-text">
                <strong>BINGO!</strong>
                <ul>
                  {banner.items.map((a) => (
                    <li key={`${a.gameKey}-${a.modeId}`} data-game={a.gameKey} data-mode={a.modeId}>
                      <b>{modeName(a.modeId)}</b>: {cardLabel(a.game.cardName, a.game.cardNumber)}, {a.game.gameName}
                    </li>
                  ))}
                </ul>
                <small>A partida continua: siga marcando os números.</small>
              </div>
              <button
                type="button"
                className="icon-btn"
                onMouseDown={keepFocus}
                onClick={() => {
                  setBanner(null);
                  inputRef.current?.focus();
                }}
                aria-label="Fechar aviso de BINGO"
              >
                <IconClose size={18} />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="container stack match-main">
        {!readOnly && allClosed && (
          <section className="panel panel-info">
            <header className="panel-head">
              <div>
                <h2>Todos os padrões foram fechados</h2>
              </div>
            </header>
            <p>
              A partida continua aberta: você pode seguir marcando os números, incluir outros modos (por exemplo,
              cartela cheia depois da quina) ou usar Finalizar partida, no fim da página, quando quiser.
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/partida/editar')}>
              <IconPlus size={18} />
              Incluir outros modos
            </button>
          </section>
        )}

        {evaluation.achievements.length > 0 && (
          <section className="panel panel-win">
            <header className="panel-head">
              <div>
                <h2>
                  <IconTrophy size={20} /> Conquistas
                </h2>
                <span className="small">Na ordem em que aconteceram</span>
              </div>
            </header>
            <ol className="achievement-list">
              {evaluation.achievements.map((a) => (
                <li
                  key={`${a.gameKey}-${a.modeId}`}
                  data-game={a.gameKey}
                  data-mode={a.modeId}
                  data-at={a.completedAt}
                  data-ball={a.ball}
                >
                  <span className="achievement-mode">{modeName(a.modeId)}</span>
                  <span className="achievement-detail">
                    {cardLabel(a.game.cardName, a.game.cardNumber)} (nº {a.game.cardNumber}), {a.game.gameName}
                  </span>
                  <span className="achievement-when">
                    {a.completedAt}º número, {formatBall(a.ball)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {!readOnly && pending.length > 0 && (
          <section className="panel panel-alert">
            <header className="panel-head">
              <div>
                <h2>Falta 1 número</h2>
                <span className="small">Se sair um destes, você completa:</span>
              </div>
            </header>
            <div className="ball-chips">
              {[...targetNumbers]
                .sort((a, b) => a - b)
                .map((n) => (
                  <span key={n} className="ball-chip ball-chip-target" data-ball={n}>
                    {formatBall(n)}
                  </span>
                ))}
            </div>
            <ul className="pending-list">
              {pending.map(({ result, mode }) => (
                <li key={`${result.game.key}-${mode.modeId}`}>
                  <strong>{modeName(mode.modeId)}</strong>
                  <span>
                    {cardLabel(result.game.cardName, result.game.cardNumber)}, {result.game.gameName}
                  </span>
                  <span className="pending-numbers">{mode.oneAway.map(formatBall).join(', ')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel draws-panel">
          <header className="panel-head">
            <div>
              <h2>Números sorteados</h2>
              <span className="muted small">
                {match.draws.length} de {MAX_BALL}
              </span>
            </div>
            <div className="segmented" role="group" aria-label="Forma de exibição">
              <button
                type="button"
                className={drawView === 'order' ? 'is-on' : ''}
                aria-pressed={drawView === 'order'}
                onClick={() => setDrawView('order')}
              >
                <IconList size={16} />
                Ordem
              </button>
              <button
                type="button"
                className={drawView === 'board' ? 'is-on' : ''}
                aria-pressed={drawView === 'board'}
                onClick={() => setDrawView('board')}
              >
                <IconGrid size={16} />
                Painel
              </button>
            </div>
          </header>

          {drawView === 'order' ? (
            match.draws.length === 0 ? (
              <p className="empty">Nenhum número sorteado ainda.</p>
            ) : (
              <>
                <div className="ball-chips">
                  {[...match.draws].reverse().map((n, i) => (
                    <button
                      type="button"
                      key={n}
                      className={`ball-chip ${myNumbers.has(n) ? 'ball-chip-hit' : ''} ${i === 0 ? 'ball-chip-last' : ''}`}
                      onClick={() => removeBall(n)}
                      disabled={readOnly}
                      data-ball={n}
                      title={readOnly ? undefined : 'Toque para remover'}
                    >
                      <small>{match.draws.length - i}º</small>
                      {formatBall(n)}
                    </button>
                  ))}
                </div>
                {!readOnly && (
                  <p className="hint">
                    Destacados: números que estão nas suas cartelas. Toque em um número para removê-lo.
                  </p>
                )}
              </>
            )
          ) : (
            <>
              <div className="ball-board">
                {LETTERS.map((letter, c) => (
                  <div className="ball-board-row" key={letter}>
                    <span className="ball-board-letter">{letter}</span>
                    {Array.from({ length: 15 }, (_, i) => {
                      const n = c * 15 + i + 1;
                      const drawn = match.draws.includes(n);
                      const classes = [
                        drawn ? 'is-drawn' : '',
                        myNumbers.has(n) ? 'is-mine' : '',
                        !drawn && targetNumbers.has(n) ? 'is-target' : '',
                      ];
                      return (
                        <button
                          type="button"
                          key={n}
                          className={classes.join(' ')}
                          disabled={readOnly}
                          onClick={() => (drawn ? removeBall(n) : drawBall(n))}
                          data-ball={n}
                          aria-label={`${formatBall(n)}${drawn ? ', sorteado' : ''}`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <p className="hint">
                  Toque em um número para marcar como sorteado (ou para remover). Sublinhados e em azul: números das
                  suas cartelas. Em cinza: sorteados que não estão nelas.
                </p>
              )}
            </>
          )}
        </section>

        <section>
          <div className="section-toolbar">
            <h2>
              Jogos da partida <span className="muted">({match.games.length})</span>
            </h2>
            <div className="segmented" role="group" aria-label="Ordenação dos jogos">
              <button
                type="button"
                className={!settings.sortByProgress ? 'is-on' : ''}
                aria-pressed={!settings.sortByProgress}
                onClick={() => dispatch({ type: 'settings', patch: { sortByProgress: false } })}
              >
                Cartelas
              </button>
              <button
                type="button"
                className={settings.sortByProgress ? 'is-on' : ''}
                aria-pressed={settings.sortByProgress}
                onClick={() => dispatch({ type: 'settings', patch: { sortByProgress: true } })}
              >
                Mais perto
              </button>
            </div>
          </div>
          <p className="muted small modes-line">Valendo: {match.modeIds.map(modeName).join(', ')}</p>
          <div className="card-groups">
            {groups.map((group) => (
              <section key={group.cardId} className="card-group" data-card={group.first.cardNumber || group.cardId}>
                <header className="card-group-head">
                  <CardName
                    name={group.first.cardName}
                    number={group.first.cardNumber}
                    onRename={
                      readOnly ? undefined : (name) => dispatch({ type: 'card/rename', id: group.cardId, name })
                    }
                  />
                  <span className="card-number-tag">Nº {group.first.cardNumber}</span>
                  <span className="muted small">{group.results.length} jogo(s)</span>
                </header>
                <div className="games-grid">
                  {group.results.map((r) => (
                    <GameCard key={r.game.key} result={r} lastBall={lastBall} draws={match.draws} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="match-actions">
          {readOnly ? (
            <>
              {canReopen && (
                <button type="button" className="btn btn-secondary" onClick={reopen}>
                  Reabrir partida
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-danger-text" onClick={removeFromHistory}>
                <IconTrash size={18} />
                Excluir do histórico
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
                <IconPlus size={18} />
                Adicionar cartela ou jogo
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/partida/editar')}>
                <IconEdit size={18} />
                Editar jogos e modos
              </button>
              <button type="button" className="btn btn-primary" onClick={finish}>
                <IconFlag size={18} />
                Finalizar partida
              </button>
            </>
          )}
        </section>
      </main>

      {adding && (
        <CardEditor
          card={null}
          existingNumbers={cards.map((c) => c.number).filter(Boolean)}
          playLabel="Salvar e incluir na partida"
          onClose={() => setAdding(false)}
          onSave={(card, intent) => {
            dispatch({ type: 'card/save', card });
            if (intent === 'play') {
              dispatch({ type: 'match/add-games', games: card.games.map((g) => toMatchGame(card, g)) });
              setFeedback({
                kind: 'info',
                text: `${cardLabel(card.name, card.number)} incluída na partida com ${card.games.length} jogo(s).`,
              });
            } else {
              setFeedback({ kind: 'info', text: `${cardLabel(card.name, card.number)} salva nas cartelas.` });
            }
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function GameCard({ result, lastBall, draws }: { result: GameResult; lastBall: number | null; draws: number[] }) {
  const { game, modes, marked } = result;
  const round = roundOf(game.prizeId);
  const won = modes.filter((m) => m.completedAt !== null);
  const winCells = new Set(won.flatMap((m) => m.winningCells ?? []));
  const targets = new Set(modes.flatMap((m) => m.oneAway));
  const totalNumbers = game.grid.filter((n) => n !== 0).length;
  const status = won.length > 0 ? 'is-won' : result.closest === 1 ? 'is-close' : '';

  return (
    <article className={`game-card ${status}`} data-game={game.key} data-marked={marked.size}>
      <header className="game-card-head">
        <span className={`prize-tag ${round ? '' : 'is-custom'}`}>
          {round > 0 && <span className="chip-round">{round}</span>}
          {game.gameName}
        </span>
        {won.length > 0 && (
          <span className="badge badge-gold">
            <IconTrophy size={14} /> BINGO
          </span>
        )}
      </header>
      <BingoGrid
        grid={game.grid}
        marked={marked}
        lastBall={lastBall}
        winCells={winCells}
        targets={targets}
        label={`${cardLabel(game.cardName, game.cardNumber)}, ${game.gameName}`}
      />
      <div className="game-card-count">
        {marked.size} de {totalNumbers} números marcados
      </div>
      <ul className="mode-progress">
        {modes.map((m) => {
          const pct = m.bestTotal ? Math.round((m.bestMarked / m.bestTotal) * 100) : 0;
          return (
            <li
              key={m.modeId}
              className={m.completedAt !== null ? 'is-done' : m.needed === 1 ? 'is-close' : ''}
              data-mode={m.modeId}
              data-done={m.completedAt ?? ''}
              data-needed={m.needed}
            >
              <span className="mode-progress-name">{modeName(m.modeId)}</span>
              {m.completedAt !== null ? (
                <span className="mode-progress-done">
                  Completou no {m.completedAt}º número ({formatBall(draws[m.completedAt - 1])})
                </span>
              ) : (
                <>
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <span className="mode-progress-need">
                    {m.needed === 1
                      ? `Falta 1: ${m.oneAway.slice(0, 6).map(pad2).join(', ')}${m.oneAway.length > 6 ? '...' : ''}`
                      : `Faltam ${m.needed}`}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
