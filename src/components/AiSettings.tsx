import { useEffect, useState } from 'react';
import { catalogFor, listModels, type ModelListResult } from '../lib/ai/modelList';
import {
  AI_PROVIDERS,
  DEFAULT_AI_MODELS,
  DEFAULT_OLLAMA_URL,
  MAX_AI_MODEL_CHAIN,
  clearAiSettings,
  emptyEntry,
  inheritSource,
  modelLabel,
  ownCredential,
  resolveAiChain,
  saveAiSettings,
  type AiModelEntry,
  type AiProvider,
  type AiSettings as Settings,
} from '../lib/ai/models';
import { chainHealth, providerMessage, runSingle, type EntryHealth } from '../lib/ai/providers';
import { Modal } from './Dialog';
import { IconKey, IconPlus, IconTrash } from './Icons';

interface AiSettingsProps {
  settings: Settings | null;
  /** Texto extra no topo, quando a janela abre porque a pessoa tentou ler uma foto sem configurar. */
  intro?: string;
  onClose: () => void;
  onSave: (settings: Settings | null) => void;
}

interface EditorEntry extends AiModelEntry {
  /** Escolheu "Nome customizado" no campo Modelo (model vazio é o padrão do provedor). */
  custom: boolean;
  /** Usa a própria chave em vez da herdada de um item anterior do mesmo provedor. */
  ownKey: boolean;
}

type TestResult = { ok: true } | { ok: false; message: string } | 'running';

const CUSTOM = '__custom__';

function toEditor(entries: AiModelEntry[]): EditorEntry[] {
  return entries.map((e, i) => ({
    ...e,
    custom: false,
    ownKey: Boolean(ownCredential(e)) || inheritSource(entries, i) === null,
  }));
}

/** O que vai para o armazenamento: chave vazia onde o item herda. */
function toSettings(entries: EditorEntry[]): Settings {
  return {
    entries: entries.map((e) => ({
      provider: e.provider,
      model: e.model.trim(),
      apiKey: e.provider !== 'ollama' && e.ownKey ? e.apiKey.trim() : '',
      baseUrl: e.provider === 'ollama' && e.ownKey ? e.baseUrl.trim() : '',
    })),
  };
}

/**
 * Configuração da IA: fila de até 6 modelos (principal e reservas), de qualquer
 * provedor. Fica salva só neste aparelho.
 */
