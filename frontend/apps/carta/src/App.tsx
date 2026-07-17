import { useEffect, useMemo, useState } from 'react';
import type { BusinessTheme, Menu, Product } from './types';
import { fetchMenu, money, routeFromPath } from './lib/api';
import { formatHours } from './lib/hours';
import { useCart } from './lib/cart';
import { SocialIcon, socialLabel } from './components/Icons';
import { ProductModal } from './components/ProductModal';
import { CartPanel } from './components/CartPanel';

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

/** El tema del local pinta la carta vía variables CSS. */
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

export function App() {
  const [route] = useState(() => routeFromPath());
  const { slug, mode } = route;

  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<number | 'all'>('all');
  const [open, setOpen] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const visits = useVisitCount();

  // En modo salón se mira, no se pide (el mozo toma la comanda).
  const canOrder = mode !== 'salon';
  const cart = useCart(slug ?? '_');

  useEffect(() => {
    if (!slug) return;
    fetchMenu(slug, mode)
      .then((data) => {
        applyTheme(data.business.theme);
        setMenu(data);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'error'));
  }, [slug, mode]);

  // Los de precio abierto son cargos internos (envío, propina): no van al público.
  const products = useMemo(
    () => (menu?.products ?? []).filter((p) => p.is_open_price !== 1),
    [menu],
  );

  const visibleCats = useMemo(() => {
    const withProducts = new Set(products.map((p) => p.category_id));
    return (menu?.categories ?? []).filter((c) => withProducts.has(c.id));
  }, [menu, products]);

  // El orden lo manda el panel (sort_order): la carta NO reordena por nombre.
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
          {mode === 'secreta'
            ? 'este link secreto no existe :('
            : `no encontramos la carta de «${slug}» :(`}
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

  const b = menu.business;
  const hoursText = formatHours(b.hours ?? []);

  return (
    <div className={`page${canOrder && cart.count > 0 ? ' page--with-bar' : ''}`}>
      <header className="masthead">
        <div className="masthead__top">
          <div className="avatar">
            {b.logo_url ? (
              <img src={b.logo_url} alt={b.name} />
            ) : (
              <span className="avatar__glyph">🍕</span>
            )}
          </div>
          <div className="masthead__id">
            <h1 className="masthead__name">{b.name}</h1>
            <p className="masthead__url">pizzalog.net/{b.slug}</p>
          </div>
        </div>

        {b.description && <p className="masthead__bio">{b.description}</p>}

        {b.social_links.length > 0 && (
          <div className="masthead__links">
            {b.social_links.map((l) => (
              <a
                key={l.platform + l.url}
                className="plink plink--icon"
                href={l.url}
                target="_blank"
                rel="noreferrer"
              >
                <SocialIcon platform={l.platform} />
                <span>{socialLabel(l.platform)}</span>
              </a>
            ))}
          </div>
        )}

        {/* "Cómo llegar" abre Google Maps directo: sin iframe, sin API key, y en
            el celular lo levanta la app nativa con la navegación lista. */}
        {(b.google_maps_url || b.address) && (
          <a
            className="masthead__addr"
            href={
              b.google_maps_url ??
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address ?? '')}`
            }
            target="_blank"
            rel="noreferrer"
          >
            📍 {b.address ?? 'ver ubicación'}{' '}
            <span className="masthead__addr-hint">(cómo llegar)</span>
          </a>
        )}

        <div className="masthead__widgets">
          {canOrder ? (
            <span className="widget">
              <b className={b.is_open_for_orders ? 'online-dot' : 'offline-dot'}>●</b>{' '}
              {b.is_open_for_orders ? 'abierto' : 'cerrado'}
            </span>
          ) : (
            <span className="widget">menú de salón</span>
          )}
          <span className="widget">tu visita nº {visits}</span>
        </div>

        {hoursText.length > 0 && (
          <div className="masthead__hours">
            <span className="masthead__hours-label">🕒 Horarios</span>
            {hoursText.map((line) => (
              <span key={line} className="masthead__hours-line">
                {line}
              </span>
            ))}
          </div>
        )}

        {mode === 'secreta' && <p className="secret-note">🤫 carta secreta</p>}
        {mode === 'salon' && (
          <p className="secret-note">Mirá la carta y pedile al mozo. Acá no se toman pedidos.</p>
        )}
        {canOrder && !b.is_open_for_orders && (
          <p className="secret-note">
            Ahora está cerrado: podés mirar la carta, pero no pedir online.
          </p>
        )}
      </header>

      <nav className="cats" aria-label="Categorías">
        <button className={`cat${cat === 'all' ? ' cat--on' : ''}`} onClick={() => setCat('all')}>
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
          const from = variants.length ? Math.min(...variants.map((v) => v.price)) : p.price;
          // Necesita abrir la ficha si hay que elegir algo (variante o combo).
          const needsChoice = variants.length > 0 || p.is_combo === 1;

          function quickAdd(e: React.MouseEvent) {
            e.stopPropagation(); // no abrir la foto
            if (!canOrder || !p.is_available_now) return;
            if (needsChoice) {
              setOpen(p); // hay que elegir: abrimos la ficha
              return;
            }
            cart.add(
              {
                key: `${p.id}/0/`,
                product_id: p.id,
                name: p.name,
                unit_price: p.price,
                image_url: p.image_url,
              },
              1,
            );
          }

          return (
            <div
              key={p.id}
              className={`post${p.is_available_now ? '' : ' post--off'}`}
              role="button"
              tabIndex={0}
              onClick={() => setOpen(p)}
              onKeyDown={(e) => e.key === 'Enter' && setOpen(p)}
            >
              <div className="post__photo">
                {p.image_url ? (
                  <img src={p.image_url} alt="" loading="lazy" />
                ) : (
                  <Placeholder name={p.name} />
                )}
                {p.badge_text && <span className="post__badge">{p.badge_text}</span>}
                {p.is_vegan_opt === 1 && (
                  <span className="post__vegan" title="Tiene opción vegana">
                    🌱
                  </span>
                )}
                {!p.is_available_now && <span className="post__off">en otro horario</span>}

                {/* Agregar rápido, sin entrar a la foto. Con variantes/combo,
                    abre la ficha para elegir. */}
                {canOrder && p.is_available_now && (
                  <button
                    className="post__add"
                    onClick={quickAdd}
                    aria-label={needsChoice ? `Elegir opciones de ${p.name}` : `Agregar ${p.name}`}
                    title={needsChoice ? 'Elegí las opciones' : 'Agregar al carrito'}
                  >
                    {needsChoice ? '＋ elegir' : '＋'}
                  </button>
                )}
              </div>
              <div className="post__strip">
                <span className="post__name">
                  {p.name}
                  {p.is_combo === 1 && <em className="post__combo"> combo</em>}
                </span>
                <span className="post__price">
                  {variants.length > 0 && <em>desde </em>}
                  {money(from)}
                </span>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="wall__empty">no hay nada por acá…</p>}
      </main>

      <footer className="guest">
        {b.phone && (
          <a
            className="guest__book"
            href={`https://wa.me/${b.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
          >
            ✍ firmá el libro de visitas (escribinos por WhatsApp)
          </a>
        )}
        {b.address && <p className="guest__addr">{b.address}</p>}
        {hoursText.length > 0 && (
          <div className="guest__hours">
            {hoursText.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        <p className="guest__tag">Hecho con Pizzalog.net © {new Date().getFullYear()}</p>
      </footer>

      {/* Barra fija del carrito: solo si hay algo y se puede pedir. */}
      {canOrder && cart.count > 0 && (
        <button className="cartbar" onClick={() => setCartOpen(true)}>
          <span className="cartbar__n">{cart.count}</span>
          <span className="cartbar__txt">ver mi pedido</span>
          <span className="cartbar__total">{money(cart.total)}</span>
        </button>
      )}

      {open && (
        <ProductModal
          product={open}
          canOrder={canOrder}
          onAdd={(line, qty) => cart.add(line, qty)}
          onClose={() => setOpen(null)}
        />
      )}

      {cartOpen && (
        <CartPanel
          slug={slug}
          business={b}
          lines={cart.lines}
          total={cart.total}
          isOpen={b.is_open_for_orders}
          onSetQty={cart.setQty}
          onClear={cart.clear}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}
