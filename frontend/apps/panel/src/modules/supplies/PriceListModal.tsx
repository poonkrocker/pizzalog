import { useEffect, useState } from 'react';
import { formatARS, type Supply, type Supplier } from '@pizzalog/shared';
import type { PriceListAlias } from '@pizzalog/shared';
import { Button, Loading, Modal } from '@/ui';
import { useSuppliers } from '../suppliers/hooks';
import { useApi } from '@/lib/auth';
import {
  parseImportFile,
  detectPriceListColumns,
  extractPriceListItems,
  matchPriceList,
  rematch,
  summarizeMatches,
  type PriceListMatch,
  type CatalogEntry,
  type SupplierAlias,
} from '@pizzalog/price-list';

interface PriceListModalProps {
  open: boolean;
  onClose: () => void;
  supplies: Supply[];
  onApplied: () => void;
}

export function PriceListModal({ open, onClose, supplies, onApplied }: PriceListModalProps) {
  const api = useApi();
  const suppliers = useSuppliers();
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [matches, setMatches] = useState<PriceListMatch[]>([]);
  const [rememberMap, setRememberMap] = useState<Record<number, boolean>>({});
  const [selectedRows, setSelectedRows] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched' | 'warnings'>('all');

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{
    batch_id: string;
    updatedCount: number;
    aliasesSaved: number;
  } | null>(null);
  const [reverting, setReverting] = useState(false);

  // Catálogo simplificado para el matcher
  const catalog: CatalogEntry[] = supplies.map((s) => ({
    id: String(s.id),
    name: s.name,
    unit: s.unit,
    current_price_per_unit: s.cost != null ? Number(s.cost) : null,
  }));

  const resetState = () => {
    setFile(null);
    setMatches([]);
    setRememberMap({});
    setSelectedRows({});
    setError(null);
    setResult(null);
    setFilter('all');
  };

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const sheets = await parseImportFile(selected, { raw: true });
      if (!sheets.length || !sheets[0]?.rows?.length) {
        throw new Error('No se encontraron filas con datos en la planilla.');
      }
      const sheet = sheets[0];
      const columns = detectPriceListColumns(sheet.rows);
      if (!columns) {
        throw new Error('No se pudo identificar una columna de producto y otra de precio en el archivo.');
      }
      const items = extractPriceListItems(sheet.rows, columns);
      if (!items.length) {
        throw new Error('No se encontraron filas con nombres de producto y precios válidos.');
      }

      // Obtener alias guardados para este proveedor
      let aliases: SupplierAlias[] = [];
      try {
        const res = await api.supplies.priceListAliases(selectedSupplierId);
        aliases = (res.aliases ?? []).map((a: PriceListAlias) => ({
          alias_key: a.alias_key,
          target_id: a.target_id,
          pack_quantity: a.pack_quantity,
          pack_unit: a.pack_unit,
        }));
      } catch {
        // Si falla la consulta de alias se continúa con matching difuso
      }

      const matchedList = matchPriceList(items, catalog, aliases);
      setMatches(matchedList);

      const initialSelected: Record<number, boolean> = {};
      const initialRemember: Record<number, boolean> = {};
      matchedList.forEach((m, idx) => {
        if (m.target_id && m.new_price_per_unit != null) {
          initialSelected[idx] = true;
          if (m.source === 'alias' || m.source === 'code') {
            initialRemember[idx] = true;
          }
        }
      });
      setSelectedRows(initialSelected);
      setRememberMap(initialRemember);
    } catch (err: any) {
      setError(err?.message || 'Error al procesar el archivo');
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTargetChange = (index: number, newTargetId: string) => {
    const updated = rematch(matches[index]!, catalog, {
      target_id: newTargetId || null,
    });
    const next = [...matches];
    next[index] = updated;
    setMatches(next);

    if (newTargetId) {
      setSelectedRows((prev) => ({ ...prev, [index]: true }));
      setRememberMap((prev) => ({ ...prev, [index]: true }));
    } else {
      setSelectedRows((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleApply = async () => {
    const toApply = matches
      .map((m, idx) => ({ match: m, index: idx }))
      .filter(({ index, match }) => selectedRows[index] && match.target_id && match.new_price_per_unit != null)
      .map(({ match, index }) => ({
        supply_id: Number(match.target_id),
        new_cost: match.new_price_per_unit!,
        alias_key: match.item.alias_key,
        raw_name: match.item.raw_name,
        raw_price: match.item.price,
        pack_quantity: match.presentation?.quantity ?? null,
        pack_unit: match.presentation?.unit ?? null,
        remember: Boolean(rememberMap[index]),
      }));

    if (!toApply.length) {
      setError('No hay insumos seleccionados para actualizar.');
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const res = await api.supplies.applyPriceList({
        supplier_id: selectedSupplierId,
        source_name: file?.name,
        items: toApply,
      });

      setResult({
        batch_id: res.batch_id,
        updatedCount: res.updated.length,
        aliasesSaved: res.aliases_saved,
      });
      onApplied();
    } catch (err: any) {
      setError(err?.message || 'Error al aplicar la lista de precios');
    } finally {
      setApplying(false);
    }
  };

  const handleRevert = async () => {
    if (!result?.batch_id) return;
    if (!confirm('¿Deshacer todos los cambios de precios aplicados en esta lista?')) return;
    setReverting(true);
    try {
      await api.supplies.revertPriceList(result.batch_id);
      alert('Se revirtieron los precios con éxito.');
      onApplied();
      onClose();
    } catch (err: any) {
      alert(err?.message || 'Error al revertir');
    } finally {
      setReverting(false);
    }
  };

  const summary = summarizeMatches(matches);

  const filteredMatches = matches
    .map((m, idx) => ({ match: m, originalIndex: idx }))
    .filter(({ match }) => {
      if (filter === 'matched') return Boolean(match.target_id);
      if (filter === 'unmatched') return !match.target_id;
      if (filter === 'warnings') return match.warnings.length > 0;
      return true;
    });

  const selectedCount = Object.values(selectedRows).filter(Boolean).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Actualizar Precios por Lista de Proveedor"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 'min(90vw, 840px)' }}>
        {result ? (
          <div style={{ padding: '1.5rem', background: 'var(--color-bg-surface-2, #f4f6f8)', borderRadius: 8 }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-success, #2e7d32)' }}>
              ✅ Precios aplicados correctamente
            </h3>
            <p style={{ margin: '0 0 1rem 0' }}>
              Se actualizaron <strong>{result.updatedCount}</strong> insumos en el catálogo y se guardaron{' '}
              <strong>{result.aliasesSaved}</strong> equivalencias para que la próxima lista de este proveedor se reconozca automáticamente.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={handleRevert} disabled={reverting}>
                {reverting ? 'Deshaciendo...' : '↺ Deshacer cambios'}
              </Button>
              <Button onClick={onClose}>Listo</Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: 4 }}>
                  Proveedor (opcional)
                </label>
                <select
                  value={selectedSupplierId ?? ''}
                  onChange={(e) => setSelectedSupplierId(e.target.value ? Number(e.target.value) : null)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
                  disabled={loading || matches.length > 0}
                >
                  <option value="">— Sin asignar / General —</option>
                  {(suppliers.data ?? []).map((s: Supplier) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: 4 }}>
                  Archivo de lista (.xlsx o .csv)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileChange}
                  disabled={loading}
                  style={{ width: '100%', padding: '0.4rem', border: '1px dashed #999', borderRadius: 6 }}
                />
              </div>
            </div>

            {loading && <Loading />}

            {error && (
              <div style={{ padding: '0.75rem 1rem', background: '#ffebee', color: '#c62828', borderRadius: 6, fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            {matches.length > 0 && (
              <>
                {/* Barra de métricas */}
                <div style={{
                  display: 'flex',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  padding: '0.75rem',
                  background: 'var(--color-bg-surface-2, #f5f5f5)',
                  borderRadius: 6,
                  fontSize: '0.85rem',
                  alignItems: 'center'
                }}>
                  <span>Total en lista: <strong>{summary.total}</strong></span>
                  <span>Vinculados: <strong style={{ color: '#2e7d32' }}>{summary.matched}</strong></span>
                  <span>Sin vincular: <strong style={{ color: summary.unmatched ? '#d32f2f' : '#666' }}>{summary.unmatched}</strong></span>
                  <span>Subas: <strong style={{ color: '#c62828' }}>+{summary.increases}</strong></span>
                  <span>Bajas: <strong style={{ color: '#2e7d32' }}>-{summary.decreases}</strong></span>
                  {summary.average_variation_pct != null && (
                    <span>Var. prom: <strong>{summary.average_variation_pct > 0 ? `+${summary.average_variation_pct}%` : `${summary.average_variation_pct}%`}</strong></span>
                  )}
                </div>

                {/* Filtros */}
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 14,
                      border: '1px solid #ccc',
                      background: filter === 'all' ? '#1976d2' : '#fff',
                      color: filter === 'all' ? '#fff' : '#333',
                      cursor: 'pointer'
                    }}
                  >
                    Todos ({matches.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter('matched')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 14,
                      border: '1px solid #ccc',
                      background: filter === 'matched' ? '#1976d2' : '#fff',
                      color: filter === 'matched' ? '#fff' : '#333',
                      cursor: 'pointer'
                    }}
                  >
                    Vinculados ({summary.matched})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter('unmatched')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 14,
                      border: '1px solid #ccc',
                      background: filter === 'unmatched' ? '#1976d2' : '#fff',
                      color: filter === 'unmatched' ? '#fff' : '#333',
                      cursor: 'pointer'
                    }}
                  >
                    Sin vincular ({summary.unmatched})
                  </button>
                  {summary.with_warnings > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter('warnings')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 14,
                        border: '1px solid #ff9800',
                        background: filter === 'warnings' ? '#ff9800' : '#fff',
                        color: filter === 'warnings' ? '#fff' : '#e65100',
                        cursor: 'pointer'
                      }}
                    >
                      ⚠️ Con advertencias ({summary.with_warnings})
                    </button>
                  )}
                </div>

                {/* Tabla de revisión interactiva */}
                <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 6 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#fafafa', borderBottom: '1px solid #ddd', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px', width: '32px' }}>
                          <input
                            type="checkbox"
                            checked={selectedCount > 0 && selectedCount === matches.filter((m) => m.target_id && m.new_price_per_unit != null).length}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const next: Record<number, boolean> = {};
                              matches.forEach((m, idx) => {
                                if (m.target_id && m.new_price_per_unit != null) next[idx] = checked;
                              });
                              setSelectedRows(next);
                            }}
                          />
                        </th>
                        <th style={{ padding: '8px 10px' }}>Ítem en lista de proveedor</th>
                        <th style={{ padding: '8px 10px' }}>Insumo del catálogo</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Precio lista</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Precio anterior</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Nuevo unitario</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Variación</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }} title="Recordar para la próxima lista">Recordar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatches.map(({ match, originalIndex }) => {
                        const targetSupply = supplies.find((s) => String(s.id) === match.target_id);
                        const isSelected = Boolean(selectedRows[originalIndex]);
                        const isInc = match.variation_pct != null && match.variation_pct > 0.05;
                        const isDec = match.variation_pct != null && match.variation_pct < -0.05;

                        return (
                          <tr
                            key={originalIndex}
                            style={{
                              borderBottom: '1px solid #eee',
                              background: !match.target_id ? '#fffdf7' : isSelected ? '#fff' : '#fafafa',
                            }}
                          >
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                disabled={!match.target_id || match.new_price_per_unit == null}
                                checked={isSelected}
                                onChange={(e) => {
                                  setSelectedRows((prev) => ({
                                    ...prev,
                                    [originalIndex]: e.target.checked,
                                  }));
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ fontWeight: 600 }}>{match.item.raw_name}</div>
                              {match.presentation && (
                                <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                  Envase: {match.presentation.quantity} {match.presentation.unit}
                                </div>
                              )}
                              {match.warnings.map((w, i) => (
                                <div key={i} style={{ fontSize: '0.72rem', color: '#e65100' }}>
                                  ⚠️ {w}
                                </div>
                              ))}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <select
                                value={match.target_id ?? ''}
                                onChange={(e) => handleTargetChange(originalIndex, e.target.value)}
                                style={{
                                  padding: '4px 6px',
                                  fontSize: '0.8rem',
                                  borderRadius: 4,
                                  border: match.target_id ? '1px solid #ccc' : '1px solid #ffa726',
                                  background: match.target_id ? '#fff' : '#fff8e1',
                                  maxWidth: '220px',
                                }}
                              >
                                <option value="">— Sin vincular —</option>
                                {supplies.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({s.unit})
                                  </option>
                                ))}
                              </select>
                              {match.target_id && (
                                <div style={{ fontSize: '0.7rem', color: '#777', marginTop: 2 }}>
                                  Match: {match.source === 'alias' ? '⭐ Guardado' : match.source === 'code' ? 'Código SKU' : match.source === 'exact' ? 'Exacto' : `Similar (${Math.round(match.confidence * 100)}%)`}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              {formatARS(match.item.price)}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#666' }}>
                              {match.old_price_per_unit != null ? formatARS(match.old_price_per_unit) : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                              {match.new_price_per_unit != null && targetSupply
                                ? `${formatARS(match.new_price_per_unit)} / ${targetSupply.unit}`
                                : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              {match.variation_pct != null ? (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    background: isInc ? '#ffebee' : isDec ? '#e8f5e9' : '#f5f5f5',
                                    color: isInc ? '#c62828' : isDec ? '#2e7d32' : '#616161',
                                  }}
                                >
                                  {match.variation_pct > 0 ? `+${match.variation_pct}%` : `${match.variation_pct}%`}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                disabled={!match.target_id}
                                checked={Boolean(rememberMap[originalIndex])}
                                onChange={(e) => {
                                  setRememberMap((prev) => ({
                                    ...prev,
                                    [originalIndex]: e.target.checked,
                                  }));
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>
                    Al aplicar, los costos calculados de los productos que usen estos insumos se actualizarán conservadoramente.
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button variant="secondary" onClick={onClose} disabled={applying}>
                      Cancelar
                    </Button>
                    <Button onClick={handleApply} disabled={applying || selectedCount === 0}>
                      {applying ? 'Aplicando...' : `Aplicar ${selectedCount} ${selectedCount === 1 ? 'precio' : 'precios'}`}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
