import Anthropic from '@anthropic-ai/sdk';
import { AI_MODEL_CATALOG, DEFAULT_OLLAMA_URL, type AiProvider, type CatalogModel } from './models';

/**
 * Lista de modelos consultada ao vivo no provedor, com a chave da pessoa.
 * O catálogo embutido envelhece a cada lançamento; ele só aparece quando a
 * consulta falha (sem chave, sem internet, chave recusada).
 */

export interface ModelListResult {
  models: CatalogModel[];
  /** true quando a lista veio do provedor agora. */
  live: boolean;
}

const LIST_TIMEOUT_MS = 8000;
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; result: ModelListResult }>();

/** Modelos que não conversam por texto (embedding, imagem, áudio, voz, moderação). */
const NOT_CHAT =
  /embed|image|imagen|dall-e|audio|tts|transcribe|whisper|realtime|moderation|search|aqa|veo|computer-use|instruct/i;

export function catalogFor(provider: AiProvider): ModelListResult {
  return { models: AI_MODEL_CATALOG[provider], live: false };
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchList(provider: AiProvider, credential: string, signal: AbortSignal): Promise<CatalogModel[]> {
  if (provider === 'claude') {
    const client = new Anthropic({ apiKey: credential, dangerouslyAllowBrowser: true, maxRetries: 0 });
    const page = await client.models.list({ limit: 100 }, { signal, timeout: LIST_TIMEOUT_MS });
    return page.data.map((m) => ({ id: m.id, label: m.display_name || m.id }));
  }
  if (provider === 'openai') {
    const data = (await fetchJson('https://api.openai.com/v1/models', {
      signal,
      headers: { authorization: `Bearer ${credential}` },
    })) as { data?: { id: string; created?: number }[] };
    return (data.data ?? [])
      .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !NOT_CHAT.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map((m) => ({ id: m.id, label: m.id }));
  }
  if (provider === 'gemini') {
    // a chave vai no cabeçalho, não na URL
    const data = (await fetchJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      signal,
      headers: { 'x-goog-api-key': credential },
    })) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && !NOT_CHAT.test(m.name))
      .map((m) => {
        const id = m.name.replace(/^models\//, '');
        return { id, label: m.displayName || id };
      });
  }
  const base = (credential || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  const data = (await fetchJson(`${base}/api/tags`, { signal })) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => ({ id: m.name, label: m.name }));
}

/** Consulta a lista (com cache de 10 minutos); qualquer falha devolve o catálogo. */
export async function listModels(
  provider: AiProvider,
  credential: string,
  signal?: AbortSignal,
): Promise<ModelListResult> {
  const cred = credential.trim();
  if (!cred && provider !== 'ollama') return catalogFor(provider);
  // no cache entra só o tamanho e o fim da chave, não a chave inteira
  const key = `${provider}|${cred.length}|${cred.slice(-6)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const models = await fetchList(provider, cred, controller.signal);
    if (models.length === 0) return catalogFor(provider);
    const result = { models, live: true };
    cache.set(key, { at: Date.now(), result });
    return result;
  } catch {
    return catalogFor(provider);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function clearModelListCache(): void {
  cache.clear();
}
