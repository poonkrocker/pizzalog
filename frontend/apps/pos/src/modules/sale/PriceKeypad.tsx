import { useState } from 'react';
import { formatARS, type Product } from '@pizzalog/shared';

interface Props {
  product: Product;
  onConfirm: (amount: number) => void;
  onClose: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PriceKeypad({ product, onConfirm, onClose }: Props) {
  const [digits, setDigits] = useState('');
  const amount = Number(digits || '0');

  const press = (d: string) => setDigits((p) => (p + d).replace(/^0+/, '').slice(0, 9));
  const back = () => setDigits((p) => p.slice(0, -1));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet__title">{product.name}</h2>
        <p className="muted-text" style={{ marginTop: 0 }}>
          Ingresá el importe
        </p>
        <div className="keypad-display">{formatARS(amount)}</div>
        <div className="keypad">
          {KEYS.map((k) => (
            <button key={k} className="keypad-key" onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <button className="keypad-key keypad-key--muted" onClick={back} aria-label="Borrar">
            ⌫
          </button>
          <button className="keypad-key" onClick={() => press('0')}>
            0
          </button>
          <button
            className="keypad-key keypad-key--ok"
            disabled={amount <= 0}
            onClick={() => onConfirm(amount)}
            aria-label="Confirmar"
          >
            ✓
          </button>
        </div>
        <button className="sheet__cancel" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
