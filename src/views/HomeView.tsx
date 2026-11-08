import { useMemo, useRef, useState, type Dispatch } from 'react';
import { BingoGrid } from '../components/BingoGrid';
import { CardEditor } from '../components/CardEditor';
import { useConfirm } from '../components/Dialog';
import { CardName } from '../components/CardName';
import {
  IconBall,
  IconClock,
  IconClose,
  IconFile,
  IconFlag,
  IconGrid,
  IconInstall,
  IconMoon,
  IconPlus,
  IconSave,
  IconSun,
  IconTrophy,
} from '../components/Icons';
import { EVENT, roundOf } from '../data/event';
import { cardLabel, hasSameNumbers, toMatchGame } from '../lib/cards';
import { getMode } from '../data/modes';
import { evaluateMatch, formatBall } from '../lib/bingo';
import { exportState, readBackupFile } from '../lib/storage';
import { usePwaInstall } from '../lib/usePwaInstall';
import type { Action } from '../state';
import type { AppState, Card, Match } from '../types';

interface HomeViewProps {
  state: AppState;
  dispatch: Dispatch<Action>;
  navigate: (path: string) => void;
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HomeView({ state, dispatch, navigate }: HomeViewProps) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Card | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = state.activeMatch;
  const pwa = usePwaInstall();

  const finishActive = async () => {
    if (!active) return;
    const ok = await confirm({
      title: 'Finalizar partida?',
      message: 'A partida vai para o histórico com todos os números sorteados e as conquistas.',
      confirmLabel: 'Finalizar',
    });
    if (ok) dispatch({ type: 'match/finish' });
  };

  const removeCard = async (card: Card) => {
    const ok = await confirm({
      title: `Excluir ${cardLabel(card.name, card.number)}?`,
      message: 'Partidas já iniciadas e o histórico não são afetados.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) {
      dispatch({ type: 'card/remove', id: card.id });
      setEditing(null);
    }
  };

  const importBackup = async (file: File) => {
    try {
      const next = await readBackupFile(file);
      const ok = await confirm({
        title: 'Importar backup?',
        message: `O backup tem ${next.cards.length} cartela(s) e ${next.history.length} partida(s) no histórico. Os dados atuais deste navegador serão substituídos.`,
        confirmLabel: 'Importar',
        danger: true,
      });
      if (ok) {
        dispatch({ type: 'replace', state: next });
        setNotice('Backup importado com sucesso.');
      }
    } catch {
      setNotice('Não foi possível ler esse arquivo de backup.');
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-inner">
          <p className="hero-kicker">{EVENT.organizer}</p>
          <h1>{EVENT.title}</h1>
          <p className="hero-meta">
            <span>{EVENT.date}</span>
            <span>{EVENT.time}</span>
            <span>{EVENT.place}</span>
          </p>
        </div>
      </header>

      <main className="container stack">
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
              Ok
            </button>
          </div>
        )}

        {active ? (
          <ActiveMatchCard match={active} onContinue={() => navigate('/partida')} onFinish={finishActive} />
        ) : (
          <section className="start-card">
            <div>
              <h2>Pronto para jogar?</h2>
              <p>Escolha as cartelas, os jogos (prêmios) e os modos que estão valendo.</p>
            </div>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate('/nova-partida')}>
              <IconBall size={20} />
              Iniciar jogo
            </button>
          </section>
        )}

        {!state.settings.hideInstallTip && (pwa.canInstall || pwa.showIosHint) && (
          <section className="install-card">
            <IconInstall size={28} />
            <div className="install-text">
              <strong>Instale o app no celular</strong>
              {pwa.canInstall ? (
                <span>Abre em tela cheia e funciona mesmo sem internet no ginásio.</span>
              ) : (
                <span>
                  No iPhone ou iPad, toque no botão Compartilhar do Safari e escolha Adicionar à Tela de Início.
                </span>
              )}
            </div>
            <div className="install-actions">
              {pwa.canInstall && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void pwa.install()}>
                  Instalar
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label="Esconder dica de instalação"
                onClick={() => dispatch({ type: 'settings', patch: { hideInstallTip: true } })}
              >
                <IconClose size={18} />
              </button>
            </div>
          </section>
        )}

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Cartelas disponíveis</h2>
              <span className="muted small">{state.cards.length} cartela(s)</span>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')}>
              <IconPlus size={16} />
              Adicionar
            </button>
          </header>

          {state.cards.length === 0 && <p className="empty">Nenhuma cartela cadastrada.</p>}

