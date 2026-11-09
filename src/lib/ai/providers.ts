import Anthropic from '@anthropic-ai/sdk';
import {
  AI_MODEL_CATALOG,
  modelLabel,
  resolveAiChain,
  type AiProvider,
  type AiSettings,
  type ResolvedEntry,
} from './models';

/**
 * Camada de provedores: toda chamada à IA sai por runCompletion, que esconde os
 * quatro provedores e a fila de modelos de reserva. Quem usa só monta o system,
 * as mensagens e lê o texto que volta.
 *
 * Diferença em relação ao desenho original: as mensagens aceitam imagens, porque
 * a única funcionalidade daqui (ler a cartela pela foto) precisa de visão.
 */

export interface ChatImage {
  mediaType: string;
  /** Conteúdo em base64, sem o prefixo data:. */
  data: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
}

/** Prazo de uma chamada a um modelo. Nenhum SDK tem prazo útil por padrão. */
export const CALL_TIMEOUT_MS = 90_000;
const DEFAULT_QUARANTINE_MS = 60_000;
const MAX_QUARANTINE_MS = 10 * 60_000;
const MISSING_MODEL_QUARANTINE_MS = 30 * 60_000;
const CREDENTIAL_QUARANTINE_MS = 60_000;

export type FailureKind = 'limit' | 'missing-model' | 'credential' | 'other';

/** Erro de um provedor (não vale repetir: a fila inteira já foi tentada). */
export class ProviderError extends Error {
  status: number | null;
  /** A frase do provedor, sem JSON em volta. */
  providerText: string;
  retryAfterMs: number | null;
  timeout: boolean;
  /** Item da fila que falhou (para dizer qual modelo, na mensagem). */
  entry: ResolvedEntry | null = null;

  constructor(
    message: string,
    options: { status?: number | null; retryAfterMs?: number | null; timeout?: boolean; providerText?: string } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.timeout = options.timeout ?? false;
    this.providerText = options.providerText ?? message;
  }
}

/** Resposta fora do formato pedido: vale pedir de novo ao modelo. */
export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError;
}

const LIMIT_TEXT = /rate.?limit|quota|resource_exhausted|overloaded|too many requests|capacity/i;
const CREDENTIAL_TEXT = /api key not valid|invalid.{0,10}api.?key|api_key_invalid|incorrect api key|invalid x-api-key/i;

export function classify(err: ProviderError): FailureKind {
  const s = err.status;
  if (
    err.timeout ||
    s === 429 ||
    s === 529 ||
    s === 502 ||
    s === 503 ||
    s === 504 ||
    LIMIT_TEXT.test(err.providerText)
  ) {
    return 'limit';
  }
  if (s === 404) return 'missing-model';
  if (s === 401 || s === 403 || (s === 400 && CREDENTIAL_TEXT.test(err.providerText))) return 'credential';
  return 'other';
}

/** A frase do provedor para mostrar à pessoa, sem JSON aninhado. */
export function providerMessage(err: unknown): string {
  if (err instanceof ProviderError) return err.providerText;
  if (err instanceof Error) return extractMessage(err.message) ?? err.message;
  return String(err);
}

/** Tira a mensagem de dentro de um corpo de erro em JSON (às vezes aninhado mais de uma vez). */
function extractMessage(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start));
  } catch {
    return null;
  }
  for (let depth = 0; depth < 4 && typeof obj === 'object' && obj !== null; depth++) {
    const o = obj as Record<string, unknown>;
    const next = o.error ?? o.message;
    if (typeof next === 'string') return extractMessage(next) ?? next;
    obj = next;
  }
  return null;
}

// ---------------------------------------------------------------- adaptadores

interface CallContext {
  signal: AbortSignal;
  /** Há outro modelo esperando na fila: não vale o SDK repetir sozinho. */
  hasNext: boolean;
}

function retryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function httpError(res: Response): Promise<ProviderError> {
  const body = await res.text().catch(() => '');
  const text = extractMessage(body) ?? (body.trim().slice(0, 300) || `Erro ${res.status} do provedor.`);
  return new ProviderError(text, { status: res.status, retryAfterMs: retryAfter(res.headers.get('retry-after')) });
}

