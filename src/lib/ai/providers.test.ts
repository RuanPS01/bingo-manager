import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_STORAGE_KEY,
  DEFAULT_AI_MODELS,
  DEFAULT_OLLAMA_URL,
  aiSettingsUsable,
  clearAiSettings,
  describeSettings,
  loadAiSettings,
  resolveAiChain,
  saveAiSettings,
  type AiModelEntry,
  type AiSettings,
  type ResolvedEntry,
} from './models';
import {
  ContentError,
  ProviderError,
  chainHealth,
  classify,
  parseJsonObject,
  providerMessage,
  resetQuarantine,
  runCompletion,
  withDeadline,
  withRetries,
} from './providers';

const entry = (provider: AiModelEntry['provider'], model = '', apiKey = '', baseUrl = ''): AiModelEntry => ({
  provider,
  model,
  apiKey,
  baseUrl,
});

describe('fila de modelos', () => {
  it('reserva sem chave herda a do item anterior do mesmo provedor', () => {
    const chain = resolveAiChain({
      entries: [
        entry('gemini', 'gemini-a', 'chave-g'),
        entry('claude', '', 'chave-c'),
        entry('gemini', 'gemini-b'),
        entry('claude', 'claude-x'),
        entry('openai', 'gpt-x'),
        entry('ollama', 'gemma3'),
      ],
    });
    expect(chain.map((e) => [e.model, e.credential, e.inheritedFrom])).toEqual([
      ['gemini-a', 'chave-g', null],
      [DEFAULT_AI_MODELS.claude, 'chave-c', null],
      ['gemini-b', 'chave-g', 0],
      ['claude-x', 'chave-c', 1],
      ['gpt-x', '', null],
      ['gemma3', DEFAULT_OLLAMA_URL, null],
    ]);
  });

  it('é utilizável quando algum item tem credencial, mesmo que não seja o principal', () => {
    expect(aiSettingsUsable({ entries: [entry('openai'), entry('claude', '', 'k')] })).toBe(true);
    expect(aiSettingsUsable({ entries: [entry('openai'), entry('gemini')] })).toBe(false);
    expect(aiSettingsUsable({ entries: [entry('ollama')] })).toBe(true);
    expect(describeSettings({ entries: [entry('claude', '', 'k'), entry('gemini'), entry('openai')] })).toBe(
      'Claude Opus 5.5 e 2 reservas',
    );
  });
});

