import type { LocaleCode } from './demoData';

export interface ToolsDictionary {
  subtitle: string;
  tabIngredients: string;
  tabSubrecipes: string;
  tabRecipes: string;
  tabExpenses: string;
  tabSales: string;
  tabSnapshots: string;
  tabSimulator: string;
  tabCostHistory: string;
  tabMenuEngineering: string;
  tabProduction: string;
  tabProfitSimulator: string;
  tabSync: string;
  stepIngredients: string;
  stepSubrecipes: string;
  stepRecipes: string;
  stepExpenses: string;
  stepMenuEngineering: string;
  stepProfitSimulator: string;
  exportCustomExcel: string;
  downloadTemplateExcel: string;
  resetDemo: string;
  exportJson: string;
  importJson: string;
  saveSnapshot: string;
  statusComplete: string;
  statusIncomplete: string;
  logout: string;
  saveError: string;
  saving: string;
  autoSaved: string;
  analyzingSheet: string;
  importXlsxCsv: string;
  plansAndSubscription: string;
  executiveReport: string;
  contextualHelp: string;
  lessOptions: string;
  moreOptions: string;
  businessOrProject: string;
  languageLocale: string;
  currencyLabel: string;
  targetFoodCostLabel: string;
  priceRoundingLabel: string;
  packagingDeliveryLabel: string;
  appDeliveryFeeLabel: string;
  currencyLockedHint: string;
  guestBannerTitle: string;
  guestBannerDesc: string;
  guestBannerPlansBtn: string;
  guestBannerExitBtn: string;
  demoBannerTitle: string;
  demoBannerDesc: string;
  demoBannerClearBtn: string;
  // Profit Simulator
  simTitle: string;
  simLead: string;
  simGlobalModeBtn: string;
  simUnitModeBtn: string;
  simFixedBlockTitle: string;
  simFixedBlockDesc: string;
  simEditExpensesBtn: string;
  simMonthlyFixedKpi: string;
  simBreakEvenRevKpi: string;
  simBreakEvenUnitsKpi: string;
  simSafetyMarginKpi: string;
  simZoneProfit: string;
  simZoneLoss: string;
  simControlsTitle: string;
  simResetBtn: string;
  simPriceDeltaLabel: string;
  simCostDeltaLabel: string;
  simAffectedSuppliesLabel: string;
  simAffectedAll: string;
  simAffectedFlour: string;
  simAffectedDairy: string;
  simAffectedMeat: string;
  simAffectedVegetables: string;
  simAffectedHint: string;
  simVolumeDeltaLabel: string;
  simScenariosTitle: string;
  simPessimisticTitle: string;
  simPessimisticDesc: string;
  simBaseTitle: string;
  simBaseDesc: string;
  simOptimisticTitle: string;
  simOptimisticDesc: string;
  simMonthlyRevenue: string;
  simCogs: string;
  simVariableCosts: string;
  simContributionMargin: string;
  simFixedExpenses: string;
  simNetProfit: string;
  simProductBreakdownTitle: string;
  simColProduct: string;
  simColProjectedUnits: string;
  simColPriceTransition: string;
  simColCostTransition: string;
  simColAffectedShare: string;
  simColUnitMargin: string;
  simColTotalContribution: string;
  // Golden tests
  goldenTitle: string;
  goldenLead: string;
  goldenColId: string;
  goldenColDesc: string;
  goldenColCalculated: string;
  goldenColExpected: string;
  goldenColStatus: string;
}

