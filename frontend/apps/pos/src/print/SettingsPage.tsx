import { useEffect, useState } from 'react';
import { Esc } from './escpos';
import {
  dispatchComandas,
  getPrinterSettings,
  isNative,
  listDevices,
  savePrinterSettings,
  tryPrint,
  type BtDevice,
  type ConfiguredPrinter,
  type PrinterSettings,
} from './printer';
import { useCatalog } from '@/modules/sale/hooks';
import { ThemeToggle } from '@/app/ThemeToggle';
import {
  DEFAULT_API_URL,
  getStoredApiUrl,
  resetStoredApiUrl,
  setStoredApiUrl,
} from '@/lib/config';

export function SettingsPage() {
  const catalog = useCatalog();
  const categories = catalog.data?.categories ?? [];

  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  const [devices, setDevices] = useState<BtDevice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Modal para configurar / agregar comandera
  const [editingPrinter, setEditingPrinter] = useState<ConfiguredPrinter | null>(null);

  const [apiUrl, setApiUrl] = useState<string>('');
  const [apiTesting, setApiTesting] = useState(false);
  const [apiMsg, setApiMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    void getPrinterSettings().then(setSettings);
    void getStoredApiUrl().then(setApiUrl);
  }, []);

  async function update(patch: Partial<PrinterSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await savePrinterSettings(next);
  }

  async function saveUrl() {
    setApiTesting(true);
    setApiMsg(null);
    try {
      const clean = apiUrl.trim().replace(/\/+$/, '');
      await setStoredApiUrl(clean);
      setApiMsg({ text: '✓ URL guardada correctamente.', ok: true });
    } catch (e) {
      setApiMsg({ text: e instanceof Error ? e.message : 'Error al guardar URL', ok: false });
    } finally {
      setApiTesting(false);
    }
  }

  async function testConnection() {
    setApiTesting(true);
    setApiMsg(null);
    try {
      const clean = apiUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${clean}/`, { method: 'GET' });
      if (!res.ok) throw new Error(`El servidor respondió con código ${res.status}`);
      const data = (await res.json()) as { ok?: boolean; data?: { service?: string } };
      if (data.ok && data.data?.service === 'pizzalog-api') {
        setApiMsg({ text: '✓ Conexión exitosa con Pizzalog API.', ok: true });
      } else {
        setApiMsg({ text: '✓ Respuesta recibida del servidor.', ok: true });
      }
    } catch (e) {
      setApiMsg({
        text: `✗ Falló la conexión: ${e instanceof Error ? e.message : 'Sin respuesta'}`,
        ok: false,
      });
    } finally {
      setApiTesting(false);
    }
  }

  async function restoreDefaultUrl() {
    await resetStoredApiUrl();
    setApiUrl(DEFAULT_API_URL);
    setApiMsg({ text: `✓ URL restablecida a ${DEFAULT_API_URL}`, ok: true });
  }

  async function search() {
    setBusy(true);
    setMsg(null);
    try {
      setDevices(await listDevices());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo buscar impresoras');
    } finally {
      setBusy(false);
    }
  }

  async function testPrint(targetAddress?: string) {
    if (!settings) return;
    setBusy(true);
    setMsg(null);
    const t = new Esc(settings.width)
      .init()
      .align('center')
      .bold(true)
      .size(2)
      .line('PIZZALOG')
      .size(1)
      .bold(false)
      .line('Prueba de impresion')
      .hr()
      .align('left')
      .row('Ancho', `${settings.width} col.`)
      .row('Impresora', targetAddress ?? settings.name ?? '-')
      .hr()
      .align('center')
      .line('Si lees esto, quedo lista :)')
      .cut();
    const err = await tryPrint(t.toString(), targetAddress);
    setMsg(err ?? 'Ticket de prueba enviado.');
    setBusy(false);
  }

  async function setAsPrincipal(printer: { address: string; name: string; alias?: string; width?: 32 | 48 }) {
    if (!settings) return;
    const existing = settings.printers ?? [];
    let nextList: ConfiguredPrinter[];
    if (existing.some((p) => p.address === printer.address)) {
      nextList = existing.map((p) => ({
        ...p,
        isDefault: p.address === printer.address,
      }));
    } else {
      nextList = [
        ...existing.map((p) => ({ ...p, isDefault: false })),
        {
          id: printer.address,
          address: printer.address,
          name: printer.name,
          alias: printer.alias || printer.name,
          width: printer.width || 32,
          isDefault: true,
        },
      ];
    }
    const next: PrinterSettings = {
      ...settings,
      address: printer.address,
      name: printer.alias || printer.name,
      width: printer.width || settings.width || 32,
      printers: nextList,
    };
    setSettings(next);
    await savePrinterSettings(next);
    setMsg(`✓ "${printer.alias || printer.name}" establecida como impresora principal activa.`);
  }

  async function savePrinterConfig(printer: ConfiguredPrinter) {
    if (!settings) return;
    const existing = settings.printers ?? [];
    const index = existing.findIndex((p) => p.address === printer.address);
    let nextList: ConfiguredPrinter[];
    if (index >= 0) {
      nextList = [...existing];
      nextList[index] = printer;
    } else {
      nextList = [...existing, printer];
    }

    const makeDefault =
      Boolean(printer.isDefault) ||
      !settings.address ||
      settings.address === printer.address ||
      nextList.length === 1;

    if (makeDefault) {
      nextList = nextList.map((p) => ({ ...p, isDefault: p.address === printer.address }));
    }

    const next: PrinterSettings = {
      ...settings,
      address: makeDefault ? printer.address : settings.address,
      name: makeDefault ? (printer.alias || printer.name) : settings.name,
      width: makeDefault ? printer.width : settings.width,
      printers: nextList,
    };
    setSettings(next);
    await savePrinterSettings(next);
    setEditingPrinter(null);
    setMsg(`✓ Comandera "${printer.alias || printer.name}" guardada${makeDefault ? ' (asignada como Principal)' : ''}.`);
  }

  async function removePrinter(address: string) {
    if (!settings) return;
    const nextList = (settings.printers ?? []).filter((p) => p.address !== address);
    const wasDefault = settings.address === address;
    const nextDefault = nextList[0] ?? null;
    const next: PrinterSettings = {
      ...settings,
      address: wasDefault ? (nextDefault?.address ?? null) : settings.address,
      name: wasDefault ? (nextDefault?.alias || nextDefault?.name || null) : settings.name,
      width: wasDefault ? (nextDefault?.width || 32) : settings.width,
      printers: nextList.map((p, idx) => (wasDefault && idx === 0 ? { ...p, isDefault: true } : p)),
    };
    setSettings(next);
    await savePrinterSettings(next);
  }

  async function clearAllPrinters() {
    if (!settings) return;
    if (!window.confirm('¿Desvincular todas las comanderas guardadas?')) return;
    const next: PrinterSettings = {
      ...settings,
      address: null,
      name: null,
      printers: [],
    };
    setSettings(next);
    await savePrinterSettings(next);
    setMsg('Todas las comanderas fueron desvinculadas.');
  }

  if (!settings) return <div className="boot">Cargando ajustes…</div>;

  return (
    <div className="settings">
      <h1 className="page-title">Ajustes y Comanderas</h1>

      {/* SECCIÓN: APARIENCIA Y TEMA */}
      <section className="settings__block">
        <h2 className="settings__subtitle">🎨 Apariencia y Tema Visual</h2>
        <p className="muted-text" style={{ fontSize: 13, marginTop: 4 }}>
          Elegí la apariencia visual para operar en este dispositivo:
        </p>
        <div style={{ marginTop: 12 }}>
          <ThemeToggle />
        </div>
      </section>

      {/* SECCIÓN: MÚLTIPLES COMANDERAS */}
      <section className="settings__block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="settings__subtitle" style={{ margin: 0 }}>
              Comanderas Configuradas
            </h2>
            {settings.address && (
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--success)' }}>
                ⭐ Activa por defecto: <strong>{settings.name || settings.address}</strong>
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(settings.printers ?? []).length > 0 && (
              <button
                className="t-btn"
                style={{ fontSize: 12, minHeight: 34, padding: '0 10px', color: '#f0a59b', borderColor: 'rgba(215, 56, 40, 0.4)' }}
                onClick={() => void clearAllPrinters()}
              >
                🗑️ Desvincular todas
              </button>
            )}
            <button
              className="t-btn t-btn--primary"
              style={{ fontSize: 13, minHeight: 34, padding: '0 12px' }}
              disabled={busy}
              onClick={() => void search()}
            >
              {busy ? 'Buscando…' : '+ Buscar Bluetooth'}
            </button>
          </div>
        </div>

        {/* Mensaje de estado de comanderas */}
        {msg && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 13,
              background: msg.startsWith('✓') ? 'rgba(108, 192, 112, 0.15)' : 'rgba(253, 183, 64, 0.15)',
              color: msg.startsWith('✓') ? 'var(--success)' : 'var(--ocre)',
              border: `1px solid ${msg.startsWith('✓') ? 'rgba(108, 192, 112, 0.3)' : 'rgba(253, 183, 64, 0.3)'}`,
            }}
          >
            {msg}
          </div>
        )}

        {/* Lista de comanderas configuradas */}
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {(!settings.printers || settings.printers.length === 0) && (
            <div
              style={{
                padding: '16px',
                background: 'var(--surface-2)',
                borderRadius: '12px',
                border: '1px dashed var(--line)',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: 14,
              }}
            >
              {settings.address
                ? `Impresora principal asignada: ${settings.name || settings.address}`
                : 'No tenés comanderas guardadas. Tocá en "+ Buscar Bluetooth" para emparejar una.'}
            </div>
          )}

          {(settings.printers ?? []).map((p) => {
            const isPrincipal = settings.address === p.address;
            return (
              <div
                key={p.address}
                style={{
                  background: isPrincipal ? 'rgba(108, 192, 112, 0.05)' : 'var(--surface)',
                  border: isPrincipal ? '1px solid rgba(108, 192, 112, 0.4)' : '1px solid var(--line)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 16, color: 'var(--cream)' }}>
                      🖨️ {p.alias || p.name}
                    </strong>
                    {isPrincipal && (
                      <span
                        style={{
                          fontSize: 11,
                          background: 'rgba(108, 192, 112, 0.2)',
                          color: 'var(--success)',
                          padding: '2px 6px',
                          borderRadius: 6,
                          fontWeight: 700,
                        }}
                      >
                        ⭐ Principal
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    MAC: {p.address} · Papel: {p.width || 32} col. (
                    {(p.width || 32) === 32 ? '58mm' : '80mm'})
                  </div>
                  {p.categoryIds && p.categoryIds.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--ocre)', marginTop: 4 }}>
                      Categorías:{' '}
                      {categories
                        .filter((c) => p.categoryIds?.includes(c.id))
                        .map((c) => c.name)
                        .join(', ') || `${p.categoryIds.length} seleccionadas`}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {!isPrincipal && (
                    <button
                      className="t-btn"
                      style={{
                        minHeight: 32,
                        padding: '0 8px',
                        fontSize: 12,
                        borderColor: 'var(--ocre)',
                        color: 'var(--ocre)',
                      }}
                      title="Establecer como impresora activa principal"
                      onClick={() => void setAsPrincipal(p)}
                    >
                      ⭐ Hacer Principal
                    </button>
                  )}
                  <button
                    className="t-btn"
                    style={{ minHeight: 32, padding: '0 8px', fontSize: 12 }}
                    onClick={() => setEditingPrinter(p)}
                  >
                    Editar
                  </button>
                  <button
                    className="t-btn"
                    style={{ minHeight: 32, padding: '0 8px', fontSize: 12 }}
                    onClick={() => void testPrint(p.address)}
                  >
                    Probar
                  </button>
                  <button
                    className="t-btn"
                    style={{
                      minHeight: 32,
                      padding: '0 8px',
                      fontSize: 12,
                      color: '#f0a59b',
                      borderColor: 'rgba(215, 56, 40, 0.4)',
                    }}
                    onClick={() => void removePrinter(p.address)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Lista de dispositivos Bluetooth encontrados al buscar */}
        {devices && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <h3 style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 10px 0' }}>
              Dispositivos Bluetooth encontrados:
            </h3>
            {devices.length === 0 ? (
              <p className="muted-text">
                No se encontraron dispositivos. Verificá que la comandera esté encendida, con
                Bluetooth activo y emparejada en Android.
              </p>
            ) : (
              <div className="settings__devices">
                {devices.map((d) => {
                  const isCurrentPrincipal = settings.address === d.address;
                  return (
                    <div
                      key={d.address}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--surface-2)',
                        padding: '10px 14px',
                        borderRadius: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: 14 }}>{d.name}</strong>
                        <small style={{ color: 'var(--muted)', fontSize: 12 }}>{d.address}</small>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {isCurrentPrincipal ? (
                          <span
                            style={{
                              fontSize: 11,
                              background: 'rgba(108, 192, 112, 0.2)',
                              color: 'var(--success)',
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontWeight: 700,
                            }}
                          >
                            ⭐ Principal Activa
                          </span>
                        ) : (
                          <button
                            className="t-btn"
                            style={{
                              minHeight: 32,
                              padding: '0 10px',
                              fontSize: 12,
                              borderColor: 'var(--ocre)',
                              color: 'var(--ocre)',
                            }}
                            onClick={() => void setAsPrincipal({ address: d.address, name: d.name })}
                          >
                            ⭐ Usar como Principal
                          </button>
                        )}
                        <button
                          className="t-btn t-btn--primary"
                          style={{ minHeight: 32, padding: '0 12px', fontSize: 12 }}
                          onClick={() =>
                            setEditingPrinter({
                              id: d.address,
                              address: d.address,
                              name: d.name,
                              alias: d.name.toLowerCase().includes('bar')
                                ? 'Barra / Bebidas'
                                : 'Cocina / Horno',
                              width: 32,
                              categoryIds: [],
                              isDefault: settings.address === d.address || (settings.printers ?? []).length === 0,
                            })
                          }
                        >
                          ⚙ Configurar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* SECCIÓN: MODO DE SEPARACIÓN DE COMANDAS */}
      <section className="settings__block">
        <h2 className="settings__subtitle">Separación de Comandas</h2>
        <p className="muted-text" style={{ fontSize: 13, marginTop: 4 }}>
          Elegí cómo querés que se organicen los tickets al marchar a la cocina:
        </p>

        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: 10,
              borderRadius: 10,
              background:
                settings.comandaSplitMode === 'by_category'
                  ? 'rgba(253, 183, 64, 0.12)'
                  : 'var(--surface)',
              border: `1px solid ${settings.comandaSplitMode === 'by_category' ? 'var(--ocre)' : 'var(--line)'}`,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="comandaSplit"
              checked={settings.comandaSplitMode === 'by_category'}
              onChange={() => void update({ comandaSplitMode: 'by_category' })}
              style={{ marginTop: 3 }}
            />
            <div>
              <strong style={{ fontSize: 14, color: 'var(--cream)', display: 'block' }}>
                Separar por grupo: Cocina y Barra (Recomendado)
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: 12 }}>
                Imprime un ticket con Pizzas/Comidas y otro inmediato siguiente con Bebidas/Postres.
              </small>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: 10,
              borderRadius: 10,
              background:
                settings.comandaSplitMode === 'by_printer'
                  ? 'rgba(253, 183, 64, 0.12)'
                  : 'var(--surface)',
              border: `1px solid ${settings.comandaSplitMode === 'by_printer' ? 'var(--ocre)' : 'var(--line)'}`,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="comandaSplit"
              checked={settings.comandaSplitMode === 'by_printer'}
              onChange={() => void update({ comandaSplitMode: 'by_printer' })}
              style={{ marginTop: 3 }}
            />
            <div>
              <strong style={{ fontSize: 14, color: 'var(--cream)', display: 'block' }}>
                Por comandera asignada (Múltiples impresoras simultáneas)
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: 12 }}>
                Envía cada categoría a su comandera física específica por Bluetooth.
              </small>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: 10,
              borderRadius: 10,
              background:
                settings.comandaSplitMode === 'unified'
                  ? 'rgba(253, 183, 64, 0.12)'
                  : 'var(--surface)',
              border: `1px solid ${settings.comandaSplitMode === 'unified' ? 'var(--ocre)' : 'var(--line)'}`,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="comandaSplit"
              checked={settings.comandaSplitMode === 'unified'}
              onChange={() => void update({ comandaSplitMode: 'unified' })}
              style={{ marginTop: 3 }}
            />
            <div>
              <strong style={{ fontSize: 14, color: 'var(--cream)', display: 'block' }}>
                Comanda unificada
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: 12 }}>
                Imprime todos los productos juntos en un único ticket largo.
              </small>
            </div>
          </label>
        </div>
      </section>

      {/* SECCIÓN: OPCIONES DE IMPRESIÓN Y DATOS FISCALES */}
      <section className="settings__block">
        <h2 className="settings__subtitle">Pre-Cuentas y Datos Fiscales</h2>
        <p className="muted-text" style={{ fontSize: 13, marginTop: 4 }}>
          Los datos fiscales se incluyen opcionalmente en los tickets y pre-cuentas de mesa:
        </p>

        <label className="settings__toggle" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={Boolean(settings.fiscalData?.enabled)}
            onChange={(e) =>
              void update({
                fiscalData: {
                  ...settings.fiscalData,
                  enabled: e.target.checked,
                },
              })
            }
          />
          <span>Imprimir datos fiscales en tickets de cuenta</span>
        </label>

        {settings.fiscalData?.enabled && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <label className="t-field">
              <span>Nombre fantasía / Local</span>
              <input
                type="text"
                value={settings.fiscalData?.fantasyName ?? ''}
                placeholder="Arrabbiata Pizza"
                onChange={(e) =>
                  void update({
                    fiscalData: { ...settings.fiscalData, fantasyName: e.target.value },
                  })
                }
              />
            </label>
            <label className="t-field">
              <span>CUIT</span>
              <input
                type="text"
                value={settings.fiscalData?.cuit ?? ''}
                placeholder="20-xxxxxxxx-x"
                onChange={(e) =>
                  void update({
                    fiscalData: { ...settings.fiscalData, cuit: e.target.value },
                  })
                }
              />
            </label>
            <label className="t-field">
              <span>Condición IVA</span>
              <input
                type="text"
                value={settings.fiscalData?.ivaCondition ?? ''}
                placeholder="Resp. Inscripto / Monotributo"
                onChange={(e) =>
                  void update({
                    fiscalData: { ...settings.fiscalData, ivaCondition: e.target.value },
                  })
                }
              />
            </label>
            <label className="t-field">
              <span>Ingresos Brutos</span>
              <input
                type="text"
                value={settings.fiscalData?.iibb ?? ''}
                placeholder="IIBB..."
                onChange={(e) =>
                  void update({
                    fiscalData: { ...settings.fiscalData, iibb: e.target.value },
                  })
                }
              />
            </label>
            <label className="t-field" style={{ gridColumn: 'span 2' }}>
              <span>Dirección fiscal / Local</span>
              <input
                type="text"
                value={settings.fiscalData?.address ?? ''}
                placeholder="27 de Abril 798, Córdoba"
                onChange={(e) =>
                  void update({
                    fiscalData: { ...settings.fiscalData, address: e.target.value },
                  })
                }
              />
            </label>
            <label className="t-field" style={{ gridColumn: 'span 2' }}>
              <span>Mensaje de pie de cuenta / ticket</span>
              <input
                type="text"
                value={settings.fiscalData?.footerNote ?? ''}
                placeholder="¡Muchas gracias por su visita! Seguinos en @arrabbiata.pizza"
                onChange={(e) =>
                  void update({
                    fiscalData: { ...settings.fiscalData, footerNote: e.target.value },
                  })
                }
              />
            </label>
          </div>
        )}
      </section>

      {/* SECCIÓN: SISTEMA DE COCINA */}
      <section className="settings__block">
        <h2 className="settings__subtitle">Sistema de Cocina (KDS vs Papel)</h2>
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.useDigitalKds !== false}
            onChange={(e) => void update({ useDigitalKds: e.target.checked })}
          />
          <span>
            Usar Comandera Digital en pantalla (desactivar si utilizás comandas en papel y pincho)
          </span>
        </label>
        <p className="muted-text" style={{ marginTop: 6, fontSize: 13 }}>
          {settings.useDigitalKds !== false
            ? 'La pestaña Cocina está activa en este dispositivo.'
            : 'Modo comandas en papel activo (pedido / en preparación / pincho de entregado). La pestaña Cocina digital queda oculta.'}
        </p>
      </section>

      {/* SECCIÓN: IMPRESIÓN AUTOMÁTICA */}
      <section className="settings__block">
        <h2 className="settings__subtitle">Impresión Automática en Papel</h2>
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.autoTicket}
            onChange={(e) => void update({ autoTicket: e.target.checked })}
          />
          <span>Imprimir ticket al cobrar (Llevar / Delivery)</span>
        </label>
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.autoComanda}
            onChange={(e) => void update({ autoComanda: e.target.checked })}
          />
          <span>Imprimir comanda en papel al enviar a una cuenta</span>
        </label>
      </section>

      {/* SERVIDOR API */}
      <section
        className="settings__block"
        style={{ marginTop: 32, borderTop: '1px solid var(--line)', paddingTop: 20 }}
      >
        <h2 className="settings__subtitle">Servidor API</h2>
        <p className="muted-text">
          Configuración del endpoint backend (por defecto: <code>{DEFAULT_API_URL}</code>).
        </p>
        <label className="t-field" style={{ marginTop: 10 }}>
          <span>URL del servidor:</span>
          <input
            type="url"
            value={apiUrl}
            placeholder="https://api.pizzalog.net"
            onChange={(e) => setApiUrl(e.target.value)}
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <button
            className="t-btn t-btn--primary"
            disabled={apiTesting || !apiUrl.trim()}
            onClick={() => void saveUrl()}
          >
            Guardar URL
          </button>
          <button
            className="t-btn"
            disabled={apiTesting || !apiUrl.trim()}
            onClick={() => void testConnection()}
          >
            {apiTesting ? 'Probando…' : 'Probar conexión'}
          </button>
        </div>
        <button
          className="t-btn"
          style={{ width: '100%', marginTop: 10, fontSize: 14 }}
          onClick={() => void restoreDefaultUrl()}
        >
          Restablecer a URL original
        </button>
        {apiMsg && (
          <p
            className="settings__msg"
            style={{ color: apiMsg.ok ? 'var(--success, #6cc070)' : '#f0a59b' }}
          >
            {apiMsg.text}
          </p>
        )}
      </section>

      {/* MODAL CONFIGURACIÓN DE COMANDERA INDIVIDUAL */}
      {editingPrinter && (
        <div className="overlay" onClick={() => setEditingPrinter(null)}>
          <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">⚙ Configurar Comandera</h2>

            <label className="t-field">
              <span>Alias / Nombre identificador</span>
              <input
                type="text"
                value={editingPrinter.alias}
                placeholder="ej: Cocina, Horno, Barra"
                onChange={(e) =>
                  setEditingPrinter({ ...editingPrinter, alias: e.target.value })
                }
              />
            </label>

            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Dispositivo: <strong>{editingPrinter.name}</strong> ({editingPrinter.address})
            </div>

            <label className="t-field">
              <span>Ancho de papel térmico</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className={`t-btn${editingPrinter.width === 32 ? ' t-btn--primary' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => setEditingPrinter({ ...editingPrinter, width: 32 })}
                >
                  58 mm (32 col.)
                </button>
                <button
                  type="button"
                  className={`t-btn${editingPrinter.width === 48 ? ' t-btn--primary' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => setEditingPrinter({ ...editingPrinter, width: 48 })}
                >
                  80 mm (48 col.)
                </button>
              </div>
            </label>

            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>
                Categorías que marchan a esta comandera:
              </label>
              <div
                style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  marginTop: 6,
                  background: 'var(--surface)',
                  padding: 8,
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                }}
              >
                {categories.map((c) => {
                  const isChecked = editingPrinter.categoryIds?.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(isChecked)}
                        onChange={(e) => {
                          const current = editingPrinter.categoryIds ?? [];
                          const updated = e.target.checked
                            ? [...current, c.id]
                            : current.filter((id) => id !== c.id);
                          setEditingPrinter({ ...editingPrinter, categoryIds: updated });
                        }}
                      />
                      <span>{c.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="settings__toggle" style={{ marginTop: 14 }}>
              <input
                type="checkbox"
                checked={Boolean(editingPrinter.isDefault || settings.address === editingPrinter.address)}
                onChange={(e) =>
                  setEditingPrinter({ ...editingPrinter, isDefault: e.target.checked })
                }
              />
              <span>⭐ Usar como impresora principal (pre-cuentas y comandas generales)</span>
            </label>

            <button
              className="t-btn t-btn--primary t-btn--block"
              style={{ marginTop: 20 }}
              onClick={() => void savePrinterConfig(editingPrinter)}
            >
              Guardar Comandera
            </button>
            <button className="sheet__cancel" onClick={() => setEditingPrinter(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
