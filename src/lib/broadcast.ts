/**
 * Transmissão do sorteio para os celulares dos participantes.
 *
 * Um site não consegue abrir um servidor (o navegador não deixa escutar conexões),
 * então o sorteador publica o estado do sorteio em servidores MQTT públicos, que só
 * repassam a mensagem a quem assinou o mesmo código. Para ninguém mandar números
 * falsos com o código de outra pessoa, cada mensagem é assinada (ECDSA P-256) e o
 * código é tirado do resumo (SHA-256) da chave pública do sorteador: quem recebe
 * confere as duas coisas antes de aceitar.
 */

/** Dois servidores ao mesmo tempo: se um cair ou estiver lento, o outro entrega. */
export const BROKERS = [
  { id: 'emqx', name: 'EMQX', url: 'wss://broker.emqx.io:8084/mqtt' },
  { id: 'hivemq', name: 'HiveMQ', url: 'wss://broker.hivemq.com:8884/mqtt' },
] as const;

export const TRANSMITTER_STORAGE_KEY = 'bingo-manager:transmissao';

/** Base32 de Crockford: sem I, L, O e U, para o código ser fácil de ler e digitar. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;

export interface BroadcastState {
  code: string;
  /** Cresce a cada publicação; quem recebe fica sempre com a maior. */
  seq: number;
  /** Muda a cada "Reiniciar" no sorteador, para separar um sorteio do outro. */
  round: number;
  maxBall: number;
  draws: number[];
  /** false quando o sorteador encerrou a transmissão. */
  live: boolean;
}

export function topicFor(code: string): string {
  return `bingo-manager/v1/${code}`;
}

/** Aceita o código como a pessoa digitar: minúsculas, espaços, hífen e letras parecidas com números. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c));
}

/** Mostra o código em dois blocos (ex.: 7KQ2-M9XA). */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function receiveLink(code: string, base = `${location.origin}${location.pathname}`): string {
  return `${base}#/receber/${code}`;
}

function base32(bytes: Uint8Array, length: number): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
    if (out.length >= length) break;
  }
  return out;
}

