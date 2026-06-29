import { useEffect, useState } from 'react';
import type { Table } from '@pizzalog/shared';
import { Button, EmptyState, ErrorState, Loading, Modal, PageHeader } from '@/ui';
import { AreasModal } from './AreasModal';
import { FloorEditor } from './FloorEditor';
import { TableForm } from './TableForm';
import { useAreas, useDeleteTable, useSaveLayout, useTables } from './hooks';

export function SalonPage() {
  const areas = useAreas();
  const [activeArea, setActiveArea] = useState<number | null>(null);
  const [areasOpen, setAreasOpen] = useState(false);

  // Seleccionar el primer sector cuando cargan.
  useEffect(() => {
    if (activeArea === null && areas.data && areas.data.length > 0) {
      const first = areas.data[0];
      if (first) setActiveArea(first.id);
    }
  }, [areas.data, activeArea]);

  const tables = useTables(activeArea);
  const saveLayout = useSaveLayout();
  const delTable = useDeleteTable();

  const [local, setLocal] = useState<Table[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [editTable, setEditTable] = useState<Table | null>(null);
  const [creating, setCreating] = useState(false);

  // Sincronizar las mesas locales (editables) con las del servidor.
  useEffect(() => {
    if (tables.data) {
      setLocal(tables.data);
      setDirty(false);
    }
  }, [tables.data]);

  function onMove(id: number, x: number, y: number) {
    setLocal((prev) => prev.map((t) => (t.id === id ? { ...t, pos_x: x, pos_y: y } : t)));
    setDirty(true);
  }

  const selectedTable = local.find((t) => t.id === selected) ?? null;
  const formOpen = creating || editTable !== null;

  if (areas.isLoading) return <Loading />;
  if (areas.isError) return <ErrorState message="No se pudo cargar el salón." />;

  return (
    <section>
      <PageHeader
        eyebrow="Configuración"
        title="Salón"
        actions={
          <>
            <Button variant="ghost" onClick={() => setAreasOpen(true)}>
              Sectores
            </Button>
            {dirty && (
              <Button onClick={() => saveLayout.mutate(local)} disabled={saveLayout.isPending}>
                {saveLayout.isPending ? 'Guardando…' : 'Guardar disposición'}
              </Button>
            )}
          </>
        }
      />

      {(areas.data ?? []).length === 0 ? (
        <EmptyState title="Creá tu primer sector para empezar a dibujar el salón">
          <Button onClick={() => setAreasOpen(true)}>Gestionar sectores</Button>
        </EmptyState>
      ) : (
        <>
          <div className="area-tabs">
            {(areas.data ?? []).map((a) => (
              <button
                key={a.id}
                className={`area-tab${a.id === activeArea ? ' area-tab--active' : ''}`}
                onClick={() => {
                  setActiveArea(a.id);
                  setSelected(null);
                }}
              >
                {a.name}
              </button>
            ))}
          </div>

          <div className="floor-toolbar">
            <Button onClick={() => setCreating(true)}>Agregar mesa</Button>
            {selectedTable && (
              <>
                <Button variant="ghost" onClick={() => setEditTable(selectedTable)}>
                  Editar «{selectedTable.label}»
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm(`¿Eliminar la mesa "${selectedTable.label}"?`)) {
                      delTable.mutate(selectedTable.id);
                      setSelected(null);
                    }
                  }}
                >
                  Eliminar
                </Button>
              </>
            )}
            <span className="floor-hint">
              Arrastrá las mesas para ubicarlas. Tocá una para seleccionarla.
            </span>
          </div>

          {tables.isLoading ? (
            <Loading />
          ) : (
            <FloorEditor
              tables={local}
              selectedId={selected}
              onSelect={setSelected}
              onMove={onMove}
            />
          )}
        </>
      )}

      <AreasModal open={areasOpen} onClose={() => setAreasOpen(false)} />

      {activeArea !== null && (
        <Modal
          open={formOpen}
          onClose={() => {
            setCreating(false);
            setEditTable(null);
          }}
          title={editTable ? 'Editar mesa' : 'Nueva mesa'}
        >
          <TableForm
            table={editTable}
            areaId={activeArea}
            onDone={() => {
              setCreating(false);
              setEditTable(null);
            }}
          />
        </Modal>
      )}
    </section>
  );
}
