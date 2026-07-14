import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, type Category, type Product } from '@pizzalog/shared';
import { useRef } from 'react';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/ui';
import { useApi } from '@/lib/auth';
import { useSaveProduct } from './hooks';
import { ImageCropModal } from './ImageCropModal';

interface Props {
  product: Product | null; // null = alta
  categories: Category[];
  onDone: () => void;
}

export function ProductForm({ product, categories, onDone }: Props) {
  const save = useSaveProduct();
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [cost, setCost] = useState(product?.cost != null ? String(product.cost) : '');
  const [categoryId, setCategoryId] = useState(
    product?.category_id != null ? String(product.category_id) : '',
  );
  const [trackStock, setTrackStock] = useState(Boolean(product?.track_stock));
  const [isOpenPrice, setIsOpenPrice] = useState(Boolean(product?.is_open_price));
  const [error, setError] = useState<string | null>(null);

  // Foto del producto: recorte 4:3 y subida al backend.
  const api = useApi();
  const fileInput = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadCropped(blob: Blob) {
    setCropFile(null);
    setUploading(true);
    setError(null);
    try {
      const { url } = await api.uploads.image(blob);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({
        id: product?.id,
        data: {
          name: name.trim(),
          description: description.trim() || null,
          price: Number(price),
          cost: cost === '' ? null : Number(cost),
          category_id: categoryId === '' ? null : Number(categoryId),
          track_stock: trackStock ? 1 : 0,
          is_open_price: isOpenPrice ? 1 : 0,
          image_url: imageUrl,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el producto');
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>
      <Field label="Foto del producto" hint="Es la imagen que aparece en tu carta. Se encuadra en 4:3 y se comprime sola.">
        <div className="photo-field">
          <div className="photo-field__thumb">
            {imageUrl ? <img src={imageUrl} alt="" /> : <span aria-hidden="true">🍕</span>}
          </div>
          <div className="photo-field__actions">
            <Button
              type="button"
              variant="ghost"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? 'Subiendo…' : imageUrl ? 'Cambiar foto' : 'Subir foto'}
            </Button>
            {imageUrl && (
              <button type="button" className="link link--danger" onClick={() => setImageUrl(null)}>
                Quitar
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setCropFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </Field>

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          onDone={(blob) => void uploadCropped(blob)}
          onClose={() => setCropFile(null)}
        />
      )}

      <Field label="Descripción" hint="De acá se extraen los ingredientes para los reportes.">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </Field>
      <div className="form-row">
        <Field label="Precio">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </Field>
        <Field label="Costo" hint="Opcional. Habilita el cálculo de margen.">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Categoría">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox
        label="Controlar stock de este producto"
        checked={trackStock}
        onChange={(e) => setTrackStock(e.target.checked)}
      />
      <Checkbox
        label="Precio abierto (se ingresa al momento de vender)"
        checked={isOpenPrice}
        onChange={(e) => setIsOpenPrice(e.target.checked)}
      />
      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
