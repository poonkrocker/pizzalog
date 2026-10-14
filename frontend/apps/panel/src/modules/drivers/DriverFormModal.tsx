import { useState } from 'react';
import type { DeliveryDriver, VehicleType } from '@pizzalog/shared';
import { Button, Field, Input, Modal, Select } from '@/ui';
import { useCreateDriver, useUpdateDriver } from './hooks';

const VEHICLES: Array<{ value: VehicleType; label: string }> = [
  { value: 'moto', label: 'Moto' },
  { value: 'bici', label: 'Bicicleta' },
  { value: 'auto', label: 'Auto' },
  { value: 'otro', label: 'Otro' },
];

export function DriverFormModal({
  driver,
  onClose,
}: {
  driver: DeliveryDriver | null;
  onClose: () => void;
}) {
  const create = useCreateDriver();
  const update = useUpdateDriver();

  const [name, setName] = useState(driver?.name ?? '');
  const [phone, setPhone] = useState(driver?.phone ?? '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(driver?.vehicle_type ?? 'moto');
  const [vehiclePlate, setVehiclePlate] = useState(driver?.vehicle_plate ?? '');
  const [feePerTrip, setFeePerTrip] = useState<string>(
    driver?.fee_per_trip !== undefined ? String(driver.fee_per_trip) : '0',
  );
  const [error, setError] = useState<string | null>(null);

  const isSaving = create.isPending || update.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('El nombre del cadete es requerido');
      return;
    }

    const fee = parseFloat(feePerTrip);
    if (isNaN(fee) || fee < 0) {
      setError('La tarifa por viaje debe ser un número mayor o igual a 0');
      return;
    }

    const payload: Partial<DeliveryDriver> = {
      name: trimmedName,
      phone: phone.trim() || null,
      vehicle_type: vehicleType,
      vehicle_plate: vehiclePlate.trim() || null,
      fee_per_trip: fee,
    };

    if (driver) {
      update.mutate(
        { id: driver.id, data: payload },
        {
          onSuccess: () => onClose(),
          onError: (err: unknown) => {
            setError(err instanceof Error ? err.message : 'Error al guardar cadete');
          },
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => onClose(),
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Error al crear cadete');
        },
      });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={driver ? `Editar Cadete: ${driver.name}` : 'Nuevo Cadete / Repartidor'}
      footer={
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? 'Guardando...' : driver ? 'Guardar Cambios' : 'Crear Cadete'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <div style={{ color: 'var(--c-danger, #e63946)', background: '#ffebee', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <Field label="Nombre y Apellido *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Juan Pérez"
            required
            autoFocus
          />
        </Field>

        <Field label="Teléfono / WhatsApp">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej. 3512345678"
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="Tipo de Vehículo">
            <Select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
            >
              {VEHICLES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Patente / Matrícula">
            <Input
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
              placeholder="Ej. A123BCD"
            />
          </Field>
        </div>

        <Field label="Tarifa base por viaje / reparto ($ ARS)">
          <Input
            type="number"
            min="0"
            step="50"
            value={feePerTrip}
            onChange={(e) => setFeePerTrip(e.target.value)}
            placeholder="0.00"
          />
          <small style={{ color: '#666', marginTop: '0.25rem', display: 'block' }}>
            Monto a liquidar al cadete por cada pedido entregado.
          </small>
        </Field>
      </form>
    </Modal>
  );
}
