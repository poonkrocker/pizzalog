import { useEffect, useMemo, useState } from 'react';

declare global {
  interface Window {
    __PIZZALOG_CONFIG__?: { apiUrl?: string; defaultSlug?: string; slug?: string };
  }
}

const API =
  window.__PIZZALOG_CONFIG__?.apiUrl ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'https://api.pizzalog.net';

/** El slug viene de la URL: pizzalog.net/{slug} (como los fotologs). */
function slugFromPath(): string | null {
  const seg = window.location.pathname.split('/').filter(Boolean)[0];
  if (seg) return decodeURIComponent(seg).toLowerCase();
  const fallback = window.__PIZZALOG_CONFIG__?.defaultSlug || window.__PIZZALOG_CONFIG__?.slug;
  if (fallback) {
    window.history.replaceState(null, '', `/${fallback}`);
    return fallback;
  }
  return null;
}

interface Variant {
  id: number;
  label: string;
  price: number;
  is_active: number;
}

interface Product {
  id: number;
  category_id: number | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  has_variants: number;
  is_open_price: number;
  variants?: Variant[];
}

interface Category {
  id: number;
  name: string;
}

interface BusinessTheme {
  bg?: string;
  accent?: string;
  link?: string;
  text?: string;
  pattern?: string;
}

interface BusinessProfile {
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  description: string | null;
  logo_url: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  latitude: number | null;
  longitude: number | null;
  theme: BusinessTheme | null;
}

interface Menu {
  business: BusinessProfile;
  categories: Category[];
  products: Product[];
}

const money = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Contador de visitas nostálgico (honesto: cuenta TUS visitas en este teléfono). */
function useVisitCount(): number {
  const [n] = useState(() => {
    try {
      const v = Number(localStorage.getItem('carta_visitas') ?? '0') + 1;
      localStorage.setItem('carta_visitas', String(v));
      return v;
    } catch {
      return 1;
    }
  });
  return n;
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="ph" aria-hidden="true">
      <span className="ph__glyph">🍕</span>
      <span className="ph__name">{name}</span>
    </div>
  );
}

function EntryModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const variants = (product.variants ?? []).filter((v) => v.is_active === 1);
  return (
    <div className="veil" onClick={onClose} role="dialog" aria-modal="true">
      <article className="entry" onClick={(e) => e.stopPropagation()}>
        <header className="entry__bar">
          <span className="entry__bar-title">{product.name}</span>
          <button className="entry__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="entry__photo">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} />
          ) : (
            <Placeholder name={product.name} />
          )}
        </div>

        <div className="entry__body">
          {variants.length === 0 && (
            <p className="entry__price">{money(product.price)}</p>
          )}
          {product.description && <p className="entry__desc">{product.description}</p>}

          {variants.length > 0 && (
            <section className="comments">
              <h3 className="comments__title">opciones ({variants.length})</h3>
              {variants.map((v) => (
                <div key={v.id} className="comment">
                  <span className="comment__who">▸ {v.label}</span>
                  <span className="comment__price">{money(v.price)}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      </article>
    </div>
  );
}

/** El tema del local pinta la carta vía variables CSS, como los temas de Fotolog. */
function applyTheme(theme: BusinessTheme | null) {
  const root = document.documentElement;
  const map: Array<[keyof BusinessTheme, string]> = [
    ['bg', '--c-bg'],
    ['accent', '--c-accent'],
    ['link', '--c-link'],
    ['text', '--c-text'],
  ];
  for (const [key, cssVar] of map) {
    const v = theme?.[key];
    if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) {
      root.style.setProperty(cssVar, v);
    }
  }
  document.body.dataset.pattern = theme?.pattern ?? 'mosaico';
}

function MapModal({ business, onClose }: { business: BusinessProfile; onClose: () => void }) {
  const q =
    business.latitude !== null && business.longitude !== null
      ? `${business.latitude},${business.longitude}`
      : (business.address ?? '');
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;
  return (
    <div className="veil" onClick={onClose} role="dialog" aria-modal="true">
      <article className="entry" onClick={(e) => e.stopPropagation()}>
        <header className="entry__bar">
          <span className="entry__bar-title">¿dónde estamos?</span>
          <button className="entry__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <iframe
          className="map-frame"
          src={src}
          title="Mapa"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="entry__body">
          {business.address && <p className="entry__desc">{business.address}</p>}
          <a
            className="map-link"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`}
            target="_blank"
            rel="noreferrer"
          >
            abrir en Google Maps →
          </a>
        </div>
      </article>
    </div>
  );
}

export function App() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState(false);
  const [cat, setCat] = useState<number | 'all'>('all');
  const [open, setOpen] = useState<Product | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [slug] = useState<string | null>(() => slugFromPath());
  const visits = useVisitCount();

  useEffect(() => {
    if (!slug) return;
    fetch(`${API}/public/${slug}/menu`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((j) => {
        const data = j.data as Menu;
        applyTheme(data.business.theme);
        setMenu(data);
      })
      .catch(() => setError(true));
  }, [slug]);

  // La carta muestra solo lo pedible: los de precio abierto son cargos
  // internos (envío, propina) y no van al público.
  const products = useMemo(
    () => (menu?.products ?? []).filter((p) => p.is_open_price !== 1),
    [menu],
  );

  const visibleCats = useMemo(() => {
    const withProducts = new Set(products.map((p) => p.category_id));
    return (menu?.categories ?? []).filter((c) => withProducts.has(c.id));
  }, [menu, products]);

  const shown = useMemo(
    () => (cat === 'all' ? products : products.filter((p) => p.category_id === cat)),
    [products, cat],
  );

  if (!slug) {
    return (
      <div className="boot">
        <div className="boot__box">
          <b>pizzalog.net</b>
          <br />
          las cartas viven en pizzalog.net/<i>tu-local</i>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="boot">
        <div className="boot__box">
          no encontramos la carta de «{slug}» :(
          <br />
          revisá la dirección o probá más tarde
        </div>
      </div>
    );
  }
  if (!menu) {
    return (
      <div className="boot">
        <div className="boot__box blink">cargando la carta…</div>
      </div>
    );
  }

  const wa = menu.business.phone ? menu.business.phone.replace(/[^\d]/g, '') : null;

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead__top">
          <div className="avatar">
            {menu.business.logo_url ? (
              <img src={menu.business.logo_url} alt={menu.business.name} />
            ) : (
              <span className="avatar__glyph">🍕</span>
            )}
          </div>
          <div className="masthead__id">
            <h1 className="masthead__name">{menu.business.name}</h1>
            <p className="masthead__url">pizzalog.net/{menu.business.slug}</p>
          </div>
        </div>

        {menu.business.description && (
          <p className="masthead__bio">{menu.business.description}</p>
        )}

        <div className="masthead__links">
          {menu.business.instagram && (
            <a href={`https://instagram.com/${menu.business.instagram}`} target="_blank" rel="noreferrer" className="plink">
              instagram
            </a>
          )}
          {menu.business.facebook && (
            <a href={`https://facebook.com/${menu.business.facebook}`} target="_blank" rel="noreferrer" className="plink">
              facebook
            </a>
          )}
          {menu.business.tiktok && (
            <a href={`https://tiktok.com/@${menu.business.tiktok}`} target="_blank" rel="noreferrer" className="plink">
              tiktok
            </a>
          )}
          {menu.business.phone && (
            <a href={`tel:${menu.business.phone.replace(/[^+\d]/g, '')}`} className="plink">
              ☎ {menu.business.phone}
            </a>
          )}
        </div>

        {menu.business.address && (
          <button className="masthead__addr" onClick={() => setMapOpen(true)}>
            📍 {menu.business.address} <span className="masthead__addr-hint">(ver mapa)</span>
          </button>
        )}

        <div className="masthead__widgets">
          <span className="widget">
            <b className="online-dot">●</b> online
          </span>
          <span className="widget">tu visita nº {visits}</span>
        </div>
      </header>

      <nav className="cats" aria-label="Categorías">
        <button
          className={`cat${cat === 'all' ? ' cat--on' : ''}`}
          onClick={() => setCat('all')}
        >
          todo
        </button>
        {visibleCats.map((c) => (
          <button
            key={c.id}
            className={`cat${cat === c.id ? ' cat--on' : ''}`}
            onClick={() => setCat(c.id)}
          >
            {c.name.toLowerCase()}
          </button>
        ))}
      </nav>

      <main className="wall">
        {shown.map((p) => {
          const variants = (p.variants ?? []).filter((v) => v.is_active === 1);
          const from = variants.length
            ? Math.min(...variants.map((v) => v.price))
            : p.price;
          return (
            <button key={p.id} className="post" onClick={() => setOpen(p)}>
              <div className="post__photo">
                {p.image_url ? (
                  <img src={p.image_url} alt="" loading="lazy" />
                ) : (
                  <Placeholder name={p.name} />
                )}
              </div>
              <div className="post__strip">
                <span className="post__name">{p.name}</span>
                <span className="post__price">
                  {variants.length > 0 && <em>desde </em>}
                  {money(from)}
                </span>
              </div>
            </button>
          );
        })}
        {shown.length === 0 && <p className="wall__empty">no hay nada por acá…</p>}
      </main>

      <footer className="guest">
        {wa && (
          <a
            className="guest__book"
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
          >
            ✍ firmá el libro de visitas (pedinos por WhatsApp)
          </a>
        )}
        {menu.business.address && <p className="guest__addr">{menu.business.address}</p>}
        <p className="guest__tag">hecho con Pizzalog © {new Date().getFullYear()}</p>
      </footer>

      {open && <EntryModal product={open} onClose={() => setOpen(null)} />}
      {mapOpen && <MapModal business={menu.business} onClose={() => setMapOpen(false)} />}
    </div>
  );
}
