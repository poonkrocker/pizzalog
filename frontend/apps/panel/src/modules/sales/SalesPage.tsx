import { useMemo, useRef, useState } from 'react';
import { ApiError, formatARS, formatDateTime, type Sale, type SaleChannel, type SalesImportResult } from '@pizzalog/shared';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
} from '@/ui';
import type { Column } from '@/ui';
import { useCancelSale, useImportSales, useSales } from './hooks';
import { CHANNEL_LABELS, channelLabel, paymentLabel } from './labels';
import { SaleDetailView } from './SaleDetailView';

const DEEPSEEK_KEY_STORAGE = 'pizzalog_deepseek_api_key';

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SalesPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [channel, setChannel] = useState<SaleChannel | ''>('');
  const [withoutCashOnly, setWithoutCashOnly] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  // Estado del importador Loyverse / CSV
  const [importOpen, setImportOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [deepseekKey, setDeepseekKey] = useState(() => {
    try {
      return localStorage.getItem(DEEPSEEK_KEY_STORAGE) ?? '';
    } catch {
      return '';
    }
  });
  const [importResult, setImportResult] = useState<SalesImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = useMemo(
    () => ({
      from,
      to,
      ...(channel ? { channel } : {}),
      ...(withoutCashOnly ? { without_cash_session: 1 as const } : {}),
    }),
    [from, to, channel, withoutCashOnly],
  );
  const sales = useSales(query);
  const cancel = useCancelSale();
  const importMut = useImportSales();

  const total = useMemo(
    () =>
      (sales.data ?? [])
        .filter((s) => s.status === 'completed')
        .reduce((acc, s) => acc + s.total, 0),
    [sales.data],
  );

  const withoutCashCount = useMemo(
    () =>
      (sales.data ?? []).filter(
        (s) => s.status === 'completed' && (s.cash_session_id === null || s.cash_session_id === undefined),
      ).length,
    [sales.data],
  );

  async function handleRunImport(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText.trim()) {
      setImportError('Seleccioná un archivo CSV primero.');
      return;
    }
    setImportError(null);
    setImportResult(null);
    try {
      if (deepseekKey.trim()) {
        try {
          localStorage.setItem(DEEPSEEK_KEY_STORAGE, deepseekKey.trim());
        } catch {
          // ignore
        }
      }
      const res = await importMut.mutateAsync({
        csv_text: csvText,
        use_ai: useAi,
        deepseek_api_key: deepseekKey.trim() || undefined,
      });
      setImportResult(res);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Error al importar el archivo CSV.');
    }
  }

  const columns: Column<Sale>[] = [
    { key: 'sale_number', header: 'N°', render: (s) => `#${s.sale_number}` },
    { key: 'created_at', header: 'Fecha', render: (s) => formatDateTime(s.created_at) },
    { key: 'channel', header: 'Canal', render: (s) => <Badge>{channelLabel(s.channel)}</Badge> },
    { key: 'user_name', header: 'Cajero', render: (s) => s.user_name ?? '—' },
    { key: 'payment_method', header: 'Pago', render: (s) => paymentLabel(s.payment_method) },
    {
      key: 'cash_session_id',
      header: 'Caja',
      render: (s) =>
        s.cash_session_id ? (
          <span style={{ fontSize: '12px', color: 'var(--c-muted)' }}>Turno #{s.cash_session_id}</span>
        ) : (
          <Badge tone="warning">⚠️ Sin caja abierta</Badge>
        ),
    },
    { key: 'total', header: 'Total', align: 'right', render: (s) => formatARS(s.total) },
    {
      key: 'status',
      header: 'Estado',
      render: (s) => (
        <Badge tone={s.status === 'completed' ? 'success' : 'danger'}>
          {s.status === 'completed' ? 'Completada' : 'Anulada'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <div className="row-actions">
          <button className="link" onClick={() => setSelected(s.id)}>
            Ver
          </button>
          {s.status === 'completed' && (
            <button
              className="link link--danger"
              onClick={() => {
                if (confirm(`¿Anular la venta #${s.sale_number}? Se repone el stock.`)) {
                  cancel.mutate(s.id);
                }
              }}
            >
              Anular
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="Operación"
        title="Ventas"
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              setImportError(null);
              setImportResult(null);
              setImportOpen(true);
            }}
          >
            📥 Importar Loyverse / CSV
          </Button>
        }
      />

      <div className="filters" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Desde">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Canal">
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value as SaleChannel | '')}
          >
            <option value="">Todos</option>
            {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div style={{ paddingBottom: '6px' }}>
          <Checkbox
            label={`⚠️ Solo sin caja abierta${withoutCashCount > 0 && !withoutCashOnly ? ` (${withoutCashCount})` : ''}`}
            checked={withoutCashOnly}
            onChange={(e) => setWithoutCashOnly(e.target.checked)}
          />
        </div>
        <div className="filters__summary">
          <span className="filters__summary-label">Facturado</span>
          <span className="filters__summary-value">{formatARS(total)}</span>
        </div>
      </div>

      {sales.isLoading ? (
        <Loading />
      ) : sales.isError ? (
        <ErrorState message="No se pudieron cargar las ventas." />
      ) : (sales.data ?? []).length === 0 ? (
        <EmptyState title="No hay ventas en este período" />
      ) : (
        <DataTable columns={columns} rows={sales.data ?? []} />
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Detalle de venta"
      >
        {selected !== null && <SaleDetailView saleId={selected} />}
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => !importMut.isPending && setImportOpen(false)}
        title="📥 Importar ventas (Loyverse / Sistema previo)"
      >
        <form onSubmit={handleRunImport} className="stack">
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--c-muted)', lineHeight: 1.5 }}>
            Subí el archivo <strong>.CSV</strong> exportado desde <strong>Loyverse Back Office</strong> (ya sea{' '}
            <em>Recibos / Receipts</em> o <em>Ventas por artículo / Item Sales</em>) o cualquier otro sistema previo.
            Los productos se vinculan automáticamente por nombre con tu catálogo de Pizzalog y los recibos repetidos se
            ignoran para no duplicar ventas.
          </p>

          <Field label="Archivo CSV de ventas">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                📂 Elegir archivo .CSV
              </Button>
              <span style={{ fontSize: '13px', color: 'var(--c-muted)' }}>
                {csvFileName || 'Ningún archivo seleccionado'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setCsvFileName(file.name);
                  const reader = new FileReader();
                  reader.onload = () => {
                    setCsvText(typeof reader.result === 'string' ? reader.result : '');
                  };
                  reader.readAsText(file, 'utf-8');
                }}
              />
            </div>
          </Field>

          <div
            style={{
              padding: '12px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--c-border, #333)',
            }}
          >
            <Checkbox
              label="🤖 Armonizar encabezados y formatos con DeepSeek AI (opcional)"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
            />
            <p className="field__hint" style={{ marginTop: '4px' }}>
              Para archivos estándar de Loyverse no hace falta IA (se reconocen directo en español e inglés). Activá
              esta opción si el CSV tiene columnas personalizadas o viene de otro sistema distinto.
            </p>
            {useAi && (
              <div style={{ marginTop: '10px' }}>
                <Field label="DeepSeek API Key (sk-...)">
                  <Input
                    type="password"
                    placeholder="sk-..."
                    value={deepseekKey}
                    onChange={(e) => setDeepseekKey(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>

          {importError && (
            <p className="login__error" role="alert" style={{ margin: 0 }}>
              {importError}
            </p>
          )}

          {importResult && (
            <div
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                fontSize: '13px',
                lineHeight: 1.6,
              }}
            >
              <strong style={{ display: 'block', marginBottom: '4px', color: '#86efac' }}>
                ✓ Importación finalizada
              </strong>
              <div>• Ventas / recibos importados: <strong>{importResult.imported_sales}</strong></div>
              <div>• Ítems registrados: <strong>{importResult.imported_items}</strong></div>
              <div>• Duplicados omitidos: <strong>{importResult.skipped_duplicates}</strong></div>
              {importResult.ai_harmonized && (
                <div>• Armonizado con DeepSeek AI: <strong>Sí</strong></div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button type="button" variant="ghost" onClick={() => setImportOpen(false)}>
              Cerrar
            </Button>
            <Button type="submit" disabled={importMut.isPending || !csvText.trim()}>
              {importMut.isPending ? 'Importando ventas…' : 'Importar ahora'}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