export const TOOLS_I18N: Record<LocaleCode, ToolsDictionary> = {
  'es-AR': {
    subtitle: 'Restaurant Profit Kit v2 — Constructor de Recetas, Mermas, Ingeniería de Menú y Rentabilidad Neta',
    tabIngredients: '1. Insumos y Merma',
    tabSubrecipes: '2. Masas y Subrecetas',
    tabRecipes: '3. Recetas, Precios y Ventas/Mes',
    tabExpenses: '4. Alquiler, Costos Fijos y Ganancia Neta',
    tabSales: 'Ventas importadas',
    tabSnapshots: '5. Snapshots y Golden Tests',
    tabSimulator: 'Simulador de recetas',
    tabCostHistory: 'Evolución de costos',
    tabMenuEngineering: 'Ingeniería de menú',
    tabProduction: 'Calculadora de producción',
    tabProfitSimulator: 'Simulador de rentabilidad',
    tabSync: '🔄 Sync Pizzalog App',
    stepIngredients: '1️⃣ Insumos & Mermas',
    stepSubrecipes: '2️⃣ Masas & Subrecetas',
    stepRecipes: '3️⃣ Recetas de Carta',
    stepExpenses: '4️⃣ Gastos Operativos Fijos',
    stepMenuEngineering: '5️⃣ Ingeniería de Menú',
    stepProfitSimulator: '6️⃣ Simulador de Negocio',
    exportCustomExcel: '📊 Exportar Mi Excel v2 (.xlsx)',
    downloadTemplateExcel: '📘 Plantilla Base v2 (.xlsx)',
    resetDemo: 'Restaurar Demo',
    exportJson: 'Exportar JSON',
    importJson: 'Importar JSON',
    saveSnapshot: 'Guardar Snapshot',
    statusComplete: 'COMPLETO',
    statusIncomplete: 'INCOMPLETO (FALTA PRECIO)',
    logout: 'Cerrar sesión',
    saveError: 'Error de guardado',
    saving: 'Guardando…',
    autoSaved: 'Guardado automático',
    analyzingSheet: 'Analizando planilla…',
    importXlsxCsv: 'Importar XLSX / CSV',
    plansAndSubscription: '✨ Planes & Suscripción',
    executiveReport: '📄 Reporte Ejecutivo',
    contextualHelp: '❓ Ayuda Contextual',
    lessOptions: '✕ Menos',
    moreOptions: '➕ Más opciones',
    businessOrProject: 'Local / Proyecto',
    languageLocale: 'Idioma / Locale',
    currencyLabel: 'Moneda',
    targetFoodCostLabel: 'Food Cost Objetivo (%)',
    priceRoundingLabel: 'Redondeo Precio',
    packagingDeliveryLabel: 'Packaging Delivery',
    appDeliveryFeeLabel: 'Comisión App Delivery (%)',
    currencyLockedHint: 'Para evitar reinterpretar importes, la moneda se fija cuando hay precios, recetas o gastos.',
    guestBannerTitle: 'Estás probando la Demo Interactiva en vivo (Modo Invitado)',
    guestBannerDesc: 'Podés editar recetas, probar el simulador de rentabilidad y la matriz BCG. Los cambios se guardan localmente en tu navegador.',
    guestBannerPlansBtn: '✨ Ver Planes & Suscribirme',
    guestBannerExitBtn: 'Iniciar sesión / Salir',
    demoBannerTitle: 'Estás explorando los datos de ejemplo de «Pizzería Demo — Il Forno»',
    demoBannerDesc: 'Podés experimentar libremente con recetas, simulaciones y precios. Cuando quieras empezar con tu restaurante real, limpiá el catálogo con un clic.',
    demoBannerClearBtn: '🗑️ Limpiar datos para empezar',
    simTitle: 'Simulador Estratégico de Rentabilidad y Decisiones',
    simLead: 'Proyectá el impacto real de aumentos de insumos por categoría (desglosando los ingredientes y subrecetas reales de cada producto en el Cost Engine), variaciones de precios y volumen de ventas.',
    simGlobalModeBtn: '🏢 Simulación Global del Negocio',
    simUnitModeBtn: '🧮 Calculadora Unitaria',
    simFixedBlockTitle: 'Estructura de Costos Fijos y Punto de Equilibrio',
    simFixedBlockDesc: 'Alimentado automáticamente desde tus gastos operativos mensuales (Alquiler, Sueldos, Servicios, Software).',
    simEditExpensesBtn: '✏️ Editar gastos fijos',
    simMonthlyFixedKpi: 'Gastos Fijos Mensuales',
    simBreakEvenRevKpi: 'Facturación de Equilibrio (Break-Even)',
    simBreakEvenUnitsKpi: 'Unidades de Equilibrio',
    simSafetyMarginKpi: 'Margen de Seguridad',
    simZoneProfit: '🟢 Operando en Zona de Ganancia',
    simZoneLoss: '🔴 Operando por debajo del punto de equilibrio',
    simControlsTitle: '🎛️ Controles de Simulación en Vivo (Motor Cost Engine)',
    simResetBtn: 'Restablecer simulación a 0%',
    simPriceDeltaLabel: 'Variación de Precios de Venta',
    simCostDeltaLabel: 'Aumento de Costo de Insumos',
    simAffectedSuppliesLabel: 'Rubro de Insumos Afectado',
    simAffectedAll: 'Todos los insumos del restaurante',
    simAffectedFlour: 'Solo Harinas, Sémolas y Masas',
    simAffectedDairy: 'Solo Lácteos y Quesos (Mozzarella, etc.)',
    simAffectedMeat: 'Solo Carnes, Pollo y Fiambres',
    simAffectedVegetables: 'Solo Vegetales, Tomate y Aceites',
    simAffectedHint: 'Aplica el aumento únicamente a los insumos de este rubro y recalcula cada subreceta y receta según la proporción exacta que lleva cada plato.',
    simVolumeDeltaLabel: 'Variación de Volumen de Ventas',
    simScenariosTitle: '⚖️ Comparativa Estratégica de Escenarios (Pesimista · Base · Optimista)',
    simPessimisticTitle: '🔴 Escenario Pesimista',
    simPessimisticDesc: 'Caída de demanda (-15%) e inflación de costos (+12%) sin ajuste de precios.',
    simBaseTitle: '⚪ Escenario Base',
    simBaseDesc: 'Tu volumen de ventas, costos y precios actuales según tu catálogo.',
    simOptimisticTitle: '🟢 Escenario Optimista',
    simOptimisticDesc: 'Aumento moderado de precios (+5%) y expansión del volumen de ventas (+15%).',
    simMonthlyRevenue: 'Facturación mensual:',
    simCogs: 'Costo insumos (CMV):',
    simVariableCosts: 'Gastos variables (packaging/comisión):',
    simContributionMargin: 'Contribución marginal:',
    simFixedExpenses: 'Gastos fijos:',
    simNetProfit: 'Ganancia neta:',
    simProductBreakdownTitle: '📋 Impacto Proyectado por Producto (Desglose Real por Ingredientes)',
    simColProduct: 'Producto',
    simColProjectedUnits: 'Unidades proyectadas',
    simColPriceTransition: 'Precio actual → simulado',
    simColCostTransition: 'Costo actual → simulado',
    simColAffectedShare: 'Incidencia del rubro en el costo',
    simColUnitMargin: 'Margen bruto unitario',
    simColTotalContribution: 'Contribución mensual',
    goldenTitle: 'Verificación en Vivo — Batería de 8 Casos Golden',
    goldenLead: 'Los 8 casos Golden definidos en la especificación se ejecutan en tiempo real sobre el motor puro @pizzalog/cost-engine.',
    goldenColId: 'ID Caso',
    goldenColDesc: 'Descripción',
    goldenColCalculated: 'Valor Calculado en Vivo',
    goldenColExpected: 'Valor Golden Esperado',
    goldenColStatus: 'Estado Motor',
  },
  'pt-BR': {
    subtitle: 'Restaurant Profit Kit v2 — Construtor de Fichas Técnicas, Perdas, Engenharia de Cardápio e Lucro Líquido',
    tabIngredients: '1. Insumos e Perdas',
    tabSubrecipes: '2. Massas e Sub-receitas',
    tabRecipes: '3. Receitas, Preços e Vendas/Mês',
    tabExpenses: '4. Aluguel, Custos Fixos e Lucro Líquido',
    tabSales: 'Vendas importadas',
    tabSnapshots: '5. Snapshots e Golden Tests',
    tabSimulator: 'Simulador de receitas',
    tabCostHistory: 'Evolução de custos',
    tabMenuEngineering: 'Engenharia de cardápio',
    tabProduction: 'Calculadora de produção',
    tabProfitSimulator: 'Simulador de rentabilidade',
    tabSync: '🔄 Sync Pizzalog App',
    stepIngredients: '1️⃣ Insumos & Perdas',
    stepSubrecipes: '2️⃣ Massas & Sub-receitas',
    stepRecipes: '3️⃣ Fichas de Cardápio',
    stepExpenses: '4️⃣ Custos Operacionais Fixos',
    stepMenuEngineering: '5️⃣ Engenharia de Cardápio',
    stepProfitSimulator: '6️⃣ Simulador de Negócio',
    exportCustomExcel: '📊 Exportar Meu Excel v2 (.xlsx)',
    downloadTemplateExcel: '📘 Planilha Base v2 (.xlsx)',
    resetDemo: 'Restaurar Demo',
    exportJson: 'Exportar JSON',
    importJson: 'Importar JSON',
    saveSnapshot: 'Salvar Snapshot',
    statusComplete: 'COMPLETO',
    statusIncomplete: 'INCOMPLETO (SEM PREÇO)',
    logout: 'Sair',
    saveError: 'Erro ao salvar',
    saving: 'Salvando…',
    autoSaved: 'Salvo automaticamente',
    analyzingSheet: 'Analisando planilha…',
    importXlsxCsv: 'Importar XLSX / CSV',
    plansAndSubscription: '✨ Planos & Assinatura',
    executiveReport: '📄 Relatório Executivo',
    contextualHelp: '❓ Ajuda Contextual',
    lessOptions: '✕ Menos',
    moreOptions: '➕ Mais opções',
    businessOrProject: 'Restaurante / Projeto',
    languageLocale: 'Idioma / Locale',
    currencyLabel: 'Moeda',
    targetFoodCostLabel: 'CMV Alvo / Food Cost (%)',
    priceRoundingLabel: 'Arredondamento de Preço',
    packagingDeliveryLabel: 'Embalagem Delivery',
    appDeliveryFeeLabel: 'Taxa App Delivery (%)',
    currencyLockedHint: 'Para evitar reinterpretar valores, a moeda fica bloqueada quando há preços, receitas ou despesas.',
    guestBannerTitle: 'Você está testando a Demo Interativa ao vivo (Modo Convidado)',
    guestBannerDesc: 'Você pode editar receitas, testar o simulador de lucro e a matriz BCG. As alterações ficam salvas no seu navegador.',
    guestBannerPlansBtn: '✨ Ver Planos & Assinar',
    guestBannerExitBtn: 'Entrar / Sair',
    demoBannerTitle: 'Você está explorando os dados de exemplo da «Pizzaria Demo — Il Forno»',
    demoBannerDesc: 'Experimente livremente com fichas técnicas, simulações e preços. Quando quiser começar com seu restaurante real, limpe o catálogo com um clique.',
    demoBannerClearBtn: '🗑️ Limpar dados para começar',
    simTitle: 'Simulador Estratégico de Rentabilidade e Decisões',
    simLead: 'Projete o impacto real de aumentos de insumos por categoria (decompondo os ingredientes e sub-receitas reais de cada produto no Cost Engine), variações de preços e volume de vendas.',
    simGlobalModeBtn: '🏢 Simulação Global do Negócio',
    simUnitModeBtn: '🧮 Calculadora Unitária',
    simFixedBlockTitle: 'Estrutura de Custos Fixos e Ponto de Equilíbrio',
    simFixedBlockDesc: 'Alimentado automaticamente pelas suas despesas operacionais mensais (Aluguel, Salários, Serviços, Software).',
    simEditExpensesBtn: '✏️ Editar custos fixos',
    simMonthlyFixedKpi: 'Custos Fixos Mensais',
    simBreakEvenRevKpi: 'Faturamento de Equilíbrio (Break-Even)',
    simBreakEvenUnitsKpi: 'Unidades de Equilíbrio',
    simSafetyMarginKpi: 'Margem de Segurança',
    simZoneProfit: '🟢 Operando na Zona de Lucro',
    simZoneLoss: '🔴 Operando abaixo do ponto de equilíbrio',
    simControlsTitle: '🎛️ Controles de Simulação ao Vivo (Motor Cost Engine)',
    simResetBtn: 'Redefinir simulação para 0%',
    simPriceDeltaLabel: 'Variação nos Preços de Venda',
    simCostDeltaLabel: 'Aumento no Custo de Insumos',
    simAffectedSuppliesLabel: 'Categoria de Insumos Afetada',
    simAffectedAll: 'Todos os insumos do restaurante',
    simAffectedFlour: 'Apenas Farinhas, Sêmolas e Massas',
    simAffectedDairy: 'Apenas Laticínios e Queijos (Mussarela, etc.)',
    simAffectedMeat: 'Apenas Carnes, Frango e Embutidos',
    simAffectedVegetables: 'Apenas Vegetais, Tomate e Azeites',
    simAffectedHint: 'Aplica o aumento apenas aos insumos desta categoria e recalcula cada sub-receita e produto segundo a proporção exata da ficha técnica.',
    simVolumeDeltaLabel: 'Variação no Volume de Vendas',
    simScenariosTitle: '⚖️ Comparativo Estratégico de Cenários (Pessimista · Base · Otimista)',
    simPessimisticTitle: '🔴 Cenário Pessimista',
    simPessimisticDesc: 'Queda de demanda (-15%) e inflação de custos (+12%) sem reajuste de preços.',
    simBaseTitle: '⚪ Cenário Base',
    simBaseDesc: 'Seu volume de vendas, custos e preços atuais conforme o catálogo.',
    simOptimisticTitle: '🟢 Cenário Otimista',
    simOptimisticDesc: 'Aumento moderado de preços (+5%) e expansão do volume de vendas (+15%).',
    simMonthlyRevenue: 'Faturamento mensal:',
    simCogs: 'Custo de insumos (CMV):',
    simVariableCosts: 'Custos variáveis (embalagem/taxa):',
    simContributionMargin: 'Margem de contribuição:',
    simFixedExpenses: 'Custos fixos:',
    simNetProfit: 'Lucro líquido:',
    simProductBreakdownTitle: '📋 Impacto Projetado por Produto (Decomposição Real por Ingredientes)',
    simColProduct: 'Produto',
    simColProjectedUnits: 'Unidades projetadas',
    simColPriceTransition: 'Preço atual → simulado',
    simColCostTransition: 'Custo atual → simulado',
    simColAffectedShare: 'Peso da categoria no custo',
    simColUnitMargin: 'Margem bruta unitária',
    simColTotalContribution: 'Contribuição mensal',
    goldenTitle: 'Verificação ao Vivo — Bateria de 8 Casos Golden',
    goldenLead: 'Os 8 casos Golden definidos na especificação são executados em tempo real sobre o motor puro @pizzalog/cost-engine.',
    goldenColId: 'ID Caso',
    goldenColDesc: 'Descrição',
    goldenColCalculated: 'Valor Calculado ao Vivo',
    goldenColExpected: 'Valor Golden Esperado',
    goldenColStatus: 'Status do Motor',
  },
  en: {
    subtitle: 'Restaurant Profit Kit v2 — Interactive Recipe Builder, Yield, Menu Engineering & Net Profit',
    tabIngredients: '1. Ingredients & Yield',
    tabSubrecipes: '2. Dough & Subrecipes',
    tabRecipes: '3. Recipes, Pricing & Monthly Sales',
    tabExpenses: '4. Rent, Fixed Costs & Net Profit',
    tabSales: 'Imported Sales',
    tabSnapshots: '5. Snapshots & Golden Tests',
    tabSimulator: 'Recipe Simulator',
    tabCostHistory: 'Cost Evolution',
    tabMenuEngineering: 'Menu Engineering',
    tabProduction: 'Production Calculator',
    tabProfitSimulator: 'Profitability Simulator',
    tabSync: '🔄 Sync Pizzalog App',
    stepIngredients: '1️⃣ Ingredients & Yield',
    stepSubrecipes: '2️⃣ Dough & Subrecipes',
    stepRecipes: '3️⃣ Menu Recipes',
    stepExpenses: '4️⃣ Operating Expenses',
    stepMenuEngineering: '5️⃣ Menu Engineering',
    stepProfitSimulator: '6️⃣ Business Simulator',
    exportCustomExcel: '📊 Export My Excel v2 (.xlsx)',
    downloadTemplateExcel: '📘 Base Template v2 (.xlsx)',
    resetDemo: 'Reset Demo',
    exportJson: 'Export JSON',
    importJson: 'Import JSON',
    saveSnapshot: 'Save Snapshot',
    statusComplete: 'COMPLETE',
    statusIncomplete: 'INCOMPLETE (MISSING PRICE)',
    logout: 'Sign out',
    saveError: 'Save error',
    saving: 'Saving…',
    autoSaved: 'Auto-saved',
    analyzingSheet: 'Analyzing spreadsheet…',
    importXlsxCsv: 'Import XLSX / CSV',
    plansAndSubscription: '✨ Plans & Subscription',
    executiveReport: '📄 Executive Report',
    contextualHelp: '❓ Contextual Help',
    lessOptions: '✕ Less',
    moreOptions: '➕ More options',
    businessOrProject: 'Restaurant / Project',
    languageLocale: 'Language / Locale',
    currencyLabel: 'Currency',
    targetFoodCostLabel: 'Target Food Cost (%)',
    priceRoundingLabel: 'Price Rounding',
    packagingDeliveryLabel: 'Delivery Packaging',
    appDeliveryFeeLabel: 'Delivery App Fee (%)',
    currencyLockedHint: 'To prevent reinterpreting amounts, currency is locked while prices, recipes, or expenses exist.',
    guestBannerTitle: 'You are testing the Live Interactive Demo (Guest Mode)',
    guestBannerDesc: 'You can edit recipes, test the profitability simulator and the BCG matrix. Changes are saved locally in your browser.',
    guestBannerPlansBtn: '✨ View Plans & Subscribe',
    guestBannerExitBtn: 'Sign in / Exit',
    demoBannerTitle: 'You are exploring sample data for «Demo Pizzeria — Il Forno»',
    demoBannerDesc: 'Feel free to experiment with recipes, simulations, and prices. When ready to start with your real restaurant, clear the catalog with one click.',
    demoBannerClearBtn: '🗑️ Clear demo data to start',
    simTitle: 'Strategic Profitability & Decision Simulator',
    simLead: 'Project the real impact of ingredient cost increases by category (decomposing actual recipe and subrecipe ingredients via Cost Engine), price adjustments, and sales volume.',
    simGlobalModeBtn: '🏢 Global Business Simulation',
    simUnitModeBtn: '🧮 Single-Item Calculator',
    simFixedBlockTitle: 'Fixed Cost Structure & Break-Even Point',
    simFixedBlockDesc: 'Automatically fed from your monthly operating expenses (Rent, Payroll, Utilities, Software).',
    simEditExpensesBtn: '✏️ Edit fixed expenses',
    simMonthlyFixedKpi: 'Monthly Fixed Expenses',
    simBreakEvenRevKpi: 'Break-Even Revenue',
    simBreakEvenUnitsKpi: 'Break-Even Units',
    simSafetyMarginKpi: 'Safety Margin',
    simZoneProfit: '🟢 Operating in Profit Zone',
    simZoneLoss: '🔴 Operating below break-even point',
    simControlsTitle: '🎛️ Live Simulation Controls (Cost Engine Powered)',
    simResetBtn: 'Reset simulation to 0%',
    simPriceDeltaLabel: 'Selling Price Variation',
    simCostDeltaLabel: 'Ingredient Cost Increase',
    simAffectedSuppliesLabel: 'Affected Ingredient Category',
    simAffectedAll: 'All restaurant ingredients',
    simAffectedFlour: 'Flours, Semolina & Doughs only',
    simAffectedDairy: 'Dairy & Cheeses (Mozzarella, etc.) only',
    simAffectedMeat: 'Meats, Poultry & Charcuterie only',
    simAffectedVegetables: 'Produce, Tomatoes & Oils only',
    simAffectedHint: 'Applies the cost increase strictly to matching ingredients and recalculates every subrecipe and product according to its exact recipe composition.',
    simVolumeDeltaLabel: 'Sales Volume Variation',
    simScenariosTitle: '⚖️ Strategic Scenario Comparison (Pessimistic · Base · Optimistic)',
    simPessimisticTitle: '🔴 Pessimistic Scenario',
    simPessimisticDesc: 'Demand drop (-15%) and cost inflation (+12%) with no price adjustment.',
    simBaseTitle: '⚪ Base Scenario',
    simBaseDesc: 'Your current sales volume, costs, and prices from your catalog.',
    simOptimisticTitle: '🟢 Optimistic Scenario',
    simOptimisticDesc: 'Moderate price increase (+5%) and sales volume expansion (+15%).',
    simMonthlyRevenue: 'Monthly revenue:',
    simCogs: 'Ingredient cost (COGS):',
    simVariableCosts: 'Variable costs (packaging/fees):',
    simContributionMargin: 'Contribution margin:',
    simFixedExpenses: 'Fixed expenses:',
    simNetProfit: 'Net operating profit:',
    simProductBreakdownTitle: '📋 Projected Impact per Product (True Ingredient-Level Decomposition)',
    simColProduct: 'Product',
    simColProjectedUnits: 'Projected units',
    simColPriceTransition: 'Current → Simulated price',
    simColCostTransition: 'Current → Simulated cost',
    simColAffectedShare: 'Category share of cost',
    simColUnitMargin: 'Unit gross margin',
    simColTotalContribution: 'Monthly contribution',
    goldenTitle: 'Live Verification — 8 Golden Cases Battery',
    goldenLead: 'All 8 Golden Cases defined in the specification are evaluated in real time on the pure @pizzalog/cost-engine.',
    goldenColId: 'Case ID',
    goldenColDesc: 'Description',
    goldenColCalculated: 'Live Calculated Value',
    goldenColExpected: 'Expected Golden Value',
    goldenColStatus: 'Engine Status',
  },
};
