import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type Business, type BusinessTheme } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/ui';
import { PageHeader } from '@/ui';
import { ErrorState, Loading } from '@/ui';
import { HoursSection } from './HoursSection';
import { SocialSection } from './SocialSection';

function useBusiness() {
  const api = useApi();
  return useQuery({
    queryKey: ['business'],
    queryFn: () => api.business.get().then((r) => r.business),
  });
}

const THEME_DEFAULTS: Required<BusinessTheme> = {
  bg: '#dfe7ef',
  accent: '#d73828',
  link: '#005dac',
  text: '#222222',
  pattern: 'mosaico',
};

const PATTERNS: Array<{ value: BusinessTheme['pattern']; label: string }> = [
  { value: 'mosaico', label: 'Mosaico' },
  { value: 'liso', label: 'Liso' },
  { value: 'rayas', label: 'Rayas' },
  { value: 'lunares', label: 'Lunares' },
];

export function BusinessPage() {
  const business = useBusiness();
  const api = useApi();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (data: Parameters<typeof api.business.update>[0]) => api.business.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business'] }),
  });

  const [form, setForm] = useState<Business | null>(null);
  const [custom, setCustom] = useState(false);
  const [theme, setTheme] = useState<Required<BusinessTheme>>(THEME_DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (business.data && !form) {
      setForm(business.data);
      if (business.data.theme) {
        setCustom(true);
        setTheme({ ...THEME_DEFAULTS, ...business.data.theme });
      }
    }
  }, [business.data, form]);

  if (business.isLoading || !form) return <Loading />;
  if (business.isError) return <ErrorState message="No se pudo cargar el perfil" />;

  const set = (k: keyof Business, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        phone: form.phone || null,
        address: form.address || null,
        description: form.description || null,
        google_maps_url: form.google_maps_url || null,
        logo_url: form.logo_url || null,
        accepts_online_orders: form.accepts_online_orders,
        theme: custom ? theme : null,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el perfil');
    }
  }

  return (
    <section>
      <PageHeader eyebrow="Perfil público" title="Mi local" />

      <form onSubmit={onSubmit} className="business-form">
        <Field label="Nombre del local">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>

        <Field
          label="Dirección de tu carta (URL)"
          hint={`Tu carta vive en pizzalog.net/${form.slug || 'tu-local'}. Si la cambiás, el QR impreso deja de apuntar a tu carta: tendrías que regenerarlo.`}
        >
          <div className="slug-row">
            <span className="slug-row__prefix">pizzalog.net/</span>
            <Input
              value={form.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
              pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
              required
            />
          </div>
        </Field>

        <Field label="Descripción" hint="Se muestra debajo del nombre en tu carta.">
          <Textarea
            rows={3}
            value={form.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Pizzas al molde y a la piedra en el corazón de Córdoba…"
          />
        </Field>

        <Field label="Foto de perfil (URL)" hint="El logo o una foto del local. Por ahora se carga como enlace a una imagen.">
          <Input
            value={form.logo_url ?? ''}
            onChange={(e) => set('logo_url', e.target.value)}
            placeholder="https://…/logo.jpg"
          />
        </Field>

        <div className="form-row">
          <Field label="Teléfono / WhatsApp">
            <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+54 9 351 …" />
          </Field>
          <Field label="Dirección física">
            <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Av. Siempreviva 742, Córdoba" />
          </Field>
        </div>

        <Field
          label="Link de Google Maps"
          hint="Pegá acá el link que te da el botón Compartir de tu ficha en Google Maps. En la carta se convierte en el botón «Cómo llegar»."
        >
          <Input
            value={form.google_maps_url ?? ''}
            onChange={(e) => set('google_maps_url', e.target.value)}
            placeholder="https://maps.app.goo.gl/…"
          />
        </Field>

        <Checkbox
          label="Acepto pedidos online ahora"
          checked={form.accepts_online_orders === 1}
          onChange={(e) =>
            setForm((f) => (f ? { ...f, accepts_online_orders: e.target.checked ? 1 : 0 } : f))
          }
        />
        <p className="field__hint">
          Interruptor general, aparte del horario: destildalo para cerrar los pedidos por hoy sin
          tocar las franjas horarias.
        </p>

        <div className="theme-block">
          <h2 className="theme-block__title">Apariencia de tu carta</h2>
          <Checkbox
            label="Personalizar los colores (como los temas de Fotolog)"
            checked={custom}
            onChange={(e) => setCustom(e.target.checked)}
          />

          {custom && (
            <>
              <div className="theme-grid">
                <Field label="Fondo">
                  <input
                    type="color"
                    className="color-input"
                    value={theme.bg}
                    onChange={(e) => setTheme((t) => ({ ...t, bg: e.target.value }))}
                  />
                </Field>
                <Field label="Títulos y precios">
                  <input
                    type="color"
                    className="color-input"
                    value={theme.accent}
                    onChange={(e) => setTheme((t) => ({ ...t, accent: e.target.value }))}
                  />
                </Field>
                <Field label="Links">
                  <input
                    type="color"
                    className="color-input"
                    value={theme.link}
                    onChange={(e) => setTheme((t) => ({ ...t, link: e.target.value }))}
                  />
                </Field>
                <Field label="Texto">
                  <input
                    type="color"
                    className="color-input"
                    value={theme.text}
                    onChange={(e) => setTheme((t) => ({ ...t, text: e.target.value }))}
                  />
                </Field>
                <Field label="Patrón de fondo">
                  <Select
                    value={theme.pattern}
                    onChange={(e) =>
                      setTheme((t) => ({ ...t, pattern: e.target.value as Required<BusinessTheme>['pattern'] }))
                    }
                  >
                    {PATTERNS.map((pt) => (
                      <option key={pt.value} value={pt.value}>
                        {pt.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="theme-preview" style={{ background: theme.bg }}>
                <div className="theme-preview__card">
                  <span className="theme-preview__name" style={{ color: theme.accent }}>
                    {form.name || 'Tu local'}
                  </span>
                  <span className="theme-preview__text" style={{ color: theme.text }}>
                    Muzzarella, salsa de tomate y albahaca
                  </span>
                  <span>
                    <a style={{ color: theme.link }}>instagram</a>{' '}
                    <b style={{ color: theme.accent }}>$18.000</b>
                  </span>
                </div>
              </div>
              <p className="field__hint">
                Elegí combinaciones legibles: el texto y los precios se leen sobre cajas blancas.
                Destildá la casilla y guardá para volver al tema original.
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}
        {saved && <p className="business-form__ok">Perfil guardado. Tu carta ya muestra los cambios.</p>}

        <div className="form-actions">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar perfil'}
          </Button>
        </div>
      </form>

      <SocialSection />
      <HoursSection />
    </section>
  );
}
