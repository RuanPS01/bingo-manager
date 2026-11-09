import { useEffect, useRef, useState } from 'react';
import { FREE } from '../data/constants';
import { describeSettings, loadAiSettings, type AiSettings as AiSettingsData } from '../lib/ai/models';
import { ScanError, prepareImage, readCardPhoto, type ScanResult } from '../lib/ai/scan';
import { LETTERS, columnRange, validateGrid } from '../lib/bingo';
import { hasSameNumbers, parseGridText } from '../lib/cards';
import { newId } from '../state';
import type { Card, CardGame } from '../types';
import { AiSettings } from './AiSettings';
import { Modal } from './Dialog';
import { IconCamera, IconPlus, IconSettings, IconStar, IconTrash } from './Icons';

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
  name: string;
  cells: string[];
}

const emptyCells = () => Array.from({ length: 25 }, (_, i) => (i === 12 ? String(FREE) : ''));
const toCells = (grid: number[]) => grid.map((n, i) => (i === 12 ? String(FREE) : String(n)));
const toValues = (cells: string[]) => cells.map((v, i) => (i === 12 ? FREE : v === '' ? null : Number(v)));

function fromCard(card: Card): EditorGame[] {
  return card.games.map((g) => ({ id: g.id, name: g.name, cells: toCells(g.grid) }));
}

const newGame = (index: number, cells: string[]): EditorGame => ({
  id: newId('jogo'),
  name: `Jogo ${index}`,
  cells: [...cells],
});

