import { useEffect, useMemo, useState } from 'react';
import type { BusinessTheme, Menu, Product, TableInfo } from './types';
import { fetchMenu, fetchTableInfo, formatWhatsAppNumber, money, routeFromPath } from './lib/api';
import { formatHours } from './lib/hours';
import { useCart } from './lib/cart';
import { SocialIcon, socialLabel } from './components/Icons';
import { ProductModal } from './components/ProductModal';
import { CartPanel } from './components/CartPanel';

/** Identifica si una categoría es de "Extras" para agregar a una pizza y no una categoría separada. */
function isExtrasCategoryName(name: string): boolean {
  return /^(extras?|agregados?|adicionales?)(\s+.*)?$/i.test(name.trim());
}

/** Identifica si una categoría o producto corresponde a pizzas (para ofrecerle extras). */
function isPizzaCategoryName(name: string): boolean {
  return /pizza|pizzeta|calz[oó]n|fugazz/i.test(name);
}

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
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [cat, setCat] = useState<number | 'all'>('all');
  const [open, setOpen] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const visits = useVisitCount();

  // En modo salón se mira, no se pide (el mozo toma la comanda).
  // En modo mesa (auto-pedido QR) sí se puede pedir.
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

    if (mode === 'mesa' && route.tableId) {
      fetchTableInfo(slug, route.tableId)
        .then((res) => setTableInfo(res.table))
        .catch(() => {});
    }
  }, [slug, mode, route.tableId]);

  // Categorías "Extras" (no aparecen como pestaña separada sino como extra dentro de las pizzas).
  const extraCatIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of menu?.categories ?? []) {
      if (isExtrasCategoryName(c.name)) set.add(c.id);
    }
    return set;
  }, [menu?.categories]);

  const pizzaCatIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of menu?.categories ?? []) {
      if (!extraCatIds.has(c.id) && isPizzaCategoryName(c.name)) {
        set.add(c.id);
      }
    }
    return set;
  }, [menu?.categories, extraCatIds]);

  // Los de precio abierto son cargos internos (envío, propina): no van al público.
  const allPublicProducts = useMemo(
    () => (menu?.products ?? []).filter((p) => p.is_open_price !== 1),
    [menu],
  );

  // Productos que pertenecen a la categoría "Extras"
  const extraProducts = useMemo(
    () =>
      allPublicProducts.filter(
        (p) => p.category_id !== null && extraCatIds.has(p.category_id) && p.is_available_now,
      ),
    [allPublicProducts, extraCatIds],
  );

  // Productos principales de la carta (excluyendo la categoría Extras)
  const products = useMemo(
    () =>
      allPublicProducts.filter((p) => p.category_id === null || !extraCatIds.has(p.category_id)),
    [allPublicProducts, extraCatIds],
  );

  const visibleCats = useMemo(() => {
    const withProducts = new Set(products.map((p) => p.category_id));
    return (menu?.categories ?? []).filter((c) => !extraCatIds.has(c.id) && withProducts.has(c.id));
  }, [menu, products, extraCatIds]);

  function canTakePizzaExtras(p: Product): boolean {
    if (extraProducts.length === 0) return false;
    if (p.is_combo === 1) return false;
    if (p.is_combinable === 1) return true;
    if (p.category_id !== null && pizzaCatIds.has(p.category_id)) return true;
    const catName =
      (menu?.categories ?? []).find((c) => c.id === p.category_id)?.name ?? '';
    if (/bebida|cerveza|vino|trago|gaseosa|agua|postre|helado|fain[aá]|empanada/i.test(catName)) {
      return false;
    }
    if (/bebida|cerveza|vino|trago|gaseosa|agua|coca|sprite|fanta|pepsi|postre|helado|tiramis|flan|brownie|fain[aá]/i.test(p.name)) {
      return false;
    }
    return true;
  }

  // El orden lo manda el panel: categorías ordenadas y luego productos por su sort_order.
  const shown = useMemo(() => {
    if (cat !== 'all') {
      return products.filter((p) => p.category_id === cat);
    }
    const catMap = new Map<number, number>();
    (menu?.categories ?? []).forEach((c, idx) => catMap.set(c.id, c.sort_order ?? idx * 10));
    return [...products].sort((a, b) => {
      const catA = a.category_id !== null ? (catMap.get(a.category_id) ?? 999999) : 999999;
      const catB = b.category_id !== null ? (catMap.get(b.category_id) ?? 999999) : 999999;
      if (catA !== catB) return catA - catB;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [products, cat, menu?.categories]);

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
        {mode === 'mesa' && (
          <div
            style={{
              background: 'var(--c-accent, #e63946)',
              color: '#fff',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              margin: '0.75rem 0',
              textAlign: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              🍽️ Estás en la {tableInfo ? `Mesa ${tableInfo.label}` : `Mesa ${route.tableId ?? ''}`}
            </div>
            <div style={{ fontSize: '0.825rem', marginTop: '0.2rem', opacity: 0.95 }}>
              Pedí directamente desde tu celu y tu comanda marcha directo a la cocina
            </div>
          </div>
        )}
        {canOrder && mode !== 'mesa' && !b.is_open_for_orders && (
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
          const hasExtras = canTakePizzaExtras(p);
          // Necesita abrir la ficha si hay que elegir algo (variante, combo o extras de pizza).
          const needsChoice = variants.length > 0 || p.is_combo === 1 || hasExtras;

          function quickAdd(e: React.MouseEvent) {
            e.stopPropagation(); // no abrir la foto
            if (!canOrder || !p.is_available_now) return;
            if (needsChoice) {
              setOpen(p); // hay que elegir: abrimos la ficha
              return;
            }
            cart.add(
              {
                key: `${p.id}/0/0//`,
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
            href={`https://wa.me/${formatWhatsAppNumber(b.phone)}`}
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
          combinableProducts={products.filter(
            (p) => p.is_combinable === 1 || (open.category_id !== null && p.category_id === open.category_id),
          )}
          extraProducts={canTakePizzaExtras(open) ? extraProducts : []}
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
          mode={mode}
          tableInfo={tableInfo}
          onSetQty={cart.setQty}
          onClear={cart.clear}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}
