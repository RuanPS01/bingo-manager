import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ConfirmProvider } from './components/Dialog';
import { IconBack } from './components/Icons';
import { MatchSetup, type SetupResult } from './components/MatchSetup';
import { STORAGE_KEY, loadState, sanitizeState, saveState } from './lib/storage';
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
    const card = extra.get(g.cardId) ?? {
      id: g.cardId,
      number: g.cardNumber,
      owner: g.owner,
      prizeIds: [],
      grid: g.grid,
    };
    card.prizeIds.push(g.prizeId);
    extra.set(g.cardId, card);
  }
  return [...cards, ...extra.values()];
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [route, navigate] = useHashRoute();
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

  // Rotas que dependem de dados inexistentes voltam para o início.
  const invalidRoute =
    ((route === '/partida' || route === '/partida/editar') && !active) ||
    (route === '/nova-partida' && Boolean(active)) ||
    (route.startsWith('/historico/') && !historyMatch);
  useEffect(() => {
    if (invalidRoute) navigate(route === '/nova-partida' && active ? '/partida' : '/', true);
  }, [invalidRoute, navigate, route, active]);

  let content;
  if (route === '/nova-partida' && !active) {
    content = (
      <SetupPage
        title="Novo jogo"
        onBack={() => navigate('/')}
        cards={state.cards}
        submitLabel="Iniciar jogo"
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
        cards={cardsForEditing(state.cards, active)}
        initial={{ name: active.name, games: active.games, modeIds: active.modeIds }}
        submitLabel="Salvar alterações"
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
  cards: Card[];
  initial?: SetupResult;
  submitLabel: string;
  onSubmit: (r: SetupResult) => void;
}

function SetupPage({ title, onBack, ...rest }: SetupPageProps) {
  return (
    <div className="page setup-page">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="icon-btn icon-btn-dark" onClick={onBack} aria-label="Voltar">
            <IconBack />
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
