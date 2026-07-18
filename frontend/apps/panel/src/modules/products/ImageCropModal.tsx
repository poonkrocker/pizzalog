import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@/ui';

/**
 * Recorte de imagen con encuadre configurable. Por defecto 4:3 a 1200×900
 * (las fotos de la carta); pasando outW/outH/quality/aspect se reutiliza para
 * otros formatos — ej. el logo, que va cuadrado, chico y muy comprimido.
 * El usuario arrastra para encuadrar y acerca con el zoom; al confirmar se
 * exporta un JPEG liviano listo para subir.
 */
export function ImageCropModal({
  file,
  onDone,
  onClose,
  outW = 1200,
  outH = 900,
  quality = 0.85,
  aspectLabel = '4:3',
  title = 'Encuadrar la foto',
}: {
  file: File;
  onDone: (blob: Blob) => void;
  onClose: () => void;
  outW?: number;
  outH?: number;
  quality?: number;
  aspectLabel?: string;
  title?: string;
}) {
  const OUT_W = outW;
  const OUT_H = outH;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError('No se pudo leer la imagen');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** Escala base: la imagen siempre cubre el encuadre (modo "cover"). */
  function baseScale(vw: number, vh: number) {
    if (!img) return 1;
    return Math.max(vw / img.width, vh / img.height);
  }

  /** Mantiene la imagen cubriendo el encuadre al arrastrar o hacer zoom. */
  function clamp(x: number, y: number, z: number) {
    const vp = viewportRef.current;
    if (!vp || !img) return { x, y };
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const s = baseScale(vw, vh) * z;
    const maxX = Math.max(0, (img.width * s - vw) / 2);
    const maxY = Math.max(0, (img.height * s - vh) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const next = clamp(
      drag.current.ox + (e.clientX - drag.current.px),
      drag.current.oy + (e.clientY - drag.current.py),
      zoom,
    );
    setPos(next);
  }
  function onPointerUp() {
    drag.current = null;
  }

  function onZoom(z: number) {
    setZoom(z);
    setPos((p) => clamp(p.x, p.y, z));
  }

  async function confirm() {
    const vp = viewportRef.current;
    if (!vp || !img) return;
    setExporting(true);
    try {
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      const s = baseScale(vw, vh) * zoom;
      const k = OUT_W / vw; // factor encuadre -> lienzo final
      const drawW = img.width * s * k;
      const drawH = img.height * s * k;
      const dx = OUT_W / 2 - drawW / 2 + pos.x * k;
      const dy = OUT_H / 2 - drawH / 2 + pos.y * k;

      const canvas = document.createElement('canvas');
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, dx, dy, drawW, drawH);

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, 'image/jpeg', quality),
      );
      if (!blob) throw new Error('export');
      onDone(blob);
    } catch {
      setError('No se pudo procesar la imagen');
      setExporting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <p className="muted-text" style={{ marginTop: 0 }}>
        Arrastrá para encuadrar y acercá con el control. Se guarda en {aspectLabel}.
      </p>

      <div
        ref={viewportRef}
        className="crop-viewport"
        style={{ aspectRatio: `${OUT_W} / ${OUT_H}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {img ? (
          <img
            src={img.src}
            alt=""
            draggable={false}
            style={{
              width: `${
                img.width *
                baseScale(
                  viewportRef.current?.clientWidth ?? 400,
                  viewportRef.current?.clientHeight ?? 300,
                ) *
                zoom
              }px`,
              transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
            }}
          />
        ) : (
          <span className="crop-loading">Cargando…</span>
        )}
      </div>

      <label className="crop-zoom">
        <span>Zoom</span>
        <input
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
        />
      </label>

      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <Button variant="ghost" onClick={onClose} disabled={exporting}>
          Cancelar
        </Button>
        <Button onClick={() => void confirm()} disabled={!img || exporting}>
          {exporting ? 'Procesando…' : 'Usar esta foto'}
        </Button>
      </div>
    </Modal>
  );
}