describe('armazenamento da configuração', () => {
  let dados: Map<string, string>;
  beforeEach(() => {
    dados = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('migra a configuração da primeira versão (só Claude) para a fila', () => {
    dados.set(AI_STORAGE_KEY, JSON.stringify({ apiKey: ' sk-ant-antiga ', model: 'claude-sonnet-5-5' }));
    expect(loadAiSettings()).toEqual({ entries: [entry('claude', 'claude-sonnet-5-5', 'sk-ant-antiga')] });
  });

  it('guarda a fila numa chave própria, cada credencial no campo do seu provedor', () => {
    const settings: AiSettings = {
      entries: [
        entry('openai', 'gpt-x', ' sk-1 ', 'http://lixo'),
        entry('ollama', 'gemma3', 'lixo', ' http://pc:11434 '),
      ],
    };
    saveAiSettings(settings);
    expect([...dados.keys()]).toEqual([AI_STORAGE_KEY]);
    expect(loadAiSettings()).toEqual({
      entries: [entry('openai', 'gpt-x', 'sk-1'), entry('ollama', 'gemma3', '', 'http://pc:11434')],
    });
    dados.set(AI_STORAGE_KEY, JSON.stringify({ v: 2, entries: [{ provider: 'outro' }, entry('gemini')] }));
    expect(loadAiSettings()).toBeNull();
    dados.set(AI_STORAGE_KEY, '{quebrado');
    expect(loadAiSettings()).toBeNull();
    clearAiSettings();
    expect(dados.size).toBe(0);
  });
});

describe('erros dos provedores', () => {
  it('classifica limite, modelo inexistente, credencial e o resto', () => {
    expect(classify(new ProviderError('x', { status: 429 }))).toBe('limit');
    expect(classify(new ProviderError('x', { status: 529 }))).toBe('limit');
    expect(classify(new ProviderError('Resource has been exhausted (e.g. check quota).', { status: 400 }))).toBe(
      'limit',
    );
    expect(classify(new ProviderError('x', { timeout: true }))).toBe('limit');
    expect(classify(new ProviderError('x', { status: 404 }))).toBe('missing-model');
    expect(classify(new ProviderError('x', { status: 401 }))).toBe('credential');
    expect(classify(new ProviderError('API key not valid. Please pass a valid API key.', { status: 400 }))).toBe(
      'credential',
    );
    expect(classify(new ProviderError('x', { status: 400 }))).toBe('other');
  });

  it('entrega a frase do provedor, sem o JSON em volta', () => {
    const aninhado = new Error(
      JSON.stringify({ error: { message: JSON.stringify({ error: { code: 400, message: 'Modelo saiu do ar.' } }) } }),
    );
    expect(providerMessage(aninhado)).toBe('Modelo saiu do ar.');
    expect(providerMessage(new ProviderError('Frase do provedor'))).toBe('Frase do provedor');
  });
});

describe('runCompletion', () => {
  beforeEach(() => resetQuarantine());

  const settings: AiSettings = {
    entries: [entry('claude', 'a', 'k1'), entry('gemini', 'b', 'k2'), entry('openai', 'c', 'k3')],
  };
  const pedido = { settings, system: 's', messages: [{ role: 'user' as const, content: 'oi' }] };

  it('com o principal no limite, a reserva responde e o principal sai da frente', async () => {
    let relogio = 1000;
    const chamados: string[] = [];
    const call = async (e: ResolvedEntry) => {
      chamados.push(e.model);
      if (e.model === 'a') throw new ProviderError('rate limit', { status: 429, retryAfterMs: 30_000 });
      return `resposta de ${e.model}`;
    };
    expect(await runCompletion(pedido, { call, now: () => relogio })).toBe('resposta de b');
    expect((await chainHealth(settings, relogio)).map((h) => [h.index, h.kind])).toEqual([[0, 'limit']]);
    // a próxima chamada já começa pela reserva
    chamados.length = 0;
    expect(await runCompletion(pedido, { call, now: () => relogio })).toBe('resposta de b');
    expect(chamados).toEqual(['b']);
    // passado o tempo do retry-after, o principal volta para a frente
    relogio += 31_000;
    chamados.length = 0;
    await runCompletion(pedido, { call, now: () => relogio });
    expect(chamados).toEqual(['a', 'b']);
  });

  it('todos falhando, repassa o erro do primeiro modelo, com o modelo identificado', async () => {
    const call = async (e: ResolvedEntry) => {
      throw new ProviderError(`falhou ${e.model}`, { status: e.model === 'a' ? 404 : 500 });
    };
    const err = await runCompletion(pedido, { call }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).providerText).toBe('falhou a');
    expect((err as ProviderError).entry?.index).toBe(0);
    // modelo inexistente sai da frente porque há reserva; erro comum não
    expect((await chainHealth(settings)).map((h) => [h.index, h.kind])).toEqual([[0, 'missing-model']]);
  });

  it('quem cancela não passa para a reserva', async () => {
    const controller = new AbortController();
    const chamados: string[] = [];
    const call = async (e: ResolvedEntry) => {
      chamados.push(e.model);
      controller.abort();
      throw new Error('cancelado');
    };
    await expect(runCompletion({ ...pedido, signal: controller.signal }, { call })).rejects.toThrow('cancelado');
    expect(chamados).toEqual(['a']);
  });

  it('sem nenhuma credencial, nem tenta', async () => {
    const call = vi.fn();
    await expect(runCompletion({ ...pedido, settings: { entries: [entry('openai')] } }, { call })).rejects.toThrow(
      'Configure a chave',
    );
    expect(call).not.toHaveBeenCalled();
  });
});

describe('saída estruturada', () => {
  it('acha o objeto JSON dentro ou fora da cerca de código', () => {
    expect(parseJsonObject('Aqui está:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('texto {"a": {"b": 2}} fim')).toEqual({ a: { b: 2 } });
    expect(() => parseJsonObject('sem objeto')).toThrow(ContentError);
    expect(() => parseJsonObject('{quebrado')).toThrow(ContentError);
  });

  it('repete só erro de conteúdo e para no primeiro erro de provedor', async () => {
    vi.useFakeTimers();
    let n = 0;
    const conteudo = withRetries(async () => {
      n++;
      if (n < 3) throw new ContentError('json');
      return 'ok';
    });
    await vi.runAllTimersAsync();
    expect(await conteudo).toBe('ok');
    let m = 0;
    const provedor = withRetries(async () => {
      m++;
      throw new ProviderError('fora do ar', { status: 503 });
    }).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await provedor).toBeInstanceOf(ProviderError);
    expect(m).toBe(1);
    const prazo = withDeadline(new Promise(() => undefined), 1000).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect((await prazo) as ProviderError).toMatchObject({ timeout: true, status: 504 });
    vi.useRealTimers();
  });
});
