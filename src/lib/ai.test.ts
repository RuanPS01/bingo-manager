import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_STORAGE_KEY,
  DEFAULT_AI_MODEL,
  clearAiConfig,
  loadAiConfig,
  maskKey,
  normalizeScan,
  saveAiConfig,
} from './ai';

// prettier-ignore
const linhas = [
  [9, 25, 39, 52, 69],
  [2, 30, 41, 51, 72],
  [3, 20, 0, 50, 68],
  [8, 27, 31, 59, 62],
  [12, 17, 38, 60, 74],
];

describe('normalizeScan', () => {
  it('converte as linhas em grade e limpa o número da cartela', () => {
    const r = normalizeScan({ numero: 'Nº 01065', nome: ' Ruan ', jogos: [{ nome: 'Bicicleta', linhas }], avisos: [] });
    expect(r.number).toBe('01065');
    expect(r.name).toBe('Ruan');
    expect(r.games).toHaveLength(1);
    expect(r.games[0].name).toBe('Bicicleta');
    expect(r.games[0].grid).toEqual(linhas.flat());
    expect(r.warnings).toEqual([]);
  });

  it('deixa vazia a casa ilegível ou fora de 1 a 75, e só aceita 0 no centro', () => {
    const ruins = linhas.map((l) => [...l]);
    ruins[0][0] = 99;
    ruins[1][1] = 0;
    const r = normalizeScan({
      numero: '',
      nome: '',
      jogos: [{ nome: '', linhas: ruins }],
      avisos: ['Linha 1 borrada'],
    });
    expect(r.games[0].grid[0]).toBeNull();
    expect(r.games[0].grid[6]).toBeNull();
    expect(r.games[0].grid[12]).toBe(0);
    expect(r.warnings).toEqual(['Linha 1 borrada']);
  });

  it('descarta tabelas incompletas avisando, e aguenta respostas fora do formato', () => {
    const r = normalizeScan({
      jogos: [
        { nome: 'A', linhas: linhas.slice(0, 4) },
        { nome: 'B', linhas },
      ],
    });
    expect(r.games.map((g) => g.name)).toEqual(['B']);
    expect(r.warnings[0]).toMatch(/tabela 1/);
    expect(normalizeScan(null)).toEqual({ number: '', name: '', games: [], warnings: [] });
  });
});

describe('configuração da IA', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fica numa chave própria do localStorage, separada dos dados do app', () => {
    const dados = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
    });
    expect(loadAiConfig()).toBeNull();
    saveAiConfig({ apiKey: '  sk-ant-abc123456789xyz ', model: 'claude-sonnet-5-5' });
    expect([...dados.keys()]).toEqual([AI_STORAGE_KEY]);
    expect(loadAiConfig()).toEqual({ apiKey: 'sk-ant-abc123456789xyz', model: 'claude-sonnet-5-5' });
    dados.set(AI_STORAGE_KEY, JSON.stringify({ apiKey: 'sk-ant-x', model: '' }));
    expect(loadAiConfig()?.model).toBe(DEFAULT_AI_MODEL);
    dados.set(AI_STORAGE_KEY, '{quebrado');
    expect(loadAiConfig()).toBeNull();
    clearAiConfig();
    expect(dados.size).toBe(0);
  });

  it('mostra só o começo e o fim da chave', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnop')).toBe('sk-ant-...mnop');
    expect(maskKey('curta')).toBe('****');
  });
});
