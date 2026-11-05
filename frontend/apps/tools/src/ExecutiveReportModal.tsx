import React from 'react';
import { formatDecimal } from '@pizzalog/cost-engine';
import type { ToolsWorkspaceState } from './demoData';

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

export function ExecutiveReportModal({
  state,
  monthlySummary,
  totalMonthlyExpenses,
  netOperatingProfit,
  breakEvenRevenue,
  onClose,
}: ExecutiveReportModalProps) {
  const currentDate = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const breakEvenUnits = monthlySummary.rows.length > 0 && monthlySummary.totalUnits > 0
    ? Math.round(totalMonthlyExpenses / (monthlySummary.totalContribution / monthlySummary.totalUnits))
    : 0;

  const safetyMarginPct = breakEvenRevenue > 0 && monthlySummary.totalRevenue > 0
    ? ((monthlySummary.totalRevenue - breakEvenRevenue) / monthlySummary.totalRevenue) * 100
    : null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
      <div className="modal-panel" style={{ maxWidth: 960, background: '#ffffff', color: '#111827' }} onClick={(e) => e.stopPropagation()}>
        {/* Barra superior con controles (oculta al imprimir) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
          <div>
            <h3 id="report-modal-title" style={{ margin: 0, fontSize: '1.2rem' }}>Reporte Ejecutivo de Rentabilidad y Menú</h3>
            <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>Listo para imprimir o guardar como PDF</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.print()}
            >
              🖨️ Imprimir / Guardar PDF
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              aria-label="Cerrar reporte"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Contenido imprimible del Reporte */}
        <div className="printable-report" style={{ padding: '8px 4px' }}>
          {/* Cabecera del Documento */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111827', paddingBottom: 14, marginBottom: 20 }}>
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: '1.6rem', fontWeight: 800, color: '#111827' }}>
                {state.businessName || 'Mi Restaurante'}
              </h1>
              <div style={{ fontSize: '0.9rem', color: '#4b5563' }}>
                Informe Ejecutivo de Costos, Contribución y Punto de Equilibrio
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.84rem', color: '#4b5563' }}>
              <div><strong>Fecha de emisión:</strong> {currentDate}</div>
              <div><strong>Período evaluado:</strong> {state.salesPeriod || 'Período actual proyectado'}</div>
              <div><strong>Moneda:</strong> {state.currency}</div>
            </div>
          </div>

          {/* Cuadrícula de KPIs Principales */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Facturación Mensual</span>
              <strong style={{ fontSize: '1.25rem', color: '#111827' }}>
                {state.currency} {formatDecimal(monthlySummary.totalRevenue, 2)}
              </strong>
              <small style={{ display: 'block', color: '#6b7280', marginTop: 2 }}>{formatDecimal(monthlySummary.totalUnits, 0)} unidades vendidas</small>
            </div>

            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Costo de Mercadería (CMV)</span>
              <strong style={{ fontSize: '1.25rem', color: '#b91c1c' }}>
                {state.currency} {formatDecimal(monthlySummary.totalCogs, 2)}
              </strong>
              <small style={{ display: 'block', color: '#6b7280', marginTop: 2 }}>
                Food Cost: {monthlySummary.totalRevenue > 0 ? formatDecimal((monthlySummary.totalCogs / monthlySummary.totalRevenue) * 100, 1) : 0}%
              </small>
            </div>

            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Contribución Marginal</span>
              <strong style={{ fontSize: '1.25rem', color: '#15803d' }}>
                {state.currency} {formatDecimal(monthlySummary.totalContribution, 2)}
              </strong>
              <small style={{ display: 'block', color: '#6b7280', marginTop: 2 }}>
                Margen ponderado: {formatDecimal(monthlySummary.weightedMarginPct, 1)}%
              </small>
            </div>

            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Resultado Neto Estimado</span>
              <strong style={{ fontSize: '1.25rem', color: (netOperatingProfit ?? 0) >= 0 ? '#15803d' : '#b91c1c' }}>
                {netOperatingProfit === null ? '—' : `${state.currency} ${formatDecimal(netOperatingProfit, 2)}`}
              </strong>
              <small style={{ display: 'block', color: '#6b7280', marginTop: 2 }}>
                Gastos fijos: {state.currency} {formatDecimal(totalMonthlyExpenses, 0)}
              </small>
            </div>
          </div>

          {/* Bloque Punto de Equilibrio y Salud Financiera */}
          <div style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, padding: '14px 18px', marginBottom: 24 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '0.96rem', color: '#1f2937' }}>
              🎯 Punto de Equilibrio (Break-Even Point)
            </h4>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.88rem' }}>
              <div>
                <strong>Facturación Mínima Necesaria:</strong>{' '}
                <span>{state.currency} {formatDecimal(breakEvenRevenue, 2)} / mes</span>
              </div>
              {breakEvenUnits > 0 && (
                <div>
                  <strong>Unidades Mínimas:</strong>{' '}
                  <span>{formatDecimal(breakEvenUnits, 0)} unidades / mes</span>
                </div>
              )}
              {safetyMarginPct !== null && (
                <div>
                  <strong>Margen de Seguridad:</strong>{' '}
                  <span style={{ color: safetyMarginPct >= 0 ? '#15803d' : '#b91c1c', fontWeight: 700 }}>
                    {safetyMarginPct >= 0 ? `+${formatDecimal(safetyMarginPct, 1)}%` : `${formatDecimal(safetyMarginPct, 1)}%`}
                    {safetyMarginPct >= 0 ? ' (Zona de Ganancia)' : ' (Zona de Déficit)'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tabla de Productos y Rendimiento */}
          <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#111827' }}>
            Desglose de Productos e Ingeniería de Menú
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left', marginBottom: 24 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #374151', background: '#f9fafb' }}>
                <th style={{ padding: '8px 10px' }}>Producto</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unidades</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Precio Venta</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Costo Receta</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Food Cost %</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Contrib. Unitaria</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Contrib. Total</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Clasificación</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.rows.map((row) => {
                const fcPct = row.evaluatedPrice > 0 ? (row.unitCost / row.evaluatedPrice) * 100 : null;
                return (
                  <tr key={row.prod.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.prod.name}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {row.units !== null ? formatDecimal(row.units, 0) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {row.isComplete ? `${state.currency} ${formatDecimal(row.evaluatedPrice, 2)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {row.isComplete ? `${state.currency} ${formatDecimal(row.unitCost, 2)}` : 'Incompleto'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {fcPct !== null ? `${formatDecimal(fcPct, 1)}%` : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {row.isComplete ? `${state.currency} ${formatDecimal(row.unitGrossProfit, 2)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                      {row.monthlyContribution !== null ? `${state.currency} ${formatDecimal(row.monthlyContribution, 2)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {row.isComplete ? row.matrixLabel : '⚠️ Incompleto'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pie de página de auditoría */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, fontSize: '0.78rem', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
            <span>Generado con Pizzalog Tools · Restaurant Profit Kit</span>
            <span>Cálculos auditados con Pizzalog Cost Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
}
