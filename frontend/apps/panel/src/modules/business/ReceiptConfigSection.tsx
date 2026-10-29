import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Business, ReceiptConfig } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { Button, Checkbox, Field, Select, Textarea } from '@/ui';

const DEFAULT_CONFIG: ReceiptConfig = {
  show_logo: true,
  header_text: '',
  footer_text: '¡Muchas gracias por su visita! Seguinos en @arrabbiata.pizza',
  show_customer_info: false,
  show_comments: false,
  language: 'es',
};

export function ReceiptConfigSection({ business }: { business: Business }) {
  const api = useApi();
  const qc = useQueryClient();

  const [config, setConfig] = useState<ReceiptConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (business.receipt_config) {
      setConfig({ ...DEFAULT_CONFIG, ...business.receipt_config });
    }
  }, [business.receipt_config]);

  const save = useMutation({
    mutationFn: (nextConfig: ReceiptConfig) =>
      api.business.update({
        name: business.name,
        slug: business.slug,
        receipt_config: nextConfig,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business'] });
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 3500);
    },
    onError: (err: any) => {
      setError(err?.message || 'No se pudo guardar la configuración de los recibos');
    },
  });

  const set = <K extends keyof ReceiptConfig>(key: K, val: ReceiptConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const headerLength = (config.header_text ?? '').length;
  const footerLength = (config.footer_text ?? '').length;

  return (
    <section className="section-card" style={{ marginTop: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0' }}>
            Configuración de los recibos
          </h2>
          <p className="muted-text" style={{ fontSize: '13px', margin: 0 }}>
            Personalizá cómo se ven los tickets, cuentas y comandas impresas en tu comandera térmica.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '20px', display: 'grid', gap: '20px' }}>
        {/* Logotipo */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>
            Logotipo
          </label>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Preview Email / Web */}
            <div
              style={{
                width: '130px',
                padding: '10px',
                background: '#f8f9fa',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '8px' }}>
                Recibo enviado por email
              </span>
              <div
                style={{
                  height: '70px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                }}
              >
                {business.logo_url ? (
                  <img
                    src={business.logo_url}
                    alt=""
                    style={{ maxHeight: '56px', maxWidth: '100px', objectFit: 'contain' }}
                  />
                ) : (
                  <strong style={{ fontSize: '14px', color: '#334155' }}>{business.name}</strong>
                )}
              </div>
            </div>

            {/* Preview Impreso Térmico */}
            <div
              style={{
                width: '130px',
                padding: '10px',
                background: '#f8f9fa',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '8px' }}>
                Recibo impreso
              </span>
              <div
                style={{
                  height: '70px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  filter: 'grayscale(100%) contrast(250%)',
                }}
              >
                {config.show_logo !== false && business.logo_url ? (
                  <img
                    src={business.logo_url}
                    alt=""
                    style={{ maxHeight: '56px', maxWidth: '100px', objectFit: 'contain' }}
                  />
                ) : (
                  <strong style={{ fontSize: '13px', color: '#000', letterSpacing: '1px' }}>
                    {business.name.toUpperCase()}
                  </strong>
                )}
              </div>
            </div>

            <div style={{ flex: '1 1 200px' }}>
              <Checkbox
                label="Incluir logotipo en tickets y pre-cuentas impresas"
                checked={config.show_logo !== false}
                onChange={() => set('show_logo', config.show_logo === false)}
              />
              <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 24px' }}>
                Si se desmarca, se imprime únicamente el nombre del local en texto para ahorrar papel.
              </p>
            </div>
          </div>
        </div>

        {/* Cabecera */}
        <Field
          label="Cabecera"
          hint={`Texto adicional que aparecerá arriba de todo en el ticket (${headerLength}/500)`}
        >
          <Textarea
            rows={2}
            maxLength={500}
            value={config.header_text ?? ''}
            placeholder="ej: Dirección del local, teléfono de pedidos, CUIT o mensaje de bienvenida…"
            onChange={(e) => set('header_text', e.target.value)}
          />
        </Field>

        {/* Pie de página */}
        <Field
          label="Pie de página"
          hint={`Mensaje de despedida o agradecimiento (${footerLength}/500)`}
        >
          <Textarea
            rows={2}
            maxLength={500}
            value={config.footer_text ?? ''}
            placeholder="ej: ¡Muchas gracias por su visita! Seguinos en Instagram @arrabbiata.pizza"
            onChange={(e) => set('footer_text', e.target.value)}
          />
        </Field>

        {/* Toggles */}
        <div style={{ display: 'grid', gap: '12px', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <Checkbox
            label="Mostrar información del cliente (nombre, teléfono y dirección si están cargados)"
            checked={Boolean(config.show_customer_info)}
            onChange={() => set('show_customer_info', !config.show_customer_info)}
          />

          <Checkbox
            label="Mostrar comentarios y notas de los productos en la cuenta del cliente"
            checked={Boolean(config.show_comments)}
            onChange={() => set('show_comments', !config.show_comments)}
          />
        </div>

        {/* Idioma */}
        <Field label="Idioma de recibo">
          <Select
            value={config.language || 'es'}
            onChange={(e) => set('language', e.target.value)}
            style={{ maxWidth: '240px' }}
          >
            <option value="es">Español</option>
          </Select>
        </Field>

        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="business-form__ok" style={{ margin: 0 }}>
            ✓ Configuración de recibos guardada correctamente.
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (business.receipt_config) {
                setConfig({ ...DEFAULT_CONFIG, ...business.receipt_config });
              } else {
                setConfig(DEFAULT_CONFIG);
              }
            }}
          >
            CANCELAR
          </Button>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate(config)}
          >
            {save.isPending ? 'GUARDANDO…' : 'GUARDAR'}
          </Button>
        </div>
      </div>
    </section>
  );
}
