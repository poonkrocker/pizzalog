import { useEffect, useState } from 'react';
import { formatARS, type Supply } from '@pizzalog/shared';
import type { SupplyPriceHistoryEntry } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { Loading, Modal } from '@/ui';

interface PriceHistoryModalProps {
  supply: Supply | null;
  onClose: () => void;
}

export function PriceHistoryModal({ supply, onClose }: PriceHistoryModalProps) {
  const api = useApi();
  const [history, setHistory] = useState<SupplyPriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supply) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.supplies
      .priceHistory(supply.id)
      .then((res: { history: SupplyPriceHistoryEntry[] }) => {
        if (!cancelled) setHistory(res.history ?? []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Error al cargar el historial de precios');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supply, api]);

  return (
    <Modal
      open={supply !== null}
      onClose={onClose}
      title={supply ? `Historial de precios · ${supply.name}` : 'Historial de precios'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 'min(90vw, 680px)' }}>
        {loading && <Loading />}

        {error && (
          <div style={{ padding: '0.75rem', background: '#ffebee', color: '#c62828', borderRadius: 6, fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', margin: '2rem 0' }}>
            No hay registros de cambios de precio para este insumo todavía.
          </p>
        )}

        {!loading && history.length > 0 && (
          <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #ddd', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Fecha</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Anterior</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Nuevo</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Variación</th>
                  <th style={{ padding: '8px 10px' }}>Origen</th>
                  <th style={{ padding: '8px 10px' }}>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  let varPct: number | null = null;
                  if (row.old_cost != null && row.old_cost > 0 && row.new_cost != null) {
                    varPct = Math.round(((row.new_cost - row.old_cost) / row.old_cost) * 1000) / 10;
                  }
                  const isInc = varPct != null && varPct > 0.05;
                  const isDec = varPct != null && varPct < -0.05;

                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        {new Date(row.created_at).toLocaleDateString()} {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#666' }}>
                        {row.old_cost != null ? formatARS(row.old_cost) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                        {row.new_cost != null ? formatARS(row.new_cost) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {varPct != null ? (
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: isInc ? '#ffebee' : isDec ? '#e8f5e9' : '#f5f5f5',
                              color: isInc ? '#c62828' : isDec ? '#2e7d32' : '#616161',
                            }}
                          >
                            {varPct > 0 ? `+${varPct}%` : `${varPct}%`}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {row.source === 'price_list' ? (
                          <span>
                            📋 Lista {row.source_name ? `(${row.source_name})` : ''}
                          </span>
                        ) : row.source === 'revert' ? (
                          <span>↺ Reversión de lista</span>
                        ) : (
                          <span>✏️ Manual</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#666' }}>
                        {row.user_name || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
