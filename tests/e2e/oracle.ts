/**
 * Oráculo independente para conferir o app.
 *
 * As regras de cada modo são escritas aqui como condições sobre uma matriz 5x5,
 * sem usar o código do app (que trabalha com listas de padrões). Assim um erro
 * na lógica do app não se repete no teste.
 */

export const LIVRE = 0;

/** Cartelas digitadas novamente a partir das fotos, em ordem de linha. */
export const CARTELAS: Record<string, { nome: string; grade: number[] }> = {
  '01062': {
    nome: 'Bruna',
    // prettier-ignore
    grade: [
      6, 19, 41, 54, 69,
      14, 21, 36, 46, 71,
      13, 20, LIVRE, 56, 62,
      2, 29, 31, 60, 73,
      8, 30, 44, 49, 72,
    ],
  },
  '01064': {
    nome: 'Kátia',
    // prettier-ignore
    grade: [
      5, 24, 35, 52, 75,
      6, 25, 38, 47, 72,
      3, 28, LIVRE, 60, 73,
      8, 26, 43, 53, 66,
      14, 27, 44, 57, 67,
    ],
  },
  '01065': {
    nome: 'Ruan',
    // prettier-ignore
    grade: [
      9, 25, 39, 52, 69,
      2, 30, 41, 51, 72,
      3, 20, LIVRE, 50, 68,
      8, 27, 31, 59, 62,
      12, 17, 38, 60, 74,
    ],
  },
};

export const NUMEROS_CARTELAS = ['01062', '01064', '01065'];

export const PREMIOS = [
  { id: 'bicicleta', rodada: 1, nome: 'Bicicleta Aro 26' },
  { id: 'smartphone', rodada: 2, nome: 'Smartphone' },
  { id: 'dinheiro', rodada: 3, nome: 'R$ 1.500,00' },
  { id: 'tv', rodada: 4, nome: 'Smart TV 43"' },
  { id: 'moto', rodada: 5, nome: 'Moto 0 km' },
];

type M = boolean[][];

const linha = (m: M, r: number) => m[r].every(Boolean);
const coluna = (m: M, c: number) => m.every((row) => row[c]);
const diagPrincipal = (m: M) => [0, 1, 2, 3, 4].every((i) => m[i][i]);
const diagSecundaria = (m: M) => [0, 1, 2, 3, 4].every((i) => m[i][4 - i]);
const contaLinha = (m: M, r: number) => m[r].filter(Boolean).length;
const contaColuna = (m: M, c: number) => m.filter((row) => row[c]).length;
const contaDiag = (m: M, anti: boolean) => [0, 1, 2, 3, 4].filter((i) => m[i][anti ? 4 - i : i]).length;
const celulas = (m: M, lista: [number, number][]) => lista.every(([r, c]) => m[r][c]);

function linhasCompletas(m: M): number {
  let total = 0;
  for (let i = 0; i < 5; i++) {
    if (linha(m, i)) total++;
    if (coluna(m, i)) total++;
  }
  if (diagPrincipal(m)) total++;
  if (diagSecundaria(m)) total++;
  return total;
}