/** Formulário para cadastrar ou editar uma cartela e seus jogos. */
export function CardEditor({ card, existingNumbers, onSave, onDelete, onClose, playLabel }: CardEditorProps) {
  const [number, setNumber] = useState(card?.number ?? '');
  const [name, setName] = useState(card?.name ?? '');
  const [games, setGames] = useState<EditorGame[]>(() => (card ? fromCard(card) : [newGame(1, emptyCells())]));
  const [same, setSame] = useState(card ? hasSameNumbers(card) : true);
  const [shared, setShared] = useState<string[]>(() => (card ? toCells(card.games[0].grid) : emptyCells()));
  const [activeId, setActiveId] = useState<string | null>(games[0]?.id ?? null);
  const [submitted, setSubmitted] = useState(false);
  const scan = usePhotoScan((result) => applyScan(result));

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
  const namesError = games.some((g) => !g.name.trim()) ? 'Dê um nome a cada jogo' : null;
  const invalidGames = games.filter((g) => (gridErrors.get(g.id)?.size ?? 0) > 0);
  const valid = !identityError && !namesError && invalidGames.length === 0;

  /** Troca a lista de jogos. Com um jogo só, volta a usar uma grade única. */
  const replaceGames = (next: EditorGame[]) => {
    if (next.length <= 1 && !same) {
      if (next[0]) setShared([...next[0].cells]);
      setSame(true);
    }
    setGames(next);
    if (!next.some((g) => g.id === activeId)) setActiveId(next[0]?.id ?? null);
  };

  const addGame = () => {
    const game = newGame(games.length + 1, sharedMode ? shared : emptyCells());
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

  /** Coloca no formulário o que a IA leu. A pessoa confere e corrige antes de salvar. */
  const applyScan = (result: ScanResult) => {
    if (result.number) setNumber(result.number);
    if (result.name && !name.trim()) setName(result.name);
    const next = result.games.map((g, i) => ({
      // reaproveita os ids ao reler uma cartela já salva, para a partida em andamento continuar ligada a ela
      id: games[i]?.id ?? newId('jogo'),
      name: g.name || `Jogo ${i + 1}`,
      cells: g.grid.map((v, cell) => (cell === 12 ? String(FREE) : v === null ? '' : String(v))),
    }));
    const allSame = next.every((g) => g.cells.join() === next[0].cells.join());
    setShared([...next[0].cells]);
    setSame(allSame);
    setGames(next);
    setActiveId(next[0].id);
    // já mostra as casas que a IA não conseguiu ler ou que estão fora da faixa da coluna
    setSubmitted(true);
  };

  const currentCells = active ? cellsOf(active) : shared;
  const currentErrors = active ? (gridErrors.get(active.id) ?? new Map<number, string>()) : new Map<number, string>();

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={card ? `Editar ${card.name || `cartela ${card.number}`}` : 'Adicionar cartela'}
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
          <PhotoScanBox scan={scan} />
          <div className="form-row">
            <label className="field">
              <span>Nome da cartela</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Ana"
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
                placeholder="Ex.: 0001"
              />
            </label>
          </div>
          {submitted && identityError && <p className="field-error form-error">{identityError}</p>}

          <fieldset className="field">
            <legend>Jogos desta cartela</legend>
            <p className="hint">Uma cartela pode ter vários jogos (por exemplo, um para cada rodada ou prêmio).</p>
            <ul className="custom-games">
              {games.map((g, i) => (
                <li key={g.id}>
                  <span className="chip-round">{i + 1}</span>
                  <input
                    value={g.name}
                    onChange={(e) => updateGame(g.id, { name: e.target.value })}
                    maxLength={40}
                    placeholder="Ex.: Rodada 1"
                    aria-label={`Nome do jogo ${i + 1}`}
                    className={submitted && !g.name.trim() ? 'has-error' : ''}
                  />
                  {multi && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeGame(g.id)}
                      aria-label={`Remover o jogo ${g.name || i + 1}`}
                    >
                      <IconTrash size={18} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost btn-sm add-custom" onClick={addGame}>
              <IconPlus size={16} />
              Adicionar jogo
            </button>
            {submitted && namesError && <small className="field-error">{namesError}</small>}
          </fieldset>

          <fieldset className="field">
            <legend>Números</legend>
            {multi && (
              <label className="check-line">
                <input type="checkbox" checked={same} onChange={(e) => changeSame(e.target.checked)} />
                <span>Mesmos números em todos os jogos</span>
              </label>
            )}
            {!sharedMode && (
              <div className="game-tabs" role="tablist" aria-label="Jogo que está sendo editado">
                {games.map((g, i) => {
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
                      <span className="chip-round">{i + 1}</span>
                      {g.name || `Jogo ${i + 1}`}
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
      {/* fora do Modal do editor: uma janela dentro da outra herdaria a animação e a posição dela */}
      {scan.settingsOpen && (
        <AiSettings
          settings={scan.config}
          intro={
            scan.config ? undefined : 'Para ler a cartela pela foto, configure o provedor, o modelo e a chave da API.'
          }
          onClose={scan.closeSettings}
          onSave={scan.settingsSaved}
        />
      )}
    </>
  );
}

type ScanStatus =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'done'; games: number; warnings: string[] }
  | { kind: 'error'; message: string; settings: boolean; warnings: string[] };

/** Estado da leitura por foto: configuração da IA, escolha da foto, envio e resultado. */
function usePhotoScan(onResult: (result: ScanResult) => void) {
  const [config, setConfig] = useState<AiSettingsData | null>(() => loadAiSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<ScanStatus>({ kind: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // fechar o editor no meio da leitura cancela o envio
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = () => {
    if (!config) setSettingsOpen(true);
    else fileRef.current?.click();
  };

  const read = async (file: File, cfg: AiSettingsData) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPreview(URL.createObjectURL(file));
    setStatus({ kind: 'reading' });
    try {
      const image = await prepareImage(file);
      const result = await readCardPhoto(image, cfg, controller.signal);
      if (controller.signal.aborted) return;
      if (result.games.length === 0) {
        setStatus({
          kind: 'error',
          message:
            'Não encontrei nenhuma tabela de bingo na foto. Tente uma foto mais de perto, com a cartela inteira.',
          settings: false,
          warnings: result.warnings,
        });
        return;
      }
      onResultRef.current(result);
      setStatus({ kind: 'done', games: result.games.length, warnings: result.warnings });
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus({ kind: 'idle' });
        return;
      }
      const e = error instanceof ScanError ? error : new ScanError('Não foi possível ler a foto. Tente de novo.');
      setStatus({ kind: 'error', message: e.message, settings: e.settings, warnings: [] });
    }
  };

  return {
    config,
    settingsOpen,
    status,
    preview,
    fileRef,
    pick,
    cancel: () => {
      abortRef.current?.abort();
      setStatus({ kind: 'idle' });
    },
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    settingsSaved: (next: AiSettingsData | null) => {
      const firstTime = !config;
      setConfig(next);
      setSettingsOpen(false);
      if (next && status.kind === 'error' && status.settings) setStatus({ kind: 'idle' });
      // ainda dentro do toque em Salvar, então o navegador deixa abrir a escolha da foto
      if (next && firstTime) fileRef.current?.click();
    },
    onFile: (file: File | undefined) => {
      if (file && config) void read(file, config);
    },
  };
}

function PhotoScanBox({ scan }: { scan: ReturnType<typeof usePhotoScan> }) {
  const { status } = scan;
  const warnings = status.kind === 'done' || status.kind === 'error' ? status.warnings : [];
  return (
    <section className="photo-scan" aria-label="Ler cartela pela foto">
      <div className="photo-scan-head">
        {scan.preview && status.kind !== 'idle' && <img className="photo-scan-thumb" src={scan.preview} alt="" />}
        <div className="photo-scan-text">
          <strong>Ler pela foto com IA</strong>
          <span className="muted small">
            {scan.config
              ? `Tire ou escolha uma foto da cartela. Usando ${describeSettings(scan.config)}.`
              : 'Tire ou escolha uma foto da cartela e a IA preenche os números.'}
          </span>
        </div>
      </div>
      <div className="photo-scan-actions">
        {status.kind === 'reading' ? (
          <>
            <span className="photo-scan-status" role="status">
              <span className="spinner" aria-hidden="true" />
              Lendo a cartela...
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={scan.cancel}>
              Cancelar leitura
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={scan.pick}>
              <IconCamera size={18} />
              {status.kind === 'idle' ? 'Tirar ou escolher foto' : 'Ler outra foto'}
            </button>
            {scan.config && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={scan.openSettings}>
                <IconSettings size={16} />
                Configurar IA
              </button>
            )}
          </>
        )}
      </div>
      {status.kind === 'done' && (
        <p className="notice-inline" role="status">
          Li {status.games} jogo(s) da foto. Confira os números com a cartela antes de salvar.
        </p>
      )}
      {status.kind === 'error' && (
        <p className="field-error" role="alert">
          {status.message}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="photo-scan-warnings" aria-label="Avisos da leitura">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <input
        ref={scan.fileRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="Foto da cartela"
        onChange={(e) => {
          scan.onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </section>
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
