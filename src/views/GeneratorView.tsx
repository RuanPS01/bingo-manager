import { useEffect, useMemo, useState, type Dispatch } from 'react';
import { useConfirm } from '../components/Dialog';
import { IconFile, IconHome, IconPlus, IconRestart, IconSave } from '../components/Icons';
import { NumberInput } from '../components/NumberInput';
import { PrintPreview } from '../components/PrintPreview';
import { cardsToCsv, generateCards, type GeneratedCard } from '../lib/cardgen';
import { downloadBlob } from '../lib/download';
import { renderPdf } from '../lib/pdf';
import { MIN_CELL_MM, PAPERS, cellSizeMm, layoutPages, perPageOptions } from '../lib/printLayout';
import { newId, type Action } from '../state';
import type { AppState, Card, GeneratorConfig } from '../types';

interface GeneratorViewProps {
  state: AppState;
  dispatch: Dispatch<Action>;
  navigate: (path: string) => void;
}

const COLORS = ['#1d4fa8', '#1c6e3a', '#b42318', '#7a2fb3', '#c2410c', '#142037'];
const COLOR_NAMES: Record<string, string> = {
  '#1d4fa8': 'Azul',
  '#1c6e3a': 'Verde',
  '#b42318': 'Vermelho',
  '#7a2fb3': 'Roxo',
  '#c2410c': 'Laranja',
  '#142037': 'Preto',
};
const MAX_QUANTITY = 1000;

/** Nome do arquivo a partir do título (sem acentos nem espaços). */
function fileBase(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'bingo';
}

