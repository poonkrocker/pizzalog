import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatARS } from '@pizzalog/shared';
import { CostEngine, type CostCatalog, type Recipe as EngineRecipe, type UnitCode } from '@pizzalog/cost-engine';
import { useApi } from '@/lib/auth';
import { Loading, PageHeader } from '@/ui';

const today = () => new Date().toISOString().slice(0,10);
const yearsAgo = (n:number) => { const d=new Date(); d.setFullYear(d.getFullYear()-n); return d.toISOString().slice(0,10); };
const aliases: Record<string,UnitCode> = { kilo:'kg',kilos:'kg',gr:'g',gramo:'g',gramos:'g',lt:'L',litro:'L',litros:'L',cc:'cc',u:'unit',un:'unit',unidad:'unit',unidades:'unit',docena:'dozen' };
const supported = new Set<UnitCode>(['kg','g','mg','lb','oz','L','l','ml','cc','fl_oz_us','gal_us','unit','u','dozen','docena']);
function engineUnit(value:string): UnitCode | null { const n=value.trim().toLowerCase(); return aliases[n] ?? (supported.has(value.trim() as UnitCode) ? value.trim() as UnitCode : null); }
function dimension(unit:UnitCode):'mass'|'volume'|'count' {
  if(['kg','g','mg','lb','oz'].includes(unit)) return 'mass';
  if(['L','l','ml','cc','fl_oz_us','gal_us'].includes(unit)) return 'volume';
  return 'count';
}

const panel:React.CSSProperties={background:'var(--c-surface,#fff)',border:'1px solid var(--c-border,#ddd)',borderRadius:10,padding:'1rem',minWidth:0};
const muted:React.CSSProperties={color:'#777',fontSize:'.82rem'};
const control:React.CSSProperties={padding:'.55rem .65rem',border:'1px solid var(--c-border,#ccc)',borderRadius:6,background:'var(--c-surface,#fff)',color:'var(--c-text,#222)'};

