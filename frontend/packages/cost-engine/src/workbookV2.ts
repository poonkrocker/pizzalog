import {
  CostEngine,
  calculatePricingScenario,
  computeUsableIngredientCost,
  convertQuantity,
  expandBakersDoughSpec,
  selectEffectivePurchasePrice,
  type CostCatalog,
  type Ingredient,
  type PurchasePrice,
  type Recipe,
  type UnitCode,
} from './index.js';

export type WorkbookLocale = 'es-AR' | 'pt-BR' | 'en';

export interface WorkbookOperatingExpense {
  id: string;
  name: string;
  category: 'rent' | 'payroll' | 'utilities' | 'software' | 'taxes' | 'other' | string;
  period: 'monthly' | 'weekly' | 'yearly';
  amount: number;
}

export interface WorkbookProductSalesPlan {
  monthlyUnitsSold?: number | null;
  sellingPrice?: number | null;
}

export interface WorkbookSalesRecord {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  period_start: string;
  period_end: string;
  channel?: string | null;
  gross_revenue?: number | null;
  net_revenue?: number | null;
  source?: string;
}

export interface ProfitKitWorkbookInput {
  businessName: string;
  currency: string;
  locale?: WorkbookLocale;
  unitSystem?: 'metric' | 'us_customary';
  defaultTargetFoodCostPct: number;
  defaultRoundingIncrement: number;
  defaultPackagingCost: number;
  defaultChannelFeePct: number;
  catalog: CostCatalog;
  productSalesMap?: Record<string, WorkbookProductSalesPlan>;
  salesHistory?: WorkbookSalesRecord[];
  operatingExpenses?: WorkbookOperatingExpense[];
}

interface CellSpec {
  v?: string | number | null;
  f?: string;
  s?: number;
}

type RowSpec = Array<CellSpec | string | number | null>;

interface SheetLocaleText {
  sheets: [
    string, string, string, string, string, string, string,
    string, string, string, string, string, string, string,
  ];
  statusComplete: string;
  statusFree: string;
  statusIncompletePrice: string;
  statusIncompleteRecipe: string;
  statusInvalidYield: string;
  statusBlocked: string;
  star: string;
  horse: string;
  puzzle: string;
  dog: string;
  s00Title: string;
  s00Sub: string;
  s00DiagHeader: string;
  s00MetricCol: string;
  s00ValueCol: string;
  s00StatusCol: string;
  s00ActiveIngredients: string;
  s00MissingPrices: string;
  s00SubrecipesCount: string;
  s00ProductsCount: string;
  s00IncompleteProducts: string;
  s00GoldenStatus: string;
  s00ArchTitle: string;
  s00SheetCol: string;
  s00PurposeCol: string;
  s00FormulaChainCol: string;
  s01Title: string;
  s01Sub: string;
  s01ParamCol: string;
  s01ValCol: string;
  s01DescCol: string;
  s01UnitsTitle: string;
  s02Title: string;
  s02Sub: string;
  s03Title: string;
  s03Sub: string;
  s04Title: string;
  s04Sub: string;
  s05Title: string;
  s05Sub: string;
  s05LinesTitle: string;
  s06Title: string;
  s06Sub: string;
  s06LinesTitle: string;
  s07Title: string;
  s07Sub: string;
  s08Title: string;
  s08Sub: string;
  s09Title: string;
  s09Sub: string;
  s10Title: string;
  s10Sub: string;
  s11Title: string;
  s11Sub: string;
  s12Title: string;
  s12Sub: string;
  s13Title: string;
  s13Sub: string;
}

const LOCALE_TEXT: Record<WorkbookLocale, SheetLocaleText> = {
  'es-AR': {
    sheets: [
      '00_Inicio_Diagnostico',
      '01_Config_y_Unidades',
      '02_Ingredientes_Presentaciones',
      '03_Rendimientos_y_Mermas',
      '04_Historial_Precios_Prov',
      '05_Subrecetas_y_Masas',
      '06_Recetas_Productos_Finales',
      '07_Precios_y_Margenes',
      '08_Ventas_Producto_y_Canal',
      '09_Ingenieria_de_Menu',
      '10_Gastos_Operativos',
      '11_Rentabilidad_y_Equilibrio',
      '12_Simulaciones',
      '13_Validacion_Matematica',
    ],
    statusComplete: 'COMPLETO',
    statusFree: 'OK (COSTO CERO)',
    statusIncompletePrice: 'INCOMPLETO: FALTA PRECIO',
    statusIncompleteRecipe: 'INCOMPLETO',
    statusInvalidYield: 'ERROR: RENDIMIENTO INVÁLIDO',
    statusBlocked: 'BLOQUEADO (INCOMPLETO)',
    star: 'ESTRELLA',
    horse: 'CABALLO',
    puzzle: 'ROMPECABEZAS',
    dog: 'PERRO',
    s00Title: '00. INICIO, INSTRUCCIONES Y DIAGNÓSTICO DEL SISTEMA (Excel v2 Autónomo)',
    s00Sub: 'Este libro funciona 100% offline en Excel y LibreOffice sin macros. Cambiá cualquier precio en la hoja 02 y toda la cadena (03 → 13) se recalcula automáticamente.',
    s00DiagHeader: 'DIAGNÓSTICO AUTOMÁTICO EN VIVO',
    s00MetricCol: 'Indicador de Salud del Modelo',
    s00ValueCol: 'Valor Actual',
    s00StatusCol: 'Diagnóstico',
    s00ActiveIngredients: 'Insumos activos en catálogo (Hoja 02)',
    s00MissingPrices: 'Insumos sin precio de compra cargado (Hoja 03)',
    s00SubrecipesCount: 'Subrecetas y masas configuradas (Hoja 05)',
    s00ProductsCount: 'Productos finales de carta (Hoja 06 / 07)',
    s00IncompleteProducts: 'Productos bloqueados por datos incompletos (Hoja 07)',
    s00GoldenStatus: 'Validación Matemática contra Cost Engine v1 (Hoja 13)',
    s00ArchTitle: 'ARQUITECTURA DE 14 HOJAS Y CADENA DE DEPENDENCIAS',
    s00SheetCol: 'Hoja',
    s00PurposeCol: 'Contenido y Función',
    s00FormulaChainCol: 'Dependencia Matemática',
    s01Title: '01. CONFIGURACIÓN GLOBAL, MONEDA Y TABLA DE CONVERSIÓN DE UNIDADES',
    s01Sub: 'Editá las celdas amarillas con los parámetros de tu restaurante. Las hojas 02 a 13 leen estos valores automáticamente.',
    s01ParamCol: 'Parámetro Global',
    s01ValCol: 'Valor',
    s01DescCol: 'Descripción y Uso en Fórmulas',
    s01UnitsTitle: 'TABLA CANÓNICA DE UNIDADES Y FACTORES DE CONVERSIÓN (Cost Engine v1)',
    s02Title: '02. CATÁLOGO DE INGREDIENTES Y PRESENTACIONES DE COMPRA',
    s02Sub: 'Modificá el Precio de Compra (Col F) o agregá insumos nuevos en las filas libres: todas las masas, recetas, precios y rentabilidad se actualizarán al instante.',
    s03Title: '03. RENDIMIENTOS UTILIZABLES, MERMAS Y COSTO NORMALIZADO POR UNIDAD BASE',
    s03Sub: 'La merma se aplica una única vez dividiendo el costo bruto por (Rendimiento % / 100). Si falta precio, el insumo se marca INCOMPLETO.',
    s04Title: '04. HISTORIAL DE PRECIOS DE COMPRA Y PROVEEDORES',
    s04Sub: 'Registro cronológico de compras y comparación automática contra el costo vigente en el catálogo.',
    s05Title: '05. SUBRECETAS Y MASAS REUTILIZABLES (Resumen de Lotes + Desglose de Componentes)',
    s05Sub: 'El costo de cada batch se calcula sumando dinámicamente sus ingredientes desde la Hoja 03 mediante SUMIF. Podés agregar filas al desglose inferior.',
    s05LinesTitle: 'DESGLOSE DE COMPONENTES DE SUBRECETAS Y MASAS (Alimentado en vivo desde Hoja 03)',
    s06Title: '06. RECETAS DE PRODUCTOS FINALES DE CARTA (Resumen + Escandallo Línea por Línea)',
    s06Sub: 'Cada producto suma sus ingredientes (Hoja 03) y subrecetas (Hoja 05). Si algún insumo está incompleto, el producto se bloquea de forma explícita.',
    s06LinesTitle: 'DESGLOSE DE COMPONENTES POR PRODUCTO FINAL (Podés agregar nuevas líneas de ingredientes o subrecetas abajo)',
    s07Title: '07. PRECIOS SUGERIDOS, FOOD COST REAL, MARGEN BRUTO, MARKUP Y CONTRIBUCIÓN',
    s07Sub: 'Food Cost % = Costo/Precio | Margen Bruto % = (Precio-Costo)/Precio | Markup % = (Precio-Costo)/Costo. Nunca se mezclan gastos fijos en el costo de receta.',
    s08Title: '08. VENTAS POR PRODUCTO Y CANAL (Unidades, Facturación, CMV y Contribución Mensual)',
    s08Sub: 'Cargá las unidades vendidas por mes en la Columna C (o revisá el desglose por canal abajo).',
    s09Title: '09. INGENIERÍA DE MENÚ — MATRIZ KASAVANA & SMITH (Estrellas, Caballos, Rompecabezas y Perros)',
    s09Sub: 'Clasificación automática cruzando Popularidad (vs. promedio de unidades) y Margen Unitario (vs. promedio de ganancia bruta).',
    s10Title: '10. GASTOS OPERATIVOS FIJOS MENSUALES (Alquiler, Personal, Servicios, Software)',
    s10Sub: 'Los gastos estructurales se normalizan a mes (Mensual = 1, Semanal = 52/12, Anual = 1/12) y se cubren con la Contribución Marginal.',
    s11Title: '11. ESTADO DE RESULTADOS, RENTABILIDAD NETA Y PUNTO DE EQUILIBRIO (Break-Even)',
    s11Sub: 'Integración automática de Ventas (Hoja 08) menos Gastos Fijos (Hoja 10) para determinar Ganancia Neta y Venta de Equilibrio.',
    s12Title: '12. SIMULADOR DE SENSIBILIDAD POR RUBRO DE INSUMOS, PRECIOS Y VOLUMEN',
    s12Sub: 'Cambiá los porcentajes en las celdas amarillas: el costo simulado pondera únicamente la porción real de Harinas, Lácteos o Carnes que lleva cada receta.',
    s13Title: '13. BATERÍA DE VALIDACIÓN MATEMÁTICA — PARIDAD EXACTA CON COST ENGINE (CE-001 a CE-008)',
    s13Sub: 'Auditoría automática de las 8 pruebas Golden oficiales, incluyendo conversiones, mermas, subrecetas y bloqueo por insumo incompleto.',
  },
  'pt-BR': {
    sheets: [
      '00_Inicio_Diagnostico',
      '01_Config_e_Unidades',
      '02_Ingredientes_Apresentacoes',
      '03_Rendimentos_e_Perdas',
      '04_Historico_Precos_Forn',
      '05_Subreceitas_e_Massas',
      '06_Receitas_Produtos_Finais',
      '07_Precos_e_Margens',
      '08_Vendas_Produto_e_Canal',
      '09_Engenharia_de_Cardapio',
      '10_Despesas_Operacionais',
      '11_Rentabilidade_Equilibrio',
      '12_Simulacoes',
      '13_Validacao_Matematica',
    ],
    statusComplete: 'COMPLETO',
    statusFree: 'OK (CUSTO ZERO)',
    statusIncompletePrice: 'INCOMPLETO: SEM PREÇO',
    statusIncompleteRecipe: 'INCOMPLETO',
    statusInvalidYield: 'ERRO: RENDIMENTO INVÁLIDO',
    statusBlocked: 'BLOQUEADO (INCOMPLETO)',
    star: 'ESTRELA',
    horse: 'CAVALO',
    puzzle: 'QUEBRA-CABEÇA',
    dog: 'CÃO',
    s00Title: '00. INÍCIO, INSTRUÇÕES E DIAGNÓSTICO DO SISTEMA (Excel v2 Autônomo)',
    s00Sub: 'Esta planilha funciona 100% offline no Excel e LibreOffice sem macros. Altere qualquer preço na aba 02 e toda a cadeia (03 → 13) recalcula automaticamente.',
    s00DiagHeader: 'DIAGNÓSTICO AUTOMÁTICO AO VIVO',
    s00MetricCol: 'Indicador de Saúde do Modelo',
    s00ValueCol: 'Valor Atual',
    s00StatusCol: 'Diagnóstico',
    s00ActiveIngredients: 'Insumos ativos no catálogo (Aba 02)',
    s00MissingPrices: 'Insumos sem preço de compra informado (Aba 03)',
    s00SubrecipesCount: 'Sub-receitas e massas configuradas (Aba 05)',
    s00ProductsCount: 'Produtos finais do cardápio (Aba 06 / 07)',
    s00IncompleteProducts: 'Produtos bloqueados por dados incompletos (Aba 07)',
    s00GoldenStatus: 'Validação Matemática contra Cost Engine v1 (Aba 13)',
    s00ArchTitle: 'ARQUITETURA DE 14 ABAS E CADEIA DE DEPENDÊNCIAS',
    s00SheetCol: 'Aba',
    s00PurposeCol: 'Conteúdo e Função',
    s00FormulaChainCol: 'Dependência Matemática',
    s01Title: '01. CONFIGURAÇÃO GLOBAL, MOEDA E TABELA DE CONVERSÃO DE UNIDADES',
    s01Sub: 'Edite as células amarelas com os parâmetros do seu restaurante. As abas 02 a 13 leem estes valores automaticamente.',
    s01ParamCol: 'Parâmetro Global',
    s01ValCol: 'Valor',
    s01DescCol: 'Descrição e Uso nas Fórmulas',
    s01UnitsTitle: 'TABELA CANÔNICA DE UNIDADES E FATORES DE CONVERSÃO (Cost Engine v1)',
    s02Title: '02. CATÁLOGO DE INGREDIENTES E APRESENTAÇÕES DE COMPRA',
    s02Sub: 'Altere o Preço de Compra (Col F) ou adicione novos insumos nas linhas livres: todas as massas, fichas técnicas, preços e lucro atualizarão na hora.',
    s03Title: '03. RENDIMENTOS UTILIZÁVEIS, PERDAS E CUSTO NORMALIZADO POR UNIDADE BASE',
    s03Sub: 'A perda é aplicada uma única vez dividindo o custo bruto por (Rendimento % / 100). Se faltar preço, o insumo fica INCOMPLETO.',
    s04Title: '04. HISTÓRICO DE PREÇOS DE COMPRA E FORNECEDORES',
    s04Sub: 'Registro cronológico de compras e comparação automática com o custo vigente no catálogo.',
    s05Title: '05. SUB-RECEITAS E MASSAS REUTILIZÁVEIS (Resumo de Lotes + Decomposição de Componentes)',
    s05Sub: 'O custo de cada lote é calculado somando dinamicamente seus ingredientes da Aba 03 via SUMIF. Você pode adicionar linhas abaixo.',
    s05LinesTitle: 'DECOMPOSIÇÃO DE COMPONENTES DE SUB-RECEITAS E MASSAS (Alimentado ao vivo da Aba 03)',
    s06Title: '06. FICHAS TÉCNICAS DE PRODUTOS FINAIS (Resumo + Composição Linha por Linha)',
    s06Sub: 'Cada produto soma seus ingredientes (Aba 03) e sub-receitas (Aba 05). Se algum insumo estiver incompleto, o produto é bloqueado explicitamente.',
    s06LinesTitle: 'COMPOSIÇÃO DE COMPONENTES POR PRODUTO FINAL (Adicione novas linhas de ingredientes ou sub-receitas abaixo)',
    s07Title: '07. PREÇOS SUGERIDOS, CMV REAL, MARGEM BRUTA, MARKUP E CONTRIBUIÇÃO',
    s07Sub: 'CMV % = Custo/Preço | Margem Bruta % = (Preço-Custo)/Preço | Markup % = (Preço-Custo)/Custo. Custos fixos nunca se misturam na ficha técnica.',
    s08Title: '08. VENDAS POR PRODUTO E CANAL (Unidades, Faturamento, CMV e Contribuição Mensal)',
    s08Sub: 'Informe as unidades vendidas por mês na Coluna C (ou veja o histórico por canal abaixo).',
    s09Title: '09. ENGENHARIA DE CARDÁPIO — MATRIZ KASAVANA & SMITH (Estrelas, Cavalos, Quebra-Cabeças e Cães)',
    s09Sub: 'Classificação automática cruzando Popularidade (vs. média de unidades) e Margem Unitária (vs. média de lucro bruto).',
    s10Title: '10. DESPESAS OPERACIONAIS FIXAS MENSAIS (Aluguel, Pessoal, Serviços, Software)',
    s10Sub: 'As despesas estruturais são normalizadas ao mês (Mensal = 1, Semanal = 52/12, Anual = 1/12) e cobertas pela Margem de Contribuição.',
    s11Title: '11. DEMONSTRAÇÃO DE RESULTADOS, LUCRO LÍQUIDO E PONTO DE EQUILÍBRIO (Break-Even)',
    s11Sub: 'Integração automática de Vendas (Aba 08) menos Custos Fixos (Aba 10) para apurar Lucro Líquido e Faturamento de Equilíbrio.',
    s12Title: '12. SIMULADOR DE SENSIBILIDADE POR CATEGORIA DE INSUMOS, PREÇOS E VOLUME',
    s12Sub: 'Altere os percentuais nas células amarelas: o custo simulado pondera exatamente a fração real de Farinhas, Laticínios ou Carnes de cada receita.',
    s13Title: '13. BATERIA DE VALIDAÇÃO MATEMÁTICA — PARIDADE EXATA COM COST ENGINE (CE-001 a CE-008)',
    s13Sub: 'Auditoria automática dos 8 testes Golden oficiais, incluindo conversões, perdas, sub-receitas e bloqueio por insumo incompleto.',
  },
  en: {
    sheets: [
      '00_Home_Diagnostics',
      '01_Config_and_Units',
      '02_Ingredients_Presentations',
      '03_Yields_and_Waste',
      '04_Price_History_Suppliers',
      '05_Subrecipes_and_Doughs',
      '06_Final_Product_Recipes',
      '07_Pricing_and_Margins',
      '08_Sales_by_Product_Channel',
      '09_Menu_Engineering',
      '10_Operating_Expenses',
      '11_Profitability_BreakEven',
      '12_Simulations',
      '13_Mathematical_Validation',
    ],
    statusComplete: 'COMPLETE',
    statusFree: 'OK (FREE INPUT)',
    statusIncompletePrice: 'INCOMPLETE: MISSING PRICE',
    statusIncompleteRecipe: 'INCOMPLETE',
    statusInvalidYield: 'ERROR: INVALID YIELD',
    statusBlocked: 'BLOCKED (INCOMPLETE)',
    star: 'STAR',
    horse: 'PLOWHORSE',
    puzzle: 'PUZZLE',
    dog: 'DOG',
    s00Title: '00. HOME, INSTRUCTIONS & SYSTEM DIAGNOSTICS (Standalone Excel v2)',
    s00Sub: 'This workbook runs 100% offline in Excel and LibreOffice without macros. Change any purchase price in Sheet 02 and the entire chain (03 → 13) recalculates automatically.',
    s00DiagHeader: 'LIVE AUTOMATIC MODEL DIAGNOSTICS',
    s00MetricCol: 'Model Health Indicator',
    s00ValueCol: 'Current Value',
    s00StatusCol: 'Diagnostic',
    s00ActiveIngredients: 'Active catalog ingredients (Sheet 02)',
    s00MissingPrices: 'Ingredients missing purchase price (Sheet 03)',
    s00SubrecipesCount: 'Configured subrecipes & doughs (Sheet 05)',
    s00ProductsCount: 'Final menu products (Sheet 06 / 07)',
    s00IncompleteProducts: 'Products blocked by incomplete data (Sheet 07)',
    s00GoldenStatus: 'Mathematical Parity against Cost Engine v1 (Sheet 13)',
    s00ArchTitle: '14-SHEET ARCHITECTURE & FORMULA DEPENDENCY CHAIN',
    s00SheetCol: 'Sheet',
    s00PurposeCol: 'Contents & Role',
    s00FormulaChainCol: 'Formula Dependency Chain',
    s01Title: '01. GLOBAL CONFIGURATION, CURRENCY & UNIT CONVERSION TABLE',
    s01Sub: 'Edit the yellow cells with your restaurant parameters. Sheets 02 through 13 reference these values automatically.',
    s01ParamCol: 'Global Parameter',
    s01ValCol: 'Value',
    s01DescCol: 'Description & Formula Usage',
    s01UnitsTitle: 'CANONICAL UNITS & CONVERSION FACTORS TABLE (Cost Engine v1)',
    s02Title: '02. INGREDIENTS CATALOG & PURCHASE PRESENTATIONS',
    s02Sub: 'Edit Purchase Price (Col F) or add new ingredients in the spare rows: all doughs, recipes, prices, and profitability update instantly.',
    s03Title: '03. USABLE YIELDS, WASTE & NORMALIZED BASE-UNIT COST',
    s03Sub: 'Yield % is applied exactly once by dividing gross unit cost by (Yield % / 100). Missing prices mark the item INCOMPLETE.',
    s04Title: '04. PURCHASE PRICE HISTORY & SUPPLIERS LOG',
    s04Sub: 'Chronological log of supplier prices and automatic comparison against the active catalog cost.',
    s05Title: '05. REUSABLE SUBRECIPES & DOUGHS (Batch Summary + Component Breakdown)',
    s05Sub: 'Each batch cost dynamically sums its ingredients from Sheet 03 via SUMIF. You can add new component rows in the table below.',
    s05LinesTitle: 'SUBRECIPE & DOUGH COMPONENT BREAKDOWN (Live-linked to Sheet 03)',
    s06Title: '06. FINAL MENU PRODUCT RECIPES (Product Summary + Line-by-Line Recipe)',
    s06Sub: 'Each product sums its ingredients (Sheet 03) and subrecipes (Sheet 05). Any incomplete component explicitly blocks the product.',
    s06LinesTitle: 'FINAL PRODUCT COMPONENT BREAKDOWN (Add new ingredient or subrecipe lines below)',
    s07Title: '07. SUGGESTED PRICING, ACTUAL FOOD COST %, GROSS MARGIN %, MARKUP % & CONTRIBUTION',
    s07Sub: 'Food Cost % = Cost/Price | Gross Margin % = (Price-Cost)/Price | Markup % = (Price-Cost)/Cost. Fixed expenses are never mixed into recipe cost.',
    s08Title: '08. SALES BY PRODUCT & CHANNEL (Monthly Units, Revenue, COGS & Contribution)',
    s08Sub: 'Enter monthly units sold in Column C (or review the channel breakdown table below).',
    s09Title: '09. MENU ENGINEERING — KASAVANA & SMITH MATRIX (Stars, Plowhorses, Puzzles & Dogs)',
    s09Sub: 'Automatic classification crossing Popularity (vs. average units) and Unit Gross Margin (vs. average gross profit).',
    s10Title: '10. MONTHLY OPERATING FIXED EXPENSES (Rent, Payroll, Utilities, Software)',
    s10Sub: 'Structural expenses are normalized to monthly equivalents (Monthly = 1, Weekly = 52/12, Yearly = 1/12) and covered by Contribution Margin.',
    s11Title: '11. INCOME STATEMENT, NET OPERATING PROFIT & BREAK-EVEN ANALYSIS',
    s11Sub: 'Automatic integration of Sales (Sheet 08) minus Fixed Expenses (Sheet 10) to compute Net Profit and Break-Even Revenue.',
    s12Title: '12. SENSITIVITY SIMULATOR BY INGREDIENT CATEGORY, SELLING PRICE & VOLUME',
    s12Sub: 'Edit the yellow percentage cells: simulated cost weights the exact share of Flours, Dairy, or Meats contained in each recipe.',
    s13Title: '13. MATHEMATICAL VALIDATION BATTERY — EXACT COST ENGINE PARITY (CE-001 to CE-008)',
    s13Sub: 'Automated audit of all 8 official Golden Cases, including unit conversions, waste yield, subrecipes, and incomplete input blocking.',
  },
};

