import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@pizzalog/shared';
import { Button, Field, Input, Modal } from '@/ui';
import { useAreas, useDeleteArea, useSaveArea } from './hooks';

export function AreasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const areas = useAreas();
  const save = useSaveArea();
  const del = useDeleteArea();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setEditingId(null);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ id: editingId ?? undefined, data: { name: name.trim() } });
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el sector');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Sectores del salón">
      <ul className="arealist">
        {(areas.data ?? []).map((a) => (
          <li key={a.id} className="arealist__item">
            <span>{a.name}</span>
            <span className="row-actions">
              <button
                className="link"
                onClick={() => {
                  setEditingId(a.id);
                  setName(a.name);
                }}
              >
                Editar
              </button>
              <button
                className="link link--danger"
                onClick={() => {
                  if (confirm(`¿Eliminar el sector "${a.name}"?`)) del.mutate(a.id);
                }}
              >
                Eliminar
              </button>
            </span>
          </li>
        ))}
        {(areas.data ?? []).length === 0 && (
          <li className="arealist__empty">Todavía no hay sectores.</li>
        )}
      </ul>

      <form onSubmit={onSubmit} className="arealist__form">
        <Field label={editingId ? 'Renombrar sector' : 'Nuevo sector'}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adentro, Vereda, Barra…"
            required
          />
        </Field>
        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {editingId && (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={save.isPending}>
            {editingId ? 'Guardar' : 'Agregar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