function connectionError(err: unknown, what: string): unknown {
  // fetch rejeita com TypeError quando não chega ao servidor (rede, CORS, endereço errado)
  if (err instanceof TypeError) return new ProviderError(what);
  return err;
}

async function callClaude(entry: ResolvedEntry, req: CompletionRequest, ctx: CallContext): Promise<string> {
  // Sem servidor próprio, a chamada sai do navegador com a chave da própria pessoa.
  const client = new Anthropic({
    apiKey: entry.credential,
    dangerouslyAllowBrowser: true,
    maxRetries: ctx.hasNext ? 0 : 2,
  });
  const known = AI_MODEL_CATALOG.claude.some((m) => m.id === entry.model);
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create(
      {
        model: entry.model,
        max_tokens: req.maxTokens,
        // se o modelo recusar por engano, o servidor da Anthropic tenta de novo em outro modelo
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: req.system,
        ...(known ? { output_config: { effort: 'medium' as const } } : {}),
        messages: req.messages.map((m) => ({
          role: m.role,
          content: [
            ...(m.images ?? []).map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: img.data,
              },
            })),
            { type: 'text' as const, text: m.content },
          ],
        })),
      },
      { signal: ctx.signal, timeout: CALL_TIMEOUT_MS },
    );
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status) {
      const body = err.error as { error?: { message?: string } } | undefined;
      const headers = err.headers as Headers | undefined;
      throw new ProviderError(body?.error?.message ?? extractMessage(err.message) ?? err.message, {
        status: err.status,
        retryAfterMs: retryAfter(headers?.get?.('retry-after')),
      });
    }
    if (err instanceof Anthropic.APIConnectionError && !(err instanceof Anthropic.APIUserAbortError)) {
      throw new ProviderError('Sem conexão com a API da Anthropic.');
    }
    throw err;
  }
  if (res.stop_reason === 'refusal') throw new ProviderError('O modelo recusou o pedido.');
  // depois de um bloco "fallback" vem a resposta do modelo que assumiu
  let text = '';
  for (const block of res.content) {
    if (block.type === 'fallback') text = '';
    else if (block.type === 'text') text += block.text;
  }
  if (!text.trim()) {
    throw new ProviderError(
      res.stop_reason === 'max_tokens' ? 'A resposta foi cortada.' : 'O modelo não devolveu texto.',
    );
  }
  return text;
}