/** Tela do gerador de cartelas em PDF. */
export function GeneratorView({ state, dispatch, navigate }: GeneratorViewProps) {
  const config = state.generator;
  const confirm = useConfirm();
  const set = (patch: Partial<GeneratorConfig>) => dispatch({ type: 'generator/config', patch });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Os números só são sorteados de novo quando muda algo que altera as tabelas,
  // para a prévia, o PDF e a lista de conferência serem sempre do mesmo lote.
  const numbersKey = [
    config.kind,
    config.quantity,
    config.gamesPerCard,
    config.sameNumbers,
    config.freeCenter,
    config.sortColumns,
    config.startNumber,
  ].join('|');
  const [cards, setCards] = useState<GeneratedCard[]>(() => generateCards(config));
  const [batch, setBatch] = useState(0);
  useEffect(() => {
    setCards(generateCards(state.generator));
    // de propósito só numbersKey e batch: título, cor e nomes não devem trocar os números
  }, [numbersKey, batch]);

  // Nomes dos jogos e textos mudam só a impressão, não os números.
  const named = useMemo(
    () =>
      cards.map((c) => ({
        ...c,
        games: c.games.map((g, i) => ({ ...g, name: (config.gameNames[i] ?? g.name).trim() })),
      })),
    [cards, config.gameNames],
  );
  const pages = useMemo(() => layoutPages(config, named), [config, named]);
  const cell = cellSizeMm(config);
  const tooSmall = cell < MIN_CELL_MM;
  const unit = config.kind === 'avulsos' ? 'jogo(s) avulso(s)' : 'cartela(s)';
  const perPageList = perPageOptions(config.kind);

  const changeKind = (kind: GeneratorConfig['kind']) => {
    const options = perPageOptions(kind);
    set({ kind, perPage: options.includes(config.perPage) ? config.perPage : options[options.length > 3 ? 2 : 1] });
  };

  const downloadPdf = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const buffer = await renderPdf(pages, { title: config.title || 'Bingo' });
      downloadBlob(new Blob([buffer], { type: 'application/pdf' }), `${fileBase(config.title)}-cartelas.pdf`);
      setNotice(`PDF gerado com ${named.length} ${unit} em ${pages.length} página(s).`);
    } catch {
      setNotice('Não foi possível gerar o PDF. Tente de novo com menos cartelas.');
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = () => {
    // BOM para o Excel reconhecer os acentos em UTF-8
    downloadBlob(
      new Blob(['﻿', cardsToCsv(named)], { type: 'text/csv;charset=utf-8' }),
      `${fileBase(config.title)}-conferencia.csv`,
    );
  };

  const addToMyCards = async () => {
    if (named.length > 50) {
      const ok = await confirm({
        title: `Adicionar ${named.length} ${unit}?`,
        message: 'Elas aparecem em Minhas cartelas e podem ser usadas para acompanhar a partida.',
        confirmLabel: 'Adicionar',
      });
      if (!ok) return;
    }
    const existing = new Set(state.cards.map((c) => c.number));
    let added = 0;
    for (const generated of named) {
      if (existing.has(generated.number)) continue;
      const card: Card = {
        id: newId('cartela'),
        number: generated.number,
        name: '',
        games: generated.games.map((g, i) => ({
          id: `jogo-${i + 1}`,
          name: g.name || `Jogo ${i + 1}`,
          grid: [...g.grid],
        })),
      };
      dispatch({ type: 'card/save', card });
      added++;
    }
    setNotice(
      added === named.length
        ? `${added} ${unit} adicionada(s) em Minhas cartelas.`
        : `${added} adicionada(s). ${named.length - added} já existiam com o mesmo número.`,
    );
  };

  return (
    <div className="page generator-page">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="btn btn-on-dark btn-sm" onClick={() => navigate('/')}>
            <IconHome size={18} />
            Início
          </button>
          <h1>Gerador de cartelas</h1>
        </div>
      </header>

      <main className="container generator-layout">
        <div className="generator-form stack">
          <section className="panel">
            <header className="panel-head">
              <h2>O que gerar</h2>
            </header>
            <div className="segmented segmented-block" role="group" aria-label="Tipo">
              <button
                type="button"
                className={config.kind === 'cartelas' ? 'is-on' : ''}
                aria-pressed={config.kind === 'cartelas'}
                onClick={() => changeKind('cartelas')}
              >
                Cartelas com vários jogos
              </button>
              <button
                type="button"
                className={config.kind === 'avulsos' ? 'is-on' : ''}
                aria-pressed={config.kind === 'avulsos'}
                onClick={() => changeKind('avulsos')}
              >
                Jogos avulsos
              </button>
            </div>
            <p className="hint">
              {config.kind === 'cartelas'
                ? 'Cada cartela tem um ou mais jogos (por exemplo, um para cada rodada ou prêmio) e um número próprio.'
                : 'Cada jogo avulso é uma tabela sozinha, com número próprio. Várias cabem na mesma folha, para recortar.'}
            </p>
            <div className="form-row">
              <label className="field">
                <span>Quantidade de {config.kind === 'cartelas' ? 'cartelas' : 'jogos avulsos'}</span>
                <NumberInput
                  min={1}
                  max={MAX_QUANTITY}
                  value={config.quantity}
                  onChange={(quantity) => set({ quantity })}
                />
              </label>
              <label className="field">
                <span>Numeração a partir de</span>
                <NumberInput
                  min={0}
                  max={999999}
                  value={config.startNumber}
                  onChange={(startNumber) => set({ startNumber })}
                />
              </label>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Textos</h2>
            </header>
            <label className="field">
              <span>Título</span>
              <input
                value={config.title}
                maxLength={60}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Ex.: Bingo da Escola"
              />
            </label>
            <label className="field">
              <span>Subtítulo (opcional)</span>
              <input
                value={config.subtitle}
                maxLength={90}
                onChange={(e) => set({ subtitle: e.target.value })}
                placeholder="Ex.: Sábado, 20h, no salão paroquial"
              />
            </label>
            <label className="field">
              <span>Rodapé (opcional)</span>
              <input
                value={config.footer}
                maxLength={120}
                onChange={(e) => set({ footer: e.target.value })}
                placeholder="Ex.: Valor R$ 10,00. Boa sorte!"
              />
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={config.identification}
                onChange={(e) => set({ identification: e.target.checked })}
              />
              <span>Linhas para nome{config.kind === 'cartelas' ? ' e telefone' : ''} de quem comprou</span>
            </label>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Jogos</h2>
            </header>
            {config.kind === 'cartelas' ? (
              <>
                <div className="setting">
                  <span className="setting-label">Jogos por cartela</span>
                  <div className="segmented" role="group" aria-label="Jogos por cartela">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button
                        type="button"
                        key={n}
                        className={config.gamesPerCard === n ? 'is-on' : ''}
                        aria-pressed={config.gamesPerCard === n}
                        onClick={() => set({ gamesPerCard: n })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="custom-games">
                  {Array.from({ length: config.gamesPerCard }, (_, i) => (
                    <li key={i}>
                      <span className="chip-round">{i + 1}</span>
                      <input
                        value={config.gameNames[i] ?? ''}
                        maxLength={40}
                        aria-label={`Nome do jogo ${i + 1}`}
                        placeholder={`Ex.: Rodada ${i + 1}`}
                        onChange={(e) => {
                          const names = [...config.gameNames];
                          names[i] = e.target.value;
                          set({ gameNames: names });
                        }}
                      />
                    </li>
                  ))}
                </ul>
                {config.gamesPerCard > 1 && (
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={config.sameNumbers}
                      onChange={(e) => set({ sameNumbers: e.target.checked })}
                    />
                    <span>Mesmos números em todos os jogos da cartela</span>
                  </label>
                )}
              </>
            ) : (
              <label className="field">
                <span>Nome do jogo (opcional)</span>
                <input
                  value={config.gameNames[0] ?? ''}
                  maxLength={40}
                  placeholder="Ex.: Rodada extra"
                  onChange={(e) => set({ gameNames: [e.target.value, ...config.gameNames.slice(1)] })}
                />
              </label>
            )}
            <label className="check-line">
              <input
                type="checkbox"
                checked={config.freeCenter}
                onChange={(e) => set({ freeCenter: e.target.checked })}
              />
              <span>Espaço livre no centro</span>
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={config.sortColumns}
                onChange={(e) => set({ sortColumns: e.target.checked })}
              />
              <span>Números de cada coluna em ordem crescente</span>
            </label>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Impressão</h2>
            </header>
            <div className="setting">
              <span className="setting-label">Papel</span>
              <div className="segmented" role="group" aria-label="Papel">
                {(['a4', 'letter'] as const).map((p) => (
                  <button
                    type="button"
                    key={p}
                    className={config.paper === p ? 'is-on' : ''}
                    aria-pressed={config.paper === p}
                    onClick={() => set({ paper: p })}
                  >
                    {PAPERS[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting">
              <span className="setting-label">{config.kind === 'cartelas' ? 'Cartelas' : 'Jogos'} por página</span>
              <div className="segmented" role="group" aria-label="Por página">
                {perPageList.map((n) => (
                  <button
                    type="button"
                    key={n}
                    className={config.perPage === n ? 'is-on' : ''}
                    aria-pressed={config.perPage === n}
                    onClick={() => set({ perPage: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting">
              <span className="setting-label">Cor</span>
              <div className="color-row" role="group" aria-label="Cor">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`color-swatch ${config.color === c ? 'is-on' : ''}`}
                    style={{ background: c }}
                    aria-pressed={config.color === c}
                    aria-label={COLOR_NAMES[c]}
                    title={COLOR_NAMES[c]}
                    onClick={() => set({ color: c })}
                  />
                ))}
                <label className="color-custom">
                  <input
                    type="color"
                    value={config.color}
                    onChange={(e) => set({ color: e.target.value })}
                    aria-label="Outra cor"
                  />
                  <span>Outra</span>
                </label>
              </div>
            </div>
          </section>
        </div>

        <aside className="generator-side">
          <section className="panel generator-preview">
            <header className="panel-head">
              <div>
                <h2>Prévia</h2>
                <span className="muted small">
                  {named.length} {unit} em {pages.length} página(s)
                </span>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBatch((b) => b + 1)}>
                <IconRestart size={16} />
                Outros números
              </button>
            </header>
            {pages[0] && <PrintPreview page={pages[0]} label="Prévia da primeira página" />}
            {tooSmall && (
              <p className="field-error" role="alert">
                Os números ficaram pequenos para imprimir ({cell.toFixed(1).replace('.', ',')} mm por casa). Diminua os
                jogos por cartela ou as cartelas por página.
              </p>
            )}
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            <div className="generator-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => void downloadPdf()}
                disabled={busy}
              >
                <IconFile size={18} />
                {busy ? 'Gerando PDF...' : 'Baixar PDF'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={downloadCsv}>
                <IconSave size={18} />
                Lista de conferência (CSV)
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void addToMyCards()}>
                <IconPlus size={18} />
                Adicionar às minhas cartelas
              </button>
            </div>
            <p className="hint">
              A lista de conferência traz os números de todas as cartelas, para conferir quem ganhou. Nenhuma tabela se
              repete no lote.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}
