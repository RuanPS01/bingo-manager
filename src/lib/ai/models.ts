/**
 * Contrato da IA: provedores, catálogo de modelos, fila com reservas e a
 * configuração guardada no aparelho.
 *
 * Segue o desenho do serviço de IA da outra plataforma (fila de até 6 modelos,
 * herança de credencial, padrão por provedor), com uma diferença: aqui não há
 * servidor. A configuração fica só neste navegador, numa entrada própria do
 * localStorage, fora do backup e do estado sincronizado entre abas.
 */

export type AiProvider = 'claude' | 'openai' | 'gemini' | 'ollama';

export const AI_PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: 'claude', label: 'Claude (Anthropic)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini (Google)' },
  { id: 'ollama', label: 'Ollama (local)' },
];

export function providerLabel(provider: AiProvider): string {
  return AI_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
}

/** Principal mais 5 reservas. */
export const MAX_AI_MODEL_CHAIN = 6;

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/** Modelo usado quando o item da fila deixa o modelo em branco. */
export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  claude: 'claude-opus-5-5',
  openai: 'gpt-6-luna',
  gemini: 'gemini-3.5-flash-lite',
  ollama: 'gemma3',
};

export interface CatalogModel {
  id: string;
  label: string;
}

/**
 * Catálogo embutido, só para quando a consulta ao provedor falha (sem chave,
 * sem internet, provedor fora do ar). Envelhece a cada lançamento: a lista de
 * verdade vem do provedor, e "Nome customizado" cobre o que faltar.
 */
export const AI_MODEL_CATALOG: Record<AiProvider, CatalogModel[]> = {
  claude: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
  ],
  openai: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
  ],
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  ],
  ollama: [
    { id: 'gemma3', label: 'gemma3' },
    { id: 'qwen2.5vl', label: 'qwen2.5vl' },
    { id: 'llama3.2-vision', label: 'llama3.2-vision' },
    { id: 'llava', label: 'llava' },
  ],
};

export function modelLabel(provider: AiProvider, model: string): string {
  const id = model || DEFAULT_AI_MODELS[provider];
  return AI_MODEL_CATALOG[provider].find((m) => m.id === id)?.label ?? id;
}

/** Um item da fila como a pessoa preencheu (chave ou endereço podem ficar vazios para herdar). */
export interface AiModelEntry {
  provider: AiProvider;
  model: string;
  apiKey: string;
  /** Só no Ollama: endereço do servidor local. */
  baseUrl: string;
}

export interface AiSettings {
  /** O primeiro é o principal; os outros são reservas, na ordem em que são tentados. */
  entries: AiModelEntry[];
}

/** Item pronto para chamar: modelo resolvido e credencial herdada aplicada. */
export interface ResolvedEntry {
  index: number;
  provider: AiProvider;
  model: string;
  /** Chave de API (ou, no Ollama, o endereço). */
  credential: string;
  /** Posição (base 0) do item de onde veio a credencial, quando herdada. */
  inheritedFrom: number | null;
}

export function emptyEntry(provider: AiProvider = 'claude'): AiModelEntry {
  return { provider, model: '', apiKey: '', baseUrl: '' };
}

/** Credencial digitada no próprio item (a chave, ou no Ollama o endereço). */
export function ownCredential(entry: AiModelEntry): string {
  return (entry.provider === 'ollama' ? entry.baseUrl : entry.apiKey).trim();
}

/**
 * Item anterior, do mesmo provedor, de onde este herdaria a credencial.
 * Assim a pessoa alterna entre modelos de um provedor digitando a chave uma vez.
 */
export function inheritSource(entries: AiModelEntry[], index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    if (entries[i].provider === entries[index].provider && ownCredential(entries[i])) return i;
  }
  return null;
}

export function resolveAiChain(settings: AiSettings): ResolvedEntry[] {
  return settings.entries.slice(0, MAX_AI_MODEL_CHAIN).map((entry, index) => {
    const own = ownCredential(entry);
    const from = own ? null : inheritSource(settings.entries, index);
    let credential = own || (from !== null ? ownCredential(settings.entries[from]) : '');
    if (!credential && entry.provider === 'ollama') credential = DEFAULT_OLLAMA_URL;
    return {
      index,
      provider: entry.provider,
      model: entry.model.trim() || DEFAULT_AI_MODELS[entry.provider],
      credential,
      inheritedFrom: from,
    };
  });
}

/** Utilizável quando algum item da fila tem credencial (o Ollama sempre tem endereço). */
export function aiSettingsUsable(settings: AiSettings | null): settings is AiSettings {
  return Boolean(settings && resolveAiChain(settings).some((e) => e.credential));
}

// ---------------------------------------------------------------- armazenamento

export const AI_STORAGE_KEY = 'bingo-manager:ia';

const PROVIDER_IDS = AI_PROVIDERS.map((p) => p.id);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function normalizeEntry(v: unknown): AiModelEntry | null {
  if (typeof v !== 'object' || v === null) return null;
  const e = v as Record<string, unknown>;
  if (!PROVIDER_IDS.includes(e.provider as AiProvider)) return null;
  return {
    provider: e.provider as AiProvider,
    model: str(e.model).trim(),
    apiKey: str(e.apiKey).trim(),
    baseUrl: str(e.baseUrl).trim(),
  };
}

/**
 * Lê a configuração. Aceita o formato da primeira versão ({apiKey, model}, só
 * Claude), que vira uma fila com um item.
 */
export function loadAiSettings(): AiSettings | null {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_STORAGE_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;
    let entries: AiModelEntry[];
    if (Array.isArray(raw.entries)) {
      entries = raw.entries.map(normalizeEntry).filter((e): e is AiModelEntry => e !== null);
    } else if (typeof raw.apiKey === 'string') {
      entries = [{ provider: 'claude', model: str(raw.model).trim(), apiKey: raw.apiKey.trim(), baseUrl: '' }];
    } else {
      return null;
    }
    const settings = { entries: entries.slice(0, MAX_AI_MODEL_CHAIN) };
    return aiSettingsUsable(settings) ? settings : null;
  } catch {
    return null;
  }
}

export function saveAiSettings(settings: AiSettings): void {
  const entries = settings.entries.slice(0, MAX_AI_MODEL_CHAIN).map((e) => ({
    provider: e.provider,
    model: e.model.trim(),
    // credencial só no campo do próprio provedor
    apiKey: e.provider === 'ollama' ? '' : e.apiKey.trim(),
    baseUrl: e.provider === 'ollama' ? e.baseUrl.trim() : '',
  }));
  localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({ v: 2, entries }));
}

export function clearAiSettings(): void {
  localStorage.removeItem(AI_STORAGE_KEY);
}

/** Resumo para a tela (ex.: "Claude Opus 5.5 e 2 reservas"). */
export function describeSettings(settings: AiSettings): string {
  const [first, ...rest] = settings.entries;
  const name = modelLabel(first.provider, first.model);
  if (rest.length === 0) return name;
  return `${name} e ${rest.length} ${rest.length === 1 ? 'reserva' : 'reservas'}`;
}
