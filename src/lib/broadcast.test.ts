import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CODE_LENGTH,
  formatCode,
  isValidCode,
  loadOrCreateIdentity,
  normalizeCode,
  planRemote,
  signState,
  verifyMessage,
  type BroadcastState,
  type ReceiverBinding,
} from './broadcast';
import { PACKET, PacketReader, decodePublish, encodeConnect, encodePublish, encodeSubscribe } from './mqtt';

function memoria() {
  const dados = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  });
  return dados;
}

describe('MQTT', () => {
  it('monta o CONNECT do protocolo 3.1.1 com sessão limpa', () => {
    const p = encodeConnect('bm-abc', 30);
    expect([...p.slice(0, 2)]).toEqual([0x10, p.length - 2]);
    expect(new TextDecoder().decode(p.slice(4, 8))).toBe('MQTT');
    expect([...p.slice(8, 12)]).toEqual([4, 0x02, 0, 30]);
    expect(new TextDecoder().decode(p.slice(14))).toBe('bm-abc');
  });

  it('PUBLISH com retenção e tamanho variável acima de 127 bytes', () => {
    const payload = 'x'.repeat(300);
    const p = encodePublish('a/b', payload, true);
    expect(p[0]).toBe(0x31);
    // 2 + 3 (tópico) + 300 = 305 = 0xB1 0x02 no formato de tamanho variável
    expect([...p.slice(1, 3)]).toEqual([0xb1, 0x02]);
    const [lido] = new PacketReader().push(p);
    expect(lido.type).toBe(PACKET.PUBLISH);
    expect(decodePublish(lido)).toEqual({ topic: 'a/b', payload });
  });

  it('SUBSCRIBE com identificador e QoS 0', () => {
    const p = encodeSubscribe(7, 't');
    expect([...p]).toEqual([0x82, 6, 0, 7, 0, 1, 't'.charCodeAt(0), 0]);
  });

  it('junta pacotes que chegam partidos ou grudados', () => {
    const a = encodePublish('t', 'um', false);
    const b = encodePublish('t', 'dois', false);
    const tudo = new Uint8Array([...a, ...b]);
    const reader = new PacketReader();
    expect(reader.push(tudo.slice(0, 3))).toEqual([]);
    const pacotes = reader.push(tudo.slice(3));
    expect(pacotes.map((p) => decodePublish(p).payload)).toEqual(['um', 'dois']);
  });
});

describe('código do sorteio', () => {
  it('aceita o código digitado de vários jeitos', () => {
    expect(normalizeCode(' 7kq2-m9xa ')).toBe('7KQ2M9XA');
    expect(normalizeCode('o1il')).toBe('0111');
    expect(isValidCode('7KQ2M9XA')).toBe(true);
    expect(isValidCode('7KQ2M9X')).toBe(false);
    expect(isValidCode('7KQ2M9XU')).toBe(false);
    expect(formatCode('7KQ2M9XA')).toBe('7KQ2-M9XA');
  });
});

describe('mensagens assinadas', () => {
  beforeEach(() => void memoria());
  afterEach(() => vi.unstubAllGlobals());

  const estado = { seq: 10, round: 1, maxBall: 75, draws: [5, 61, 33], live: true };

  it('o código vem da chave, fica igual ao recarregar e a mensagem confere', async () => {
    const id = await loadOrCreateIdentity();
    expect(id.code).toHaveLength(CODE_LENGTH);
    expect(isValidCode(id.code)).toBe(true);
    expect((await loadOrCreateIdentity()).code).toBe(id.code);
    const msg = await signState(id, estado);
    expect(await verifyMessage(id.code, msg)).toEqual({ code: id.code, ...estado });
  });

  it('recusa mensagem alterada, de outra chave ou com números inválidos', async () => {
    const id = await loadOrCreateIdentity();
    const msg = JSON.parse(await signState(id, estado));
    const alterada = { ...msg, body: msg.body.replace('[5,61,33]', '[5,61,34]') };
    expect(await verifyMessage(id.code, JSON.stringify(alterada))).toBeNull();

    memoria();
    const outro = await loadOrCreateIdentity();
    expect(outro.code).not.toBe(id.code);
    // assinatura válida, mas de quem não é dono do código
    expect(await verifyMessage(id.code, await signState(outro, estado))).toBeNull();
    expect(await verifyMessage(outro.code, await signState(outro, { ...estado, draws: [5, 5] }))).toBeNull();
    expect(await verifyMessage(outro.code, await signState(outro, { ...estado, draws: [80] }))).toBeNull();
    expect(await verifyMessage(outro.code, 'não é json')).toBeNull();
  });
});

describe('aplicar o que chegou na partida', () => {
  const remoto = (draws: number[], extra: Partial<BroadcastState> = {}): BroadcastState => ({
    code: 'ABCDEFGH',
    seq: 1,
    round: 1,
    maxBall: 75,
    draws,
    live: true,
    ...extra,
  });
  const nova: ReceiverBinding = { code: 'ABCDEFGH', matchId: null, round: null, applied: [] };

  it('na primeira vez recebe o sorteio todo, sem repetir o que já foi digitado', () => {
    const plan = planRemote(nova, { id: 'p1', draws: [61] }, remoto([5, 61, 33]));
    expect(plan.add).toEqual([5, 33]);
    expect(plan.remove).toEqual([]);
    expect(plan.binding).toEqual({ code: 'ABCDEFGH', matchId: 'p1', round: 1, applied: [5, 33] });
    expect(plan.status).toBe('applied');
  });

  it('desfazer no sorteador tira só o que veio dele', () => {
    const ligada = { ...nova, matchId: 'p1', round: 1, applied: [5, 33] };
    const plan = planRemote(ligada, { id: 'p1', draws: [61, 5, 33] }, remoto([5, 61]));
    expect(plan.remove).toEqual([33]);
    expect(plan.add).toEqual([]);
    expect(plan.binding.applied).toEqual([5]);
  });

  it('bola tirada à mão na partida não volta sozinha', () => {
    const ligada = { ...nova, matchId: 'p1', round: 1, applied: [5, 33] };
    expect(planRemote(ligada, { id: 'p1', draws: [5] }, remoto([5, 33])).add).toEqual([]);
  });

  it('novo sorteio não mexe na partida; partida nova espera o sorteio novo', () => {
    const ligada = { ...nova, matchId: 'p1', round: 1, applied: [5] };
    expect(planRemote(ligada, { id: 'p1', draws: [5] }, remoto([], { round: 2 }))).toMatchObject({
      status: 'new-round',
      add: [],
      remove: [],
    });
    expect(planRemote(ligada, { id: 'p2', draws: [] }, remoto([5, 9]))).toMatchObject({ status: 'waiting', add: [] });
    const proxima = planRemote(ligada, { id: 'p2', draws: [] }, remoto([7], { round: 2 }));
    expect(proxima).toMatchObject({ status: 'applied', add: [7] });
    expect(proxima.binding).toMatchObject({ matchId: 'p2', round: 2, applied: [7] });
  });

  it('globo com mais de 75 bolas: só entram os números da cartela', () => {
    const plan = planRemote(nova, { id: 'p1', draws: [] }, remoto([80, 12], { maxBall: 90 }));
    expect(plan.add).toEqual([12]);
    expect(plan.status).toBe('too-many-balls');
    expect(planRemote(nova, { id: 'p1', draws: [] }, remoto([12], { live: false })).status).toBe('ended');
  });
});
