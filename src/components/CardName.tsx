import { useState } from 'react';
import { cardLabel } from '../lib/cards';
import { IconEdit } from './Icons';

export { cardLabel };

interface CardNameProps {
  name: string;
  number: string;
  /** Sem onRename o nome é só exibido (ex.: histórico). */
  onRename?: (name: string) => void;
  size?: 'md' | 'lg';
}

/** Nome da cartela com edição no próprio lugar. */
export function CardName({ name, number, onRename, size = 'md' }: CardNameProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  const start = () => {
    setValue(name);
    setEditing(true);
  };

  const save = () => {
    onRename?.(value.trim());
    setEditing(false);
  };

  if (editing && onRename) {
    return (
      <form
        className="card-name-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
          }}
          maxLength={40}
          autoFocus
          placeholder={number ? `Cartela ${number}` : 'Nome da cartela'}
          aria-label={`Nome da cartela ${number || name}`}
        />
        <button type="submit" className="btn btn-primary btn-sm">
          Salvar
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <div className={`card-name card-name-${size}`}>
      <span className={`card-name-text ${name.trim() ? '' : 'is-empty'}`}>{cardLabel(name, number)}</span>
      {onRename && (
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          onClick={start}
          aria-label={`Renomear cartela ${number || name}`}
          title="Renomear"
        >
          <IconEdit size={16} />
        </button>
      )}
    </div>
  );
}
