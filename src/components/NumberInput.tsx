import { useEffect, useState, type InputHTMLAttributes } from 'react';

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

/**
 * Campo de número inteiro com limites. Guarda o texto digitado à parte do valor
 * salvo: sem isso, apagar o campo para digitar outro número (ou digitar o primeiro
 * dígito de um número que só fica válido no segundo) fazia o valor antigo voltar.
 * O valor só é salvo quando está dentro dos limites; ao sair do campo, o texto
 * volta a mostrar o último valor válido.
 */
export function NumberInput({ value, min, max, onChange, onBlur, ...rest }: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));

  // acompanha mudanças feitas por fora (outra aba, restaurar backup, botões)
  useEffect(() => {
    setDraft((d) => (Number(d) === value && d.trim() !== '' ? d : String(value)));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={(e) => {
        setDraft(String(value));
        onBlur?.(e);
      }}
    />
  );
}
