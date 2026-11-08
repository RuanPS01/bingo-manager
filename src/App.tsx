import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ConfirmProvider } from './components/Dialog';
import { IconHome } from './components/Icons';
import { MatchSetup, type SetupResult } from './components/MatchSetup';
import { DEFAULT_MODE_IDS } from './data/modes';
import { toMatchGame } from './lib/cards';
import { STORAGE_KEY, loadState, sanitizeState, saveState } from './lib/storage';
import { useTheme } from './lib/useTheme';
import { reducer } from './state';
import type { Card, Match } from './types';
import { HomeView } from './views/HomeView';
import { MatchView } from './views/MatchView';

function readRoute(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.startsWith('/') ? hash : '/';
}

/** Roteamento simples por hash, para o botão Voltar do celular funcionar. */
function useHashRoute(): [string, (path: string, replace?: boolean) => void] {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);
  const navigate = useCallback((path: string, replace = false) => {
    if (replace) {
      window.history.replaceState(null, '', `#${path}`);
    } else {
      window.location.hash = path;
    }
    // Atualiza na mesma renderização das mudanças de estado, sem esperar o evento hashchange.
    setRoute(path);
  }, []);
  return [route, navigate];
}

/** Cartelas atuais mais as cartelas de jogos da partida que já foram excluídas. */
function cardsForEditing(cards: Card[], match: Match): Card[] {
  const known = new Set(cards.map((c) => c.id));
  const extra = new Map<string, Card>();
  for (const g of match.games) {
    if (known.has(g.cardId)) continue;
    const card = extra.get(g.cardId) ?? { id: g.cardId, number: g.cardNumber, name: g.cardName, games: [] };
    card.games.push({ id: g.gameId, prizeId: g.prizeId, name: g.gameName, grid: g.grid });
    extra.set(g.cardId, card);
  }
  return [...cards, ...extra.values()];
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [route, navigate] = useHashRoute();
  const theme = useTheme(state.settings.theme);
  const [storageFailed, setStorageFailed] = useState(false);
  const skipSave = useRef(false);

  // Salva tudo no localStorage a cada alteração.
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setStorageFailed(!saveState(state));
  }, [state]);

  // Mantém várias abas abertas sincronizadas.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = sanitizeState(JSON.parse(e.newValue));
        if (next) {
          skipSave.current = true;
          dispatch({ type: 'replace', state: next });
        }
      } catch {
        // ignora conteúdo inválido
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const active = state.activeMatch;
  const historyMatch = useMemo(() => {
    const m = route.match(/^\/historico\/(.+)$/);
    return m ? (state.history.find((h) => h.id === decodeURIComponent(m[1])) ?? null) : null;
  }, [route, state.history]);

  // Nova partida, opcionalmente já com os jogos de uma cartela selecionados (#/nova-partida/<id>).
  const newMatchRoute = route.match(/^\/nova-partida(?:\/(.+))?$/);
  const preselected = newMatchRoute?.[1]
    ? state.cards.find((c) => c.id === decodeURIComponent(newMatchRoute[1]))
    : undefined;

  // Rotas que dependem de dados inexistentes voltam para o início.
  const invalidRoute =
    ((route === '/partida' || route === '/partida/editar') && !active) ||
    (Boolean(newMatchRoute) && Boolean(active)) ||
    (route.startsWith('/historico/') && !historyMatch);
  useEffect(() => {
    if (invalidRoute) navigate(route.startsWith('/nova-partida') && active ? '/partida' : '/', true);
  }, [invalidRoute, navigate, route, active]);

  const saveCard = (card: Card) => dispatch({ type: 'card/save', card });

  let content;
  if (newMatchRoute && !active) {
    content = (
      <SetupPage
        key={route}
        title="Novo jogo"
        onBack={() => navigate('/')}
        backLabel="Início"
        cards={state.cards}
        initial={
          preselected
            ? { name: '', games: preselected.games.map((g) => toMatchGame(preselected, g)), modeIds: DEFAULT_MODE_IDS }
            : undefined
        }
        submitLabel="Iniciar jogo"
        onSaveCard={saveCard}
        onSubmit={(r) => {
          dispatch({ type: 'match/start', ...r });
          navigate('/partida', true);
        }}
      />
    );
  } else if (route === '/partida/editar' && active) {
    content = (
      <SetupPage
        title="Editar partida"
        onBack={() => navigate('/partida')}
        backLabel="Cancelar"
        cards={cardsForEditing(state.cards, active)}
        initial={{ name: active.name, games: active.games, modeIds: active.modeIds }}
        submitLabel="Salvar alterações"
        onSaveCard={saveCard}
        onSubmit={(r) => {
          dispatch({ type: 'match/update', ...r });
          navigate('/partida', true);
        }}
      />
    );
  } else if (route === '/partida' && active) {
    content = (
      <MatchView
        key={active.id}
        match={active}
        readOnly={false}
        settings={state.settings}
        canReopen={false}
        cards={state.cards}
        theme={theme}
        dispatch={dispatch}
        navigate={navigate}
      />
    );
  } else if (historyMatch) {
    content = (
      <MatchView
        key={historyMatch.id}
        match={historyMatch}
        readOnly
        settings={state.settings}
        canReopen={!active}
        cards={state.cards}
        theme={theme}
        dispatch={dispatch}
        navigate={navigate}
      />
    );
  } else {
    content = <HomeView state={state} dispatch={dispatch} navigate={navigate} />;
  }

  return (
    <ConfirmProvider>
      {storageFailed && (
        <div className="storage-warning" role="alert">
          Não foi possível salvar no armazenamento do navegador. Verifique se a navegação anônima está desativada.
        </div>
      )}
      {content}
    </ConfirmProvider>
  );
}

interface SetupPageProps {
  title: string;
  onBack: () => void;
  backLabel: string;
  cards: Card[];
  initial?: SetupResult;
  submitLabel: string;
  onSubmit: (r: SetupResult) => void;
  onSaveCard: (card: Card) => void;
}

function SetupPage({ title, onBack, backLabel, ...rest }: SetupPageProps) {
  return (
    <div className="page setup-page">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="btn btn-on-dark btn-sm" onClick={onBack}>
            {backLabel === 'Início' && <IconHome size={18} />}
            {backLabel}
          </button>
          <h1>{title}</h1>
        </div>
      </header>
      <main className="container">
        <MatchSetup {...rest} />
      </main>
    </div>
  );
}
