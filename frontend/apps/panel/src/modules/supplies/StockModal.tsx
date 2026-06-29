import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, formatDateTime, type Supply, type SupplyMovementType } from '@pizzalog/shared';
import { Button, Field, Input, Select } from '@/ui';
import { useMoveSupply, useSupplyMovements } from './hooks';

const TYPE_LABELS: Record<SupplyMovementType, string> = {
  restock: 'Reposición',
  consumption: 'Consumo',
  adjustment: 'Ajuste',
  count: 'Recuento',
};

export function StockModal({ supply, onDone }: { supply: Supply; onDone: () => void }) {
  const move = useMoveSupply();
  const movements = useSupplyMovements(supply.id);
  const [currentStock, setCurrentStock] = useState(supply.stock);
  const [type, setType] = useState<SupplyMovementType>('restock');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await move.mutateAsync({
        id: supply.id,
        body: { type, quantity: Number(quantity), reason: reason.trim() || undefined },
      });
      setCurrentStock(res.supply.stock);
      setQuantity('');
      setReason('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el movimiento');
    }
  }

  const qtyLabel = type === 'count' ? 'Stock real contado' : 'Cantidad';

  return (
    <div>
      <p className="stock-current">
        Stock actual: <strong>{currentStock}</strong> {supply.unit}
      </p>

      <form onSubmit={onSubmit}>
        <div className="form-row">
          <Field label="Movimiento">
            <Select value={type} onChange={(e) => setType(e.target.value as SupplyMovementType)}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={qtyLabel}>
            <Input
              type="number"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field
          label="Motivo"
          hint={type === 'adjustment' ? 'Obligatorio para ajustes.' : 'Opcional.'}
        >
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cerrar
          </Button>
          <Button type="submit" disabled={move.isPending}>
            {move.isPending ? 'Registrando…' : 'Registrar'}
          </Button>
        </div>
      </form>

      <h3 className="stock-history-title">Movimientos recientes</h3>
      {movements.isLoading ? (
        <p className="muted-text">Cargando…</p>
      ) : (movements.data ?? []).length === 0 ? (
        <p className="muted-text">Sin movimientos todavía.</p>
      ) : (
        <ul className="stock-history">
          {(movements.data ?? []).map((m) => (
            <li key={m.id}>
              <span>
                <span className="stock-history__type">{TYPE_LABELS[m.type]}</span>
                <span className={`stock-history__qty${m.quantity < 0 ? ' is-neg' : ''}`}>
                  {m.quantity > 0 ? '+' : ''}
                  {m.quantity} {supply.unit}
                </span>
              </span>
              <span className="stock-history__meta">
                {m.user_name ? `${m.user_name} · ` : ''}
                {formatDateTime(m.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