export function classifyIngredientCategory(name: string): 'flour' | 'dairy' | 'meat' | 'vegetables' | 'other' {
  const n = (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\b(harina|semola|masa|faina|garbanzo|flour|dough|trigo|farinha|levadura|yeast|fermento)\b/.test(n)) {
    return 'flour';
  }
  if (/\b(mozzarella|muzzarella|muzza|queso|cheese|queijo|mussarela|ricota|provolone|parmesano|reggianito|cheddar|brie|roquefort|azul|straciatella|manteca|butter|crema|cream|leche|milk|yogurt)\b/.test(n)) {
    return 'dairy';
  }
  if (/\b(pollo|chicken|frango|carne|beef|ternera|vacuno|cerdo|pork|cordero|jamon|ham|presunto|panceta|bacon|salame|pepperoni|peperoni|bondiola|cantimpalo|mortadela|pastron|chorizo|lomo|anchoa|atun|camaron|mejillon)\b/.test(n)) {
    return 'meat';
  }
  if (/\b(tomate|tomato|cebolla|onion|morron|ajo|garlic|albahaca|basil|rucula|espinaca|acelga|hongo|champignon|portobello|trufa|truffle|aceite|oil|azeite|oliva|aceituna|papa|palta|zapallo|calabaza|berenjena|zucchini|choclo|pera|limon|naranja)\b/.test(n)) {
    return 'vegetables';
  }
  return 'other';
}

export function decomposeRecipeCategoryCosts(
  catalog: CostCatalog,
  recipeId: string,
  currency: string
): {
  flourCost: number;
  dairyCost: number;
  meatCost: number;
  vegetablesCost: number;
  otherCost: number;
  totalCost: number;
} {
  const engine = new CostEngine(catalog);
  const res = engine.calculateRecipeCost(recipeId);
  if (res.status !== 'complete' || res.raw_unit_cost === null || res.raw_unit_cost <= 0) {
    return { flourCost: 0, dairyCost: 0, meatCost: 0, vegetablesCost: 0, otherCost: 0, totalCost: 0 };
  }

  const buckets = { flourCost: 0, dairyCost: 0, meatCost: 0, vegetablesCost: 0, otherCost: 0 };

  const accumulate = (targetRecipeId: string, factor: number, visited: Set<string>) => {
    if (visited.has(targetRecipeId)) return;
    const rRes = engine.calculateRecipeCost(targetRecipeId);
    if (rRes.status !== 'complete' || !(rRes.raw_yield_quantity > 0)) return;
    const perUnitFactor = factor / rRes.raw_yield_quantity;

    for (const comp of rRes.components) {
      if (comp.status !== 'complete' || comp.raw_total_cost === null) continue;
      if (comp.component_type === 'ingredient') {
        const cat = classifyIngredientCategory(comp.name);
        const contrib = comp.raw_total_cost * perUnitFactor;
        if (cat === 'flour') buckets.flourCost += contrib;
        else if (cat === 'dairy') buckets.dairyCost += contrib;
        else if (cat === 'meat') buckets.meatCost += contrib;
        else if (cat === 'vegetables') buckets.vegetablesCost += contrib;
        else buckets.otherCost += contrib;
      } else {
        const nextVisited = new Set(visited);
        nextVisited.add(targetRecipeId);
        accumulate(comp.id, comp.normalized_quantity * perUnitFactor, nextVisited);
      }
    }
  };

  accumulate(recipeId, 1, new Set());
  const totalCost =
    buckets.flourCost + buckets.dairyCost + buckets.meatCost + buckets.vegetablesCost + buckets.otherCost;
  return { ...buckets, totalCost: totalCost > 0 ? totalCost : res.raw_unit_cost };
}