export function AiSettings({ settings, intro, onClose, onSave }: AiSettingsProps) {
  const [entries, setEntries] = useState<EditorEntry[]>(() => toEditor(settings?.entries ?? [emptyEntry('claude')]));
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<EntryHealth[]>([]);
  const [tests, setTests] = useState<Record<number, TestResult>>({});

  useEffect(() => {
    if (settings) void chainHealth(settings).then(setHealth);
  }, [settings]);

  const draft = toSettings(entries);
  const sources = entries.map((_, i) => inheritSource(draft.entries, i));

  const update = (index: number, patch: Partial<EditorEntry>) => {
    setError(null);
    setTests({});
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const changeProvider = (index: number, provider: AiProvider) =>
    // trocar o provedor zera modelo e chave, que não valem no outro provedor
    update(index, { provider, model: '', apiKey: '', baseUrl: '', custom: false, ownKey: true });

  const addReserve = () => {
    // a reserva nasce com o provedor do principal e herda a chave dele
    setEntries((prev) => [...prev, { ...emptyEntry(prev[0].provider), custom: false, ownKey: false }]);
    setTests({});
  };

  const remove = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setTests({});
  };

  const validate = (): string | null => {
    const chain = resolveAiChain(draft);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.custom && !e.model.trim()) return `Digite o nome do modelo ${i + 1}.`;
      if (e.provider !== 'ollama' && !chain[i].credential) return `Cole a chave de API do modelo ${i + 1}.`;
    }
    return null;
  };

  const save = () => {
    const problem = validate();
    if (problem) return setError(problem);
    saveAiSettings(draft);
    onSave(draft);
  };

  const removeAll = () => {
    clearAiSettings();
    onSave(null);
  };

  /** Uma chamada curta a cada modelo, sem fila: mostra qual funciona e o que o provedor respondeu. */
  const test = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    const chain = resolveAiChain(draft);
    setTests(Object.fromEntries(chain.map((e) => [e.index, 'running' as const])));
    for (const entry of chain) {
      let result: TestResult;
      try {
        await runSingle(entry, {
          system: 'Responda só com a palavra ok.',
          messages: [{ role: 'user', content: 'Teste de conexão.' }],
          maxTokens: 512,
        });
        result = { ok: true };
      } catch (err) {
        result = { ok: false, message: providerMessage(err) };
      }
      setTests((prev) => ({ ...prev, [entry.index]: result }));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Leitura de cartelas por foto"
      size="lg"
      footer={
        <>
          {settings && (
            <button type="button" className="btn btn-ghost btn-danger-text push-left" onClick={removeAll}>
              Remover configuração
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <form
        className="ai-settings"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {intro && <p className="notice-inline">{intro}</p>}
        <h3 className="ai-section-title">Provedor e credenciais</h3>
        <p className="hint">
          Tire uma foto da cartela e a IA preenche o número e os jogos para você conferir. Use uma chave da sua conta em
          um dos provedores; cada leitura é cobrada nela. Escolha modelos que leem imagens.
        </p>

        <div className="ai-chain-head">
          <strong>Modelos</strong>
          <p className="hint">
            Quando um modelo atinge o limite de uso ou falha, o app tenta o próximo da lista sozinho. O modelo que bateu
            no limite sai da frente por alguns minutos, e as próximas leituras já começam pelo seguinte.
          </p>
        </div>

        <ol className="ai-chain">
          {entries.map((entry, i) => (
            <ModelEntryCard
              key={i}
              index={i}
              entry={entry}
              resolvedCredential={resolveAiChain(draft)[i]?.credential ?? ''}
              inheritFrom={sources[i]}
              health={health.find((h) => h.index === i)}
              test={tests[i]}
              onProvider={(p) => changeProvider(i, p)}
              onChange={(patch) => update(i, patch)}
              onRemove={i > 0 ? () => remove(i) : undefined}
            />
          ))}
        </ol>

        <div className="button-row">
          {entries.length < MAX_AI_MODEL_CHAIN && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={addReserve}>
              <IconPlus size={16} />
              Adicionar modelo de reserva
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void test()}
            disabled={Object.values(tests).includes('running')}
          >
            Testar modelos
          </button>
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          As chaves ficam salvas só neste aparelho, não entram no backup e são enviadas apenas ao provedor de cada
          modelo, junto com a foto, na hora da leitura.
        </p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

interface ModelEntryCardProps {
  index: number;
  entry: EditorEntry;
  resolvedCredential: string;
  inheritFrom: number | null;
  health?: EntryHealth;
  test?: TestResult;
  onProvider: (provider: AiProvider) => void;
  onChange: (patch: Partial<EditorEntry>) => void;
  onRemove?: () => void;
}

function ModelEntryCard({
  index,
  entry,
  resolvedCredential,
  inheritFrom,
  health,
  test,
  onProvider,
  onChange,
  onRemove,
}: ModelEntryCardProps) {
  const n = index + 1;
  const [showKey, setShowKey] = useState(false);
  const list = useModelList(entry.provider, resolvedCredential);
  const inList = list.result.models.some((m) => m.id === entry.model);
  const selectValue = entry.custom || (entry.model && !inList) ? CUSTOM : entry.model;
  const inherits = inheritFrom !== null && !entry.ownKey;
  const ollama = entry.provider === 'ollama';

  return (
    <li className="ai-chain-item" data-provider={entry.provider}>
      <header className="ai-chain-item-head">
        <span className="chip-round">{n}</span>
        <strong>{index === 0 ? 'Modelo principal' : `Modelo ${n} (reserva)`}</strong>
        {onRemove && (
          <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remover o modelo ${n}`}>
            <IconTrash size={18} />
          </button>
        )}
      </header>

      <div className="ai-chain-grid">
        <label className="field">
          <span>Provedor</span>
          <select
            value={entry.provider}
            onChange={(e) => onProvider(e.target.value as AiProvider)}
            aria-label={`Provedor do modelo ${n}`}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <label htmlFor={`ai-model-${n}`}>Modelo</label>
          <select
            id={`ai-model-${n}`}
            value={selectValue}
            aria-label={`Modelo ${n}`}
            onChange={(e) =>
              e.target.value === CUSTOM
                ? onChange({ custom: true, model: inList ? '' : entry.model })
                : onChange({ custom: false, model: e.target.value })
            }
          >
            <option value={CUSTOM}>Nome customizado</option>
            <option value="">
              Padrão do provedor ({modelLabel(entry.provider, DEFAULT_AI_MODELS[entry.provider])})
            </option>
            {list.result.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {selectValue === CUSTOM && (
            <input
              className="ai-custom-model"
              value={entry.model}
              onChange={(e) => onChange({ custom: true, model: e.target.value })}
              placeholder={`Ex.: ${DEFAULT_AI_MODELS[entry.provider]}`}
              aria-label={`Nome do modelo ${n}`}
              autoComplete="off"
              spellCheck={false}
            />
          )}
          <small className="muted small" data-live={list.result.live}>
            {list.loading
              ? 'Consultando os modelos no provedor...'
              : list.result.live
                ? 'Lista consultada agora no provedor.'
                : resolvedCredential || ollama
                  ? 'Não deu para consultar o provedor: lista do catálogo do app. Pode haver modelo fora dela.'
                  : 'Lista do catálogo do app. Com a chave, a lista vem do provedor.'}
          </small>
        </div>
      </div>

      {inherits ? (
        <div className="ai-inherited">
          <IconKey size={16} />
          <span>
            {ollama ? 'Endereço já preenchido' : 'Chave já preenchida'} no modelo {inheritFrom + 1}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ownKey: true })}>
            {ollama ? 'Usar outro endereço' : 'Usar outra chave'}
          </button>
        </div>
      ) : ollama ? (
        <label className="field">
          <span>Endereço do Ollama</span>
          <input
            value={entry.baseUrl}
            onChange={(e) => onChange({ baseUrl: e.target.value })}
            placeholder={DEFAULT_OLLAMA_URL}
            aria-label={`Endereço do Ollama do modelo ${n}`}
            autoComplete="off"
            spellCheck={false}
          />
          <small className="muted small">
            O Ollama roda no seu computador. Abra-o com OLLAMA_ORIGINS liberando este site e use um modelo que lê
            imagens (ex.: gemma3).
          </small>
        </label>
      ) : (
        <label className="field">
          <span>Chave de API</span>
          <div className="input-with-action">
            <input
              type={showKey ? 'text' : 'password'}
              value={entry.apiKey}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              placeholder={
                entry.provider === 'claude' ? 'sk-ant-...' : entry.provider === 'openai' ? 'sk-...' : 'AIza...'
              }
              aria-label={`Chave de API do modelo ${n}`}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowKey((v) => !v)}>
              {showKey ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <small className="muted small">
            Guardada só neste aparelho; usada apenas para chamar a IA deste provedor.
            {inheritFrom !== null && (
              <>
                {' '}
                <button type="button" className="link-btn" onClick={() => onChange({ ownKey: false, apiKey: '' })}>
                  Usar a chave do modelo {inheritFrom + 1}
                </button>
              </>
            )}
          </small>
        </label>
      )}

      {health && (
        <p className="ai-health" role="status">
          Fora da frente por alguns minutos ({healthReason(health)}): {health.message}
        </p>
      )}
      {test && test !== 'running' && (
        <p className={test.ok ? 'ai-test is-ok' : 'ai-test is-error'} role="status">
          {test.ok ? 'Funcionou.' : `Falhou: ${test.message}`}
        </p>
      )}
      {test === 'running' && (
        <p className="ai-test" role="status">
          Testando...
        </p>
      )}
    </li>
  );
}

function healthReason(h: EntryHealth): string {
  if (h.kind === 'limit') return 'limite de uso ou ocupado';
  if (h.kind === 'missing-model') return 'modelo não encontrado';
  if (h.kind === 'credential') return 'chave recusada';
  return 'erro';
}

/** Lista de modelos do provedor, consultada 700 ms depois de a chave parar de mudar. */
function useModelList(provider: AiProvider, credential: string) {
  const [state, setState] = useState<{ key: string; result: ModelListResult; loading: boolean }>(() => ({
    key: '',
    result: catalogFor(provider),
    loading: false,
  }));
  const key = `${provider}|${credential}`;
  useEffect(() => {
    // enquanto consulta, mostra o catálogo como dado provisório
    setState({ key, result: catalogFor(provider), loading: Boolean(credential) || provider === 'ollama' });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void listModels(provider, credential, controller.signal).then((result) => {
        if (!controller.signal.aborted) setState({ key, result, loading: false });
      });
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, provider, credential]);
  return state;
}