async function callOpenAI(entry: ResolvedEntry, req: CompletionRequest, ctx: CallContext): Promise<string> {
  const messages = [
    { role: 'system', content: req.system },
    ...req.messages.map((m) =>
      m.images?.length
        ? {
            role: m.role,
            content: [
              { type: 'text', text: m.content },
              ...m.images.map((img) => ({
                type: 'image_url',
                image_url: { url: `data:${img.mediaType};base64,${img.data}` },
              })),
            ],
          }
        : { role: m.role, content: m.content },
    ),
  ];
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctx.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${entry.credential}` },
      // max_tokens é recusado pelos modelos de raciocínio e pela família GPT-5 em diante
      body: JSON.stringify({ model: entry.model, max_completion_tokens: req.maxTokens, messages }),
    });
  } catch (err) {
    throw connectionError(err, 'Sem conexão com a API da OpenAI.');
  }
  if (!res.ok) throw await httpError(res);
  const data = (await res.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  };
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new ProviderError(choice.message.refusal);
  const text = choice?.message?.content ?? '';
  if (!text.trim()) {
    throw new ProviderError(
      choice?.finish_reason === 'length' ? 'A resposta foi cortada.' : 'O modelo não devolveu texto.',
    );
  }
  return text;
}

async function callGemini(entry: ResolvedEntry, req: CompletionRequest, ctx: CallContext): Promise<string> {
  const model = entry.model.replace(/^models\//, '');
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: ctx.signal,
        // a chave vai no cabeçalho, não na URL
        headers: { 'content-type': 'application/json', 'x-goog-api-key': entry.credential },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [
              ...(m.images ?? []).map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.data } })),
              { text: m.content },
            ],
          })),
          // sem maxOutputTokens a resposta para no teto padrão do modelo
          generationConfig: { maxOutputTokens: req.maxTokens },
        }),
      },
    );
  } catch (err) {
    throw connectionError(err, 'Sem conexão com a API do Gemini.');
  }
  if (!res.ok) throw await httpError(res);
  const data = (await res.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  if (!text.trim()) {
    const reason = data.promptFeedback?.blockReason ?? candidate?.finishReason;
    throw new ProviderError(
      reason === 'MAX_TOKENS'
        ? 'A resposta foi cortada.'
        : reason
          ? `O Gemini não respondeu (${reason}).`
          : 'O modelo não devolveu texto.',
    );
  }
  return text;
}

async function callOllama(entry: ResolvedEntry, req: CompletionRequest, ctx: CallContext): Promise<string> {
  const base = entry.credential.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      signal: ctx.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: entry.model,
        stream: false,
        messages: [
          { role: 'system', content: req.system },
          ...req.messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.images?.length ? { images: m.images.map((img) => img.data) } : {}),
          })),
        ],
      }),
    });
  } catch (err) {
    throw connectionError(
      err,
      `Não foi possível falar com o Ollama em ${base}. Confira se ele está aberto e se OLLAMA_ORIGINS libera este site.`,
    );
  }
  if (!res.ok) throw await httpError(res);
  const data = (await res.json()) as { message?: { content?: string }; error?: string };
  if (data.error) throw new ProviderError(data.error);
  const text = data.message?.content ?? '';
  if (!text.trim()) throw new ProviderError('O modelo não devolveu texto.');
  return text;
}

const ADAPTERS: Record<
  AiProvider,
  (entry: ResolvedEntry, req: CompletionRequest, ctx: CallContext) => Promise<string>
> = {
  claude: callClaude,
  openai: callOpenAI,
  gemini: callGemini,
  ollama: callOllama,
};

/** Chama um único modelo, com o prazo de uma chamada. */
export async function runSingle(
  entry: ResolvedEntry,
  req: CompletionRequest,
  options: { signal?: AbortSignal; hasNext?: boolean } = {},
  call: typeof callEntry = callEntry,
): Promise<string> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CALL_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);
  try {
    return await call(entry, req, { signal: controller.signal, hasNext: options.hasNext ?? false });
  } catch (err) {
    if (timedOut) {
      throw new ProviderError(`O modelo não respondeu em ${CALL_TIMEOUT_MS / 1000} segundos.`, { timeout: true });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export function callEntry(entry: ResolvedEntry, req: CompletionRequest, ctx: CallContext): Promise<string> {
  return ADAPTERS[entry.provider](entry, req, ctx);
}

// ---------------------------------------------------------------- quarentena e fila

interface Quarantine {
  until: number;
  kind: FailureKind;
  message: string;
}

/** Em memória, por aba: recarregar a página volta a tentar todos os modelos. */
const quarantine = new Map<string, Quarantine>();

export function resetQuarantine(): void {
  quarantine.clear();
}

/** Identidade do item: provedor, modelo e resumo da credencial (a chave nunca fica em claro na memória). */
async function entryKey(entry: ResolvedEntry): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entry.credential)));
  const hex = [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${entry.provider}|${entry.model}|${hex}`;
}

function quarantineFor(err: ProviderError, hasReserve: boolean): number | null {
  const kind = classify(err);
  if (kind === 'limit') return Math.min(MAX_QUARANTINE_MS, err.retryAfterMs ?? DEFAULT_QUARANTINE_MS);
  // modelo retirado ou chave recusada só sai da frente quando há outro para assumir
  if (kind === 'missing-model' && hasReserve) return MISSING_MODEL_QUARANTINE_MS;
  if (kind === 'credential' && hasReserve) return CREDENTIAL_QUARANTINE_MS;
  return null;
}

export interface RunOptions {
  settings: AiSettings;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** Quem pediu desistiu: para sem tentar as reservas. */
  signal?: AbortSignal;
}

