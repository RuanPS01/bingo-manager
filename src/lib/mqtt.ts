/**
 * Cliente MQTT 3.1.1 mínimo sobre WebSocket, só com o que a transmissão do
 * sorteio usa: conectar, publicar (QoS 0, com retenção), assinar e manter a
 * conexão viva. Escrito à mão para não trazer uma biblioteca inteira ao pacote,
 * que já é um arquivo único carregado no celular.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PACKET = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  SUBSCRIBE: 8,
  SUBACK: 9,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
} as const;

function remainingLength(n: number): number[] {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return out;
}

function str(s: string): number[] {
  const bytes = enc.encode(s);
  return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
}

function packet(first: number, body: number[]): Uint8Array {
  return Uint8Array.from([first, ...remainingLength(body.length), ...body]);
}

export function encodeConnect(clientId: string, keepAlive: number): Uint8Array {
  // protocolo "MQTT" nível 4, sessão limpa
  return packet(PACKET.CONNECT << 4, [...str('MQTT'), 4, 0x02, keepAlive >> 8, keepAlive & 0xff, ...str(clientId)]);
}

export function encodePublish(topic: string, payload: string, retain: boolean): Uint8Array {
  return packet((PACKET.PUBLISH << 4) | (retain ? 1 : 0), [...str(topic), ...enc.encode(payload)]);
}

export function encodeSubscribe(packetId: number, topic: string): Uint8Array {
  return packet((PACKET.SUBSCRIBE << 4) | 0x02, [packetId >> 8, packetId & 0xff, ...str(topic), 0]);
}

export const PINGREQ = Uint8Array.from([PACKET.PINGREQ << 4, 0]);
export const DISCONNECT = Uint8Array.from([PACKET.DISCONNECT << 4, 0]);

export interface Packet {
  type: number;
  flags: number;
  body: Uint8Array;
}

/** Junta os pedaços que chegam pelo WebSocket e devolve os pacotes completos. */
export class PacketReader {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): Packet[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;
    const packets: Packet[] = [];
    for (;;) {
      if (this.buffer.length < 2) break;
      let length = 0;
      let multiplier = 1;
      let i = 1;
      let complete = false;
      while (i < this.buffer.length && i <= 4) {
        const byte = this.buffer[i++];
        length += (byte & 0x7f) * multiplier;
        multiplier *= 128;
        if ((byte & 0x80) === 0) {
          complete = true;
          break;
        }
      }
      if (!complete || this.buffer.length < i + length) break;
      packets.push({
        type: this.buffer[0] >> 4,
        flags: this.buffer[0] & 0x0f,
        body: this.buffer.slice(i, i + length),
      });
      this.buffer = this.buffer.slice(i + length);
    }
    return packets;
  }
}

/** Tópico e conteúdo de um PUBLISH recebido (QoS 0 ou não, o identificador é pulado). */
export function decodePublish(p: Packet): { topic: string; payload: string } {
  const topicLength = (p.body[0] << 8) | p.body[1];
  const topic = dec.decode(p.body.subarray(2, 2 + topicLength));
  const qos = (p.flags >> 1) & 0x03;
  const start = 2 + topicLength + (qos > 0 ? 2 : 0);
  return { topic, payload: dec.decode(p.body.subarray(start)) };
}

export interface MqttClientOptions {
  url: string;
  clientId: string;
  /** Tópicos assinados a cada conexão. */
  subscribe?: string[];
  onMessage?: (topic: string, payload: string) => void;
  onStatus?: (connected: boolean) => void;
  keepAliveSeconds?: number;
}

/**
 * Conexão com um servidor MQTT. Reconecta sozinha (com espera crescente) e
 * avisa quando conecta ou cai, para a tela mostrar o estado.
 */
export class MqttClient {
  private ws: WebSocket | null = null;
  private reader = new PacketReader();
  private ready = false;
  private closed = false;
  private retry = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeen = 0;
  private packetId = 1;

  constructor(private readonly options: MqttClientOptions) {
    this.open();
  }

  get connected(): boolean {
    return this.ready;
  }

  /** Publica se estiver conectado. Devolve false quando a mensagem não saiu. */
  publish(topic: string, payload: string, retain = true): boolean {
    if (!this.ready || !this.ws) return false;
    this.ws.send(encodePublish(topic, payload, retain));
    return true;
  }

  close(): void {
    this.closed = true;
    this.clearTimers();
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) this.ws.send(DISCONNECT);
        this.ws.close();
      } catch {
        // a conexão já caiu
      }
    }
    this.setReady(false);
  }

  private open() {
    if (this.closed) return;
    this.reader = new PacketReader();
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.options.url, ['mqtt']);
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    const keepAlive = this.options.keepAliveSeconds ?? 30;
    ws.onopen = () => ws.send(encodeConnect(this.options.clientId, keepAlive));
    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      this.lastSeen = Date.now();
      for (const p of this.reader.push(new Uint8Array(event.data))) this.handle(p, ws, keepAlive);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      this.setReady(false);
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private handle(p: Packet, ws: WebSocket, keepAlive: number) {
    if (p.type === PACKET.CONNACK) {
      if (p.body[1] !== 0) {
        ws.close();
        return;
      }
      this.retry = 0;
      for (const topic of this.options.subscribe ?? []) {
        ws.send(encodeSubscribe(this.packetId, topic));
        this.packetId = (this.packetId % 65535) + 1;
      }
      // ping antes do fim do keep alive; sem resposta por muito tempo, a conexão é refeita
      this.pingTimer = setInterval(
        () => {
          if (Date.now() - this.lastSeen > keepAlive * 1500) ws.close();
          else if (ws.readyState === WebSocket.OPEN) ws.send(PINGREQ);
        },
        (keepAlive * 1000) / 2,
      );
      this.setReady(true);
    } else if (p.type === PACKET.PUBLISH) {
      const { topic, payload } = decodePublish(p);
      this.options.onMessage?.(topic, payload);
    }
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const wait = Math.min(30000, 1000 * 2 ** this.retry);
    this.retry++;
    this.timers.push(setTimeout(() => this.open(), wait));
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setReady(ready: boolean) {
    if (this.ready === ready) return;
    this.ready = ready;
    this.options.onStatus?.(ready);
  }
}
