import React from 'react';
import { formatCalendarDate, formatLocaleNumber, todayLocalDateString } from '@pizzalog/cost-engine';
import type { LocaleCode, ToolsWorkspaceState } from './demoData';

interface ExecutiveReportModalProps {
  state: ToolsWorkspaceState;
  monthlySummary: {
    rows: Array<{
      prod: { id: string; name: string };
      isComplete: boolean;
      hasSalesData: boolean;
      units: number | null;
      unitCost: number;
      evaluatedPrice: number;
      unitGrossProfit: number;
      monthlyRevenue: number | null;
      monthlyCogs: number | null;
      monthlyContribution: number | null;
      matrixLabel: string;
      matrixClass: string | null;
    }>;
    totalUnits: number;
    hasSalesData: boolean;
    totalRevenue: number;
    totalCogs: number;
    totalContribution: number;
    weightedMarginPct: number;
  };
  totalMonthlyExpenses: number;
  netOperatingProfit: number | null;
  breakEvenRevenue: number;
  onClose: () => void;
}

const REPORT_TEXT: Record<LocaleCode, {
  modalTitle: string;
  modalSub: string;
  printBtn: string;
  docSub: string;
  issuedLabel: string;
  periodLabel: string;
  periodDefault: string;
  currencyLabel: string;
  kpiRevenue: string;
  kpiUnitsSold: string;
  kpiCogs: string;
  kpiContribution: string;
  kpiWeightedMargin: string;
  kpiNetProfit: string;
  kpiFixedExpenses: string;
  breakEvenTitle: string;
  minRevenueLabel: string;
  minUnitsLabel: string;
  unitsMonth: string;
  safetyMarginLabel: string;
  profitZone: string;
  deficitZone: string;
  tableTitle: string;
  colProduct: string;
  colUnits: string;
  colPrice: string;
  colCost: string;
  colFc: string;
  colUnitContrib: string;
  colTotalContrib: string;
  colClass: string;
  incomplete: string;
  footerLeft: string;
  footerRight: string;
}> = {
  'es-AR': {
    modalTitle: 'Reporte Ejecutivo de Rentabilidad y Menú',
    modalSub: 'Listo para imprimir o guardar como PDF',
    printBtn: '🖨️ Imprimir / Guardar PDF',
    docSub: 'Informe Ejecutivo de Costos, Contribución y Punto de Equilibrio',
    issuedLabel: 'Fecha de emisión:',
    periodLabel: 'Período evaluado:',
    periodDefault: 'Período actual proyectado',
    currencyLabel: 'Moneda:',
    kpiRevenue: 'Facturación Mensual',
    kpiUnitsSold: 'unidades vendidas',
    kpiCogs: 'Costo de Mercadería (CMV)',
    kpiContribution: 'Contribución Marginal',
    kpiWeightedMargin: 'Margen ponderado:',
    kpiNetProfit: 'Resultado Neto Estimado',
    kpiFixedExpenses: 'Gastos fijos:',
    breakEvenTitle: '🎯 Punto de Equilibrio (Break-Even Point)',
    minRevenueLabel: 'Facturación Mínima Necesaria:',
    minUnitsLabel: 'Unidades Mínimas:',
    unitsMonth: 'unidades / mes',
    safetyMarginLabel: 'Margen de Seguridad:',
    profitZone: ' (Zona de Ganancia)',
    deficitZone: ' (Zona de Déficit)',
    tableTitle: 'Desglose de Productos e Ingeniería de Menú',
    colProduct: 'Producto',
    colUnits: 'Unidades',
    colPrice: 'Precio Venta',
    colCost: 'Costo Receta',
    colFc: 'Food Cost %',
    colUnitContrib: 'Contrib. Unitaria',
    colTotalContrib: 'Contrib. Total',
    colClass: 'Clasificación',
    incomplete: '⚠️ Incompleto',
    footerLeft: 'Generado con Pizzalog Tools · Restaurant Profit Kit v2',
    footerRight: 'Cálculos auditados con Pizzalog Cost Engine',
  },
  'pt-BR': {
    modalTitle: 'Relatório Executivo de Rentabilidade e Cardápio',
    modalSub: 'Pronto para imprimir ou salvar como PDF',
    printBtn: '🖨️ Imprimir / Salvar PDF',
    docSub: 'Relatório Executivo de Custos, Contribuição e Ponto de Equilíbrio',
    issuedLabel: 'Data de emissão:',
    periodLabel: 'Período avaliado:',
    periodDefault: 'Período atual projetado',
    currencyLabel: 'Moeda:',
    kpiRevenue: 'Faturamento Mensal',
    kpiUnitsSold: 'unidades vendidas',
    kpiCogs: 'Custo de Mercadoria (CMV)',
    kpiContribution: 'Margem de Contribuição',
    kpiWeightedMargin: 'Margem ponderada:',
    kpiNetProfit: 'Lucro Líquido Estimado',
    kpiFixedExpenses: 'Custos fixos:',
    breakEvenTitle: '🎯 Ponto de Equilíbrio (Break-Even Point)',
    minRevenueLabel: 'Faturamento Mínimo Necessário:',
    minUnitsLabel: 'Unidades Mínimas:',
    unitsMonth: 'unidades / mês',
    safetyMarginLabel: 'Margem de Segurança:',
    profitZone: ' (Zona de Lucro)',
    deficitZone: ' (Zona de Déficit)',
    tableTitle: 'Decomposição de Produtos e Engenharia de Cardápio',
    colProduct: 'Produto',
    colUnits: 'Unidades',
    colPrice: 'Preço Venda',
    colCost: 'Custo Receita',
    colFc: 'CMV %',
    colUnitContrib: 'Contrib. Unitária',
    colTotalContrib: 'Contrib. Total',
    colClass: 'Classificação',
    incomplete: '⚠️ Incompleto',
    footerLeft: 'Gerado com Pizzalog Tools · Restaurant Profit Kit v2',
    footerRight: 'Cálculos auditados com Pizzalog Cost Engine',
  },
  en: {
    modalTitle: 'Executive Profitability & Menu Engineering Report',
    modalSub: 'Ready to print or save as PDF',
    printBtn: '🖨️ Print / Save PDF',
    docSub: 'Executive Costing, Contribution Margin & Break-Even Report',
    issuedLabel: 'Issue date:',
    periodLabel: 'Evaluated period:',
    periodDefault: 'Current projected period',
    currencyLabel: 'Currency:',
    kpiRevenue: 'Monthly Revenue',
    kpiUnitsSold: 'units sold',
    kpiCogs: 'Cost of Goods Sold (COGS)',
    kpiContribution: 'Contribution Margin',
    kpiWeightedMargin: 'Weighted margin:',
    kpiNetProfit: 'Estimated Net Profit',
    kpiFixedExpenses: 'Fixed expenses:',
    breakEvenTitle: '🎯 Break-Even Point Analysis',
    minRevenueLabel: 'Minimum Required Revenue:',
    minUnitsLabel: 'Minimum Units:',
    unitsMonth: 'units / month',
    safetyMarginLabel: 'Safety Margin:',
    profitZone: ' (Profit Zone)',
    deficitZone: ' (Deficit Zone)',
    tableTitle: 'Product Breakdown & Menu Engineering',
    colProduct: 'Product',
    colUnits: 'Units',
    colPrice: 'Selling Price',
    colCost: 'Recipe Cost',
    colFc: 'Food Cost %',
    colUnitContrib: 'Unit Contrib.',
    colTotalContrib: 'Total Contrib.',
    colClass: 'Classification',
    incomplete: '⚠️ Incomplete',
    footerLeft: 'Generated with Pizzalog Tools · Restaurant Profit Kit v2',
    footerRight: 'Calculations audited by Pizzalog Cost Engine',
  },
};

