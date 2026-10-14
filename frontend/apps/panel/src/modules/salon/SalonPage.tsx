import { useEffect, useState } from 'react';
import type { Table } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, Loading, Modal, PageHeader } from '@/ui';
import { AreasModal } from './AreasModal';
import { FloorEditor } from './FloorEditor';
import { TableForm } from './TableForm';
import { useAreas, useDeleteTable, useSaveLayout, useTables } from './hooks';

export function SalonPage() {
  const api = useApi();
  const businessQuery = useQuery({
    queryKey: ['business'],
    queryFn: () => api.business.get().then((r) => r.business),
  });

  const areas = useAreas();
  const [activeArea, setActiveArea] = useState<number | null>(null);
  const [areasOpen, setAreasOpen] = useState(false);
  const [qrTable, setQrTable] = useState<Table | null>(null);

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
                <Button variant="secondary" onClick={() => setQrTable(selectedTable)}>
                  📱 Ver QR Auto-Pedido
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

      {/* Modal QR de Mesa */}
      {qrTable && (
        <Modal
          open
          onClose={() => setQrTable(null)}
          title={`Código QR · Mesa ${qrTable.label}`}
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="secondary" onClick={() => setQrTable(null)}>
                Cerrar
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const slug = businessQuery.data?.slug ?? 'demo';
                  const url = `https://pizzalog.net/${slug}/mesa/${qrTable.id}`;
                  window.open(url, '_blank');
                }}
              >
                Abrir Carta de Mesa
              </Button>
            </div>
          }
        >
          {(() => {
            const slug = businessQuery.data?.slug ?? 'demo';
            const url = `https://pizzalog.net/${slug}/mesa/${qrTable.id}`;
            const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
            return (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <p style={{ margin: '0 0 1rem 0', color: '#666', fontSize: '0.9rem' }}>
                  Los clientes escanean este código con la cámara de su celular y pueden pedir directamente desde su mesa.
                </p>
                <div style={{ background: '#fff', padding: '1rem', display: 'inline-block', borderRadius: '12px', border: '1px solid #ddd', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <img src={qrImg} alt={`QR Mesa ${qrTable.label}`} style={{ width: '220px', height: '220px', display: 'block' }} />
                  <div style={{ marginTop: '0.5rem', fontWeight: 700, fontSize: '1.1rem' }}>
                    Mesa {qrTable.label}
                  </div>
                </div>
                <div style={{ marginTop: '1rem', background: '#f5f5f5', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {url}
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    className="link"
                    style={{ fontSize: '0.85rem', fontWeight: 600 }}
                    onClick={() => {
                      navigator.clipboard.writeText(url);
                      alert('Enlace copiado al portapapeles');
                    }}
                  >
                    📋 Copiar enlace directo
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

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
