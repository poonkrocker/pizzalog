import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type SocialLink } from '@pizzalog/shared';
import { Button, Field, Input, Loading, Select } from '@/ui';
import { useApi } from '@/lib/auth';

/**
 * Plataformas con ícono propio en la carta. Cualquier otra ("otra") se guarda
 * igual y en la carta cae a un ícono genérico de link — así el teléfono fijo,
 * el email o el sitio web del internet viejo también tienen su ícono.
 */
const KNOWN = [
  { value: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/tu-local' },
  { value: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/tu-local' },
  { value: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@tu-local' },
  { value: 'x', label: 'X / Twitter', placeholder: 'https://x.com/tu-local' },
  { value: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/5493511234567' },
  { value: 'website', label: 'Sitio web', placeholder: 'https://tu-local.com.ar' },
  { value: 'email', label: 'Email', placeholder: 'mailto:hola@tu-local.com.ar' },
  { value: 'phone', label: 'Teléfono', placeholder: 'tel:+5493511234567' },
];

export function SocialSection() {
  const api = useApi();
  const qc = useQueryClient();

  const links = useQuery({
    queryKey: ['business-social'],
    queryFn: () => api.business.socialLinks().then((r) => r.social_links),
  });

  const save = useMutation({
    mutationFn: (data: Array<Pick<SocialLink, 'platform' | 'url'>>) =>
      api.business.updateSocialLinks(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-social'] }),
  });

  const [rows, setRows] = useState<SocialLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (links.data && rows === null) setRows(links.data);
  }, [links.data, rows]);

  if (links.isLoading || rows === null) return <Loading />;

  const patch = (i: number, changes: Partial<SocialLink>) =>
    setRows((rs) => (rs ?? []).map((r, idx) => (idx === i ? { ...r, ...changes } : r)));

  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const next = [...(rs ?? [])];
      const j = i + dir;
      const a = next[i];
      const b = next[j];
      if (!a || !b) return next;
      next[i] = b;
      next[j] = a;
      return next;
    });

  async function onSave() {
    setError(null);
    setSaved(false);
    for (const r of rows ?? []) {
      if (!r.platform.trim() || !r.url.trim()) {
        return setError('Completá la plataforma y el link de cada red.');
      }
      if (!/^(https?:\/\/|mailto:|tel:)/i.test(r.url.trim())) {
        return setError(`El link de «${r.platform}» tiene que empezar con https://, mailto: o tel:`);
      }
    }
    try {
      await save.mutateAsync(
        (rows ?? []).map((r) => ({ platform: r.platform.trim().toLowerCase(), url: r.url.trim() })),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar las redes');
    }
  }

  return (
    <div className="social-block">
      <h2 className="theme-block__title">Redes sociales</h2>
      <p className="field__hint">
        Aparecen como íconos en tu carta. Las que no estén en la lista igual funcionan: se
        muestran con un ícono genérico de link.
      </p>

      {(rows ?? []).map((r, i) => {
        const known = KNOWN.find((k) => k.value === r.platform);
        return (
          <div key={i} className="social-row">
            <Field label="Red">
              <Select
                value={known ? r.platform : 'otra'}
                onChange={(e) =>
                  patch(i, { platform: e.target.value === 'otra' ? '' : e.target.value })
                }
              >
                {KNOWN.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
                <option value="otra">Otra…</option>
              </Select>
            </Field>

            {!known && (
              <Field label="Nombre de la red" hint="Minúsculas, sin espacios.">
                <Input
                  value={r.platform}
                  placeholder="telegram"
                  onChange={(e) => patch(i, { platform: e.target.value.toLowerCase() })}
                />
              </Field>
            )}

            <Field label="Link">
              <Input
                value={r.url}
                placeholder={known?.placeholder ?? 'https://…'}
                onChange={(e) => patch(i, { url: e.target.value })}
              />
            </Field>

            <div className="social-row__actions">
              <button type="button" className="link" onClick={() => move(i, -1)} aria-label="Subir">
                ↑
              </button>
              <button type="button" className="link" onClick={() => move(i, 1)} aria-label="Bajar">
                ↓
              </button>
              <button
                type="button"
                className="link link--danger"
                onClick={() => setRows((rs) => (rs ?? []).filter((_, idx) => idx !== i))}
              >
                Quitar
              </button>
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="ghost"
        onClick={() => setRows((rs) => [...(rs ?? []), { platform: 'instagram', url: '' }])}
      >
        + Agregar red
      </Button>

      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}
      {saved && <p className="business-form__ok">Redes guardadas.</p>}

      <div className="form-actions">
        <Button type="button" onClick={() => void onSave()} disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar redes'}
        </Button>
      </div>
    </div>
  );
}
