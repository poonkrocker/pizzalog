import { useEffect, useState } from 'react';
import { Esc } from './escpos';
import {
  getPrinterSettings,
  isNative,
  listDevices,
  savePrinterSettings,
  tryPrint,
  type BtDevice,
  type PrinterSettings,
} from './printer';
import {
  DEFAULT_API_URL,
  getStoredApiUrl,
  resetStoredApiUrl,
  setStoredApiUrl,
} from '@/lib/config';

export function SettingsPage() {
  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  const [devices, setDevices] = useState<BtDevice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  async function testPrint() {
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
      .row('Impresora', settings.name ?? '-')
      .hr()
      .align('center')
      .line('Si lees esto, quedo lista :)')
      .cut();
    const err = await tryPrint(t.toString());
    setMsg(err ?? 'Ticket de prueba enviado.');
    setBusy(false);
  }

  if (!settings) return <div className="boot">Cargando ajustes…</div>;

  return (
    <div className="settings">
      <h1 className="page-title">Ajustes de impresión</h1>

      {!isNative() && (
        <p className="settings__warn">
          Estás en el navegador: acá se puede configurar, pero la impresión
          funciona en la app Android instalada.
        </p>
      )}

      <section className="settings__block">
        <h2 className="settings__subtitle">Impresora</h2>
        <p className="muted-text">
          {settings.name
            ? `Configurada: ${settings.name}`
            : 'Todavía no elegiste una impresora.'}
        </p>
        <button className="t-btn t-btn--primary" disabled={busy} onClick={() => void search()}>
          {busy ? 'Buscando…' : 'Buscar impresoras'}
        </button>

        {devices && (
          <div className="settings__devices">
            {devices.length === 0 ? (
              <p className="muted-text">
                No se encontraron dispositivos. Emparejá la comandera desde los
                ajustes Bluetooth de Android y volvé a buscar.
              </p>
            ) : (
              devices.map((d) => (
                <button
                  key={d.address}
                  className={`bar-account${settings.address === d.address ? ' is-selected' : ''}`}
                  onClick={() => void update({ address: d.address, name: d.name })}
                >
                  <span className="bar-account__name">{d.name}</span>
                  <span className="bar-account__total">
                    {settings.address === d.address ? '✓' : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </section>

      <section className="settings__block">
        <h2 className="settings__subtitle">Papel</h2>
        <div className="settings__paper">
          <button
            className={`t-btn${settings.width === 32 ? ' t-btn--primary' : ''}`}
            onClick={() => void update({ width: 32 })}
          >
            58 mm (32 col.)
          </button>
          <button
            className={`t-btn${settings.width === 48 ? ' t-btn--primary' : ''}`}
            onClick={() => void update({ width: 48 })}
          >
            80 mm (48 col.)
          </button>
        </div>
      </section>

      <section className="settings__block">
        <h2 className="settings__subtitle">Impresión automática</h2>
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
          <span>Imprimir comanda al enviar a una cuenta</span>
        </label>
      </section>

      <section className="settings__block">
        <button
          className="t-btn t-btn--primary t-btn--block"
          disabled={busy || !settings.address}
          onClick={() => void testPrint()}
        >
          Imprimir ticket de prueba
        </button>
        {msg && <p className="settings__msg">{msg}</p>}
      </section>

      <section className="settings__block" style={{ marginTop: 32, borderTop: '1px solid var(--line)', paddingTop: 20 }}>
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
    </div>
  );
}
