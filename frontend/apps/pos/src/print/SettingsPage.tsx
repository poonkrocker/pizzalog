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

export function SettingsPage() {
  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  const [devices, setDevices] = useState<BtDevice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void getPrinterSettings().then(setSettings);
  }, []);

  async function update(patch: Partial<PrinterSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await savePrinterSettings(next);
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
    </div>
  );
}
