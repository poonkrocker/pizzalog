import { useState } from 'react';
import type { CashMovementType } from '@pizzalog/shared';
import { Button, Field, Input, Modal, Select } from '@/ui';
import { useCashMovement } from './hooks';

export function CashMovementModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [type, setType] = useState<CashMovementType>('out');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const addMovement = useCashMovement();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      setError('El monto debe ser un número mayor a cero');
      return;
    }

    addMovement.mutate(
      { type, amount: val, reason: reason.trim() || undefined },
      {
        onSuccess: () => onClose(),
        onError: (err: any) => setError(err.message ?? 'Error al registrar el movimiento'),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar Movimiento de Efectivo"
      footer={
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={addMovement.isPending}
          >
            {addMovement.isPending ? 'Guardando...' : 'Registrar'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.6rem', borderRadius: '4px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <Field label="Tipo de movimiento">
          <Select value={type} onChange={(e) => setType(e.target.value as CashMovementType)}>
            <option value="out">Egreso / Salida de dinero</option>
            <option value="in">Ingreso / Entrada de dinero</option>
          </Select>
        </Field>

        <Field label="Monto ($)">
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </Field>

        <Field label="Motivo u observación">
          <Input
            type="text"
            placeholder="Ej: Compra de hielo, propinas mozo, cambio..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
