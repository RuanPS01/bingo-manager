import { useState } from 'react';
import { AI_MODELS, DEFAULT_AI_MODEL, clearAiConfig, maskKey, saveAiConfig, type AiConfig } from '../lib/ai';
import { Modal } from './Dialog';

interface AiSettingsProps {
  config: AiConfig | null;
  /** Texto extra no topo, quando a janela abre porque a pessoa tentou ler uma foto sem configurar. */
  intro?: string;
  onClose: () => void;
  onSave: (config: AiConfig | null) => void;
}

const OTHER = 'outro';

/** Configuração da leitura por foto: chave da API e modelo. Fica salva só neste aparelho. */
export function AiSettings({ config, intro, onClose, onSave }: AiSettingsProps) {
  const known = !config || AI_MODELS.some((m) => m.id === config.model);
  const [apiKey, setApiKey] = useState('');
  const [choice, setChoice] = useState<string>(known ? (config?.model ?? DEFAULT_AI_MODEL) : OTHER);
  const [custom, setCustom] = useState(known ? '' : (config?.model ?? ''));
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    // Campo vazio mantém a chave já salva; assim dá para trocar só o modelo.
    const key = apiKey.trim() || config?.apiKey || '';
    const model = choice === OTHER ? custom.trim() : choice;
    if (!key) return setError('Cole a chave da API da Anthropic.');
    if (!model) return setError('Digite o ID do modelo.');
    const next = { apiKey: key, model };
    saveAiConfig(next);
    onSave(next);
  };

  const remove = () => {
    clearAiConfig();
    onSave(null);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Leitura de cartelas por foto"
      size="md"
      footer={
        <>
          {config && (
            <button type="button" className="btn btn-ghost btn-danger-text push-left" onClick={remove}>
              Remover chave
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <form
        className="ai-settings"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {intro && <p className="notice-inline">{intro}</p>}
        <p className="hint">
          Tire uma foto da cartela e a IA da Anthropic (Claude) preenche o número e os jogos para você conferir. Para
          isso, use uma chave da sua conta na API da Anthropic: crie em{' '}
          <a href="https://platform.claude.com/" target="_blank" rel="noreferrer">
            platform.claude.com
          </a>
          , em API Keys. Cada leitura é cobrada na sua conta.
        </p>

        <label className="field">
          <span>Chave da API</span>
          <div className="input-with-action">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError(null);
              }}
              placeholder={config ? `Salva: ${maskKey(config.apiKey)}` : 'sk-ant-...'}
              autoComplete="off"
              spellCheck={false}
              data-autofocus
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowKey((v) => !v)}>
              {showKey ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </label>
        {config && <p className="hint">Deixe em branco para manter a chave salva.</p>}

        <fieldset className="field">
          <legend>Modelo</legend>
          <div className="ai-models">
            {AI_MODELS.map((m) => (
              <label key={m.id} className={`ai-model ${choice === m.id ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="modelo"
                  value={m.id}
                  checked={choice === m.id}
                  onChange={() => setChoice(m.id)}
                />
                <span>
                  <strong>{m.label}</strong>
                  <small>{m.hint}</small>
                </span>
              </label>
            ))}
            <label className={`ai-model ${choice === OTHER ? 'is-on' : ''}`}>
              <input
                type="radio"
                name="modelo"
                value={OTHER}
                checked={choice === OTHER}
                onChange={() => setChoice(OTHER)}
              />
              <span>
                <strong>Outro modelo</strong>
                <small>Digite o ID do modelo da Anthropic</small>
              </span>
            </label>
          </div>
          {choice === OTHER && (
            <input
              className="ai-custom-model"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setError(null);
              }}
              placeholder="Ex.: claude-opus-5-5"
              aria-label="ID do modelo"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </fieldset>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          A chave fica salva só neste aparelho, não entra no backup e é enviada apenas para a Anthropic, junto com a
          foto, na hora da leitura.
        </p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
