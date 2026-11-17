import { generateProfitKitV2WorkbookBytes } from '@pizzalog/cost-engine';
import { createInitialDemoWorkspace, type LocaleCode, type ToolsWorkspaceState } from './demoData';

export function downloadCustomProfitKitXlsx(state: ToolsWorkspaceState) {
  const bytes = generateProfitKitV2WorkbookBytes({
    businessName: state.businessName,
    currency: state.currency,
    locale: state.locale,
    unitSystem: state.unitSystem,
    defaultTargetFoodCostPct: state.defaultTargetFoodCostPct,
    defaultRoundingIncrement: state.defaultRoundingIncrement,
    defaultPackagingCost: state.defaultPackagingCost,
    defaultChannelFeePct: state.defaultChannelFeePct,
    catalog: state.catalog,
    productSalesMap: state.productSalesMap,
    salesHistory: state.salesHistory,
    operatingExpenses: state.operatingExpenses,
  });

  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (state.businessName || 'Mi_Restaurante')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 40);
  a.href = url;
  a.download = `Profit_Kit_v2_${safeName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTemplateProfitKitXlsx(locale: LocaleCode = 'es-AR') {
  const demo = createInitialDemoWorkspace();
  demo.locale = locale;
  const bytes = generateProfitKitV2WorkbookBytes({
    businessName: demo.businessName,
    currency: demo.currency,
    locale: demo.locale,
    unitSystem: demo.unitSystem,
    defaultTargetFoodCostPct: demo.defaultTargetFoodCostPct,
    defaultRoundingIncrement: demo.defaultRoundingIncrement,
    defaultPackagingCost: demo.defaultPackagingCost,
    defaultChannelFeePct: demo.defaultChannelFeePct,
    catalog: demo.catalog,
    productSalesMap: demo.productSalesMap,
    salesHistory: demo.salesHistory,
    operatingExpenses: demo.operatingExpenses,
  });

  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Restaurant_Profit_Kit_v2_${locale}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