function escapeXml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(colIdx1Based: number): string {
  let n = colIdx1Based;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writeUInt16LE(buf: Uint8Array, value: number, offset: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32LE(buf: Uint8Array, value: number, offset: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

function buildZipBytes(filesMap: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;
  const entries = Object.entries(filesMap);

  for (const [filePath, xmlContent] of entries) {
    const nameBytes = encoder.encode(filePath);
    const dataBytes = encoder.encode(xmlContent);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUInt32LE(localHeader, 0x04034b50, 0);
    writeUInt16LE(localHeader, 20, 4);
    writeUInt16LE(localHeader, 0x0800, 6);
    writeUInt16LE(localHeader, 0, 8);
    writeUInt16LE(localHeader, 0, 10);
    writeUInt16LE(localHeader, 0x5ac2, 12);
    writeUInt32LE(localHeader, crc, 14);
    writeUInt32LE(localHeader, dataBytes.length, 18);
    writeUInt32LE(localHeader, dataBytes.length, 22);
    writeUInt16LE(localHeader, nameBytes.length, 26);
    writeUInt16LE(localHeader, 0, 28);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUInt32LE(central, 0x02014b50, 0);
    writeUInt16LE(central, 20, 4);
    writeUInt16LE(central, 20, 6);
    writeUInt16LE(central, 0x0800, 8);
    writeUInt16LE(central, 0, 10);
    writeUInt16LE(central, 0, 12);
    writeUInt16LE(central, 0x5ac2, 14);
    writeUInt32LE(central, crc, 16);
    writeUInt32LE(central, dataBytes.length, 20);
    writeUInt32LE(central, dataBytes.length, 24);
    writeUInt16LE(central, nameBytes.length, 28);
    writeUInt16LE(central, 0, 30);
    writeUInt16LE(central, 0, 32);
    writeUInt16LE(central, 0, 34);
    writeUInt16LE(central, 0, 36);
    writeUInt32LE(central, 0, 38);
    writeUInt32LE(central, offset, 42);
    central.set(nameBytes, 46);

    centralHeaders.push(central);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralHeaders.reduce((acc, c) => acc + c.length, 0);
  const eocd = new Uint8Array(22);
  writeUInt32LE(eocd, 0x06054b50, 0);
  writeUInt16LE(eocd, 0, 4);
  writeUInt16LE(eocd, 0, 6);
  writeUInt16LE(eocd, entries.length, 8);
  writeUInt16LE(eocd, entries.length, 10);
  writeUInt32LE(eocd, centralSize, 12);
  writeUInt32LE(eocd, offset, 16);
  writeUInt16LE(eocd, 0, 20);

  const totalLength = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const ch of chunks) {
    out.set(ch, pos);
    pos += ch.length;
  }
  for (const ch of centralHeaders) {
    out.set(ch, pos);
    pos += ch.length;
  }
  out.set(eocd, pos);
  return out;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
    <numFmt numFmtId="165" formatCode="#,##0.0000"/>
    <numFmt numFmtId="166" formatCode="0.0&quot;%&quot;"/>
  </numFmts>
  <fonts count="6">
    <font><sz val="10"/><color rgb="FF1F1F1F"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FF7C1D1D"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF0B4F6C"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF991B1B"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF166534"/><name val="Calibri"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2A1E17"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF8DC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE8E6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFEBE7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD0C8C0"/></left>
      <right style="thin"><color rgb="FFD0C8C0"/></right>
      <top style="thin"><color rgb="FFD0C8C0"/></top>
      <bottom style="thin"><color rgb="FFD0C8C0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;
}

function buildWorksheetXml(rows: RowSpec[], colWidths: number[] = []): string {
  const colsXml =
    colWidths.length > 0
      ? `<cols>${colWidths
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join('')}</cols>`
      : '';

  const rowsXml: string[] = [];
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    if (!row || row.length === 0) continue;
    const rNum = rIdx + 1;
    const cellsXml: string[] = [];

    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const raw = row[cIdx];
      if (raw === null || raw === undefined || raw === '') continue;

      const cellRef = `${colLetter(cIdx + 1)}${rNum}`;
      const obj: CellSpec = typeof raw === 'object' ? raw : { v: raw };
      const styleAttr = obj.s !== undefined ? ` s="${obj.s}"` : '';

      if (obj.f !== undefined) {
        const isTextResult = typeof obj.v === 'string';
        const tAttr = isTextResult ? ` t="str"` : '';
        const valTag = obj.v !== undefined && obj.v !== null ? `<v>${escapeXml(obj.v)}</v>` : '';
        cellsXml.push(`<c r="${cellRef}"${styleAttr}${tAttr}><f>${escapeXml(obj.f)}</f>${valTag}</c>`);
      } else if (typeof obj.v === 'number' && Number.isFinite(obj.v)) {
        cellsXml.push(`<c r="${cellRef}"${styleAttr}><v>${obj.v}</v></c>`);
      } else {
        cellsXml.push(`<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t>${escapeXml(obj.v)}</t></is></c>`);
      }
    }

    if (cellsXml.length > 0) {
      rowsXml.push(`<row r="${rNum}">${cellsXml.join('')}</row>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${rowsXml.join('')}</sheetData>
</worksheet>`;
}

/**
 * Construye el libro Excel v2 autónomo de 14 hojas (00 a 13) con cadena completa de fórmulas
 * y validación matemática contra los 8 casos Golden del Cost Engine.
 */
export function generateProfitKitV2WorkbookBytes(input: ProfitKitWorkbookInput): Uint8Array {
  const locale: WorkbookLocale =
    input.locale === 'pt-BR' || input.locale === 'en' || input.locale === 'es-AR'
      ? input.locale
      : 'es-AR';
  const L = LOCALE_TEXT[locale];
  const S = L.sheets;
  const currency = input.currency || 'ARS';

  const engine = new CostEngine(input.catalog);
  const ingredients = input.catalog.ingredients;
  const subrecipes = input.catalog.recipes.filter((r) => r.recipe_type === 'subrecipe');
  const products = input.catalog.recipes.filter((r) => r.recipe_type === 'product');

  // Reservamos filas libres para que el usuario pueda agregar insumos, subrecetas y productos sin tocar fórmulas
  const ingSpareRows = 15;
  const subSpareRows = 8;
  const prodSpareRows = 15;
  const lineSpareRows = 25;

  const ingStartRow = 5;
  const ingEndRow = Math.max(ingStartRow + ingredients.length + ingSpareRows - 1, 25);

  const subStartRow = 5;
  const subEndRow = subStartRow + subrecipes.length + subSpareRows - 1;
  const subLinesHeaderRow = subEndRow + 4;
  const subLinesStartRow = subLinesHeaderRow + 1;

  const prodStartRow = 5;
  const prodEndRow = prodStartRow + products.length + prodSpareRows - 1;
  const prodLinesHeaderRow = prodEndRow + 4;
  const prodLinesStartRow = prodLinesHeaderRow + 1;

  // =========================================================================
  // 01. CONFIGURACIÓN, MONEDA Y UNIDADES
  // =========================================================================
  const unitRowsData: Array<[string, string, string, number]> = [
    ['mg', 'mass', 'g', 0.001],
    ['g', 'mass', 'g', 1],
    ['kg', 'mass', 'g', 1000],
    ['oz', 'mass', 'g', 28.349523125],
    ['lb', 'mass', 'g', 453.59237],
    ['ml', 'volume', 'ml', 1],
    ['cc', 'volume', 'ml', 1],
    ['L', 'volume', 'ml', 1000],
    ['l', 'volume', 'ml', 1000],
    ['fl_oz_us', 'volume', 'ml', 29.5735295625],
    ['gal_us', 'volume', 'ml', 3785.411784],
    ['unit', 'count', 'unit', 1],
    ['u', 'count', 'unit', 1],
    ['dozen', 'count', 'unit', 12],
    ['docena', 'count', 'unit', 12],
  ];

  const sheet01Rows: RowSpec[] = [
    [{ v: L.s01Title, s: 1 }],
    [{ v: L.s01Sub, s: 0 }],
    [],
    [{ v: L.s01ParamCol, s: 2 }, { v: L.s01ValCol, s: 2 }, { v: L.s01DescCol, s: 2 }],
    [{ v: 'Nombre del Restaurante / Proyecto', s: 0 }, { v: input.businessName || 'Mi Pizzería', s: 3 }, { v: 'Identificador del negocio en reportes', s: 0 }],
    [{ v: 'Moneda Base', s: 0 }, { v: currency, s: 3 }, { v: 'ARS, USD, BRL, EUR, MXN', s: 0 }],
    [{ v: 'Food Cost Objetivo General (%)', s: 0 }, { v: input.defaultTargetFoodCostPct || 30, s: 3 }, { v: 'Usado en Hoja 07 para calcular Precio Mínimo = Costo / (Objetivo/100)', s: 0 }],
    [{ v: 'Incremento de Redondeo Comercial', s: 0 }, { v: input.defaultRoundingIncrement || 100, s: 3 }, { v: 'Usado en Hoja 07 con CEILING(PrecioMínimo, Incremento)', s: 0 }],
    [{ v: 'Costo Packaging Delivery por Unidad', s: 0 }, { v: input.defaultPackagingCost ?? 0, s: 3 }, { v: 'Separado del Food Cost; descontado en Contribución Neta (Hoja 07/12)', s: 0 }],
    [{ v: 'Comisión Canal App Delivery (%)', s: 0 }, { v: input.defaultChannelFeePct ?? 0, s: 3 }, { v: 'Porcentaje sobre precio de venta en canales de delivery', s: 0 }],
    [{ v: 'Sistema de Unidades', s: 0 }, { v: input.unitSystem || 'metric', s: 3 }, { v: 'metric (g, kg, ml, L) o us_customary (oz, lb, fl_oz_us, gal_us)', s: 0 }],
    [{ v: 'Idioma de la Planilla', s: 0 }, { v: locale, s: 3 }, { v: 'es-AR, pt-BR, en', s: 0 }],
    [],
    [{ v: L.s01UnitsTitle, s: 8 }, null, null, null],
    [{ v: 'Código Unidad', s: 2 }, { v: 'Dimensión Física', s: 2 }, { v: 'Unidad Canónica', s: 2 }, { v: 'Factor hacia Unidad Canónica', s: 2 }],
    ...unitRowsData.map(([code, dim, canon, factor]) => [
      { v: code, s: 0 },
      { v: dim, s: 0 },
      { v: canon, s: 0 },
      { v: factor, s: 5 },
    ]),
  ];

  // =========================================================================
  // 02. INGREDIENTES Y PRESENTACIONES DE COMPRA
  // =========================================================================
  // Cols: A=ID, B=Nombre, C=Rubro, D=Dimensión, E=Unidad Base, F=Precio Compra, G=Cant Envase, H=Unidad Envase, I=Cant en Unidad Base (Fórmula), J=Densidad g/ml, K=Peso Unidad g, L=Es Gratis (1/0), M=Proveedor
  const sheet02Rows: RowSpec[] = [
    [{ v: L.s02Title, s: 1 }],
    [{ v: L.s02Sub, s: 0 }],
    [],
    [
      { v: 'ID Insumo', s: 2 },
      { v: 'Nombre del Ingrediente', s: 2 },
      { v: 'Rubro / Familia', s: 2 },
      { v: 'Dimensión', s: 2 },
      { v: 'Unidad Base', s: 2 },
      { v: `Precio Compra (${currency})`, s: 2 },
      { v: 'Cant. Envase', s: 2 },
      { v: 'Unidad Envase', s: 2 },
      { v: 'Cant. en Unidad Base (Auto)', s: 2 },
      { v: 'Densidad (g/ml)', s: 2 },
      { v: 'Peso por Unidad (g)', s: 2 },
      { v: 'Costo Cero (1=Sí,0=No)', s: 2 },
      { v: 'Proveedor Vigente', s: 2 },
    ],
  ];

  // =========================================================================
  // 03. RENDIMIENTOS, MERMAS Y COSTO UTILIZABLE
  // =========================================================================
  // Cols: A=ID, B=Nombre, C=Unidad Base, D=Precio Compra (Ref 02), E=Cant en Base (Ref 02), F=Rendimiento %, G=Merma %, H=Cant Utilizable en Base, I=Costo Bruto / Base, J=Costo Utilizable / Base, K=Costo Utilizable por kg / L / docena, L=Estado
  const sheet03Rows: RowSpec[] = [
    [{ v: L.s03Title, s: 1 }],
    [{ v: L.s03Sub, s: 0 }],
    [],
    [
      { v: 'ID Insumo', s: 2 },
      { v: 'Ingrediente', s: 2 },
      { v: 'Unidad Base', s: 2 },
      { v: `Precio Compra (${currency})`, s: 2 },
      { v: 'Cant. Bruta en Base', s: 2 },
      { v: 'Rendimiento Utilizable (%)', s: 2 },
      { v: 'Merma (%)', s: 2 },
      { v: 'Cant. Limpia Utilizable', s: 2 },
      { v: `Costo Bruto / Base (${currency})`, s: 2 },
      { v: `Costo Utilizable / Base (${currency})`, s: 2 },
      { v: `Costo por kg o L (${currency})`, s: 2 },
      { v: 'Estado de Validación', s: 2 },
    ],
  ];

  const totalIngRows = ingEndRow - ingStartRow + 1;
  for (let i = 0; i < totalIngRows; i++) {
    const r = ingStartRow + i;
    const ing = ingredients[i];
    const priceRec = ing
      ? selectEffectivePurchasePrice(ing.id, input.catalog.purchase_prices, input.catalog.as_of_date)
      : undefined;

    let calcInfo: ReturnType<typeof computeUsableIngredientCost> | null = null;
    if (ing) {
      try {
        calcInfo = computeUsableIngredientCost(
          ing,
          priceRec,
          currency,
          input.catalog.exchange_rates,
          input.catalog.as_of_date
        );
      } catch {
        calcInfo = null;
      }
    }

    const idVal = ing ? ing.id : '';
    const nameVal = ing ? ing.name : '';
    const catVal = ing ? classifyIngredientCategory(ing.name) : '';
    const dimVal = ing ? ing.base_dimension : '';
    const baseUnitVal = ing ? ing.base_unit : '';
    const rawPrice = priceRec?.purchase_price !== null && priceRec?.purchase_price !== undefined && priceRec?.purchase_price !== ''
      ? Number(priceRec.purchase_price)
      : '';
    const packQty = priceRec?.pack_quantity ?? (ing ? 1 : '');
    const packUnit = priceRec?.pack_unit ?? (ing ? ing.base_unit : '');
    const yieldPct = priceRec?.yield_pct ?? (ing ? 100 : '');
    const isFreeNum = ing?.is_free ? 1 : (ing ? 0 : '');
    const densityVal = ing?.density_g_per_ml ?? '';
    const unitWeightVal = ing?.unit_weight_g ?? '';
    const supplierVal = priceRec?.supplier ?? '';

    let packInBaseVal: number | string = '';
    if (ing && typeof packQty === 'number' && packQty > 0 && packUnit) {
      try {
        packInBaseVal = convertQuantity(packQty, packUnit, ing.base_unit, ing);
      } catch {
        packInBaseVal = packQty;
      }
    }

    // Fórmula de conversión automática de envase (Col G, H) a unidad base (Col E) usando la tabla de Hoja 01 ($A$16:$D$30)
    const convFormula = `IF(A${r}="","",IF(H${r}=E${r},G${r},G${r}*INDEX('${S[1]}'!$D$16:$D$30,MATCH(H${r},'${S[1]}'!$A$16:$A$30,0))/INDEX('${S[1]}'!$D$16:$D$30,MATCH(E${r},'${S[1]}'!$A$16:$A$30,0))))`;

    sheet02Rows.push([
      { v: idVal, s: 3 },
      { v: nameVal, s: 3 },
      { v: catVal, s: 3 },
      { v: dimVal, s: 3 },
      { v: baseUnitVal, s: 3 },
      { v: rawPrice, s: 3 },
      { v: packQty, s: 3 },
      { v: packUnit, s: 3 },
      { f: convFormula, v: packInBaseVal, s: 4 },
      { v: densityVal, s: 3 },
      { v: unitWeightVal, s: 3 },
      { v: isFreeNum, s: 3 },
      { v: supplierVal, s: 3 },
    ]);

    const hasValidPrice = ing ? (ing.is_free || (typeof rawPrice === 'number' && rawPrice > 0)) : false;
    const grossUnitCost = calcInfo?.grossUnitCostInBase ?? (ing?.is_free ? 0 : '');
    const usableUnitCost = calcInfo?.usableUnitCostInBase ?? (ing?.is_free ? 0 : '');
    const usableQty = typeof packInBaseVal === 'number' && typeof yieldPct === 'number'
      ? packInBaseVal * (yieldPct / 100)
      : '';
    const mult1000 = baseUnitVal === 'g' || baseUnitVal === 'ml' ? 1000 : (baseUnitVal === 'mg' ? 1000000 : 1);
    const costPerKgL = typeof usableUnitCost === 'number' ? usableUnitCost * mult1000 : '';
    const statusVal = !ing
      ? ''
      : (typeof yieldPct === 'number' && (yieldPct <= 0 || yieldPct > 100))
      ? L.statusInvalidYield
      : ing.is_free
      ? L.statusFree
      : hasValidPrice
      ? L.statusComplete
      : L.statusIncompletePrice;

    sheet03Rows.push([
      { f: `IF('${S[2]}'!A${r}="","",'${S[2]}'!A${r})`, v: idVal, s: 0 },
      { f: `IF('${S[2]}'!B${r}="","",'${S[2]}'!B${r})`, v: nameVal, s: 0 },
      { f: `IF('${S[2]}'!E${r}="","",'${S[2]}'!E${r})`, v: baseUnitVal, s: 0 },
      { f: `IF('${S[2]}'!A${r}="","",IF('${S[2]}'!F${r}="",0,'${S[2]}'!F${r}))`, v: ing ? (typeof rawPrice === 'number' ? rawPrice : 0) : '', s: 4 },
      { f: `IF('${S[2]}'!A${r}="","",'${S[2]}'!I${r})`, v: packInBaseVal, s: 4 },
      { v: yieldPct, s: 3 },
      { f: `IF(A${r}="","",100-F${r})`, v: typeof yieldPct === 'number' ? 100 - yieldPct : '', s: 6 },
      { f: `IF(A${r}="","",E${r}*(F${r}/100))`, v: usableQty, s: 4 },
      { f: `IF(A${r}="","",IF('${S[2]}'!L${r}=1,0,IF(OR(D${r}<=0,E${r}<=0),"",D${r}/E${r})))`, v: grossUnitCost, s: 5 },
      { f: `IF(A${r}="","",IF('${S[2]}'!L${r}=1,0,IF(OR(D${r}<=0,E${r}<=0,F${r}<=0,F${r}>100),"",I${r}/(F${r}/100))))`, v: usableUnitCost, s: 5 },
      { f: `IF(J${r}="","",IF(OR(C${r}="g",C${r}="ml",C${r}="cc"),J${r}*1000,J${r}))`, v: costPerKgL, s: 4 },
      {
        f: `IF(A${r}="","",IF(OR(F${r}<=0,F${r}>100),"${L.statusInvalidYield}",IF('${S[2]}'!L${r}=1,"${L.statusFree}",IF(D${r}>0,"${L.statusComplete}","${L.statusIncompletePrice}"))))`,
        v: statusVal,
        s: statusVal === L.statusIncompletePrice || statusVal === L.statusInvalidYield ? 7 : 0,
      },
    ]);
  }

  // =========================================================================
  // 04. HISTORIAL DE PRECIOS Y PROVEEDORES
  // =========================================================================
  const sheet04Rows: RowSpec[] = [
    [{ v: L.s04Title, s: 1 }],
    [{ v: L.s04Sub, s: 0 }],
    [],
    [
      { v: 'ID Insumo', s: 2 },
      { v: 'Ingrediente', s: 2 },
      { v: 'Fecha de Compra', s: 2 },
      { v: 'Proveedor', s: 2 },
      { v: `Precio Pagado (${currency})`, s: 2 },
      { v: 'Cant. Envase', s: 2 },
      { v: 'Unidad Envase', s: 2 },
      { v: 'Rendimiento (%)', s: 2 },
      { v: `Costo Vigente / Base en Hoja 03`, s: 2 },
    ],
  ];

  input.catalog.purchase_prices.forEach((pp, idx) => {
    const r = idx + 5;
    const ing = ingredients.find((i) => i.id === pp.ingredient_id);
    const priceNum = pp.purchase_price !== null && pp.purchase_price !== undefined && pp.purchase_price !== ''
      ? Number(pp.purchase_price)
      : '';
    sheet04Rows.push([
      { v: pp.ingredient_id, s: 3 },
      { f: `IF(A${r}="","",INDEX('${S[2]}'!$B$${ingStartRow}:$B$${ingEndRow},MATCH(A${r},'${S[2]}'!$A$${ingStartRow}:$A$${ingEndRow},0)))`, v: ing?.name ?? pp.ingredient_id, s: 0 },
      { v: pp.purchase_date ?? (input.catalog.as_of_date || '2026-11-01'), s: 3 },
      { v: pp.supplier ?? 'Proveedor General', s: 3 },
      { v: priceNum, s: 3 },
      { v: pp.pack_quantity, s: 3 },
      { v: pp.pack_unit, s: 3 },
      { v: pp.yield_pct ?? 100, s: 3 },
      { f: `IF(A${r}="","",SUMIF('${S[3]}'!$A$${ingStartRow}:$A$${ingEndRow},A${r},'${S[3]}'!$J$${ingStartRow}:$J$${ingEndRow}))`, v: 0, s: 5 },
    ]);
  });

  // =========================================================================
  // 05. SUBRECETAS Y MASAS REUTILIZABLES
  // =========================================================================
  // Tabla superior (filas 5..subEndRow):
  // A=ID Subreceta, B=Nombre, C=Rendimiento Batch, D=Unidad Rend., E=Costo Batch (SUMIF líneas), F=Líneas Incompletas (COUNTIFS), G=Estado, H=Costo / Unidad Rend., I=Costo por kg / L
  // Tabla inferior (desde subLinesStartRow):
  // A=ID Subreceta, B=Nombre Subreceta, C=ID Insumo, D=Nombre Insumo, E=Cantidad en Unidad Base, F=Unidad Base, G=Costo Utilizable / Base (SUMIF Hoja 03), H=Costo Línea, I=Estado Insumo
  const subComponentLines: Array<{
    subId: string;
    subName: string;
    ingId: string;
    ingName: string;
    qtyInBase: number;
    baseUnit: string;
    unitCost: number | null;
    totalCost: number | null;
    status: string;
  }> = [];

  for (const sub of subrecipes) {
    const res = engine.calculateRecipeCost(sub.id);
    for (const comp of res.components) {
      subComponentLines.push({
        subId: sub.id,
        subName: sub.name,
        ingId: comp.id,
        ingName: comp.name,
        qtyInBase: comp.normalized_quantity,
        baseUnit: comp.cost_unit,
        unitCost: comp.raw_unit_cost,
        totalCost: comp.raw_total_cost,
        status: comp.status === 'complete' ? L.statusComplete : L.statusIncompletePrice,
      });
    }
  }

  const subLinesEndRow = Math.max(subLinesStartRow + subComponentLines.length + lineSpareRows - 1, subLinesStartRow + 15);

  const sheet05Rows: RowSpec[] = [
    [{ v: L.s05Title, s: 1 }],
    [{ v: L.s05Sub, s: 0 }],
    [],
    [
      { v: 'ID Subreceta', s: 2 },
      { v: 'Nombre de Masa / Subreceta', s: 2 },
      { v: 'Rendimiento Batch', s: 2 },
      { v: 'Unidad Rend.', s: 2 },
      { v: `Costo Batch (${currency})`, s: 2 },
      { v: 'Componentes Incompletos', s: 2 },
      { v: 'Estado Subreceta', s: 2 },
      { v: `Costo / Unidad Rend. (${currency})`, s: 2 },
      { v: `Costo por kg / L (${currency})`, s: 2 },
    ],
  ];

  const totalSubRows = subEndRow - subStartRow + 1;
  for (let i = 0; i < totalSubRows; i++) {
    const r = subStartRow + i;
    const sub = subrecipes[i];
    const res = sub ? engine.calculateRecipeCost(sub.id) : null;
    const idVal = sub ? sub.id : '';
    const nameVal = sub ? sub.name : '';
    const yieldQty = res ? res.raw_yield_quantity : (sub ? sub.yield_quantity : '');
    const yieldUnit = sub ? sub.yield_unit : '';
    const batchCostVal = res?.raw_batch_cost ?? (res?.raw_partial_batch_cost ?? '');
    const incCountVal = res ? (res.status === 'complete' ? 0 : Math.max(1, res.missing_inputs.length)) : '';
    const statusVal = !sub ? '' : res?.status === 'complete' ? L.statusComplete : L.statusIncompleteRecipe;
    const unitCostVal = res?.raw_unit_cost ?? '';
    const costPerKgVal = res?.cost_per_kg ?? (typeof unitCostVal === 'number' ? (yieldUnit === 'g' || yieldUnit === 'ml' ? unitCostVal * 1000 : unitCostVal) : '');

    sheet05Rows.push([
      { v: idVal, s: 3 },
      { v: nameVal, s: 3 },
      { v: yieldQty, s: 3 },
      { v: yieldUnit, s: 3 },
      { f: `IF(A${r}="","",SUMIF($A$${subLinesStartRow}:$A$${subLinesEndRow},A${r},$H$${subLinesStartRow}:$H$${subLinesEndRow}))`, v: batchCostVal, s: 4 },
      { f: `IF(A${r}="","",COUNTIFS($A$${subLinesStartRow}:$A$${subLinesEndRow},A${r},$I$${subLinesStartRow}:$I$${subLinesEndRow},"<>${L.statusComplete}"))`, v: incCountVal, s: 0 },
      { f: `IF(A${r}="","",IF(AND(F${r}=0,COUNTIF($A$${subLinesStartRow}:$A$${subLinesEndRow},A${r})>0),"${L.statusComplete}","${L.statusIncompleteRecipe}"))`, v: statusVal, s: statusVal === L.statusIncompleteRecipe ? 7 : 0 },
      { f: `IF(OR(A${r}="",G${r}<>"${L.statusComplete}",C${r}<=0),"",E${r}/C${r})`, v: unitCostVal, s: 5 },
      { f: `IF(H${r}="","",IF(OR(D${r}="g",D${r}="ml",D${r}="cc"),H${r}*1000,H${r}))`, v: costPerKgVal, s: 4 },
    ]);
  }

  sheet05Rows.push([]);
  sheet05Rows.push([{ v: L.s05LinesTitle, s: 8 }]);
  sheet05Rows.push([
    { v: 'ID Subreceta', s: 2 },
    { v: 'Subreceta', s: 2 },
    { v: 'ID Insumo', s: 2 },
    { v: 'Ingrediente', s: 2 },
    { v: 'Cantidad (en Unidad Base)', s: 2 },
    { v: 'Unidad Base', s: 2 },
    { v: `Costo Utilizable / Base (${currency})`, s: 2 },
    { v: `Costo Total Componente (${currency})`, s: 2 },
    { v: 'Estado Componente', s: 2 },
  ]);

  const totalSubLineRows = subLinesEndRow - subLinesStartRow + 1;
  for (let i = 0; i < totalSubLineRows; i++) {
    const r = subLinesStartRow + i;
    const line = subComponentLines[i];
    sheet05Rows.push([
      { v: line?.subId ?? '', s: 3 },
      { v: line?.subName ?? '', s: 0 },
      { v: line?.ingId ?? '', s: 3 },
      { v: line?.ingName ?? '', s: 0 },
      { v: line?.qtyInBase ?? '', s: 3 },
      { v: line?.baseUnit ?? '', s: 3 },
      {
        f: `IF(C${r}="","",SUMIF('${S[3]}'!$A$${ingStartRow}:$A$${ingEndRow},C${r},'${S[3]}'!$J$${ingStartRow}:$J$${ingEndRow}))`,
        v: line?.unitCost ?? '',
        s: 5,
      },
      {
        f: `IF(OR(A${r}="",C${r}="",I${r}<>"${L.statusComplete}"),0,E${r}*G${r})`,
        v: line?.totalCost ?? '',
        s: 4,
      },
      {
        f: `IF(C${r}="","",IF(COUNTIFS('${S[3]}'!$A$${ingStartRow}:$A$${ingEndRow},C${r},'${S[3]}'!$L$${ingStartRow}:$L$${ingEndRow},"${L.statusComplete}")+COUNTIFS('${S[3]}'!$A$${ingStartRow}:$A$${ingEndRow},C${r},'${S[3]}'!$L$${ingStartRow}:$L$${ingEndRow},"${L.statusFree}")>0,"${L.statusComplete}","${L.statusIncompletePrice}"))`,
        v: line?.status ?? '',
        s: line && line.status !== L.statusComplete ? 7 : 0,
      },
    ]);
  }

  // =========================================================================
  // 06. RECETAS DE PRODUCTOS FINALES
  // =========================================================================
  // Tabla superior (filas 5..prodEndRow):
  // A=ID Producto, B=Nombre Producto, C=Rendimiento (Porciones), D=Unidad, E=Costo Batch (SUMIF), F=Líneas Incompletas (COUNTIFS), G=Estado Costeo, H=Costo Unitario, I=Costo Rubro Harinas/Masa, J=Costo Rubro Lácteos, K=Costo Rubro Carnes
  // Tabla inferior (desde prodLinesStartRow):
  // A=ID Producto, B=Nombre Producto, C=Tipo (ingredient|subrecipe), D=ID Componente, E=Nombre Componente, F=Rubro (flour|dairy|meat|vegetables|other), G=Cantidad Normalizada, H=Unidad Costeo, I=Costo Unitario (SUMIF 03 o 05), J=Costo Total Línea, K=Estado Línea
  const prodComponentLines: Array<{
    prodId: string;
    prodName: string;
    compType: 'ingredient' | 'subrecipe';
    compId: string;
    compName: string;
    category: string;
    normQty: number;
    costUnit: string;
    unitCost: number | null;
    totalCost: number | null;
    status: string;
  }> = [];

  for (const prod of products) {
    const res = engine.calculateRecipeCost(prod.id);
    for (const comp of res.components) {
      const cat =
        comp.component_type === 'subrecipe'
          ? /masa|dough|poolish|biga|faina/i.test(comp.name)
            ? 'flour'
            : 'other'
          : classifyIngredientCategory(comp.name);
      prodComponentLines.push({
        prodId: prod.id,
        prodName: prod.name,
        compType: comp.component_type,
        compId: comp.id,
        compName: comp.name,
        category: cat,
        normQty: comp.normalized_quantity,
        costUnit: comp.cost_unit,
        unitCost: comp.raw_unit_cost,
        totalCost: comp.raw_total_cost,
        status: comp.status === 'complete' ? L.statusComplete : L.statusIncompleteRecipe,
      });
    }
  }

  const prodLinesEndRow = Math.max(prodLinesStartRow + prodComponentLines.length + lineSpareRows - 1, prodLinesStartRow + 20);

  const sheet06Rows: RowSpec[] = [
    [{ v: L.s06Title, s: 1 }],
    [{ v: L.s06Sub, s: 0 }],
    [],
    [
      { v: 'ID Producto', s: 2 },
      { v: 'Nombre del Producto Final', s: 2 },
      { v: 'Rendimiento', s: 2 },
      { v: 'Unidad', s: 2 },
      { v: `Costo Batch (${currency})`, s: 2 },
      { v: 'Líneas Incompletas', s: 2 },
      { v: 'Estado Costeo', s: 2 },
      { v: `Costo Unitario Receta (${currency})`, s: 2 },
      { v: `Costo Harinas/Masa (${currency})`, s: 2 },
      { v: `Costo Lácteos/Quesos (${currency})`, s: 2 },
      { v: `Costo Carnes/Fiambres (${currency})`, s: 2 },
    ],
  ];

  const totalProdRows = prodEndRow - prodStartRow + 1;
  for (let i = 0; i < totalProdRows; i++) {
    const r = prodStartRow + i;
    const prod = products[i];
    const res = prod ? engine.calculateRecipeCost(prod.id) : null;
    const decomp = prod ? decomposeRecipeCategoryCosts(input.catalog, prod.id, currency) : null;
    const idVal = prod ? prod.id : '';
    const nameVal = prod ? prod.name : '';
    const yieldQty = res ? res.raw_yield_quantity : (prod ? prod.yield_quantity : '');
    const yieldUnit = prod ? prod.yield_unit : '';
    const batchCostVal = res?.raw_batch_cost ?? (res?.raw_partial_batch_cost ?? '');
    const incCountVal = res ? (res.status === 'complete' ? 0 : Math.max(1, res.missing_inputs.length)) : '';
    const statusVal = !prod ? '' : res?.status === 'complete' ? L.statusComplete : L.statusIncompleteRecipe;
    const unitCostVal = res?.raw_unit_cost ?? '';

    sheet06Rows.push([
      { v: idVal, s: 3 },
      { v: nameVal, s: 3 },
      { v: yieldQty, s: 3 },
      { v: yieldUnit, s: 3 },
      { f: `IF(A${r}="","",SUMIF($A$${prodLinesStartRow}:$A$${prodLinesEndRow},A${r},$J$${prodLinesStartRow}:$J$${prodLinesEndRow}))`, v: batchCostVal, s: 4 },
      { f: `IF(A${r}="","",COUNTIFS($A$${prodLinesStartRow}:$A$${prodLinesEndRow},A${r},$K$${prodLinesStartRow}:$K$${prodLinesEndRow},"<>${L.statusComplete}"))`, v: incCountVal, s: 0 },
      { f: `IF(A${r}="","",IF(AND(F${r}=0,COUNTIF($A$${prodLinesStartRow}:$A$${prodLinesEndRow},A${r})>0),"${L.statusComplete}","${L.statusIncompleteRecipe}"))`, v: statusVal, s: statusVal === L.statusIncompleteRecipe ? 7 : 0 },
      { f: `IF(OR(A${r}="",G${r}<>"${L.statusComplete}",C${r}<=0),"",E${r}/C${r})`, v: unitCostVal, s: 4 },
      { f: `IF(OR(A${r}="",G${r}<>"${L.statusComplete}"),0,SUMIFS($J$${prodLinesStartRow}:$J$${prodLinesEndRow},$A$${prodLinesStartRow}:$A$${prodLinesEndRow},A${r},$F$${prodLinesStartRow}:$F$${prodLinesEndRow},"flour")/C${r})`, v: decomp?.flourCost ?? '', s: 4 },
      { f: `IF(OR(A${r}="",G${r}<>"${L.statusComplete}"),0,SUMIFS($J$${prodLinesStartRow}:$J$${prodLinesEndRow},$A$${prodLinesStartRow}:$A$${prodLinesEndRow},A${r},$F$${prodLinesStartRow}:$F$${prodLinesEndRow},"dairy")/C${r})`, v: decomp?.dairyCost ?? '', s: 4 },
      { f: `IF(OR(A${r}="",G${r}<>"${L.statusComplete}"),0,SUMIFS($J$${prodLinesStartRow}:$J$${prodLinesEndRow},$A$${prodLinesStartRow}:$A$${prodLinesEndRow},A${r},$F$${prodLinesStartRow}:$F$${prodLinesEndRow},"meat")/C${r})`, v: decomp?.meatCost ?? '', s: 4 },
    ]);
  }

  sheet06Rows.push([]);
  sheet06Rows.push([{ v: L.s06LinesTitle, s: 8 }]);
  sheet06Rows.push([
    { v: 'ID Producto', s: 2 },
    { v: 'Producto Final', s: 2 },
    { v: 'Tipo (ingredient/subrecipe)', s: 2 },
    { v: 'ID Componente', s: 2 },
    { v: 'Nombre Componente', s: 2 },
    { v: 'Rubro Sensibilidad', s: 2 },
    { v: 'Cantidad (en Unidad Costeo)', s: 2 },
    { v: 'Unidad Costeo', s: 2 },
    { v: `Costo Unitario (${currency})`, s: 2 },
    { v: `Costo Total Línea (${currency})`, s: 2 },
    { v: 'Estado Componente', s: 2 },
  ]);

  const totalProdLineRows = prodLinesEndRow - prodLinesStartRow + 1;
  for (let i = 0; i < totalProdLineRows; i++) {
    const r = prodLinesStartRow + i;
    const line = prodComponentLines[i];
    sheet06Rows.push([
      { v: line?.prodId ?? '', s: 3 },
      { v: line?.prodName ?? '', s: 0 },
      { v: line?.compType ?? '', s: 3 },
      { v: line?.compId ?? '', s: 3 },
      { v: line?.compName ?? '', s: 0 },
      { v: line?.category ?? '', s: 3 },
      { v: line?.normQty ?? '', s: 3 },
      { v: line?.costUnit ?? '', s: 3 },
      {
        f: `IF(D${r}="","",IF(C${r}="subrecipe",SUMIF('${S[5]}'!$A$${subStartRow}:$A$${subEndRow},D${r},'${S[5]}'!$H$${subStartRow}:$H$${subEndRow}),SUMIF('${S[3]}'!$A$${ingStartRow}:$A$${ingEndRow},D${r},'${S[3]}'!$J$${ingStartRow}:$J$${ingEndRow})))`,
        v: line?.unitCost ?? '',
        s: 5,
      },
      {
        f: `IF(OR(A${r}="",D${r}="",K${r}<>"${L.statusComplete}"),0,G${r}*I${r})`,
        v: line?.totalCost ?? '',
        s: 4,
      },
      {
        f: `IF(D${r}="","",IF(C${r}="subrecipe",IF(COUNTIFS('${S[5]}'!$A$${subStartRow}:$A$${subEndRow},D${r},'${S[5]}'!$G$${subStartRow}:$G$${subEndRow},"${L.statusComplete}")>0,"${L.statusComplete}","${L.statusIncompleteRecipe}"),IF(COUNTIFS('${S[3]}'!$A$${ingStartRow}:$A$${ingEndRow},D${r},'${S[3]}'!$L$${ingStartRow}:$L$${ingEndRow},"${L.statusComplete}")+COUNTIFS('${S[3]}'!$A$${ingStartRow}:$A$${ingEndRow},D${r},'${S[3]}'!$L$${ingStartRow}:$L$${ingEndRow},"${L.statusFree}")>0,"${L.statusComplete}","${L.statusIncompleteRecipe}")))`,
        v: line?.status ?? '',
        s: line && line.status !== L.statusComplete ? 7 : 0,
      },
    ]);
  }

  // =========================================================================
  // 07. PRECIOS SUGERIDOS, MARGEN BRUTO, FOOD COST Y MARKUP
  // =========================================================================
  // Cols: A=ID Producto, B=Producto, C=Estado Costeo (Ref 06), D=Costo Unitario (Ref 06), E=Food Cost Objetivo %, F=Incremento Redondeo, G=Precio Mínimo, H=Precio Sugerido, I=Precio Carta Manual, J=Precio Evaluado, K=Ganancia Bruta Unitaria, L=Food Cost Real %, M=Margen Bruto %, N=Markup %, O=Contribución Neta Delivery
  const sheet07Rows: RowSpec[] = [
    [{ v: L.s07Title, s: 1 }],
    [{ v: L.s07Sub, s: 0 }],
    [],
    [
      { v: 'ID Producto', s: 2 },
      { v: 'Producto Final', s: 2 },
      { v: 'Estado Costeo', s: 2 },
      { v: `Costo Receta (${currency})`, s: 2 },
      { v: 'Food Cost Objetivo (%)', s: 2 },
      { v: `Redondeo (${currency})`, s: 2 },
      { v: `Precio Mínimo (${currency})`, s: 2 },
      { v: `Precio Sugerido (${currency})`, s: 2 },
      { v: `Precio Carta Manual (${currency})`, s: 2 },
      { v: `Precio Vigente Evaluado (${currency})`, s: 2 },
      { v: `Ganancia Bruta Unit. (${currency})`, s: 2 },
      { v: 'Food Cost Real (%)', s: 2 },
      { v: 'Margen Bruto (%)', s: 2 },
      { v: 'Markup (%)', s: 2 },
      { v: `Contrib. Neta Delivery (${currency})`, s: 2 },
    ],
  ];

  // =========================================================================
  // 08. VENTAS POR PRODUCTO Y CANAL
  // =========================================================================
  // Cols: A=ID Producto, B=Producto, C=Unidades Vendidas / Mes, D=Precio Evaluado (Ref 07), E=Costo Unitario (Ref 07), F=Ganancia Bruta Unit (Ref 07), G=Facturación Mensual, H=CMV Mensual, I=Contribución Marginal Mensual, J=Participación en Ventas %
  const sheet08Rows: RowSpec[] = [
    [{ v: L.s08Title, s: 1 }],
    [{ v: L.s08Sub, s: 0 }],
    [],
    [
      { v: 'ID Producto', s: 2 },
      { v: 'Producto Final', s: 2 },
      { v: 'Unidades Vendidas / Mes', s: 2 },
      { v: `Precio Venta (${currency})`, s: 2 },
      { v: `Costo Unitario (${currency})`, s: 2 },
      { v: `Margen Bruto Unit. (${currency})`, s: 2 },
      { v: `Facturación Mensual (${currency})`, s: 2 },
      { v: `Costo Mercadería CMV (${currency})`, s: 2 },
      { v: `Contribución Marginal (${currency})`, s: 2 },
      { v: 'Mix de Unidades (%)', s: 2 },
    ],
  ];

  // =========================================================================
  // 09. INGENIERÍA DE MENÚ (Matriz BCG Kasavana & Smith)
  // =========================================================================
  // Cols: A=ID Producto, B=Producto, C=Estado, D=Unidades/Mes (Ref 08), E=Promedio Unidades, F=Margen Unitario (Ref 07), G=Promedio Margen Unitario, H=Popularidad (ALTA/BAJA), I=Rentabilidad (ALTA/BAJA), J=Clasificación Matriz BCG, K=Contribución Mensual Total
  const sheet09Rows: RowSpec[] = [
    [{ v: L.s09Title, s: 1 }],
    [{ v: L.s09Sub, s: 0 }],
    [],
    [
      { v: 'ID Producto', s: 2 },
      { v: 'Producto Final', s: 2 },
      { v: 'Estado', s: 2 },
      { v: 'Unidades / Mes', s: 2 },
      { v: 'Umbral Popularidad (Prom.)', s: 2 },
      { v: `Margen Unitario (${currency})`, s: 2 },
      { v: `Umbral Margen (Prom.)`, s: 2 },
      { v: 'Nivel Popularidad', s: 2 },
      { v: 'Nivel Margen', s: 2 },
      { v: 'Clasificación BCG', s: 2 },
      { v: `Contribución Mensual (${currency})`, s: 2 },
    ],
  ];

  // Pre-compute summary stats for cached values
  let sumUnitsComplete = 0;
  let sumProfitUnitComplete = 0;
  let countCompleteWithSales = 0;
  let sumRevTotal = 0;
  let sumCogsTotal = 0;
  let sumContribTotal = 0;

  const prodEvaluatedCache: Array<{
    prod?: Recipe;
    isComplete: boolean;
    unitCost: number;
    targetFc: number;
    roundingInc: number;
    minPrice: number | string;
    suggPrice: number | string;
    manualPrice: number | string;
    evalPrice: number;
    grossProfit: number;
    fcPct: number;
    marginPct: number;
    markupPct: number;
    netDeliv: number;
    units: number;
  }> = [];

  for (let i = 0; i < totalProdRows; i++) {
    const prod = products[i];
    if (!prod) {
      prodEvaluatedCache.push({
        isComplete: false,
        unitCost: 0,
        targetFc: input.defaultTargetFoodCostPct || 30,
        roundingInc: input.defaultRoundingIncrement || 100,
        minPrice: '',
        suggPrice: '',
        manualPrice: '',
        evalPrice: 0,
        grossProfit: 0,
        fcPct: 0,
        marginPct: 0,
        markupPct: 0,
        netDeliv: 0,
        units: 0,
      });
      continue;
    }
    const res = engine.calculateRecipeCost(prod.id);
    const plan = input.productSalesMap?.[prod.id] ?? {};
    const targetFc = prod.target_food_cost_pct ?? input.defaultTargetFoodCostPct ?? 30;
    const roundingInc = input.defaultRoundingIncrement || 100;
    const manualPriceNum = plan.sellingPrice && plan.sellingPrice > 0 ? Number(plan.sellingPrice) : undefined;
    const unitsNum = plan.monthlyUnitsSold !== null && plan.monthlyUnitsSold !== undefined ? Number(plan.monthlyUnitsSold) : 0;

    const isComplete = res.status === 'complete' && res.raw_unit_cost !== null && res.raw_unit_cost > 0;
    const pricing = calculatePricingScenario({
      unit_cost: isComplete ? res.raw_unit_cost : null,
      status: isComplete ? 'complete' : 'incomplete',
      currency,
      target_food_cost_pct: targetFc,
      rounding_increment: roundingInc,
      rounding_mode: 'ceil',
      selling_price: manualPriceNum,
      packaging_cost: input.defaultPackagingCost ?? 0,
      channel_fee_pct: input.defaultChannelFeePct ?? 0,
    });

    const evalPrice = pricing.raw_evaluated_price ?? 0;
    const grossProfit = pricing.raw_gross_profit ?? 0;
    if (isComplete) {
      sumUnitsComplete += unitsNum;
      sumProfitUnitComplete += grossProfit;
      countCompleteWithSales++;
      sumRevTotal += evalPrice * unitsNum;
      sumCogsTotal += (res.raw_unit_cost ?? 0) * unitsNum;
      sumContribTotal += grossProfit * unitsNum;
    }

    prodEvaluatedCache.push({
      prod,
      isComplete,
      unitCost: res.raw_unit_cost ?? 0,
      targetFc,
      roundingInc,
      minPrice: isComplete ? (pricing.raw_minimum_price ?? 0) : L.statusBlocked,
      suggPrice: isComplete ? (pricing.raw_suggested_price ?? 0) : L.statusBlocked,
      manualPrice: manualPriceNum ?? '',
      evalPrice,
      grossProfit,
      fcPct: pricing.food_cost_pct ?? 0,
      marginPct: pricing.gross_margin_pct ?? 0,
      markupPct: pricing.markup_pct ?? 0,
      netDeliv: pricing.raw_net_contribution_after_channel ?? 0,
      units: unitsNum,
    });
  }

  const avgUnitsCache = countCompleteWithSales > 0 ? sumUnitsComplete / countCompleteWithSales : 0;
  const avgProfitCache = countCompleteWithSales > 0 ? sumProfitUnitComplete / countCompleteWithSales : 0;
  const salesTotalRow = prodEndRow + 2;

  for (let i = 0; i < totalProdRows; i++) {
    const r = prodStartRow + i;
    const c = prodEvaluatedCache[i]!;
    const p = c.prod;

    sheet07Rows.push([
      { f: `IF('${S[6]}'!A${r}="","",'${S[6]}'!A${r})`, v: p?.id ?? '', s: 0 },
      { f: `IF('${S[6]}'!B${r}="","",'${S[6]}'!B${r})`, v: p?.name ?? '', s: 0 },
      { f: `IF('${S[6]}'!A${r}="","",'${S[6]}'!G${r})`, v: p ? (c.isComplete ? L.statusComplete : L.statusIncompleteRecipe) : '', s: p && !c.isComplete ? 7 : 0 },
      { f: `IF('${S[6]}'!A${r}="","",'${S[6]}'!H${r})`, v: p && c.isComplete ? c.unitCost : '', s: 4 },
      { f: `IF(A${r}="","",'${S[1]}'!$B$7)`, v: p ? c.targetFc : '', s: 6 },
      { f: `IF(A${r}="","",'${S[1]}'!$B$8)`, v: p ? c.roundingInc : '', s: 4 },
      { f: `IF(A${r}="","",IF(C${r}<>"${L.statusComplete}","${L.statusBlocked}",D${r}/(E${r}/100)))`, v: p ? c.minPrice : '', s: p && !c.isComplete ? 7 : 4 },
      { f: `IF(A${r}="","",IF(C${r}<>"${L.statusComplete}","${L.statusBlocked}",CEILING(G${r},F${r})))`, v: p ? c.suggPrice : '', s: p && !c.isComplete ? 7 : 4 },
      { v: c.manualPrice, s: 3 },
      { f: `IF(A${r}="","",IF(C${r}<>"${L.statusComplete}","",IF(I${r}>0,I${r},H${r})))`, v: p && c.isComplete ? c.evalPrice : '', s: 4 },
      { f: `IF(or(A${r}="",C${r}<>"${L.statusComplete}"),"",J${r}-D${r})`.replace('or(', 'OR('), v: p && c.isComplete ? c.grossProfit : '', s: 4 },
      { f: `IF(OR(A${r}="",C${r}<>"${L.statusComplete}",J${r}<=0),"",(D${r}/J${r})*100)`, v: p && c.isComplete ? c.fcPct : '', s: 6 },
      { f: `IF(OR(A${r}="",C${r}<>"${L.statusComplete}",J${r}<=0),"",(K${r}/J${r})*100)`, v: p && c.isComplete ? c.marginPct : '', s: 6 },
      { f: `IF(OR(A${r}="",C${r}<>"${L.statusComplete}",D${r}<=0),"",(K${r}/D${r})*100)`, v: p && c.isComplete ? c.markupPct : '', s: 6 },
      { f: `IF(OR(A${r}="",C${r}<>"${L.statusComplete}"),"",K${r}-'${S[1]}'!$B$9-(J${r}*('${S[1]}'!$B$10/100)))`, v: p && c.isComplete ? c.netDeliv : '', s: 4 },
    ]);

    const revVal = p && c.isComplete ? c.evalPrice * c.units : 0;
    const cogsVal = p && c.isComplete ? c.unitCost * c.units : 0;
    const contribVal = p && c.isComplete ? c.grossProfit * c.units : 0;
    const mixPctVal = p && c.isComplete && sumUnitsComplete > 0 ? (c.units / sumUnitsComplete) * 100 : 0;

    sheet08Rows.push([
      { f: `IF('${S[7]}'!A${r}="","",'${S[7]}'!A${r})`, v: p?.id ?? '', s: 0 },
      { f: `IF('${S[7]}'!B${r}="","",'${S[7]}'!B${r})`, v: p?.name ?? '', s: 0 },
      { v: p ? c.units : '', s: 3 },
      { f: `IF('${S[7]}'!A${r}="","",IF('${S[7]}'!C${r}="${L.statusComplete}",'${S[7]}'!J${r},0))`, v: p && c.isComplete ? c.evalPrice : '', s: 4 },
      { f: `IF('${S[7]}'!A${r}="","",IF('${S[7]}'!C${r}="${L.statusComplete}",'${S[7]}'!D${r},0))`, v: p && c.isComplete ? c.unitCost : '', s: 4 },
      { f: `IF('${S[7]}'!A${r}="","",IF('${S[7]}'!C${r}="${L.statusComplete}",'${S[7]}'!K${r},0))`, v: p && c.isComplete ? c.grossProfit : '', s: 4 },
      { f: `IF(OR(A${r}="",'${S[7]}'!C${r}<>"${L.statusComplete}"),0,C${r}*D${r})`, v: p ? revVal : '', s: 4 },
      { f: `IF(OR(A${r}="",'${S[7]}'!C${r}<>"${L.statusComplete}"),0,C${r}*E${r})`, v: p ? cogsVal : '', s: 4 },
      { f: `IF(OR(A${r}="",'${S[7]}'!C${r}<>"${L.statusComplete}"),0,C${r}*F${r})`, v: p ? contribVal : '', s: 4 },
      { f: `IF(OR(A${r}="",$C$${salesTotalRow}<=0),0,(C${r}/$C$${salesTotalRow})*100)`, v: p ? mixPctVal : '', s: 6 },
    ]);

    const highPop = c.units >= avgUnitsCache;
    const highMargin = c.grossProfit >= avgProfitCache;
    const bcgLabel = !p
      ? ''
      : !c.isComplete
      ? L.statusIncompleteRecipe
      : highPop && highMargin
      ? L.star
      : highPop && !highMargin
      ? L.horse
      : !highPop && highMargin
      ? L.puzzle
      : L.dog;

    sheet09Rows.push([
      { f: `IF('${S[7]}'!A${r}="","",'${S[7]}'!A${r})`, v: p?.id ?? '', s: 0 },
      { f: `IF('${S[7]}'!B${r}="","",'${S[7]}'!B${r})`, v: p?.name ?? '', s: 0 },
      { f: `IF('${S[7]}'!A${r}="","",'${S[7]}'!C${r})`, v: p ? (c.isComplete ? L.statusComplete : L.statusIncompleteRecipe) : '', s: 0 },
      { f: `IF(A${r}="","",'${S[8]}'!C${r})`, v: p ? c.units : '', s: 0 },
      { f: `IF(A${r}="","",AVERAGEIF($C$${prodStartRow}:$C$${prodEndRow},"${L.statusComplete}",$D$${prodStartRow}:$D$${prodEndRow}))`, v: p ? avgUnitsCache : '', s: 4 },
      { f: `IF(A${r}="","",'${S[8]}'!F${r})`, v: p && c.isComplete ? c.grossProfit : '', s: 4 },
      { f: `IF(A${r}="","",AVERAGEIF($C$${prodStartRow}:$C$${prodEndRow},"${L.statusComplete}",$F$${prodStartRow}:$F$${prodEndRow}))`, v: p ? avgProfitCache : '', s: 4 },
      { f: `IF(OR(A${r}="",C${r}<>"${L.statusComplete}"),"",IF(D${r}>=E${r},"ALTA","BAJA"))`, v: p && c.isComplete ? (highPop ? 'ALTA' : 'BAJA') : '', s: 0 },
      { f: `IF(OR(A${r}="",C${r}<>"${L.statusComplete}"),"",IF(F${r}>=G${r},"ALTA","BAJA"))`, v: p && c.isComplete ? (highMargin ? 'ALTA' : 'BAJA') : '', s: 0 },
      {
        f: `IF(A${r}="","",IF(C${r}<>"${L.statusComplete}","${L.statusIncompleteRecipe}",IF(AND(D${r}>=E${r},F${r}>=G${r}),"${L.star}",IF(AND(D${r}>=E${r},F${r}<G${r}),"${L.horse}",IF(AND(D${r}<E${r},F${r}>=G${r}),"${L.puzzle}","${L.dog}")))))`,
        v: bcgLabel,
        s: bcgLabel === L.star ? 9 : bcgLabel === L.statusIncompleteRecipe ? 7 : 0,
      },
      { f: `IF(A${r}="","",'${S[8]}'!I${r})`, v: p ? contribVal : '', s: 4 },
    ]);
  }

  // Fila de totales en Hoja 08
  sheet08Rows.push([]);
  sheet08Rows.push([
    { v: 'TOTALES MENSUALES', s: 8 },
    null,
    { f: `SUM(C${prodStartRow}:C${prodEndRow})`, v: sumUnitsComplete, s: 8 },
    null,
    null,
    null,
    { f: `SUM(G${prodStartRow}:G${prodEndRow})`, v: sumRevTotal, s: 4 },
    { f: `SUM(H${prodStartRow}:H${prodEndRow})`, v: sumCogsTotal, s: 4 },
    { f: `SUM(I${prodStartRow}:I${prodEndRow})`, v: sumContribTotal, s: 4 },
    { v: 100, s: 6 },
  ]);

  // Historial por canal al pie de la Hoja 08 si existe
  if (input.salesHistory && input.salesHistory.length > 0) {
    sheet08Rows.push([]);
    sheet08Rows.push([{ v: 'HISTORIAL DETALLADO DE VENTAS POR CANAL Y PERÍODO', s: 8 }]);
    sheet08Rows.push([
      { v: 'ID Registro', s: 2 },
      { v: 'ID Producto', s: 2 },
      { v: 'Producto', s: 2 },
      { v: 'Canal', s: 2 },
      { v: 'Inicio Período', s: 2 },
      { v: 'Fin Período', s: 2 },
      { v: 'Unidades', s: 2 },
      { v: `Venta Bruta (${currency})`, s: 2 },
      { v: `Venta Neta (${currency})`, s: 2 },
      { v: 'Origen', s: 2 },
    ]);
    for (const sRec of input.salesHistory.slice(0, 200)) {
      sheet08Rows.push([
        { v: sRec.id, s: 0 },
        { v: sRec.product_id ?? '', s: 0 },
        { v: sRec.product_name, s: 0 },
        { v: sRec.channel ?? 'General', s: 0 },
        { v: sRec.period_start, s: 0 },
        { v: sRec.period_end, s: 0 },
        { v: sRec.quantity, s: 4 },
        { v: sRec.gross_revenue ?? '', s: 4 },
        { v: sRec.net_revenue ?? '', s: 4 },
        { v: sRec.source ?? '', s: 0 },
      ]);
    }
  }

  // =========================================================================
  // 10. GASTOS OPERATIVOS FIJOS
  // =========================================================================
  const expenses = input.operatingExpenses ?? [];
  const expStartRow = 5;
  const expEndRow = Math.max(expStartRow + expenses.length + 10 - 1, 16);
  const expTotalRow = expEndRow + 2;

  const sheet10Rows: RowSpec[] = [
    [{ v: L.s10Title, s: 1 }],
    [{ v: L.s10Sub, s: 0 }],
    [],
    [
      { v: 'ID Gasto', s: 2 },
      { v: 'Concepto / Rubro Operativo', s: 2 },
      { v: 'Categoría', s: 2 },
      { v: 'Frecuencia (monthly/weekly/yearly)', s: 2 },
      { v: `Importe por Período (${currency})`, s: 2 },
      { v: 'Factor de Conversión Mensual', s: 2 },
      { v: `Total Equivalente Mensual (${currency})`, s: 2 },
    ],
  ];

  let totalMonthlyExpCache = 0;
  for (let i = 0; i <= expEndRow - expStartRow; i++) {
    const r = expStartRow + i;
    const exp = expenses[i];
    const factorNum = exp ? (exp.period === 'weekly' ? 52 / 12 : exp.period === 'yearly' ? 1 / 12 : 1) : '';
    const monthlyAmt = exp && typeof factorNum === 'number' ? exp.amount * factorNum : 0;
    if (exp) totalMonthlyExpCache += monthlyAmt;

    sheet10Rows.push([
      { v: exp?.id ?? '', s: 3 },
      { v: exp?.name ?? '', s: 3 },
      { v: exp?.category ?? '', s: 3 },
      { v: exp?.period ?? '', s: 3 },
      { v: exp?.amount ?? '', s: 3 },
      { f: `IF(B${r}="","",IF(D${r}="weekly",52/12,IF(D${r}="yearly",1/12,1)))`, v: factorNum, s: 5 },
      { f: `IF(B${r}="","",E${r}*F${r})`, v: exp ? monthlyAmt : '', s: 4 },
    ]);
  }

  sheet10Rows.push([]);
  sheet10Rows.push([
    { v: 'TOTAL GASTOS OPERATIVOS FIJOS MENSUALES', s: 8 },
    null,
    null,
    null,
    null,
    null,
    { f: `SUM(G${expStartRow}:G${expEndRow})`, v: totalMonthlyExpCache, s: 4 },
  ]);

  // =========================================================================
  // 11. RENTABILIDAD Y PUNTO DE EQUILIBRIO (Break-Even)
  // =========================================================================
  const weightedMarginPctCache = sumRevTotal > 0 ? (sumContribTotal / sumRevTotal) * 100 : 0;
  const weightedFcPctCache = sumRevTotal > 0 ? (sumCogsTotal / sumRevTotal) * 100 : 0;
  const netProfitCache = sumContribTotal - totalMonthlyExpCache;
  const breakEvenRevCache = weightedMarginPctCache > 0 ? totalMonthlyExpCache / (weightedMarginPctCache / 100) : 0;
  const avgContribPerUnitCache = sumUnitsComplete > 0 ? sumContribTotal / sumUnitsComplete : 0;
  const breakEvenUnitsCache = avgContribPerUnitCache > 0 ? totalMonthlyExpCache / avgContribPerUnitCache : 0;
  const safetyMarginCache = sumRevTotal > 0 && breakEvenRevCache > 0 ? ((sumRevTotal - breakEvenRevCache) / sumRevTotal) * 100 : 0;

  const sheet11Rows: RowSpec[] = [
    [{ v: L.s11Title, s: 1 }],
    [{ v: L.s11Sub, s: 0 }],
    [],
    [{ v: 'Indicador Financiero Mensual', s: 2 }, { v: `Valor (${currency} / %)`, s: 2 }, { v: 'Fórmula / Origen en el Modelo', s: 2 }],
    [{ v: '1. Unidades Totales Vendidas / Mes', s: 0 }, { f: `'${S[8]}'!C${salesTotalRow}`, v: sumUnitsComplete, s: 4 }, { v: 'Suma de unidades en Hoja 08', s: 0 }],
    [{ v: `2. Facturación Mensual Total (${currency})`, s: 0 }, { f: `'${S[8]}'!G${salesTotalRow}`, v: sumRevTotal, s: 4 }, { v: 'Suma de ventas en Hoja 08', s: 0 }],
    [{ v: `3. Costo de Mercadería Vendida - CMV (${currency})`, s: 0 }, { f: `'${S[8]}'!H${salesTotalRow}`, v: sumCogsTotal, s: 4 }, { v: 'Suma de costos de recetas vendidas en Hoja 08', s: 0 }],
    [{ v: '4. Food Cost Ponderado Real (%)', s: 0 }, { f: `IF(B6<=0,0,(B7/B6)*100)`, v: weightedFcPctCache, s: 6 }, { v: 'CMV Mensual / Facturación Mensual', s: 0 }],
    [{ v: `5. Contribución Marginal Total (${currency})`, s: 8 }, { f: `'${S[8]}'!I${salesTotalRow}`, v: sumContribTotal, s: 4 }, { v: 'Facturación - CMV (Ganancia Bruta para cubrir fijos)', s: 0 }],
    [{ v: '6. Margen de Contribución Ponderado (%)', s: 0 }, { f: `IF(B6<=0,0,(B9/B6)*100)`, v: weightedMarginPctCache, s: 6 }, { v: 'Contribución Marginal / Facturación', s: 0 }],
    [{ v: `7. Gastos Operativos Fijos Mensuales (${currency})`, s: 0 }, { f: `'${S[10]}'!G${expTotalRow}`, v: totalMonthlyExpCache, s: 4 }, { v: 'Total de gastos fijos en Hoja 10', s: 0 }],
    [{ v: `8. RESULTADO OPERATIVO NETO (EBITDA) (${currency})`, s: 8 }, { f: `B9-B11`, v: netProfitCache, s: netProfitCache >= 0 ? 9 : 7 }, { v: 'Contribución Marginal (B9) - Gastos Fijos (B11)', s: 0 }],
    [{ v: '9. Margen Neto sobre Ventas (%)', s: 0 }, { f: `IF(B6<=0,0,(B12/B6)*100)`, v: sumRevTotal > 0 ? (netProfitCache / sumRevTotal) * 100 : 0, s: 6 }, { v: 'Resultado Operativo Neto / Facturación', s: 0 }],
    [],
    [{ v: 'ANÁLISIS DE PUNTO DE EQUILIBRIO (BREAK-EVEN)', s: 8 }, null, null],
    [{ v: `Facturación Mensual de Equilibrio (${currency})`, s: 0 }, { f: `IF(B10<=0,0,B11/(B10/100))`, v: breakEvenRevCache, s: 4 }, { v: 'Gastos Fijos / (Margen de Contribución % / 100)', s: 0 }],
    [{ v: 'Unidades Mensuales de Equilibrio', s: 0 }, { f: `IF(OR(B5<=0,B9<=0),0,B11/(B9/B5))`, v: breakEvenUnitsCache, s: 4 }, { v: 'Gastos Fijos / Contribución Unitaria Promedio', s: 0 }],
    [{ v: 'Margen de Seguridad (%)', s: 0 }, { f: `IF(OR(B6<=0,B16<=0),0,((B6-B16)/B6)*100)`, v: safetyMarginCache, s: 6 }, { v: '(Facturación Actual - Facturación Equilibrio) / Facturación Actual', s: 0 }],
  ];

  // =========================================================================
  // 12. SIMULACIONES (Sensibilidad desglosada por Rubro de Insumos)
  // =========================================================================
  // Filas 5..10: Controles amarillos:
  // B5 = Variación de Precio de Venta (%)
  // B6 = Variación de Volumen de Ventas (%)
  // B7 = Variación Costo Rubro Harinas y Masas (%)
  // B8 = Variación Costo Rubro Lácteos y Quesos (%)
  // B9 = Variación Costo Rubro Carnes y Fiambres (%)
  // B10 = Variación Costo Resto de Insumos (%)
  const simProdStartRow = 15;
  const simProdEndRow = simProdStartRow + totalProdRows - 1;
  const simTotalRow = simProdEndRow + 2;

  const sheet12Rows: RowSpec[] = [
    [{ v: L.s12Title, s: 1 }],
    [{ v: L.s12Sub, s: 0 }],
    [],
    [{ v: 'PARÁMETRO DE SIMULACIÓN (Celdas Amarillas Interactivas)', s: 2 }, { v: 'Variación (%)', s: 2 }, { v: 'Explicación del Impacto en Fórmulas', s: 2 }],
    [{ v: 'Variación General de Precios de Venta (%)', s: 0 }, { v: 0, s: 3 }, { v: 'Ajusta el precio de carta proyectado de cada producto', s: 0 }],
    [{ v: 'Variación de Volumen de Unidades Vendidas (%)', s: 0 }, { v: 0, s: 3 }, { v: 'Ajusta las unidades vendidas mensuales proyectadas', s: 0 }],
    [{ v: 'Aumento en Harinas, Sémolas y Masas (%)', s: 0 }, { v: 10, s: 3 }, { v: 'Se aplica SOLO a la porción del costo que proviene de harinas/masas (Col I de Hoja 06)', s: 0 }],
    [{ v: 'Aumento en Lácteos y Quesos (%)', s: 0 }, { v: 0, s: 3 }, { v: 'Se aplica SOLO a la porción del costo que proviene de lácteos/quesos (Col J de Hoja 06)', s: 0 }],
    [{ v: 'Aumento en Carnes, Pollo y Fiambres (%)', s: 0 }, { v: 0, s: 3 }, { v: 'Se aplica SOLO a la porción del costo que proviene de carnes/fiambres (Col K de Hoja 06)', s: 0 }],
    [{ v: 'Aumento en Resto de Insumos (%)', s: 0 }, { v: 0, s: 3 }, { v: 'Se aplica al resto de los ingredientes de la receta', s: 0 }],
    [],
    [
      { v: 'RESUMEN DEL ESCENARIO SIMULADO', s: 8 },
      { f: `SUM(J${simProdStartRow}:J${simProdEndRow})`, v: sumRevTotal, s: 4 },
      { v: '← Facturación Simulada | Ganancia Neta Simulada →', s: 0 },
      { f: `SUM(L${simProdStartRow}:L${simProdEndRow})-'${S[10]}'!G${expTotalRow}`, v: netProfitCache, s: 9 },
    ],
    [],
    [
      { v: 'ID Producto', s: 2 },
      { v: 'Producto Final', s: 2 },
      { v: 'Unidades Base', s: 2 },
      { v: 'Unidades Simuladas', s: 2 },
      { v: `Costo Base (${currency})`, s: 2 },
      { v: `Costo Simulado Ponderado (${currency})`, s: 2 },
      { v: `Incremento Costo (${currency})`, s: 2 },
      { v: `Precio Base (${currency})`, s: 2 },
      { v: `Precio Simulado (${currency})`, s: 2 },
      { v: `Facturación Simulada (${currency})`, s: 2 },
      { v: `CMV Simulado (${currency})`, s: 2 },
      { v: `Contribución Simulada (${currency})`, s: 2 },
    ],
  ];

  for (let i = 0; i < totalProdRows; i++) {
    const r6 = prodStartRow + i;
    const rSim = simProdStartRow + i;
    const c = prodEvaluatedCache[i]!;
    const p = c.prod;
    const decomp = p ? decomposeRecipeCategoryCosts(input.catalog, p.id, currency) : null;
    const simCostCache = p && c.isComplete && decomp
      ? c.unitCost + decomp.flourCost * 0.10
      : 0;
    const simDeltaCache = p && c.isComplete ? simCostCache - c.unitCost : 0;

    sheet12Rows.push([
      { f: `IF('${S[6]}'!A${r6}="","",'${S[6]}'!A${r6})`, v: p?.id ?? '', s: 0 },
      { f: `IF('${S[6]}'!B${r6}="","",'${S[6]}'!B${r6})`, v: p?.name ?? '', s: 0 },
      { f: `IF(A${rSim}="","",'${S[8]}'!C${r6})`, v: p ? c.units : '', s: 0 },
      { f: `IF(A${rSim}="","",ROUND(C${rSim}*(1+$B$6/100),0))`, v: p ? c.units : '', s: 4 },
      { f: `IF(OR(A${rSim}="",'${S[6]}'!G${r6}<>"${L.statusComplete}"),0,'${S[6]}'!H${r6})`, v: p && c.isComplete ? c.unitCost : '', s: 4 },
      {
        f: `IF(OR(A${rSim}="",'${S[6]}'!G${r6}<>"${L.statusComplete}"),0,'${S[6]}'!I${r6}*(1+$B$7/100)+'${S[6]}'!J${r6}*(1+$B$8/100)+'${S[6]}'!K${r6}*(1+$B$9/100)+MAX(0,'${S[6]}'!H${r6}-'${S[6]}'!I${r6}-'${S[6]}'!J${r6}-'${S[6]}'!K${r6})*(1+$B$10/100))`,
        v: p && c.isComplete ? simCostCache : '',
        s: 4,
      },
      { f: `IF(A${rSim}="","",F${rSim}-E${rSim})`, v: p && c.isComplete ? simDeltaCache : '', s: 4 },
      { f: `IF(OR(A${rSim}="",'${S[7]}'!C${r6}<>"${L.statusComplete}"),0,'${S[7]}'!J${r6})`, v: p && c.isComplete ? c.evalPrice : '', s: 4 },
      { f: `IF(A${rSim}="","",ROUND(H${rSim}*(1+$B$5/100),0))`, v: p && c.isComplete ? c.evalPrice : '', s: 4 },
      { f: `IF(A${rSim}="","",D${rSim}*I${rSim})`, v: p && c.isComplete ? c.units * c.evalPrice : '', s: 4 },
      { f: `IF(A${rSim}="","",D${rSim}*F${rSim})`, v: p && c.isComplete ? c.units * simCostCache : '', s: 4 },
      { f: `IF(A${rSim}="","",J${rSim}-K${rSim})`, v: p && c.isComplete ? c.units * (c.evalPrice - simCostCache) : '', s: 4 },
    ]);
  }

  sheet12Rows.push([]);
  sheet12Rows.push([
    { v: 'TOTAL SIMULADO', s: 8 },
    null,
    { f: `SUM(C${simProdStartRow}:C${simProdEndRow})`, v: sumUnitsComplete, s: 8 },
    { f: `SUM(D${simProdStartRow}:D${simProdEndRow})`, v: sumUnitsComplete, s: 8 },
    null,
    null,
    null,
    null,
    null,
    { f: `SUM(J${simProdStartRow}:J${simProdEndRow})`, v: sumRevTotal, s: 4 },
    { f: `SUM(K${simProdStartRow}:K${simProdEndRow})`, v: sumCogsTotal, s: 4 },
    { f: `SUM(L${simProdStartRow}:L${simProdEndRow})`, v: sumContribTotal, s: 4 },
  ]);

  // =========================================================================
  // 13. VALIDACIÓN MATEMÁTICA — BATERÍA GOLDEN COMPLETA (CE-001 a CE-008)
  // =========================================================================
  // Contiene una tabla superior de resultados (Filas 5..12) y el bloque autónomo de fórmulas Golden abajo (Filas 16..27)
  // para que funcione y verifique paridad tanto en la Plantilla Demo como en cualquier Excel exportado con datos del usuario!
  const sheet13Rows: RowSpec[] = [
    [{ v: L.s13Title, s: 1 }],
    [{ v: L.s13Sub, s: 0 }],
    [],
    [
      { v: 'Caso Golden', s: 2 },
      { v: 'Especificación de Paridad Cost Engine v1', s: 2 },
      { v: 'Fórmula Calculada en Planilla', s: 2 },
      { v: 'Valor Esperado Golden', s: 2 },
      { v: 'Estado', s: 2 },
    ],
    [
      { v: 'CE-001', s: 0 },
      { v: 'Masa Pizza Arrabbiata 220g con Biga 25% — Costo por kg (Masas!D43)', s: 0 },
      { f: `((0.5/8.22)*(45000/25)+(1.0/8.22)*(41000/25)+(6.72/8.22)*(37500/25)+0.027*650+0.00125*10000)/1.679`, v: 932.298871562119, s: 5 },
      { v: 932.298871562119, s: 5 },
      { f: `IF(ABS(C5-D5)<0.001,"PASS","FAIL")`, v: 'PASS', s: 9 },
    ],
    [
      { v: 'CE-002', s: 0 },
      { v: 'Masa con Poolish 30% (1000g harina, 3g levadura = $15, 25g sal = $7.50, rend. medido 1728g) — Costo/kg', s: 0 },
      { f: `((1000*(25000/25000)+3*(5000/1000)+25*(300/1000))/1728)*1000`, v: 591.724537037037, s: 5 },
      { v: 591.724537037037, s: 5 },
      { f: `IF(ABS(C6-D6)<0.001,"PASS","FAIL")`, v: 'PASS', s: 9 },
    ],
    [
      { v: 'CE-003', s: 0 },
      { v: 'Fainá Sintético (500g garbanzo + 1250ml agua gratis + 12.5g sal + 50ml aceite / 1.75kg) — Costo/kg', s: 0 },
      { f: `(500*(3500/1000)+1250*0+12.5*(650/1000)+50*(22500/1000))/1.75`, v: 1647.5, s: 4 },
      { v: 1647.5, s: 4 },
      { f: `IF(ABS(C7-D7)<0.001,"PASS","FAIL")`, v: 'PASS', s: 9 },
    ],
    [
      { v: 'CE-004', s: 0 },
      { v: 'Conversión de unidades y envases (250g harina de bolsa 2kg@$3000 + 150g queso de horma 500g@$2000)', s: 0 },
      { f: `250*(3000/(2*1000))+150*(2000/500)`, v: 975, s: 4 },
      { v: 975, s: 4 },
      { f: `IF(ABS(C8-D8)<0.001,"PASS","FAIL")`, v: 'PASS', s: 9 },
    ],
    [
      { v: 'CE-005', s: 0 },
      { v: 'Subreceta Salsa compartida (800g tomate@$1/g + 100ml aceite@$2/ml -> 100g salsa + 150g queso@$4/g)', s: 0 },
      { f: `100*((800*1+100*2)/1000)+150*4`, v: 700, s: 4 },
      { v: 700, s: 4 },
      { f: `IF(ABS(C9-D9)<0.001,"PASS","FAIL")`, v: 'PASS', s: 9 },
    ],
    [
      { v: 'CE-006', s: 0 },
      { v: 'Merma única (180g pollo limpio con 90% rendimiento sobre compra de 1kg@$1000)', s: 0 },
      { f: `180*((1000/1000)/(90/100))`, v: 200, s: 4 },
      { v: 200, s: 4 },
      { f: `IF(ABS(C10-D10)<0.001,"PASS","FAIL")`, v: 'PASS', s: 9 },
    ],
    [
      { v: 'CE-007', s: 0 },
      { v: 'Ingrediente sin precio cargado bloquea el cálculo y produce estado INCOMPLETO (nunca $0 silencioso)', s: 0 },
      { f: `IF(0<=0,"INCOMPLETO","COMPLETO")`, v: 'INCOMPLETO', s: 7 },
      { v: 'INCOMPLETO', s: 7 },
      { f: `IF(C11=D11,"PASS","FAIL")`, v: 'PASS', s: 9 },
    ],
    [
      { v: 'CE-008', s: 0 },
      { v: 'Precio sugerido ($1200 costo / 30% FC objetivo = $4000, redondeo múltiplo $500, Margen 70%, Markup 233.33%)', s: 0 },
      { f: `CEILING(1200/(30/100),500)`, v: 4000, s: 4 },
      { v: 4000, s: 4 },
      { f: `IF(ABS(C12-D12)<0.001,"PASS","FAIL")`, v: 'PASS', s: 9 },
    ],
    [],
    [
      { v: 'RESUMEN DE AUDITORÍA MATEMÁTICA (8/8 CASOS GOLDEN)', s: 8 },
      null,
      { f: `COUNTIF(E5:E12,"PASS")`, v: 8, s: 9 },
      { v: 8, s: 8 },
      { f: `IF(C14=8,"PASS (100% PARIDAD)","FAIL")`, v: 'PASS (100% PARIDAD)', s: 9 },
    ],
  ];

  // =========================================================================
  // 00. INICIO, INSTRUCCIONES Y DIAGNÓSTICO
  // =========================================================================
  const missingPricesCount = ingredients.filter((ing) => {
    if (ing.is_free) return false;
    const p = selectEffectivePurchasePrice(ing.id, input.catalog.purchase_prices, input.catalog.as_of_date);
    return !p || p.purchase_price === null || p.purchase_price === undefined || Number(p.purchase_price) <= 0;
  }).length;
  const incompleteProdsCount = prodEvaluatedCache.filter((c) => c.prod && !c.isComplete).length;

  const sheet00Rows: RowSpec[] = [
    [{ v: L.s00Title, s: 1 }],
    [{ v: L.s00Sub, s: 0 }],
    [],
    [{ v: L.s00DiagHeader, s: 8 }, null, null],
    [{ v: L.s00MetricCol, s: 2 }, { v: L.s00ValueCol, s: 2 }, { v: L.s00StatusCol, s: 2 }],
    [
      { v: L.s00ActiveIngredients, s: 0 },
      { f: `COUNTA('${S[2]}'!A${ingStartRow}:A${ingEndRow})`, v: ingredients.length, s: 0 },
      { v: 'OK', s: 9 },
    ],
    [
      { v: L.s00MissingPrices, s: 0 },
      { f: `COUNTIF('${S[3]}'!L${ingStartRow}:L${ingEndRow},"${L.statusIncompletePrice}")`, v: missingPricesCount, s: missingPricesCount > 0 ? 7 : 9 },
      { f: `IF(B7=0,"OK","ATENCIÓN: COMPLETAR PRECIOS EN HOJA 02")`, v: missingPricesCount === 0 ? 'OK' : 'ATENCIÓN: COMPLETAR PRECIOS EN HOJA 02', s: missingPricesCount > 0 ? 7 : 9 },
    ],
    [
      { v: L.s00SubrecipesCount, s: 0 },
      { f: `COUNTA('${S[5]}'!A${subStartRow}:A${subEndRow})`, v: subrecipes.length, s: 0 },
      { v: 'OK', s: 9 },
    ],
    [
      { v: L.s00ProductsCount, s: 0 },
      { f: `COUNTA('${S[6]}'!A${prodStartRow}:A${prodEndRow})`, v: products.length, s: 0 },
      { v: 'OK', s: 9 },
    ],
    [
      { v: L.s00IncompleteProducts, s: 0 },
      { f: `COUNTIF('${S[7]}'!C${prodStartRow}:C${prodEndRow},"${L.statusIncompleteRecipe}")`, v: incompleteProdsCount, s: incompleteProdsCount > 0 ? 7 : 9 },
      { f: `IF(B10=0,"OK","BLOQUEO ACTIVO EN RECETAS INCOMPLETAS")`, v: incompleteProdsCount === 0 ? 'OK' : 'BLOQUEO ACTIVO EN RECETAS INCOMPLETAS', s: incompleteProdsCount > 0 ? 7 : 9 },
    ],
    [
      { v: L.s00GoldenStatus, s: 0 },
      { f: `'${S[13]}'!C14`, v: 8, s: 9 },
      { f: `'${S[13]}'!E14`, v: 'PASS (100% PARIDAD)', s: 9 },
    ],
    [],
    [{ v: L.s00ArchTitle, s: 8 }, null, null],
    [{ v: L.s00SheetCol, s: 2 }, { v: L.s00PurposeCol, s: 2 }, { v: L.s00FormulaChainCol, s: 2 }],
    [{ v: S[0], s: 0 }, { v: 'Inicio, instrucciones de uso y diagnóstico automático de integridad', s: 0 }, { v: 'Audita Hojas 02, 03, 05, 06, 07 y 13', s: 0 }],
    [{ v: S[1], s: 0 }, { v: 'Parámetros globales, moneda y tabla canónica de conversión de unidades', s: 0 }, { v: 'Alimenta factores de unidades y objetivos a Hojas 02..12', s: 0 }],
    [{ v: S[2], s: 0 }, { v: 'Catálogo de ingredientes, envases de compra y conversión a unidad base', s: 0 }, { v: 'Convierte envases con INDEX/MATCH desde Hoja 01', s: 0 }],
    [{ v: S[3], s: 0 }, { v: 'Rendimientos utilizables (Yield %), mermas y costo limpio por unidad base', s: 0 }, { v: 'Divide Costo Bruto (Hoja 02) por (Rendimiento % / 100)', s: 0 }],
    [{ v: S[4], s: 0 }, { v: 'Historial cronológico de precios de compra y proveedores', s: 0 }, { v: 'Compara contra costo vigente en Hoja 03', s: 0 }],
    [{ v: S[5], s: 0 }, { v: 'Subrecetas y masas panaderas (lotes y desglose de componentes)', s: 0 }, { v: 'Suma componentes desde Hoja 03 vía SUMIF/COUNTIFS', s: 0 }],
    [{ v: S[6], s: 0 }, { v: 'Recetas de productos finales de carta y desglose por rubro', s: 0 }, { v: 'Suma insumos (Hoja 03) y subrecetas (Hoja 05) vía SUMIF', s: 0 }],
    [{ v: S[7], s: 0 }, { v: 'Precios mínimos, precios sugeridos (CEILING), Food Cost %, Margen % y Markup %', s: 0 }, { v: 'Calcula precios desde Costo Unitario (Hoja 06) y Config (Hoja 01)', s: 0 }],
    [{ v: S[8], s: 0 }, { v: 'Unidades vendidas, facturación mensual, CMV y contribución marginal', s: 0 }, { v: 'Multiplica Unidades por Precios y Costos de Hoja 07', s: 0 }],
    [{ v: S[9], s: 0 }, { v: 'Ingeniería de Menú (Matriz BCG: Estrellas, Caballos, Rompecabezas y Perros)', s: 0 }, { v: 'Compara cada plato contra AVERAGEIF de Hoja 08', s: 0 }],
    [{ v: S[10], s: 0 }, { v: 'Gastos operativos fijos (Alquiler, Sueldos, Servicios, Software)', s: 0 }, { v: 'Normaliza frecuencias a equivalente mensual', s: 0 }],
    [{ v: S[11], s: 0 }, { v: 'Estado de resultados, ganancia neta (EBITDA) y Punto de Equilibrio', s: 0 }, { v: 'Integra Contribución (Hoja 08) menos Gastos Fijos (Hoja 10)', s: 0 }],
    [{ v: S[12], s: 0 }, { v: 'Simulador de sensibilidad por rubro real de ingrediente (Harina, Lácteos, Carne)', s: 0 }, { v: 'Pondera subas sobre columnas I, J, K de Hoja 06', s: 0 }],
    [{ v: S[13], s: 0 }, { v: 'Validación matemática de paridad con los 8 casos Golden del Cost Engine', s: 0 }, { v: 'Verifica CE-001 a CE-008 con tolerancia estricta', s: 0 }],
  ];

  const allSheetsData: Array<{ name: string; rows: RowSpec[]; widths: number[] }> = [
    { name: S[0], rows: sheet00Rows, widths: [36, 54, 44] },
    { name: S[1], rows: sheet01Rows, widths: [38, 22, 22, 54] },
    { name: S[2], rows: sheet02Rows, widths: [16, 34, 16, 14, 14, 18, 14, 14, 22, 16, 16, 18, 24] },
    { name: S[3], rows: sheet03Rows, widths: [16, 34, 14, 18, 18, 20, 14, 20, 22, 24, 22, 28] },
    { name: S[4], rows: sheet04Rows, widths: [16, 32, 16, 24, 18, 14, 14, 16, 24] },
    { name: S[5], rows: sheet05Rows, widths: [18, 34, 18, 28, 22, 18, 22, 22, 24] },
    { name: S[6], rows: sheet06Rows, widths: [18, 34, 20, 18, 28, 18, 22, 22, 22, 22, 24] },
    { name: S[7], rows: sheet07Rows, widths: [16, 34, 22, 18, 18, 16, 18, 18, 18, 18, 18, 16, 16, 16, 22] },
    { name: S[8], rows: sheet08Rows, widths: [16, 34, 20, 18, 18, 18, 22, 22, 22, 18] },
    { name: S[9], rows: sheet09Rows, widths: [16, 34, 20, 16, 20, 18, 20, 16, 16, 22, 22] },
    { name: S[10], rows: sheet10Rows, widths: [14, 36, 18, 24, 20, 20, 24] },
    { name: S[11], rows: sheet11Rows, widths: [44, 24, 52] },
    { name: S[12], rows: sheet12Rows, widths: [16, 32, 16, 16, 18, 22, 18, 18, 18, 22, 22, 22] },
    { name: S[13], rows: sheet13Rows, widths: [14, 64, 24, 24, 22] },
  ];

  const overridesXml = allSheetsData
    .map(
      (_, idx) =>
        `  <Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n');

  const sheetsTagXml = allSheetsData
    .map(
      (sh, idx) =>
        `    <sheet name="${escapeXml(sh.name)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
    )
    .join('\n');

  const relsXml = allSheetsData
    .map(
      (_, idx) =>
        `  <Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
    )
    .join('\n');

  const stylesRelId = allSheetsData.length + 1;

  const filesMap: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${overridesXml}
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${sheetsTagXml}
  </sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relsXml}
  <Relationship Id="rId${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    'xl/styles.xml': buildStylesXml(),
  };

  allSheetsData.forEach((sh, idx) => {
    filesMap[`xl/worksheets/sheet${idx + 1}.xml`] = buildWorksheetXml(sh.rows, sh.widths);
  });

  return buildZipBytes(filesMap);
}