export async function codeFromKey(publicKeyRaw: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', publicKeyRaw as BufferSource));
  return base32(hash, CODE_LENGTH);
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' } as const;

export interface Identity {
  code: string;
  publicKey: Uint8Array;
  privateKey: CryptoKey;
}

/**
 * Chave do sorteador, guardada só neste aparelho (fora do backup). É a mesma a
 * cada vez, então o código continua igual de um sorteio para o outro.
 */
export async function loadOrCreateIdentity(): Promise<Identity> {
  let jwk: JsonWebKey | null = null;
  try {
    jwk =
      (JSON.parse(localStorage.getItem(TRANSMITTER_STORAGE_KEY) ?? 'null') as { jwk?: JsonWebKey } | null)?.jwk ?? null;
  } catch {
    jwk = null;
  }
  if (!jwk?.d) {
    const pair = (await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify'])) as CryptoKeyPair;
    jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    try {
      localStorage.setItem(TRANSMITTER_STORAGE_KEY, JSON.stringify({ jwk }));
    } catch {
      // sem armazenamento a transmissão funciona, mas o código muda ao recarregar
    }
  }
  const privateKey = await crypto.subtle.importKey('jwk', jwk, ALGORITHM, false, ['sign']);
  const { kty, crv, x, y } = jwk;
  const publicCrypto = await crypto.subtle.importKey('jwk', { kty, crv, x, y }, ALGORITHM, true, ['verify']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', publicCrypto));
  return { code: await codeFromKey(publicKey), publicKey, privateKey };
}

/** Mensagem pronta para publicar: o estado em texto, a chave pública e a assinatura desse texto. */
export async function signState(identity: Identity, state: Omit<BroadcastState, 'code'>): Promise<string> {
  const body = JSON.stringify({ v: 1, code: identity.code, ...state });
  const sig = new Uint8Array(await crypto.subtle.sign(SIGNATURE, identity.privateKey, new TextEncoder().encode(body)));
  return JSON.stringify({ pk: toB64(identity.publicKey), body, sig: toB64(sig) });
}

/** Confere chave, assinatura e conteúdo. Devolve null para qualquer mensagem que não seja do sorteador desse código. */
export async function verifyMessage(code: string, payload: string): Promise<BroadcastState | null> {
  try {
    const msg = JSON.parse(payload) as { pk?: unknown; body?: unknown; sig?: unknown };
    if (typeof msg.pk !== 'string' || typeof msg.body !== 'string' || typeof msg.sig !== 'string') return null;
    const publicKey = fromB64(msg.pk);
    if ((await codeFromKey(publicKey)) !== code) return null;
    const key = await crypto.subtle.importKey('raw', publicKey as BufferSource, ALGORITHM, false, ['verify']);
    const ok = await crypto.subtle.verify(
      SIGNATURE,
      key,
      fromB64(msg.sig) as BufferSource,
      new TextEncoder().encode(msg.body),
    );
    if (!ok) return null;
    const body = JSON.parse(msg.body) as Record<string, unknown>;
    const maxBall = body.maxBall;
    if (body.v !== 1 || body.code !== code) return null;
    if (!Number.isInteger(maxBall) || (maxBall as number) < 10 || (maxBall as number) > 99) return null;
    if (!Number.isInteger(body.round) || typeof body.seq !== 'number' || !Array.isArray(body.draws)) return null;
    const draws = body.draws.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= (maxBall as number));
    if (draws.length !== body.draws.length || new Set(draws).size !== draws.length) return null;
    return {
      code,
      seq: body.seq,
      round: body.round as number,
      maxBall: maxBall as number,
      draws,
      live: body.live !== false,
    };
  } catch {
    return null;
  }
}

export function randomClientId(): string {
  // MQTT 3.1.1 garante só até 23 caracteres no identificador
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `bm-${[...bytes].map((b) => b.toString(36).padStart(2, '0')).join('')}`.slice(0, 23);
}

// ---------------------------------------------------------------- quem recebe

export const RECEIVER_STORAGE_KEY = 'bingo-manager:recepcao';

/** A que partida e a que sorteio as bolas recebidas estão ligadas. */
export interface ReceiverBinding {
  code: string;
  matchId: string | null;
  round: number | null;
  /** Bolas que entraram pela transmissão (as digitadas à mão ficam de fora). */
  applied: number[];
}

export function loadReceiver(): ReceiverBinding | null {
  try {
    const raw = JSON.parse(localStorage.getItem(RECEIVER_STORAGE_KEY) ?? 'null') as Partial<ReceiverBinding> | null;
    if (!raw || typeof raw.code !== 'string' || !isValidCode(raw.code)) return null;
    return {
      code: raw.code,
      matchId: typeof raw.matchId === 'string' ? raw.matchId : null,
      round: Number.isInteger(raw.round) ? (raw.round as number) : null,
      applied: Array.isArray(raw.applied) ? raw.applied.filter((n): n is number => Number.isInteger(n)) : [],
    };
  } catch {
    return null;
  }
}

export function saveReceiver(binding: ReceiverBinding | null): void {
  try {
    if (binding) localStorage.setItem(RECEIVER_STORAGE_KEY, JSON.stringify(binding));
    else localStorage.removeItem(RECEIVER_STORAGE_KEY);
  } catch {
    // sem armazenamento, a ligação vale só enquanto a página estiver aberta
  }
}

export type RemoteStatus = 'applied' | 'new-round' | 'waiting' | 'ended' | 'too-many-balls';

export interface RemotePlan {
  binding: ReceiverBinding;
  add: number[];
  remove: number[];
  status: RemoteStatus;
}

/** A partida só aceita de 1 a 75 (cartelas B I N G O). */
const MATCH_MAX_BALL = 75;

/**
 * Decide o que fazer com o estado recebido na partida aberta:
 * - partida nova ligada a um sorteio novo: recebe todas as bolas desse sorteio;
 * - partida nova com o mesmo sorteio da partida anterior: espera o sorteador reiniciar
 *   (ou a pessoa pedir para usar o sorteio atual), para não misturar rodadas;
 * - mesmo sorteio: entra o que é novo e sai o que o sorteador desfez;
 * - o sorteador reiniciou: nada muda na partida, que já é de outro sorteio.
 */
export function planRemote(
  binding: ReceiverBinding,
  match: { id: string; draws: number[] },
  remote: BroadcastState,
): RemotePlan {
  let next = binding;
  if (binding.matchId !== match.id) {
    if (binding.matchId !== null && binding.round === remote.round) {
      return { binding, add: [], remove: [], status: 'waiting' };
    }
    next = { ...binding, matchId: match.id, round: remote.round, applied: [] };
  } else if (binding.round !== remote.round) {
    return { binding, add: [], remove: [], status: 'new-round' };
  }
  const remoteSet = new Set(remote.draws);
  const applied = new Set(next.applied);
  const current = new Set(match.draws);
  const add = remote.draws.filter((b) => b <= MATCH_MAX_BALL && !current.has(b) && !applied.has(b));
  const remove = next.applied.filter((b) => !remoteSet.has(b) && current.has(b));
  const kept = next.applied.filter((b) => remoteSet.has(b));
  const status: RemoteStatus = !remote.live ? 'ended' : remote.maxBall > MATCH_MAX_BALL ? 'too-many-balls' : 'applied';
  return { binding: { ...next, applied: [...kept, ...add] }, add, remove, status };
}
