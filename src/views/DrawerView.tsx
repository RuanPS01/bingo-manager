import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import { useConfirm } from '../components/Dialog';
import { NumberInput } from '../components/NumberInput';
import { QrCode } from '../components/QrCode';
import {
  IconBroadcast,
  IconClock,
  IconClose,
  IconEraser,
  IconHome,
  IconPause,
  IconProjector,
  IconRestart,
  IconSettings,
} from '../components/Icons';
import { LETTERS, pad2 } from '../lib/bingo';
import { BROKERS, formatCode, receiveLink } from '../lib/broadcast';
import {
  ANIMATION_SPEEDS,
  canSpeak,
  drawerLetter,
  pickBall,
  remainingBalls,
  speak,
  spokenBall,
  usesLetters,
} from '../lib/drawer';
import { playReveal, playTick, unlockAudio } from '../lib/feedback';
import type { Transmitter } from '../lib/useBroadcast';
import { useWakeLock } from '../lib/useWakeLock';
import { syncsWithMatch, type Action } from '../state';
import type { AppState, DrawerConfig } from '../types';

interface DrawerViewProps {
  state: AppState;
  dispatch: Dispatch<Action>;
  navigate: (path: string) => void;
  transmitter: Transmitter;
}

type Phase = 'idle' | 'rolling';

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Tela do sorteador: globo, animação, painel de bolas e modo telão. */
export function DrawerView({ state, dispatch, navigate, transmitter }: DrawerViewProps) {
  const { config, draws } = state.drawer;
  const confirm = useConfirm();
  const [phase, setPhase] = useState<Phase>('idle');
  const [rolling, setRolling] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [projecting, setProjecting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  /** Marca a saída da tela cheia pedida pelo próprio app, para não confundir com a saída pelo navegador. */
  const leavingFullscreen = useRef(false);
  const timers = useRef<number[]>([]);

  useWakeLock(state.settings.keepAwake);

  const last = draws[draws.length - 1] ?? null;
  const remaining = config.maxBall - draws.length;
  const finished = remaining === 0;
  const syncing = syncsWithMatch(state);
  const letters = usesLetters(config);

  const setConfig = (patch: Partial<DrawerConfig>) => dispatch({ type: 'drawer/config', patch });

  const setBroadcast = async (on: boolean) => {
    // avisa quem está recebendo antes de desligar, para a tela deles mostrar que acabou
    if (!on) await transmitter.stop();
    setConfig({ broadcast: on });
  };

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const reveal = useCallback(
    (ball: number) => {
      clearTimers();
      dispatch({ type: 'drawer/draw', ball });
      setRolling(null);
      setPhase('idle');
      if (config.sound) playReveal();
      if (config.voice) speak(spokenBall(ball, config));
    },
    [config, dispatch],
  );

  const draw = useCallback(() => {
    if (phase !== 'idle') return;
    unlockAudio();
    const ball = pickBall(config.maxBall, draws);
    if (ball === null) return;
    const duration = config.animation === 'nenhuma' || prefersReducedMotion() ? 0 : config.animationMs;
    if (duration === 0) {
      reveal(ball);
      return;
    }
    setPhase('rolling');
    if (config.animation === 'simples') {
      // Animação simples: a bola balança sem mostrar números e revela no fim.
      setRolling(null);
      timers.current.push(window.setTimeout(() => reveal(ball), duration));
      return;
    }
    // Globo: os números passam cada vez mais devagar, como a bola parando.
    const pool = remainingBalls(config.maxBall, draws);
    const start = performance.now();
    const step = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= duration) {
        reveal(ball);
        return;
      }
      setRolling(pool[Math.floor(Math.random() * pool.length)]);
      if (config.sound) playTick();
      const progress = elapsed / duration;
      timers.current.push(window.setTimeout(step, 45 + progress * progress * 230));
    };
    step();
  }, [config, draws, phase, reveal]);

  // Sorteio automático: a próxima bola sai depois do intervalo configurado.
  const autoRunning = config.auto && !paused && !finished;
  useEffect(() => {
    if (!autoRunning || phase !== 'idle') return;
    const t = window.setTimeout(draw, config.autoSeconds * 1000);
    return () => window.clearTimeout(t);
  }, [autoRunning, phase, draw, config.autoSeconds, draws.length]);

  const enterProjector = async () => {
    setProjecting(true);
    try {
      if (pageRef.current?.requestFullscreen && !document.fullscreenElement) await pageRef.current.requestFullscreen();
    } catch {
      // Sem tela cheia do navegador (ex.: iPhone): o modo telão ocupa a janela inteira mesmo assim.
    }
  };

  const exitProjector = async () => {
    setProjecting(false);
    if (document.fullscreenElement) {
      leavingFullscreen.current = true;
      await document.exitFullscreen().catch(() => undefined);
    }
  };

  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) return;
      // A saída pedida pelo app pode chegar depois de o telão já ter sido ligado de novo
      // (F duas vezes seguidas); só a saída pelo navegador (Esc, gesto) desliga o telão aqui.
      if (leavingFullscreen.current) leavingFullscreen.current = false;
      else setProjecting(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Atalhos de teclado (úteis com o notebook ligado ao projetor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (document.querySelector('.modal')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (target?.tagName === 'BUTTON' && e.key === 'Enter') return;
        e.preventDefault();
        draw();
      } else if (e.key === 'f' || e.key === 'F') {
        void (projecting ? exitProjector() : enterProjector());
      } else if (e.key === 'Escape' && projecting) {
        void exitProjector();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const reset = async () => {
    const ok = await confirm({
      title: 'Reiniciar o sorteio?',
      message: 'Todas as bolas voltam para o globo. A partida em andamento não é alterada.',
      confirmLabel: 'Reiniciar',
      danger: true,
    });
    if (ok) {
      clearTimers();
      setPhase('idle');
      setRolling(null);
      setPaused(false);
      dispatch({ type: 'drawer/reset' });
    }
  };

  const shown = phase === 'rolling' ? rolling : last;
  const shownLetter = shown ? drawerLetter(shown, config) : null;
  const recent = [...draws].reverse().slice(phase === 'rolling' ? 0 : 1, phase === 'rolling' ? 8 : 9);
  const drawnSet = new Set(draws);
  const ballState = phase === 'rolling' ? 'rolling' : last ? 'shown' : 'idle';

  return (
    <div
      ref={pageRef}
      className={`page drawer-page ${projecting ? 'is-projecting' : ''} anim-${config.animation}`}
      data-testid="sorteador"
    >
      {!projecting && (
        <header className="topbar">
          <div className="topbar-inner">
            <button type="button" className="btn btn-on-dark btn-sm" onClick={() => navigate('/')}>
              <IconHome size={18} />
              Início
            </button>
            <h1>Sorteador</h1>
            <div className="topbar-actions">
              <button
                type="button"
                className={`icon-btn icon-btn-dark ${showSettings ? 'is-on' : ''}`}
                onClick={() => setShowSettings((v) => !v)}
                aria-expanded={showSettings}
                aria-label="Configurações do sorteio"
                title="Configurações"
              >
                <IconSettings />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-dark"
                onClick={() => void enterProjector()}
                aria-label="Modo telão (tela cheia)"
                title="Modo telão (tela cheia)"
              >
                <IconProjector />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={projecting ? 'drawer-projector' : 'container stack'}>
        {!projecting && showSettings && (
          <DrawerSettings
            config={config}
            hasDraws={draws.length > 0}
            hasMatch={Boolean(state.activeMatch)}
            onChange={setConfig}
            onBroadcast={(on) => void setBroadcast(on)}
          />
        )}

        <section className="drawer-stage" aria-label="Bola sorteada">
          <div
            className={`drawer-ball is-${ballState}`}
            data-ball={phase === 'idle' && last ? last : ''}
            data-state={ballState}
            key={phase === 'idle' ? `bola-${last ?? 0}` : 'girando'}
          >
            {phase === 'rolling' && config.animation === 'simples' ? (
              <span className="drawer-ball-number">?</span>
            ) : shown ? (
              <>
                {shownLetter && <span className="drawer-ball-letter">{shownLetter}</span>}
                <span className="drawer-ball-number">{shown}</span>
              </>
            ) : (
              <span className="drawer-ball-empty">Pronto</span>
            )}
          </div>
          <p className="drawer-count" aria-live="polite">
            {finished
              ? `Todas as ${config.maxBall} bolas foram sorteadas.`
              : draws.length === 0
                ? `${config.maxBall} bolas no globo.`
                : `Bola ${draws.length} de ${config.maxBall}. Restam ${remaining}.`}
          </p>

          <div className="drawer-controls">
            <button
              type="button"
              className="btn btn-gold btn-lg drawer-draw"
              onClick={draw}
              disabled={phase !== 'idle' || finished}
            >
              {phase === 'rolling' ? 'Sorteando...' : 'Sortear'}
            </button>
            {config.auto && !finished && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPaused((p) => !p)}
                aria-pressed={paused}
              >
                {paused ? <IconClock size={18} /> : <IconPause size={18} />}
                {paused ? 'Continuar automático' : 'Pausar automático'}
              </button>
            )}
            {projecting ? (
              <button type="button" className="btn btn-on-dark" onClick={() => void exitProjector()}>
                <IconClose size={18} />
                Sair do telão
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => dispatch({ type: 'drawer/undo' })}
                  disabled={!last || phase !== 'idle'}
                >
                  <IconEraser size={18} />
                  Desfazer
                </button>
                <button type="button" className="btn btn-ghost" onClick={reset} disabled={!last}>
                  <IconRestart size={18} />
                  Reiniciar
                </button>
              </>
            )}
          </div>

          {autoRunning && phase === 'idle' && (
            <div className="drawer-auto" aria-label={`Próxima bola em ${config.autoSeconds} segundos`}>
              <span
                className="drawer-auto-bar"
                key={draws.length}
                style={{ animationDuration: `${config.autoSeconds}s` }}
              />
            </div>
          )}

          {!projecting && (
            <p className="hint drawer-hint">
              Atalhos: Espaço ou Enter sorteia, F liga o modo telão.
              {syncing && state.activeMatch && ` Marcando também na partida "${state.activeMatch.name}".`}
            </p>
          )}
        </section>

        {config.broadcast && (
          <BroadcastPanel transmitter={transmitter} projecting={projecting} onStop={() => void setBroadcast(false)} />
        )}

        {recent.length > 0 && (
          <section className={projecting ? 'drawer-recent' : 'panel drawer-recent'} aria-label="Últimas bolas">
            {!projecting && <h2>Últimas bolas</h2>}
            <div className="drawer-recent-list">
              {recent.map((n) => (
                <span key={n} className="drawer-mini-ball" data-ball={n}>
                  {drawerLetter(n, config) && <small>{drawerLetter(n, config)}</small>}
                  {n}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className={projecting ? 'drawer-board-wrap' : 'panel drawer-board-wrap'} aria-label="Painel de bolas">
          {!projecting && (
            <header className="panel-head">
              <h2>Painel</h2>
              <span className="muted small">
                {draws.length} de {config.maxBall}
              </span>
            </header>
          )}
          <div
            className={`drawer-board ${letters ? 'has-letters' : ''}`}
            style={{ ['--cols' as string]: letters ? 15 : 10 }}
          >
            {letters
              ? LETTERS.map((letter, c) => (
                  <div className="drawer-board-row" key={letter}>
                    <span className="drawer-board-letter">{letter}</span>
                    {Array.from({ length: 15 }, (_, i) => c * 15 + i + 1).map((n) => (
                      <BoardCell key={n} n={n} drawn={drawnSet.has(n)} isLast={phase === 'idle' && n === last} />
                    ))}
                  </div>
                ))
              : Array.from({ length: config.maxBall }, (_, i) => i + 1).map((n) => (
                  <BoardCell key={n} n={n} drawn={drawnSet.has(n)} isLast={phase === 'idle' && n === last} />
                ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function BoardCell({ n, drawn, isLast }: { n: number; drawn: boolean; isLast: boolean }) {
  return (
    <span
      className={`drawer-cell ${drawn ? 'is-drawn' : ''} ${isLast ? 'is-last' : ''}`}
      data-ball={n}
      aria-label={`${n}${drawn ? ', sorteada' : ''}`}
    >
      {pad2(n)}
    </span>
  );
}

interface DrawerSettingsProps {
  config: DrawerConfig;
  hasDraws: boolean;
  hasMatch: boolean;
  onChange: (patch: Partial<DrawerConfig>) => void;
  onBroadcast: (on: boolean) => void;
}

function DrawerSettings({ config, hasDraws, hasMatch, onChange, onBroadcast }: DrawerSettingsProps) {
  const preset = config.maxBall === 75 ? 75 : config.maxBall === 90 ? 90 : 0;
  return (
    <section className="panel drawer-settings" aria-label="Configurações do sorteio">
      <header className="panel-head">
        <h2>Configurações</h2>
      </header>

      <div className="setting">
        <span className="setting-label">Bolas no globo</span>
        <div className="segmented" role="group" aria-label="Bolas no globo">
          {[
            [75, '75 (B I N G O)'],
            [90, '90'],
            [0, 'Outro'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={preset === value ? 'is-on' : ''}
              aria-pressed={preset === value}
              disabled={hasDraws}
              onClick={() => onChange({ maxBall: value === 0 ? (preset === 0 ? config.maxBall : 50) : Number(value) })}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 0 && (
          <label className="setting-inline">
            <span>Maior número</span>
            <NumberInput
              min={10}
              max={99}
              value={config.maxBall}
              disabled={hasDraws}
              onChange={(maxBall) => onChange({ maxBall })}
            />
          </label>
        )}
        {hasDraws && <small className="muted">Reinicie o sorteio para mudar a quantidade de bolas.</small>}
      </div>

      {config.maxBall === 75 && (
        <label className="check-line">
          <input
            type="checkbox"
            checked={config.showLetters}
            onChange={(e) => onChange({ showLetters: e.target.checked })}
          />
          <span>Mostrar a letra (B, I, N, G, O) junto do número</span>
        </label>
      )}

      <div className="setting">
        <span className="setting-label">Animação</span>
        <div className="segmented" role="group" aria-label="Animação">
          {(
            [
              ['globo', 'Globo'],
              ['simples', 'Simples'],
              ['nenhuma', 'Sem animação'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={config.animation === value ? 'is-on' : ''}
              aria-pressed={config.animation === value}
              onClick={() => onChange({ animation: value })}
            >
              {label}
            </button>
          ))}
        </div>
        {config.animation !== 'nenhuma' && (
          <div className="segmented" role="group" aria-label="Duração da animação">
            {ANIMATION_SPEEDS.map((s) => (
              <button
                type="button"
                key={s.ms}
                className={config.animationMs === s.ms ? 'is-on' : ''}
                aria-pressed={config.animationMs === s.ms}
                onClick={() => onChange({ animationMs: s.ms })}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="setting">
        <label className="check-line">
          <input type="checkbox" checked={config.auto} onChange={(e) => onChange({ auto: e.target.checked })} />
          <span>Sortear automaticamente</span>
        </label>
        {config.auto && (
          <label className="setting-inline">
            <span>A cada</span>
            <NumberInput
              min={3}
              max={120}
              value={config.autoSeconds}
              onChange={(autoSeconds) => onChange({ autoSeconds })}
            />
            <span>segundos</span>
          </label>
        )}
      </div>

      <label className="check-line">
        <input
          type="checkbox"
          checked={config.voice}
          disabled={!canSpeak()}
          onChange={(e) => onChange({ voice: e.target.checked })}
        />
        <span>Anunciar o número por voz{canSpeak() ? '' : ' (não disponível neste navegador)'}</span>
      </label>

      <label className="check-line">
        <input type="checkbox" checked={config.sound} onChange={(e) => onChange({ sound: e.target.checked })} />
        <span>Efeitos sonoros</span>
      </label>

      <label className="check-line">
        <input
          type="checkbox"
          checked={config.syncMatch}
          disabled={config.maxBall > 75}
          onChange={(e) => onChange({ syncMatch: e.target.checked })}
        />
        <span>
          Marcar também na partida em andamento
          {config.maxBall > 75
            ? ' (só no bingo de até 75 bolas)'
            : hasMatch
              ? ''
              : ' (nenhuma partida em andamento agora)'}
        </span>
      </label>

      <label className="check-line">
        <input type="checkbox" checked={config.broadcast} onChange={(e) => onBroadcast(e.target.checked)} />
        <span>Transmitir os números para os celulares dos participantes (precisa de internet)</span>
      </label>
    </section>
  );
}

function connectionText({ connected, total }: { connected: number; total: number }): string {
  if (connected === total) return 'Transmitindo';
  if (connected > 0) return `Transmitindo por ${connected} de ${total} servidores`;
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'Sem internet' : 'Conectando...';
}

/** Código, QR code e link para os participantes receberem os números no celular. */
function BroadcastPanel({
  transmitter,
  projecting,
  onStop,
}: {
  transmitter: Transmitter;
  projecting: boolean;
  onStop: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { code } = transmitter;
  const link = code ? receiveLink(code) : '';
  const state = transmitter.connected > 0 ? 'on' : 'off';

  if (projecting) {
    if (!code) return null;
    return (
      <section className="drawer-broadcast" aria-label="Receber os números no celular">
        <QrCode text={link} label={`QR code para receber os números, código ${formatCode(code)}`} />
        <div>
          <span>Acompanhe no celular</span>
          <strong className="broadcast-code">{formatCode(code)}</strong>
        </div>
      </section>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="panel broadcast-panel" aria-label="Transmissão para os participantes">
      <header className="panel-head">
        <h2>
          <IconBroadcast size={20} />
          Transmissão para os participantes
        </h2>
        <span className={`connection-badge is-${state}`} role="status" data-connected={transmitter.connected}>
          {connectionText(transmitter)}
        </span>
      </header>
      {code ? (
        <div className="broadcast-body">
          <QrCode text={link} label={`QR code para receber os números, código ${formatCode(code)}`} />
          <div className="broadcast-info">
            <span className="muted small">Código do sorteio</span>
            <strong className="broadcast-code" data-code={code}>
              {formatCode(code)}
            </strong>
            <p className="hint">
              Quem joga lê o QR code com a câmera do celular, ou abre a partida no Bingo Manager, toca em Receber do
              sorteador e digita o código. Cada bola sorteada aqui é marcada na hora nas cartelas deles.
            </p>
            <div className="button-row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
                {copied ? 'Link copiado' : 'Copiar link'}
              </button>
              {typeof navigator.share === 'function' && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    void navigator
                      .share({ title: 'Bingo Manager', text: 'Receba os números do sorteio no celular', url: link })
                      .catch(() => undefined)
                  }
                >
                  Compartilhar
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-danger-text btn-sm" onClick={onStop}>
                Parar transmissão
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="hint">Preparando o código...</p>
      )}
      <p className="hint">
        Os números passam por servidores públicos gratuitos ({BROKERS.map((b) => b.name).join(' e ')}), sem cadastro. As
        mensagens saem assinadas por este aparelho: ninguém consegue mandar números falsos com este código. O código é o
        mesmo nos próximos sorteios.
      </p>
    </section>
  );
}