          <div className="card-list">
            {state.cards.map((card) => (
              <article key={card.id} className="card-item" data-card={card.number || card.id}>
                <div className="card-item-head">
                  <CardName
                    name={card.name}
                    number={card.number}
                    size="lg"
                    onRename={(name) => dispatch({ type: 'card/rename', id: card.id, name })}
                  />
                  {card.number && <span className="card-number-tag">Nº {card.number}</span>}
                </div>
                <div className="card-item-body">
                  <div>
                    <BingoGrid
                      grid={card.games[0].grid}
                      size="sm"
                      label={`Números de ${cardLabel(card.name, card.number)}`}
                    />
                    {!hasSameNumbers(card) && <small className="muted small">Números do 1º jogo</small>}
                  </div>
                  <ul className="prize-list">
                    {card.games.map((g) => {
                      const round = roundOf(g.prizeId);
                      return (
                        <li key={g.id} className={round ? '' : 'is-custom'}>
                          {round > 0 && <span className="chip-round">{round}</span>}
                          {g.name}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="card-item-foot">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(card)}>
                    <IconGrid size={16} />
                    Editar números e jogos
                  </button>
                </div>
              </article>
            ))}
          </div>

          <button type="button" className="add-tile" onClick={() => setEditing('new')}>
            <IconPlus size={20} />
            Adicionar cartela ou jogo avulso
          </button>
        </section>

        <HistoryList history={state.history} onOpen={(m) => navigate(`/historico/${m.id}`)} />

        <section className="panel panel-quiet">
          <header className="panel-head">
            <h2>Preferências e dados</h2>
          </header>
          <div className="pref-row">
            <span className="pref-label">Tema</span>
            <div className="segmented" role="group" aria-label="Tema">
              {(
                [
                  ['auto', 'Automático'],
                  ['light', 'Claro'],
                  ['dark', 'Escuro'],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={state.settings.theme === value ? 'is-on' : ''}
                  aria-pressed={state.settings.theme === value}
                  onClick={() => dispatch({ type: 'settings', patch: { theme: value } })}
                >
                  {value === 'dark' ? <IconMoon size={16} /> : value === 'light' ? <IconSun size={16} /> : null}
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="hint">Automático segue o tema do celular ou do computador.</p>
          <p className="hint">
            Tudo fica salvo automaticamente neste navegador. Use o backup para levar os dados para outro aparelho.
          </p>
          <div className="button-row">
            <button type="button" className="btn btn-ghost" onClick={() => exportState(state)}>
              <IconSave size={18} />
              Exportar backup
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              <IconFile size={18} />
              Importar backup
            </button>
            {pwa.canInstall && (
              <button type="button" className="btn btn-ghost" onClick={() => void pwa.install()}>
                <IconInstall size={18} />
                Instalar app
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importBackup(file);
                e.target.value = '';
              }}
            />
          </div>
        </section>
      </main>

      {editing && (
        <CardEditor
          card={editing === 'new' ? null : editing}
          existingNumbers={state.cards
            .filter((c) => editing === 'new' || c.id !== editing.id)
            .map((c) => c.number)
            .filter(Boolean)}
          onClose={() => setEditing(null)}
          onDelete={removeCard}
          playLabel={active ? 'Salvar e incluir na partida' : 'Salvar e jogar'}
          onSave={(card, intent) => {
            dispatch({ type: 'card/save', card });
            setEditing(null);
            if (intent !== 'play') return;
            if (active) {
              dispatch({ type: 'match/add-games', games: card.games.map((g) => toMatchGame(card, g)) });
              navigate('/partida');
            } else {
              navigate(`/nova-partida/${encodeURIComponent(card.id)}`);
            }
          }}
        />
      )}
    </div>
  );
}

function ActiveMatchCard({
  match,
  onContinue,
  onFinish,
}: {
  match: Match;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const { achievements } = useMemo(() => evaluateMatch(match), [match]);
  const last = match.draws[match.draws.length - 1];
  const cardNames = [...new Map(match.games.map((g) => [g.cardId, g.cardName || g.cardNumber])).values()];
  return (
    <section className="active-card">
      <div className="active-card-top">
        <span className="live-dot" aria-hidden="true" />
        <span className="eyebrow">Partida em andamento</span>
      </div>
      <h2>{match.name}</h2>
      <div className="active-stats">
        <div>
          <strong>{match.draws.length}</strong>
          <span>números</span>
        </div>
        <div>
          <strong>{last ? formatBall(last) : '-'}</strong>
          <span>último</span>
        </div>
        <div>
          <strong>{match.games.length}</strong>
          <span>jogos em {cardNames.length} cartela(s)</span>
        </div>
        <div>
          <strong>{achievements.length}</strong>
          <span>conquista(s)</span>
        </div>
      </div>
      <p className="small">
        Cartelas: {cardNames.join(', ')}
        <br />
        Valendo: {match.modeIds.map((id) => getMode(id)?.name ?? id).join(', ')}
      </p>
      <div className="button-row">
        <button type="button" className="btn btn-gold btn-lg" onClick={onContinue}>
          <IconBall size={20} />
          Continuar partida
        </button>
        <button type="button" className="btn btn-on-dark" onClick={onFinish}>
          <IconFlag size={18} />
          Finalizar
        </button>
      </div>
    </section>
  );
}

function HistoryList({ history, onOpen }: { history: Match[]; onOpen: (m: Match) => void }) {
  if (history.length === 0) return null;
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Partidas finalizadas</h2>
          <span className="muted small">{history.length} no histórico</span>
        </div>
        <IconClock className="muted" />
      </header>
      <ul className="history-list">
        {history.map((m) => (
          <HistoryItem key={m.id} match={m} onOpen={() => onOpen(m)} />
        ))}
      </ul>
    </section>
  );
}

function HistoryItem({ match, onOpen }: { match: Match; onOpen: () => void }) {
  const { achievements } = useMemo(() => evaluateMatch(match), [match]);
  return (
    <li>
      <button type="button" className="history-item" onClick={onOpen}>
        <span className="history-main">
          <strong>{match.name}</strong>
          <small>
            {[
              match.finishedAt ? `Finalizada em ${formatDateTime(match.finishedAt)}` : null,
              `${match.draws.length} números`,
            ]
              .filter(Boolean)
              .join(', ')}
          </small>
        </span>
        {achievements.length > 0 && (
          <span className="badge badge-gold">
            <IconTrophy size={14} />
            {achievements.length}
          </span>
        )}
      </button>
    </li>
  );
}
