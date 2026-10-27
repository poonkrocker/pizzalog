import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatARS, type CloseSplit, type PaymentSlice, type RoundItem } from '@pizzalog/shared';
import { useCurrentCashSession } from '@/modules/cash/hooks';
import { dispatchComandas, getPrinterSettings, tryPrint } from '@/print/printer';
import { accountTicket } from '@/print/tickets';
import { useCatalog } from '@/modules/sale/hooks';
import { AddRoundSheet } from './AddRoundSheet';
import {
  useCancelSession,
  useCloseSession,
  useDiscountSessionItem,
  useRequestBill,
  useSession,
} from './hooks';

const METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otro' },
];

export function SessionPage() {
  const { id } = useParams();
  const sessionId = id ? Number(id) : null;
  const session = useSession(sessionId);
  const requestBill = useRequestBill();
  const closeSession = useCloseSession();
  const cancelSession = useCancelSession();
  const discountItemMut = useDiscountSessionItem();
  const cashQuery = useCurrentCashSession();
  const isCashOpen = cashQuery.isLoading ? true : cashQuery.data !== null && cashQuery.data !== undefined;
  const navigate = useNavigate();
  const catalog = useCatalog();
  const categories = catalog.data?.categories ?? [];

  async function handleReprintRound(round: any) {
    try {
      const activeItems = (round.items ?? []).filter((it: any) => it.status === 'ordered');
      if (activeItems.length === 0) {
        alert('Esta comanda no contiene productos activos.');
        return;
      }
      const res = await dispatchComandas({
        place: tablesLabel || 'Salón',
        account: s.label || undefined,
        roundNumber: round.number,
        isReprint: true,
        lines: activeItems.map((it: any) => {
          const p = catalog.data?.products?.find((prod) => prod.id === it.product_id);
          return {
            qty: it.qty,
            label: it.name,
            note: it.note ?? undefined,
            categoryId: p ? p.category_id : null,
            categoryName: p?.category_id ? categories.find((c) => c.id === p.category_id)?.name : undefined,
          };
        }),
      });
      if (res.error) {
        alert('Aviso de comanda: ' + res.error);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al reimprimir');
    }
  }

  async function handlePrintAccount() {
    try {
      const settings = await getPrinterSettings();
      let cachedBiz: any = null;
      try {
        const raw = localStorage.getItem('pizzalog_cached_business');
        if (raw) cachedBiz = JSON.parse(raw);
      } catch {}

      const ticket = accountTicket({
        businessName: cachedBiz?.name || 'Pizzalog',
        place: tablesLabel || 'Mesa / Salón',
        account: s.label || undefined,
        lines: allActiveItems.map((it) => ({
          qty: it.qty,
          label: it.name,
          unitPrice: it.unit_price,
          originalPrice: it.original_unit_price ?? undefined,
          discountPct: it.discount_pct ?? undefined,
          note: it.note ?? undefined,
        })),
        subtotal: total,
        discount: discountAmount,
        total: finalTotal,
        width: settings.width,
        fiscalData: settings.fiscalData,
      });

      const err = await tryPrint(ticket);
      if (err) {
        alert('Aviso al imprimir cuenta: ' + err);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al imprimir cuenta');
    }
  }

  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [showGlobalDiscount, setShowGlobalDiscount] = useState(false);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [customDiscount, setCustomDiscount] = useState<string>('');
  const [itemForDiscount, setItemForDiscount] = useState<RoundItem | null>(null);
  const [customItemDiscount, setCustomItemDiscount] = useState<string>('');
  const [payMode, setPayMode] = useState<'single' | 'split_amount' | 'split_items'>('single');
  const [paymentRows, setPaymentRows] = useState<Array<{ amount: string; payment_method: string; label: string }>>([]);
  const [itemPeopleCount, setItemPeopleCount] = useState<number>(2);
  const [itemAssignments, setItemAssignments] = useState<Record<number, number>>({});
  const [personMethods, setPersonMethods] = useState<Record<number, string>>({ 0: 'cash', 1: 'transfer' });
  const [error, setError] = useState<string | null>(null);

  if (sessionId === null) return <div className="boot">Mesa inválida.</div>;
  if (session.isLoading) return <div className="boot">Cargando cuenta…</div>;
  if (session.isError || !session.data) return <div className="boot">No se pudo cargar la cuenta.</div>;

  const s = session.data;
  const tablesLabel = s.tables?.map((t) => t.label).join(' + ') ?? '';
  const accountTitle = tablesLabel
    ? s.label
      ? `${tablesLabel} · ${s.label}`
      : `Mesa ${tablesLabel}`
    : s.label || `Cuenta #${s.id}`;
  const total = s.totals?.subtotal ?? 0;
  const rounds = s.rounds ?? [];
  const sid = sessionId;

  const discountAmount =
    customDiscount.trim() !== ''
      ? Math.min(total, parseFloat(customDiscount) || 0)
      : discountPct > 0
        ? Math.round((total * discountPct) / 100)
        : 0;

  const finalTotal = Math.max(0, total - discountAmount);

  async function applyItemDiscountPct(pct: number) {
    if (!itemForDiscount) return;
    try {
      await discountItemMut.mutateAsync({
        sessionId: sid,
        itemId: itemForDiscount.id,
        discount_pct: pct,
      });
      setItemForDiscount(null);
      setCustomItemDiscount('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo aplicar el descuento al producto');
    }
  }

  async function applyItemDiscountCustom() {
    if (!itemForDiscount) return;
    const val = parseFloat(customItemDiscount);
    if (isNaN(val) || val < 0) return;
    try {
      await discountItemMut.mutateAsync({
        sessionId: sid,
        itemId: itemForDiscount.id,
        discount_amount: val,
      });
      setItemForDiscount(null);
      setCustomItemDiscount('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo aplicar el descuento al producto');
    }
  }

  async function pay(method: string) {
    setError(null);
    try {
      await closeSession.mutateAsync({
        sessionId: sid,
        payment_method: method,
        discount: discountAmount,
      });
      navigate('/salon');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cobrar la cuenta');
    }
  }

  function initEqualSplit(n: number, targetTotal: number) {
    const count = Math.max(2, n);
    const baseShare = Math.floor(targetTotal / count);
    const remainder = Math.round(targetTotal - baseShare * (count - 1));
    const rows = Array.from({ length: count }, (_, idx) => ({
      amount: String(idx === count - 1 ? remainder : baseShare),
      payment_method: idx === 0 ? 'cash' : 'transfer',
      label: `Persona ${idx + 1}`,
    }));
    setPaymentRows(rows);
  }

  async function payMultipleSlices() {
    setError(null);
    const slices: PaymentSlice[] = paymentRows
      .map((r) => ({
        amount: parseFloat(r.amount) || 0,
        payment_method: r.payment_method,
        label: r.label,
      }))
      .filter((r) => r.amount > 0);

    if (slices.length === 0) {
      setError('Ingresá al menos un monto mayor a 0');
      return;
    }
    const sumSlices = Math.round(slices.reduce((acc, s) => acc + s.amount, 0));
    if (Math.abs(sumSlices - Math.round(finalTotal)) > 5) {
      setError(`La suma de los pagos (${formatARS(sumSlices)}) debe coincidir con el total (${formatARS(finalTotal)})`);
      return;
    }

    try {
      await closeSession.mutateAsync({
        sessionId: sid,
        payment_method: slices[0]!.payment_method,
        payments: slices,
        discount: discountAmount,
      });
      navigate('/salon');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cobrar la cuenta dividida');
    }
  }

  async function payByItems() {
    setError(null);
    const groups: Record<number, number[]> = {};
    for (const it of allActiveItems) {
      const pIdx = itemAssignments[it.id] ?? 0;
      if (!groups[pIdx]) groups[pIdx] = [];
      groups[pIdx]!.push(it.id);
    }
    const splits: CloseSplit[] = Object.entries(groups)
      .filter(([, ids]) => ids.length > 0)
      .map(([pIdxStr, item_ids]) => ({
        item_ids,
        payment_method: personMethods[Number(pIdxStr)] ?? 'cash',
      }));

    if (splits.length === 0) {
      setError('Asigná los productos a cobrar');
      return;
    }

    try {
      await closeSession.mutateAsync({
        sessionId: sid,
        payment_method: splits[0]!.payment_method,
        splits,
        discount: discountAmount,
      });
      navigate('/salon');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cobrar por productos');
    }
  }

  async function doCancel() {
    if (!confirm('¿Cancelar la cuenta? Se descarta sin cobrar.')) return;
    await cancelSession.mutateAsync(sid);
    navigate('/salon');
  }

  const allActiveItems = rounds.flatMap((r) =>
    r.items.filter((it) => it.status === 'ordered'),
  );

  return (
    <div className="session">
      <div className="session__head">
        <button className="back-btn" onClick={() => navigate('/salon')}>
          ‹ Cuentas
        </button>
        <div className="session__title-wrap">
          <h1 className="session__table">{accountTitle}</h1>
          <span className={`session__status session__status--${s.status}`}>
            {s.status === 'bill_requested'
              ? 'Cuenta pedida'
              : s.status === 'open'
                ? 'Abierta'
                : s.status}
          </span>
        </div>
      </div>

      <div className="session__rounds">
        {rounds.length === 0 ? (
          <p className="cart__empty">Todavía no hay comandas.</p>
        ) : (
          rounds.map((r) => (
            <div key={r.id} className="round-card">
              <div className="round-card__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Comanda {r.number}</span>
                <button
                  type="button"
                  className="t-btn"
                  style={{
                    fontSize: '11px',
                    minHeight: '26px',
                    padding: '2px 8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--line)',
                  }}
                  onClick={() => void handleReprintRound(r)}
                  title="Reimprimir esta comanda"
                >
                  🖨️ Reimprimir
                </button>
              </div>
              {r.items.map((it) => {
                const hasDisc = Boolean(it.discount_pct && it.discount_pct > 0);
                const origTotal =
                  it.original_unit_price && it.original_unit_price > it.unit_price
                    ? it.original_unit_price * it.qty
                    : null;
                return (
                  <div
                    key={it.id}
                    className={`round-item${it.status === 'cancelled' ? ' is-cancelled' : ''}`}
                    style={{ alignItems: 'center', gap: '8px' }}
                  >
                    <span style={{ flex: 1 }}>
                      {it.qty}× {it.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {it.status === 'ordered' && (
                        <button
                          type="button"
                          style={{
                            background: hasDisc ? 'rgba(253, 183, 64, 0.14)' : 'transparent',
                            border: hasDisc ? '1px solid rgba(253, 183, 64, 0.45)' : '1px solid transparent',
                            borderRadius: '4px',
                            color: hasDisc ? 'var(--ocre)' : 'var(--muted)',
                            fontSize: '11px',
                            fontWeight: hasDisc ? 700 : 500,
                            padding: '1px 5px',
                            cursor: 'pointer',
                            opacity: hasDisc ? 1 : 0.65,
                          }}
                          onClick={() => {
                            setCustomItemDiscount('');
                            setItemForDiscount(it);
                          }}
                          title="Descuento en este producto"
                        >
                          {hasDisc ? `-${it.discount_pct}%` : '%'}
                        </button>
                      )}
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {origTotal ? (
                          <>
                            <s style={{ opacity: 0.55, marginRight: '5px', fontSize: '13px' }}>
                              {formatARS(origTotal)}
                            </s>
                            <b style={{ color: 'var(--ocre)' }}>
                              {formatARS(it.line_total ?? it.unit_price * it.qty)}
                            </b>
                          </>
                        ) : (
                          <b style={{ color: 'var(--ocre)' }}>
                            {formatARS(it.line_total ?? it.unit_price * it.qty)}
                          </b>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="session__foot">
        <div className="cart__total">
          <span>Total</span>
          <strong style={{ color: 'var(--ocre)' }}>{formatARS(total)}</strong>
        </div>
        {error && <p className="t-error">{error}</p>}
        <div className="session__actions">
          <button className="t-btn method-btn" onClick={() => setAddOpen(true)}>
            + Comanda
          </button>
          <button
            className="t-btn method-btn"
            disabled={total <= 0}
            onClick={() => {
              if (s.status === 'open') requestBill.mutate(sid);
              void handlePrintAccount();
            }}
            title="Imprimir pre-cuenta en comanderas"
          >
            🖨️ Cuenta
          </button>
          <button className="t-btn method-btn method-btn--danger" onClick={() => void doCancel()}>
            Cancelar cuenta
          </button>
          <button
            className="t-btn t-btn--primary"
            disabled={total <= 0}
            onClick={() => setPayOpen(true)}
          >
            Cobrar
          </button>
        </div>
      </div>

      {addOpen && (
        <AddRoundSheet
          sessionId={sid}
          placeLabel={tablesLabel || undefined}
          accountLabel={s.label ?? undefined}
          onClose={() => setAddOpen(false)}
        />
      )}

      {/* Modal Descuento en producto específico de la cuenta */}
      {itemForDiscount && (
        <div
          className="overlay"
          style={{ zIndex: 70 }}
          onClick={() => !discountItemMut.isPending && setItemForDiscount(null)}
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="sheet__title">Descuento en producto</h3>
            <p style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--cream)' }}>
              {itemForDiscount.qty}× {itemForDiscount.name} (
              <b style={{ color: 'var(--ocre)' }}>
                {formatARS(itemForDiscount.original_unit_price ?? itemForDiscount.unit_price)} c/u
              </b>
              )
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              {[0, 10, 15, 20, 30, 50].map((pct) => {
                const active = Math.round(itemForDiscount.discount_pct ?? 0) === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    className="t-btn"
                    disabled={discountItemMut.isPending}
                    style={{
                      background: active ? 'rgba(253, 183, 64, 0.22)' : 'var(--surface-2)',
                      border: active ? '2px solid var(--ocre)' : '1px solid var(--line)',
                      color: 'var(--ocre)',
                      fontSize: '15px',
                      fontWeight: 700,
                    }}
                    onClick={() => void applyItemDiscountPct(pct)}
                  >
                    {pct === 0 ? 'Sin desc.' : `${pct}%`}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="number"
                min="0"
                max={itemForDiscount.original_unit_price ?? itemForDiscount.unit_price}
                placeholder="Descontar monto $ por unidad"
                className="t-input"
                value={customItemDiscount}
                onChange={(e) => setCustomItemDiscount(e.target.value)}
              />
              <button
                type="button"
                className="t-btn"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--ocre)',
                  color: 'var(--ocre)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
                disabled={
                  discountItemMut.isPending ||
                  !customItemDiscount ||
                  parseFloat(customItemDiscount) <= 0
                }
                onClick={() => void applyItemDiscountCustom()}
              >
                Aplicar $
              </button>
            </div>
            <button
              className="sheet__cancel"
              disabled={discountItemMut.isPending}
              onClick={() => setItemForDiscount(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {payOpen && (
        <div className="overlay" onClick={() => !closeSession.isPending && setPayOpen(false)}>
          <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">Cobrar {accountTitle}</h2>

            {!isCashOpen && (
              <div
                style={{
                  background: 'rgba(253, 183, 64, 0.14)',
                  border: '1px solid var(--ocre)',
                  color: 'var(--ocre)',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '10px',
                }}
              >
                ⚠️ Atención: La caja está cerrada. Este cobro se registrará igualmente bajo «Ventas sin caja abierta».
              </div>
            )}

            <div
              style={{
                marginBottom: '12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                padding: '12px',
                borderRadius: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Subtotal consumos:</span>
                <span style={{ color: 'var(--ocre)', fontWeight: 600 }}>{formatARS(total)}</span>
              </div>
              {discountAmount > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--ocre)',
                    marginBottom: '4px',
                    fontWeight: 600,
                  }}
                >
                  <span>Descuento general cuenta:</span>
                  <span>−{formatARS(discountAmount)}</span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  borderTop: '1px solid var(--line)',
                  paddingTop: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Total a cobrar:</span>
                  <button
                    type="button"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--line)',
                      borderRadius: '4px',
                      color: discountAmount > 0 ? 'var(--ocre)' : 'var(--muted)',
                      fontSize: '11px',
                      padding: '2px 6px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowGlobalDiscount((v) => !v)}
                  >
                    {discountAmount > 0 ? 'Editar desc.' : '+ desc.'}
                  </button>
                </div>
                <strong style={{ color: 'var(--ocre)' }}>{formatARS(finalTotal)}</strong>
              </div>
            </div>

            {(showGlobalDiscount || discountAmount > 0) && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                }}
              >
                {allActiveItems.length > 0 && (
                  <div style={{ marginBottom: '10px', maxHeight: '18vh', overflowY: 'auto' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                      Descuento por ítem:
                    </div>
                    {allActiveItems.map((it) => {
                      const hasDisc = Boolean(it.discount_pct && it.discount_pct > 0);
                      return (
                        <div
                          key={it.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '3px 0',
                            fontSize: '13px',
                            gap: '6px',
                          }}
                        >
                          <span style={{ flex: 1 }}>
                            {it.qty}× {it.name}
                          </span>
                          <button
                            type="button"
                            style={{
                              background: hasDisc ? 'rgba(253, 183, 64, 0.16)' : 'var(--surface-2)',
                              border: '1px solid var(--line)',
                              borderRadius: '4px',
                              color: hasDisc ? 'var(--ocre)' : 'var(--muted)',
                              fontSize: '11px',
                              padding: '1px 6px',
                              cursor: 'pointer',
                            }}
                            onClick={() => {
                              setCustomItemDiscount('');
                              setItemForDiscount(it);
                            }}
                          >
                            {hasDisc ? `-${it.discount_pct}%` : '%'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: '6px',
                    marginBottom: '8px',
                  }}
                >
                  {[0, 10, 15, 20, 30, 50].map((pct) => {
                    const active = discountPct === pct && customDiscount === '';
                    return (
                      <button
                        key={pct}
                        type="button"
                        className="t-btn"
                        style={{
                          minHeight: '34px',
                          padding: '4px 6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: active ? 'rgba(253, 183, 64, 0.22)' : 'var(--surface-2)',
                          border: active ? '1px solid var(--ocre)' : '1px solid var(--line)',
                          color: 'var(--ocre)',
                        }}
                        onClick={() => {
                          setDiscountPct(pct);
                          setCustomDiscount('');
                        }}
                      >
                        {pct === 0 ? '0%' : `${pct}%`}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    Monto $:
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={total}
                    placeholder="$ Monto a descontar"
                    className="t-input"
                    style={{ minHeight: '34px', fontSize: '13px' }}
                    value={customDiscount}
                    onChange={(e) => {
                      setCustomDiscount(e.target.value);
                      setDiscountPct(0);
                    }}
                  />
                </div>
              </div>
            )}

            {error && <p className="t-error">{error}</p>}

            {/* Selector de modalidad de cobro: Pago único / Dividir en personas o medios / Por productos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
              <button
                type="button"
                className="t-btn"
                style={{
                  minHeight: '36px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: payMode === 'single' ? 'var(--ocre)' : 'var(--surface-2)',
                  color: payMode === 'single' ? '#111' : 'var(--cream)',
                  border: '1px solid var(--line)',
                }}
                onClick={() => setPayMode('single')}
              >
                💳 Pago único
              </button>
              <button
                type="button"
                className="t-btn"
                style={{
                  minHeight: '36px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: payMode === 'split_amount' ? 'var(--ocre)' : 'var(--surface-2)',
                  color: payMode === 'split_amount' ? '#111' : 'var(--cream)',
                  border: '1px solid var(--line)',
                }}
                onClick={() => {
                  setPayMode('split_amount');
                  if (paymentRows.length === 0) {
                    initEqualSplit(2, finalTotal);
                  }
                }}
              >
                👥 Dividir / Pagos
              </button>
              <button
                type="button"
                className="t-btn"
                style={{
                  minHeight: '36px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: payMode === 'split_items' ? 'var(--ocre)' : 'var(--surface-2)',
                  color: payMode === 'split_items' ? '#111' : 'var(--cream)',
                  border: '1px solid var(--line)',
                }}
                onClick={() => setPayMode('split_items')}
              >
                🍕 Por ítems
              </button>
            </div>

            {payMode === 'single' && (
              <div className="method-grid">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    className="t-btn method-btn"
                    disabled={closeSession.isPending}
                    onClick={() => void pay(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {payMode === 'split_amount' && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {[2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="t-btn"
                      style={{
                        flex: 1,
                        minHeight: '34px',
                        fontSize: '12px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line)',
                        color: 'var(--ocre)',
                        fontWeight: 700,
                      }}
                      onClick={() => initEqualSplit(n, finalTotal)}
                    >
                      ÷ {n} ({formatARS(Math.round(finalTotal / n))})
                    </button>
                  ))}
                  <button
                    type="button"
                    className="t-btn"
                    style={{
                      minHeight: '34px',
                      fontSize: '12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--cream)',
                      padding: '0 10px',
                    }}
                    onClick={() => {
                      const currentSum = paymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                      const rem = Math.max(0, Math.round(finalTotal - currentSum));
                      setPaymentRows((prev) => [
                        ...prev,
                        { amount: String(rem), payment_method: 'cash', label: `Persona ${prev.length + 1}` },
                      ]);
                    }}
                  >
                    + Pago
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '28vh', overflowY: 'auto', marginBottom: '10px' }}>
                  {paymentRows.map((row, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '90px 1fr 125px auto',
                        gap: '6px',
                        alignItems: 'center',
                        background: 'var(--surface-2)',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cream)' }}>{row.label}</span>
                      <input
                        type="number"
                        min="0"
                        className="t-input"
                        style={{ minHeight: '34px', fontSize: '14px', padding: '4px 8px' }}
                        value={row.amount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPaymentRows((prev) => {
                            const next = prev.map((r, i) => (i === idx ? { ...r, amount: val } : r));
                            // Si son 2 pagos y edita el primero, autocompletar el segundo con el resto
                            if (next.length === 2 && idx === 0) {
                              const num = parseFloat(val) || 0;
                              next[1] = { ...next[1]!, amount: String(Math.max(0, Math.round(finalTotal - num))) };
                            }
                            return next;
                          });
                        }}
                      />
                      <select
                        className="t-input"
                        style={{ minHeight: '34px', fontSize: '12px', padding: '4px 6px' }}
                        value={row.payment_method}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPaymentRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, payment_method: val } : r)),
                          );
                        }}
                      >
                        {METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      {paymentRows.length > 2 && (
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '15px' }}
                          onClick={() => setPaymentRows((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {(() => {
                  const sumAssigned = Math.round(paymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0));
                  const diff = Math.round(finalTotal) - sumAssigned;
                  return (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        marginBottom: '10px',
                        background: Math.abs(diff) <= 5 ? 'rgba(46, 204, 113, 0.14)' : 'rgba(253, 183, 64, 0.14)',
                        color: Math.abs(diff) <= 5 ? '#2ecc71' : 'var(--ocre)',
                        fontWeight: 600,
                      }}
                    >
                      <span>Asignado: {formatARS(sumAssigned)}</span>
                      <span>
                        {Math.abs(diff) <= 5
                          ? '✓ Total cubierto'
                          : diff > 0
                            ? `Faltan ${formatARS(diff)}`
                            : `Sobran ${formatARS(Math.abs(diff))}`}
                      </span>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  className="t-btn t-btn--primary t-btn--block"
                  disabled={closeSession.isPending}
                  onClick={() => void payMultipleSlices()}
                >
                  {closeSession.isPending ? 'Cobrando…' : `Confirmar cobro dividido (${formatARS(finalTotal)})`}
                </button>
              </div>
            )}

            {payMode === 'split_items' && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    Tocá cada producto para asignarlo a una persona:
                  </span>
                  <button
                    type="button"
                    className="t-btn"
                    style={{ minHeight: '28px', fontSize: '11px', padding: '2px 8px', background: 'var(--surface-2)', border: '1px solid var(--line)' }}
                    onClick={() => {
                      const nextIdx = itemPeopleCount;
                      setItemPeopleCount((c) => c + 1);
                      setPersonMethods((prev) => ({ ...prev, [nextIdx]: 'cash' }));
                    }}
                  >
                    + Persona
                  </button>
                </div>

                <div style={{ maxHeight: '22vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                  {allActiveItems.map((it) => {
                    const assigned = itemAssignments[it.id] ?? 0;
                    return (
                      <div
                        key={it.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: 'var(--surface-2)',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          fontSize: '13px',
                        }}
                      >
                        <span style={{ flex: 1 }}>
                          {it.qty}× {it.name} ({formatARS(it.line_total ?? it.unit_price * it.qty)})
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {Array.from({ length: itemPeopleCount }, (_, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              onClick={() => setItemAssignments((prev) => ({ ...prev, [it.id]: pIdx }))}
                              style={{
                                padding: '3px 7px',
                                borderRadius: '4px',
                                border: assigned === pIdx ? '1px solid var(--ocre)' : '1px solid var(--line)',
                                background: assigned === pIdx ? 'var(--ocre)' : 'transparent',
                                color: assigned === pIdx ? '#111' : 'var(--cream)',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              P{pIdx + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                  {Array.from({ length: itemPeopleCount }, (_, pIdx) => {
                    const personSum = allActiveItems
                      .filter((it) => (itemAssignments[it.id] ?? 0) === pIdx)
                      .reduce((s, it) => s + (it.line_total ?? it.unit_price * it.qty), 0);
                    if (personSum <= 0) return null;
                    return (
                      <div
                        key={pIdx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '13px',
                          background: 'var(--bg)',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--line)',
                        }}
                      >
                        <span>
                          <b>Persona {pIdx + 1}:</b> <span style={{ color: 'var(--ocre)' }}>{formatARS(personSum)}</span>
                        </span>
                        <select
                          className="t-input"
                          style={{ width: '135px', minHeight: '30px', fontSize: '12px', padding: '2px 6px' }}
                          value={personMethods[pIdx] ?? 'cash'}
                          onChange={(e) => setPersonMethods((prev) => ({ ...prev, [pIdx]: e.target.value }))}
                        >
                          {METHODS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="t-btn t-btn--primary t-btn--block"
                  disabled={closeSession.isPending}
                  onClick={() => void payByItems()}
                >
                  {closeSession.isPending ? 'Cobrando…' : 'Confirmar cobro por productos'}
                </button>
              </div>
            )}
            <button
              className="sheet__cancel"
              onClick={() => setPayOpen(false)}
              disabled={closeSession.isPending}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