export function SeasonalPizzaLabPage() {
  const api=useApi(); const qc=useQueryClient();
  const [from,setFrom]=useState(yearsAgo(4)); const [to,setTo]=useState(today());
  const [recipeChoice,setRecipeChoice]=useState<Record<number,string>>({});
  const report=useQuery({queryKey:['analytics','seasonal-pizzas',from,to],queryFn:()=>api.analytics.seasonalPizzas({from,to})});
  const studio=useQuery({queryKey:['production','recipe-studio'],queryFn:()=>api.production.recipeStudio()});
  const link=useMutation({
    mutationFn:({variantId,recipeId}:{variantId:number;recipeId:number})=>api.analytics.linkSeasonalPizzaRecipe(variantId,recipeId),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['analytics','seasonal-pizzas']});}
  });
  const unlink=useMutation({mutationFn:(variantId:number)=>api.analytics.unlinkSeasonalPizzaRecipe(variantId),onSuccess:()=>qc.invalidateQueries({queryKey:['analytics','seasonal-pizzas']})});

  const costing=useMemo(()=>{
    const supplies=studio.data?.supplies??[]; const raw=studio.data?.recipes??[];
    const ingredients=supplies.flatMap(s=>{const u=engineUnit(s.unit);return u?[{id:`supply_${s.id}`,name:s.name,base_dimension:dimension(u),base_unit:u,is_active:true}]:[];});
    const purchase_prices=supplies.flatMap(s=>{const u=engineUnit(s.unit);return u&&s.cost!==null&&Number.isFinite(s.cost)&&s.cost>0?[{ingredient_id:`supply_${s.id}`,purchase_price:s.cost,currency:'ARS',pack_quantity:1,pack_unit:u,yield_pct:100}]:[];});
    const recipes:EngineRecipe[]=[];
    for(const r of raw){
      const yu=engineUnit(r.yield_unit); if(!yu) continue;
      const components=[]; let valid=true;
      for(const c of r.components){
        const u=engineUnit(c.unit); if(!u||!Number.isFinite(c.quantity)||c.quantity<=0){valid=false;break;}
        if(c.component_type==='supply'){
          const supply=supplies.find(s=>s.id===c.component_id); if(!supply||!engineUnit(supply.unit)){valid=false;break;}
          components.push({component_type:'ingredient' as const,ingredient_id:`supply_${c.component_id}`,quantity:c.quantity,unit:u});
        } else components.push({component_type:'subrecipe' as const,recipe_id:String(c.component_id),quantity:c.quantity,unit:u});
      }
      if(valid) recipes.push({id:String(r.id),name:r.name,recipe_type:r.recipe_type,yield_quantity:r.yield_quantity,yield_unit:yu,currency:'ARS',components});
    }
    const catalog:CostCatalog={ingredients,purchase_prices,recipes};
    const engine=new CostEngine(catalog);
    const costs=new Map<number,{unitCost:number|null;recipePrice:number;recipeName:string}>();
    for(const r of raw){
      try { const result=engine.calculateRecipeCost(String(r.id)); costs.set(r.id,{unitCost:result.status==='complete'&&result.raw_unit_cost!==null?result.raw_unit_cost:null,recipePrice:r.price,recipeName:r.name}); }
      catch { costs.set(r.id,{unitCost:null,recipePrice:r.price,recipeName:r.name}); }
    }
    return costs;
  },[studio.data]);

  const variants=report.data?.variants??[];
  const recipes=report.data?.recipes??[];
  const totalUnits=variants.reduce((s,v)=>s+v.units,0);
  const totalRevenue=variants.reduce((s,v)=>s+v.revenue,0);
  const costed=variants.filter(v=>v.recipe_id!==null&&costing.get(v.recipe_id)?.unitCost!==null);
  const estimatedProfit=costed.reduce((s,v)=>s+v.revenue-(v.units*(costing.get(v.recipe_id!)?.unitCost??0)),0);

  return <section>
    <PageHeader eyebrow="Analítica · Producto" title="Laboratorio de pizzas" description="Historial, demanda y rentabilidad estimada de las pizzas de temporada. Las ventas se agrupan por variante de Pizza de la semana." />
    <div style={{...panel,display:'flex',gap:'.75rem',alignItems:'end',flexWrap:'wrap',marginBottom:'1rem'}}>
      <label style={{display:'grid',gap:'.3rem',fontSize:'.82rem'}}>Desde<input style={control} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label style={{display:'grid',gap:'.3rem',fontSize:'.82rem'}}>Hasta<input style={control} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <button style={control} onClick={()=>{setFrom(yearsAgo(4));setTo(today());}}>Todo el histórico</button>
    </div>
    {(report.isLoading||studio.isLoading)&&<Loading message="Analizando pizzas de temporada y recetas..."/>}
    {(report.isError||studio.isError)&&<div role="alert" style={{...panel,color:'#a12622'}}>No se pudieron cargar los datos. Verificá que esté aplicada la migración 035 y la conciliación histórica.</div>}
    {!report.isLoading&&report.data?.parent_product_id===null&&<div style={panel}>Todavía no existe el producto Pizza de la semana. Ejecutá la migración de catálogo y conciliación antes de usar este panel.</div>}
    {report.data?.parent_product_id!==null&&<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'.75rem',marginBottom:'1rem'}}>
        <div style={panel}><div style={muted}>Variantes</div><strong style={{fontSize:'1.7rem'}}>{variants.length}</strong></div>
        <div style={panel}><div style={muted}>Unidades netas</div><strong style={{fontSize:'1.7rem'}}>{totalUnits.toLocaleString('es-AR',{maximumFractionDigits:1})}</strong></div>
        <div style={panel}><div style={muted}>Facturación histórica</div><strong style={{fontSize:'1.7rem'}}>{formatARS(totalRevenue)}</strong></div>
        <div style={panel}><div style={muted}>Ganancia estimada con costo actual</div><strong style={{fontSize:'1.7rem'}}>{formatARS(estimatedProfit)}</strong><div style={muted}>{costed.length} variantes con receta costeable</div></div>
      </div>
      <div style={{...panel,marginBottom:'1rem'}}>
        <strong>Ranking histórico</strong>
        <p style={muted}>La rentabilidad se estima aplicando el costo vigente de la receta a las unidades históricas. No representa el costo histórico de cada fecha. Las ventas por día disponible solo aparecen cuando se verifican los períodos de carta.</p>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.88rem'}}>
            <thead><tr>{['Pizza','Unidades','Facturación','Tickets','Primera venta','Última venta','Unid./día disponible','Costo unitario actual','Ganancia estimada','Receta'].map(x=><th key={x} style={{textAlign:'left',padding:'.6rem',borderBottom:'1px solid var(--c-border,#ddd)'}}>{x}</th>)}</tr></thead>
            <tbody>{variants.map(v=>{
              const c=v.recipe_id!==null?costing.get(v.recipe_id):undefined;
              const profit=c?.unitCost!==null&&c?.unitCost!==undefined?v.revenue-v.units*c.unitCost:null;
              return <tr key={v.variant_id}>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)',fontWeight:650}}>{v.label}</td>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)'}}>{v.units.toLocaleString('es-AR',{maximumFractionDigits:1})}</td>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)'}}>{formatARS(v.revenue)}</td>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)'}}>{v.tickets}</td>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)'}}>{v.first_sale??'—'}</td>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)'}}>{v.last_sale??'—'}</td>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)'}}>{v.units_per_available_day===null?'Período sin verificar':v.units_per_available_day.toFixed(2)}</td>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)'}}>{c?.unitCost!==null&&c?.unitCost!==undefined?formatARS(c.unitCost):'Sin costeo'}</td>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)'}}>{profit===null?'—':formatARS(profit)}</td>
                <td style={{padding:'.6rem',borderBottom:'1px solid var(--c-border,#eee)',minWidth:220}}>
                  <div style={{display:'grid',gap:'.35rem'}}>
                    <span>{v.recipe_name??'Sin receta asignada'}</span>
                    <div style={{display:'flex',gap:'.35rem'}}>
                      <select style={{...control,flex:1,minWidth:130}} value={recipeChoice[v.variant_id]??String(v.recipe_id??'')} onChange={e=>setRecipeChoice(s=>({...s,[v.variant_id]:e.target.value}))}>
                        <option value="">Sin receta</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <button style={control} disabled={!recipeChoice[v.variant_id]||link.isPending} onClick={()=>link.mutate({variantId:v.variant_id,recipeId:Number(recipeChoice[v.variant_id])})}>Vincular</button>
                      {v.recipe_id!==null&&<button style={control} onClick={()=>unlink.mutate(v.variant_id)}>×</button>}
                    </div>
                  </div>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>
      <div style={panel}>
        <strong>Cómo cargar recetas</strong>
        <p style={muted}>Creá cada receta en Calculadora & Costos con el nombre de la pizza, dejándola sin producto vinculado. Después seleccionála en la columna Receta. El motor de costos calcula el costo unitario a partir de sus insumos y subrecetas.</p>
      </div>
    </>}
  </section>;
}