/**
 * Tenta os modelos da fila em ordem; os que estão em quarentena vão para o fim
 * (não somem). Se todos falharem, repassa o erro da primeira tentativa: é ele
 * que diz o que aconteceu com o modelo que a pessoa escolheu como principal.
 */
export async function runCompletion(
  options: RunOptions,
  deps: { call?: typeof callEntry; now?: () => number } = {},
): Promise<string> {
  const now = deps.now ?? Date.now;
  const chain = resolveAiChain(options.settings).filter((e) => e.credential);
  if (chain.length === 0) throw new ProviderError('Configure a chave de algum provedor de IA.', { status: 401 });
  const keys = await Promise.all(chain.map(entryKey));
  const items = chain.map((entry, i) => {
    const q = quarantine.get(keys[i]);
    if (q && q.until <= now()) quarantine.delete(keys[i]);
    return { entry, key: keys[i], quarantined: Boolean(q && q.until > now()) };
  });
  const order = [...items.filter((x) => !x.quarantined), ...items.filter((x) => x.quarantined)];
  const req: CompletionRequest = {
    system: options.system,
    messages: options.messages,
    maxTokens: options.maxTokens ?? 4000,
  };

  let first: ProviderError | null = null;
  for (let i = 0; i < order.length; i++) {
    const { entry, key } = order[i];
    try {
      const text = await runSingle(entry, req, { signal: options.signal, hasNext: i < order.length - 1 }, deps.call);
      quarantine.delete(key);
      return text;
    } catch (err) {
      if (options.signal?.aborted) throw err;
      const failure =
        err instanceof ProviderError ? err : new ProviderError(err instanceof Error ? err.message : String(err));
      failure.entry = entry;
      first ??= failure;
      const ms = quarantineFor(failure, chain.length > 1);
      if (ms !== null)
        quarantine.set(key, { until: now() + ms, kind: classify(failure), message: failure.providerText });
    }
  }
  throw first!;
}

export interface EntryHealth {
  index: number;
  kind: FailureKind;
  message: string;
  until: number;
}

/** Itens da fila em quarentena agora, com o motivo, para a tela de configuração. */
export async function chainHealth(settings: AiSettings, now = Date.now()): Promise<EntryHealth[]> {
  const chain = resolveAiChain(settings).filter((e) => e.credential);
  const out: EntryHealth[] = [];
  for (const entry of chain) {
    const q = quarantine.get(await entryKey(entry));
    if (q && q.until > now) out.push({ index: entry.index, kind: q.kind, message: q.message, until: q.until });
  }
  return out;
}

/** Nome do item para mensagens (ex.: "Modelo 2 (Gemini 3.5 Flash Lite)"). */
export function entryName(entry: ResolvedEntry): string {
  const label = modelLabel(entry.provider, entry.model);
  return entry.index === 0 ? `Modelo principal (${label})` : `Modelo ${entry.index + 1} (${label})`;
}

// ---------------------------------------------------------------- saída estruturada

/** Primeiro objeto JSON do texto, dentro ou fora de uma cerca de código. */
export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new ContentError('A resposta da IA não trouxe o objeto JSON pedido.');
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    throw new ContentError('A resposta da IA veio com JSON inválido.');
  }
}

/**
 * Repete só erro de conteúdo (JSON malformado): o modelo escreve de novo e
 * costuma acertar. Para no primeiro erro de provedor, porque a fila inteira já
 * foi tentada; repetir seria pagar a mesma fila de recusas de novo.
 */
export async function withRetries<T>(fn: () => Promise<T>, attempts = 3, signal?: AbortSignal): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!(err instanceof ContentError) || signal?.aborted) throw err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
  throw last;
}

/** Garante que a operação inteira (fila e repetições) termina dentro do prazo. */
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ProviderError('A IA demorou demais para responder.', { timeout: true, status: 504 })),
      ms,
    );
  });
  // a chamada perdedora segue até o prazo dela; o catch vazio evita rejeição não tratada
  promise.catch(() => undefined);
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
