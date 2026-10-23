import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatARS, type AnalyticsQuery } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { Loading, PageHeader, Input } from '@/ui';

const dateNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (date: string, amount: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const card: React.CSSProperties = { background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #ddd)', borderRadius: 10, padding: '1rem', minWidth: 0 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' };
const muted: React.CSSProperties = { color: '#777', fontSize: '.82rem' };
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function AnalyticsDetailsPage() {
  const api = useApi();
  const [from, setFrom] = useState(dateDaysAgo(29));
  const [to, setTo] = useState(dateNow());
  const [heatPreset, setHeatPreset] = useState<'all' | 'midday' | 'night'>('all');
  const query: AnalyticsQuery = useMemo(() => ({ from, to, limit: 100 }), [from, to]);
  const previous = useMemo(() => {
    const length = Math.max(1, Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000) + 1);
    return { from: addDays(from, -length), to: addDays(from, -1) };
  }, [from, to]);

  const preferencesQ = useQuery({ queryKey: ['analytics','time-preferences'], queryFn: () => api.analytics.timePreferences().then(r => r.preferences) });
  useEffect(() => {
    if (preferencesQ.data?.selected_preset) setHeatPreset(preferencesQ.data.selected_preset);
  }, [preferencesQ.data?.selected_preset]);
  const summary = useQuery({ queryKey: ['analytics','details-summary',query], queryFn: () => api.analytics.summary(query).then(r => r.summary) });
  const previousSummary = useQuery({ queryKey: ['analytics','details-summary-previous',previous], queryFn: () => api.analytics.summary(previous).then(r => r.summary) });
  const productsQ = useQuery({ queryKey: ['analytics','details-products',query], queryFn: () => api.analytics.topProducts(query).then(r => r.products) });
  const marginsQ = useQuery({ queryKey: ['analytics','details-margins',query], queryFn: () => api.analytics.productMargins(query).then(r => r.products as Array<{product_id:number;name:string;unit_cost:number;units:number;revenue:number;profit:number;margin_pct:number|null;has_cost:boolean}>) });
  const combosQ = useQuery({ queryKey: ['analytics','details-combos',query], queryFn: () => api.analytics.winningCombinations(query) });
  const heatQ = useQuery({ queryKey: ['analytics','details-heatmap',query], queryFn: () => api.analytics.timeHeatmap(query).then(r => r.cells) });
  const products = productsQ.data ?? [];
  const margins = marginsQ.data ?? [];
  const combos = combosQ.data?.product_combinations ?? [];
  const triples = combosQ.data?.product_triples ?? [];
  const cells = heatQ.data ?? [];
  const maxUnits = Math.max(1, ...products.map(p => p.units));
  const maxRevenue = Math.max(1, ...cells.map(c => c.revenue));
  const heatCells = useMemo(() => {
    if (heatPreset === 'all') return cells;
    return cells.filter(c => heatPreset === 'midday'
      ? c.weekday >= 1 && c.weekday <= 4 && c.hour >= 11 && c.hour < 16
      : [3,4,5,6].includes(c.weekday) && (c.hour >= 20 || c.hour < 2));
  }, [cells, heatPreset]);
  const heatLookup = useMemo(() => new Map(heatCells.map(c => [`${c.weekday}-${c.hour}`, c])), [heatCells]);
  const categories = useMemo(() => {
    const map = new Map<string, typeof products>();
    products.forEach(p => {
      const name = p.category_name || 'Sin categoría';
      map.set(name, [...(map.get(name) ?? []), p]);
    });
    return [...map.entries()].map(([name, list]) => ({ name, product: [...list].sort((a,b) => b.units-a.units)[0] })).sort((a,b) => b.product.units-a.product.units);
  }, [products]);
  const goodMargins = margins.filter(p => p.has_cost && p.margin_pct !== null);
  const avgMargin = goodMargins.length ? goodMargins.reduce((sum,p)=>sum+(p.margin_pct ?? 0),0)/goodMargins.length : 0;
  const medianUnits = products.length ? [...products].sort((a,b)=>a.units-b.units)[Math.floor(products.length/2)].units : 0;
  const trend = (current: number, prior: number) => prior > 0 ? ((current-prior)/prior)*100 : current > 0 ? null : 0;
  const moneyTrend = trend(summary.data?.revenue ?? 0, previousSummary.data?.revenue ?? 0);
  const ticketTrend = trend(summary.data?.avg_ticket ?? 0, previousSummary.data?.avg_ticket ?? 0);

  return <section>
    <PageHeader eyebrow="Analítica" title="Detalles de rendimiento" description="Rentabilidad, evolución, combinaciones y horarios de venta para tomar decisiones con datos." />
    <div style={{ ...card, display:'flex', gap:'.75rem', alignItems:'end', flexWrap:'wrap', marginBottom:'1rem' }}>
      <label style={{display:'grid',gap:'.3rem',fontSize:'.82rem'}}>Desde<Input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
      <label style={{display:'grid',gap:'.3rem',fontSize:'.82rem'}}>Hasta<Input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
      <button onClick={()=>{setFrom(dateDaysAgo(6));setTo(dateNow());}} style={{padding:'.55rem .8rem',borderRadius:6,border:'1px solid #ddd',background:'#fff',cursor:'pointer'}}>7 días</button>
      <button onClick={()=>{const d=new Date();setFrom(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);setTo(dateNow());}} style={{padding:'.55rem .8rem',borderRadius:6,border:'1px solid #ddd',background:'#fff',cursor:'pointer'}}>Este mes</button>
      <span style={muted}>Comparación: {previous.from} a {previous.to}</span>
    </div>
    {(summary.isLoading || productsQ.isLoading || marginsQ.isLoading) && <Loading message="Analizando ventas y rentabilidad..." />}
    <div style={grid}>
      <div style={card}><div style={muted}>Facturación vs. período anterior</div><div style={{fontSize:'1.6rem',fontWeight:800}}>{formatARS(summary.data?.revenue ?? 0)}</div><strong style={{color: moneyTrend === null ? '#777' : moneyTrend >= 0 ? '#16803d' : '#c62828'}}>{moneyTrend === null ? 'Sin base comparable' : `${moneyTrend >= 0 ? '+' : ''}${moneyTrend.toFixed(1)}%`}</strong></div>
      <div style={card}><div style={muted}>Ticket promedio vs. período anterior</div><div style={{fontSize:'1.6rem',fontWeight:800}}>{formatARS(summary.data?.avg_ticket ?? 0)}</div><strong style={{color: ticketTrend === null ? '#777' : ticketTrend >= 0 ? '#16803d' : '#c62828'}}>{ticketTrend === null ? 'Sin base comparable' : `${ticketTrend >= 0 ? '+' : ''}${ticketTrend.toFixed(1)}%`}</strong></div>
      <div style={card}><div style={muted}>Ventas completadas</div><div style={{fontSize:'1.6rem',fontWeight:800}}>{summary.data?.sales_count ?? '—'}</div><div style={muted}>Unidades vendidas: {summary.data?.units_sold ?? '—'}</div></div>
    </div>
    <div style={grid}>
      <div style={card}>
        <h3 style={{marginTop:0}}>Producto más vendido por categoría</h3>
        {categories.length ? categories.map(c=><div key={c.name} style={{display:'flex',justifyContent:'space-between',gap:'.75rem',padding:'.55rem 0',borderBottom:'1px solid #eee'}}><div><div style={{fontWeight:700}}>{c.name}</div><div style={muted}>{c.product.name}</div></div><strong>{c.product.units} u.</strong></div>) : <p style={muted}>No hay productos para este período.</p>}
      </div>
      <div style={card}>
        <h3 style={{marginTop:0}}>Rentabilidad por producto</h3><p style={muted}>Estimación con el costo actual del catálogo; no representa necesariamente el costo histórico de cada venta.</p>
        {margins.slice(0,10).map(p=><div key={p.product_id} style={{display:'flex',justifyContent:'space-between',gap:'.75rem',padding:'.5rem 0',borderBottom:'1px solid #eee'}}><div><strong>{p.name}</strong><div style={muted}>{p.units} u. · Venta {formatARS(p.revenue)}</div></div><div style={{textAlign:'right'}}><strong>{p.has_cost ? formatARS(p.profit) : 'Costo faltante'}</strong><div style={muted}>{p.has_cost && p.margin_pct !== null ? `Margen ${p.margin_pct}%` : 'No comparable'}</div></div></div>)}
      </div>
    </div>
    <div style={grid}>
      <div style={card}>
        <h3 style={{marginTop:0}}>Popularidad vs. margen</h3><p style={muted}>Popularidad relativa a los productos del período. El margen usa solo productos con costo cargado.</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem'}}>
          {[
            {title:'Estrellas',desc:'Alta popularidad · alto margen',items:goodMargins.filter(p=>p.units>=medianUnits && (p.margin_pct??0)>=avgMargin)},
            {title:'Caballos de batalla',desc:'Alta popularidad · margen bajo',items:goodMargins.filter(p=>p.units>=medianUnits && (p.margin_pct??0)<avgMargin)},
            {title:'Oportunidades',desc:'Baja popularidad · margen alto',items:goodMargins.filter(p=>p.units<medianUnits && (p.margin_pct??0)>=avgMargin)},
            {title:'Revisar',desc:'Baja popularidad · margen bajo',items:goodMargins.filter(p=>p.units<medianUnits && (p.margin_pct??0)<avgMargin)},
          ].map(q=><div key={q.title} style={{border:'1px solid #e5e7eb',borderRadius:8,padding:'.7rem',minWidth:0}}><strong>{q.title}</strong><div style={muted}>{q.desc}</div><div style={{marginTop:'.4rem',fontSize:'.85rem'}}>{q.items.slice(0,4).map(p=><div key={p.product_id}>{p.name}</div>)}{q.items.length===0 && <span style={muted}>Sin productos</span>}</div></div>)}
        </div>
      </div>
      <div style={card}>
        <h3 style={{marginTop:0}}>Combinaciones de 2 productos</h3>
        {combos.slice(0,8).map((p,i)=><div key={`${p.p1_id}-${p.p2_id}`} style={{padding:'.55rem 0',borderBottom:'1px solid #eee'}}><strong>{p.p1_name} + {p.p2_name}</strong><div style={muted}>{p.pair_orders} pedidos · Facturación asociada {formatARS(p.total_revenue)}</div></div>)}
        {!combos.length && <p style={muted}>Todavía no hay combinaciones en este período.</p>}
      </div>
    </div>
    <div style={grid}>
      <div style={card}>
        <h3 style={{marginTop:0}}>Combinaciones de 3 productos</h3>
        <p style={muted}>Tríos distintos registrados en un mismo ticket; las líneas hijas de combos no se consideran productos independientes.</p>
        {triples.map(p=><div key={`${p.p1_id}-${p.p2_id}-${p.p3_id}`} style={{padding:'.55rem 0',borderBottom:'1px solid #eee'}}><strong>{p.p1_name} + {p.p2_name} + {p.p3_name}</strong><div style={muted}>{p.triple_orders} pedidos · {formatARS(p.total_revenue)}</div></div>)}
        {!triples.length && <p style={muted}>No hay tríos de productos distintos suficientes para mostrar.</p>}
      </div>
      <div style={card}>
        <h3 style={{marginTop:0}}>Mapa de calor: día y hora</h3>
        <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',marginBottom:'.75rem'}}>
          {([{id:'all',label:'Todo el horario'},{id:'midday',label:'Mediodía · mar–vie 11–16'},{id:'night',label:'Noche · jue–dom 20–02'}] as const).map(p=><button key={p.id} onClick={()=>{setHeatPreset(p.id); api.analytics.saveTimePreferences({selected_preset:p.id}).catch(()=>undefined);}} style={{border:'1px solid #ddd',borderRadius:6,padding:'.4rem .55rem',background:heatPreset===p.id?'var(--c-accent, #e63946)':'#fff',color:heatPreset===p.id?'#fff':'#333',cursor:'pointer',fontSize:'.78rem'}}>{p.label}</button>)}
        </div>
        <div style={{overflowX:'auto'}}>
          <div style={{display:'grid',gridTemplateColumns:'34px repeat(24, minmax(17px, 1fr))',gap:2,minWidth:540}}>
            <div />
            {Array.from({length:24},(_,h)=><div key={h} style={{fontSize:'.62rem',textAlign:'center',color:'#777'}}>{h%3===0?String(h).padStart(2,'0'):''}</div>)}
            {weekdays.map((day,d)=><div key={day} style={{display:'contents'}}><div style={{fontSize:'.72rem',alignSelf:'center'}}>{day}</div>{Array.from({length:24},(_,h)=>{const cell=heatLookup.get(`${d}-${h}`);const intensity=cell?Math.max(.12,cell.revenue/maxRevenue):0;return <div key={h} title={`${day} ${String(h).padStart(2,'0')}:00 · ${cell?.sales_count ?? 0} ventas · ${formatARS(cell?.revenue ?? 0)}`} style={{height:19,borderRadius:3,background:cell? `rgba(215,56,40,${intensity})`:'#f1f1f1',border:'1px solid rgba(0,0,0,.035)'}} />})}</div>)}
          </div>
        </div>
        <p style={muted}>La intensidad representa facturación dentro del filtro seleccionado. Los horarios se agrupan con la zona horaria configurada para el backend.</p>
      </div>
    </div>
  </section>;
}
