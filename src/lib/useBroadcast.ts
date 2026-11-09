import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawerState } from '../types';
import {
  BROKERS,
  loadOrCreateIdentity,
  randomClientId,
  signState,
  topicFor,
  verifyMessage,
  type BroadcastState,
  type Identity,
} from './broadcast';
import { MqttClient } from './mqtt';

export interface ConnectionInfo {
  /** Quantos dos servidores estão conectados agora. */
  connected: number;
  total: number;
}

export interface Transmitter extends ConnectionInfo {
  code: string | null;
  /** Avisa os participantes que acabou e para de publicar. */
  stop: () => Promise<void>;
}

function useConnectionCount() {
  const [connected, setConnected] = useState(0);
  const statuses = useRef<boolean[]>([]);
  const update = useCallback((index: number, ok: boolean) => {
    statuses.current[index] = ok;
    setConnected(statuses.current.filter(Boolean).length);
  }, []);
  const reset = useCallback(() => {
    statuses.current = [];
    setConnected(0);
  }, []);
  return { connected, update, reset };
}

/**
 * Publica o sorteio enquanto a transmissão estiver ligada. Fica no App (e não na
 * tela do sorteador) para continuar transmitindo se o sorteador abrir outra tela.
 */
export function useTransmitter(drawer: DrawerState, enabled: boolean): Transmitter {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const clients = useRef<MqttClient[]>([]);
  const lastMessage = useRef<string | null>(null);
  const lastSeq = useRef(0);
  const { connected, update, reset } = useConnectionCount();

  useEffect(() => {
    if (!enabled || identity) return;
    let alive = true;
    void loadOrCreateIdentity().then((id) => alive && setIdentity(id));
    return () => {
      alive = false;
    };
  }, [enabled, identity]);

  useEffect(() => {
    if (!enabled || !identity) return;
    const topic = topicFor(identity.code);
    const list: MqttClient[] = BROKERS.map(
      (broker, i) =>
        new MqttClient({
          url: broker.url,
          clientId: randomClientId(),
          onStatus: (ok) => {
            update(i, ok);
            // mensagem retida: quem entrar depois (ou reconectar) recebe o estado atual na hora
            if (ok && lastMessage.current) list[i].publish(topic, lastMessage.current);
          },
        }),
    );
    clients.current = list;
    return () => {
      list.forEach((c) => c.close());
      clients.current = [];
      reset();
    };
  }, [enabled, identity, update, reset]);

  const publish = useCallback(
    async (state: Omit<BroadcastState, 'code' | 'seq'>) => {
      if (!identity) return;
      // horário em milissegundos, sempre crescente: dispensa guardar contador
      const seq = Math.max(Date.now(), lastSeq.current + 1);
      lastSeq.current = seq;
      const message = await signState(identity, { ...state, seq });
      lastMessage.current = message;
      clients.current.forEach((c) => c.publish(topicFor(identity.code), message));
    },
    [identity],
  );

  const { draws, round } = drawer;
  const { maxBall } = drawer.config;
  useEffect(() => {
    if (!enabled || !identity) return;
    void publish({ round, maxBall, draws, live: true });
  }, [enabled, identity, publish, draws, round, maxBall]);

  const stop = useCallback(async () => {
    await publish({ round, maxBall, draws, live: false });
  }, [publish, round, maxBall, draws]);

  return { code: enabled ? (identity?.code ?? null) : null, connected, total: BROKERS.length, stop };
}

export interface Receiver extends ConnectionInfo {
  state: BroadcastState | null;
}

/** Assina o código do sorteador nos servidores e guarda o último estado válido recebido. */
export function useReceiver(code: string | null): Receiver {
  const [state, setState] = useState<BroadcastState | null>(null);
  const { connected, update, reset } = useConnectionCount();

  useEffect(() => {
    setState(null);
    if (!code) return;
    const topic = topicFor(code);
    let best = 0;
    let alive = true;
    const list = BROKERS.map(
      (broker, i) =>
        new MqttClient({
          url: broker.url,
          clientId: randomClientId(),
          subscribe: [topic],
          onStatus: (ok) => update(i, ok),
          onMessage: (t, payload) => {
            if (t !== topic) return;
            void verifyMessage(code, payload).then((s) => {
              // a mesma mensagem chega pelos dois servidores; fica a mais nova
              if (!alive || !s || s.seq <= best) return;
              best = s.seq;
              setState(s);
            });
          },
        }),
    );
    return () => {
      alive = false;
      list.forEach((c) => c.close());
      reset();
    };
  }, [code, update, reset]);

  return { state, connected, total: BROKERS.length };
}