export function ExecutiveReportModal({
  state,
  monthlySummary,
  totalMonthlyExpenses,
  netOperatingProfit,
  breakEvenRevenue,
  onClose,
}: ExecutiveReportModalProps) {
  const loc: LocaleCode = state.locale === 'pt-BR' || state.locale === 'en' ? state.locale : 'es-AR';
  const rText = REPORT_TEXT[loc];
  const currentDate = formatCalendarDate(todayLocalDateString(), loc);
  const fmt = (n: number, dec = 2) => formatLocaleNumber(n, loc, dec);

  const breakEvenUnits = monthlySummary.rows.length > 0 && monthlySummary.totalUnits > 0 && monthlySummary.totalContribution > 0
    ? Math.round(totalMonthlyExpenses / (monthlySummary.totalContribution / monthlySummary.totalUnits))
    : 0;

  const safetyMarginPct = breakEvenRevenue > 0 && monthlySummary.totalRevenue > 0
    ? ((monthlySummary.totalRevenue - breakEvenRevenue) / monthlySummary.totalRevenue) * 100
    : null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
      <div className="modal-panel" style={{ maxWidth: 960, background: '#ffffff', color: '#111827' }} onClick={(e) => e.stopPropagation()}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
          <div>
            <h3 id="report-modal-title" style={{ margin: 0, fontSize: '1.2rem' }}>{rText.modalTitle}</h3>
            <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>{rText.modalSub}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--primary" onClick={() => window.print()}>
              {rText.printBtn}
            </button>
            <button type="button" className="btn btn--secondary" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="printable-report" style={{ padding: '8px 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, borderBottom: '2px solid #111827', paddingBottom: 14, marginBottom: 20 }}>
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: '1.6rem', fontWeight: 800, color: '#111827' }}>
                {state.businessName || 'Mi Restaurante'}
              </h1>
              <div style={{ fontSize: '0.9rem', color: '#4b5563' }}>{rText.docSub}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.84rem', color: '#4b5563' }}>
              <div><strong>{rText.issuedLabel}</strong> {currentDate}</div>
              <div><strong>{rText.periodLabel}</strong> {state.salesPeriod || rText.periodDefault}</div>
              <div><strong>{rText.currencyLabel}</strong> {state.currency}</div>
            </div>
          </div>

          <div className="report-kpi-grid">
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>{rText.kpiRevenue}</span>
              <strong style={{ fontSize: '1.25rem', color: '#111827' }}>
                {state.currency} {fmt(monthlySummary.totalRevenue, 2)}
              </strong>
              <small style={{ display: 'block', color: '#6b7280', marginTop: 2 }}>{fmt(monthlySummary.totalUnits, 0)} {rText.kpiUnitsSold}</small>
            </div>

            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>{rText.kpiCogs}</span>
              <strong style={{ fontSize: '1.25rem', color: '#b91c1c' }}>
                {state.currency} {fmt(monthlySummary.totalCogs, 2)}
              </strong>
              <small style={{ display: 'block', color: '#6b7280', marginTop: 2 }}>
                Food Cost: {monthlySummary.totalRevenue > 0 ? fmt((monthlySummary.totalCogs / monthlySummary.totalRevenue) * 100, 1) : fmt(0, 1)}%
              </small>
            </div>

            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>{rText.kpiContribution}</span>
              <strong style={{ fontSize: '1.25rem', color: '#15803d' }}>
                {state.currency} {fmt(monthlySummary.totalContribution, 2)}
              </strong>
              <small style={{ display: 'block', color: '#6b7280', marginTop: 2 }}>
                {rText.kpiWeightedMargin} {fmt(monthlySummary.weightedMarginPct, 1)}%
              </small>
            </div>

            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>{rText.kpiNetProfit}</span>
              <strong style={{ fontSize: '1.25rem', color: (netOperatingProfit ?? 0) >= 0 ? '#15803d' : '#b91c1c' }}>
                {netOperatingProfit === null ? '—' : `${state.currency} ${fmt(netOperatingProfit, 2)}`}
              </strong>
              <small style={{ display: 'block', color: '#6b7280', marginTop: 2 }}>
                {rText.kpiFixedExpenses} {state.currency} {fmt(totalMonthlyExpenses, 0)}
              </small>
            </div>
          </div>

          <div style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, padding: '14px 18px', marginBottom: 24 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '0.96rem', color: '#1f2937' }}>{rText.breakEvenTitle}</h4>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.88rem' }}>
              <div>
                <strong>{rText.minRevenueLabel}</strong>{' '}
                <span>{state.currency} {fmt(breakEvenRevenue, 2)}</span>
              </div>
              {breakEvenUnits > 0 && (
                <div>
                  <strong>{rText.minUnitsLabel}</strong>{' '}
                  <span>{fmt(breakEvenUnits, 0)} {rText.unitsMonth}</span>
                </div>
              )}
              {safetyMarginPct !== null && (
                <div>
                  <strong>{rText.safetyMarginLabel}</strong>{' '}
                  <span style={{ color: safetyMarginPct >= 0 ? '#15803d' : '#b91c1c', fontWeight: 700 }}>
                    {safetyMarginPct >= 0 ? `+${fmt(safetyMarginPct, 1)}%` : `${fmt(safetyMarginPct, 1)}%`}
                    {safetyMarginPct >= 0 ? rText.profitZone : rText.deficitZone}
                  </span>
                </div>
              )}
            </div>
          </div>

          <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#111827' }}>{rText.tableTitle}</h4>
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #374151', background: '#f9fafb' }}>
                  <th style={{ padding: '8px 10px' }}>{rText.colProduct}</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>{rText.colUnits}</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>{rText.colPrice}</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>{rText.colCost}</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>{rText.colFc}</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>{rText.colUnitContrib}</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>{rText.colTotalContrib}</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>{rText.colClass}</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.rows.map((row) => {
                  const fcPct = row.evaluatedPrice > 0 ? (row.unitCost / row.evaluatedPrice) * 100 : null;
                  return (
                    <tr key={row.prod.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.prod.name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {row.units !== null ? fmt(row.units, 0) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {row.isComplete ? `${state.currency} ${fmt(row.evaluatedPrice, 2)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {row.isComplete ? `${state.currency} ${fmt(row.unitCost, 2)}` : rText.incomplete}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {fcPct !== null ? `${fmt(fcPct, 1)}%` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {row.isComplete ? `${state.currency} ${fmt(row.unitGrossProfit, 2)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                        {row.monthlyContribution !== null ? `${state.currency} ${fmt(row.monthlyContribution, 2)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {row.isComplete ? row.matrixLabel : rText.incomplete}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, fontSize: '0.78rem', color: '#9ca3af', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>{rText.footerLeft}</span>
            <span>{rText.footerRight}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