export const REGRAS: Record<string, (m: M) => boolean> = {
  quadra: (m) => [0, 1, 2, 3, 4].some((r) => contaLinha(m, r) >= 4),
  quina: (m) => [0, 1, 2, 3, 4].some((r) => linha(m, r)),
  'cartela-cheia': (m) => m.every((row) => row.every(Boolean)),
  'linha-vertical': (m) => [0, 1, 2, 3, 4].some((c) => coluna(m, c)),
  diagonal: (m) => diagPrincipal(m) || diagSecundaria(m),
  'linha-qualquer': (m) => linhasCompletas(m) >= 1,
  'quadra-qualquer': (m) =>
    [0, 1, 2, 3, 4].some((i) => contaLinha(m, i) >= 4 || contaColuna(m, i) >= 4) ||
    contaDiag(m, false) >= 4 ||
    contaDiag(m, true) >= 4,
  'duas-linhas': (m) => linhasCompletas(m) >= 2,
  'duas-quinas': (m) => [0, 1, 2, 3, 4].filter((r) => linha(m, r)).length >= 2,
  'quatro-cantos': (m) => m[0][0] && m[0][4] && m[4][0] && m[4][4],
  selo: (m) =>
    celulas(m, [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) ||
    celulas(m, [
      [0, 3],
      [0, 4],
      [1, 3],
      [1, 4],
    ]) ||
    celulas(m, [
      [3, 0],
      [3, 1],
      [4, 0],
      [4, 1],
    ]) ||
    celulas(m, [
      [3, 3],
      [3, 4],
      [4, 3],
      [4, 4],
    ]),
  cruz: (m) => linha(m, 2) && coluna(m, 2),
  'letra-x': (m) => diagPrincipal(m) && diagSecundaria(m),
  'letra-t': (m) => linha(m, 0) && coluna(m, 2),
  'letra-l': (m) => coluna(m, 0) && linha(m, 4),
  'letra-u': (m) => coluna(m, 0) && coluna(m, 4) && linha(m, 4),
  'letra-h': (m) => coluna(m, 0) && coluna(m, 4) && linha(m, 2),
  'letra-n': (m) => coluna(m, 0) && coluna(m, 4) && diagPrincipal(m),
  'letra-z': (m) => linha(m, 0) && linha(m, 4) && diagSecundaria(m),
  moldura: (m) => linha(m, 0) && linha(m, 4) && coluna(m, 0) && coluna(m, 4),
  'quadrado-meio': (m) => [1, 2, 3].every((r) => [1, 2, 3].every((c) => m[r][c])),
  losango: (m) =>
    celulas(m, [
      [0, 2],
      [1, 1],
      [1, 3],
      [2, 0],
      [2, 4],
      [3, 1],
      [3, 3],
      [4, 2],
    ]),
  piramide: (m) =>
    linha(m, 4) &&
    celulas(m, [
      [3, 1],
      [3, 2],
      [3, 3],
      [2, 2],
    ]),
};

export const MODOS = Object.keys(REGRAS);

export const NOMES_MODOS: Record<string, string> = {
  quadra: 'Quadra',
  quina: 'Quina',
  'cartela-cheia': 'Cartela cheia',
  'linha-vertical': 'Linha vertical',
  diagonal: 'Diagonal',
  'linha-qualquer': 'Linha em qualquer direção',
  'quadra-qualquer': 'Quadra em qualquer direção',
  'duas-linhas': 'Duas linhas',
  'duas-quinas': 'Duas quinas',
  'quatro-cantos': 'Quatro cantos',
  selo: 'Selo',
  cruz: 'Cruz',
  'letra-x': 'Letra X',
  'letra-t': 'Letra T',
  'letra-l': 'Letra L',
  'letra-u': 'Letra U',
  'letra-h': 'Letra H',
  'letra-n': 'Letra N',
  'letra-z': 'Letra Z',
  moldura: 'Moldura',
  'quadrado-meio': 'Quadrado do meio',
  losango: 'Losango',
  piramide: 'Pirâmide',
};

export const GRUPO_MODO: Record<string, 'Tradicionais' | 'Linhas' | 'Figuras'> = Object.fromEntries(
  MODOS.map((id, i) => [id, i < 3 ? 'Tradicionais' : i < 9 ? 'Linhas' : 'Figuras']),
) as Record<string, 'Tradicionais' | 'Linhas' | 'Figuras'>;

function matriz(grade: number[], sorteados: Set<number>): M {
  return [0, 1, 2, 3, 4].map((r) =>
    [0, 1, 2, 3, 4].map((c) => {
      const n = grade[r * 5 + c];
      return n === LIVRE || sorteados.has(n);
    }),
  );
}

/** Posição (1 = primeiro número) em que o modo foi completado, ou null. */
export function completouEm(grade: number[], modo: string, sorteios: number[]): number | null {
  const sorteados = new Set<number>();
  for (let i = 0; i < sorteios.length; i++) {
    sorteados.add(sorteios[i]);
    if (REGRAS[modo](matriz(grade, sorteados))) return i + 1;
  }
  return null;
}

/** Números que, se sorteados agora, completam o modo (só para modos ainda não completos). */
export function faltaUm(grade: number[], modo: string, sorteios: number[]): number[] {
  const sorteados = new Set(sorteios);
  if (REGRAS[modo](matriz(grade, sorteados))) return [];
  return grade.filter(
    (n) => n !== LIVRE && !sorteados.has(n) && REGRAS[modo](matriz(grade, new Set([...sorteados, n]))),
  );
}

export function marcados(grade: number[], sorteios: number[]): number {
  const s = new Set(sorteios);
  return grade.filter((n) => n !== LIVRE && s.has(n)).length;
}

export function letra(n: number): string {
  return 'BINGO'[Math.floor((n - 1) / 15)];
}

export function bola(n: number): string {
  return `${letra(n)}-${String(n).padStart(2, '0')}`;
}

/** Gerador pseudoaleatório com semente, para as simulações serem reproduzíveis. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max: number) => Math.floor(next() * max),
    chance: (p: number) => next() < p,
    shuffle<T>(list: T[]): T[] {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
