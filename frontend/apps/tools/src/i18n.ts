import type { LocaleCode } from './demoData';

export interface AuthDictionary {
  kicker: string;
  titleLogin: string;
  leadLogin: string;
  emailOrUser: string;
  password: string;
  signInBtn: string;
  signingInBtn: string;
  forgotLink: string;
  noAccountHint: string;
  demoBtn: string;
  plansBtn: string;
  titleActivate: string;
  leadActivate: string;
  titleReset: string;
  leadReset: string;
  newPassword: string;
  confirmPassword: string;
  activateBtn: string;
  resetSaveBtn: string;
  savingBtn: string;
  backToLogin: string;
  titleForgot: string;
  leadForgot: string;
  emailLabel: string;
  sendResetBtn: string;
  sendingBtn: string;
  forgotSentNotice: string;
  errPassMinLen: string;
  errPassMismatch: string;
  errLoadWorkspaceTitle: string;
  errLoadWorkspaceDesc: string;
  retryBtn: string;
  retryingBtn: string;
  signOutBtn: string;
  verifyingAccess: string;
  errInvalidSession: string;
  errVerifySession: string;
  errLoginFailed: string;
  errGeneric: string;
  recoveryKicker: string;
  recoveryTitle: string;
  recoveryDesc: string;
  recoveryRetry: string;
  recoveryDownload: string;
  recoveryReset: string;
  stagingBadge: string;
}

export const AUTH_I18N: Record<LocaleCode, AuthDictionary> = {
  'es-AR': {
    kicker: 'PIZZALOG / TOOLS',
    titleLogin: 'Restaurant Profit Kit',
    leadLogin: 'Ingresá con la cuenta que recibiste al adquirir el producto o vinculá tu usuario de Pizzalog App.',
    emailOrUser: 'Email o Usuario',
    password: 'Contraseña',
    signInBtn: 'Ingresar a mis herramientas',
    signingInBtn: 'Ingresando…',
    forgotLink: '¿Olvidaste tu contraseña?',
    noAccountHint: '¿Todavía no tenés cuenta? Podés probar la demo interactiva en vivo o suscribirte para acceso permanente.',
    demoBtn: '🚀 Explorar Demo en Vivo (Sin Registro)',
    plansBtn: '✨ Ver Planes, Precios y Medios de Pago',
    titleActivate: '¡Bienvenido! Creá tu contraseña',
    leadActivate: 'Definí la contraseña para acceder a tu Restaurant Profit Kit.',
    titleReset: 'Restablecer contraseña',
    leadReset: 'Ingresá tu nueva contraseña para volver a acceder a tu cuenta.',
    newPassword: 'Nueva Contraseña (mínimo 8 caracteres)',
    confirmPassword: 'Confirmar Contraseña',
    activateBtn: 'Activar cuenta y acceder',
    resetSaveBtn: 'Guardar nueva contraseña',
    savingBtn: 'Guardando…',
    backToLogin: '← Volver al inicio de sesión',
    titleForgot: 'Recuperar Contraseña',
    leadForgot: 'Ingresá tu email registrado y te enviaremos un enlace seguro para restablecer tu contraseña.',
    emailLabel: 'Email',
    sendResetBtn: 'Enviar enlace de recuperación',
    sendingBtn: 'Enviando…',
    forgotSentNotice: 'Si el correo corresponde a una cuenta activa, te enviamos un enlace para restablecer tu contraseña.',
    errPassMinLen: 'La contraseña debe tener al menos 8 caracteres',
    errPassMismatch: 'Las contraseñas no coinciden',
    errLoadWorkspaceTitle: 'No pudimos cargar tu espacio de trabajo',
    errLoadWorkspaceDesc: 'Tu sesión sigue activa y no se reemplazaron tus datos guardados.',
    retryBtn: 'Reintentar',
    retryingBtn: 'Reintentando…',
    signOutBtn: 'Cerrar sesión',
    verifyingAccess: 'Verificando acceso…',
    errInvalidSession: 'La sesión ya no es válida. Ingresá nuevamente.',
    errVerifySession: 'No se pudo verificar la sesión guardada',
    errLoginFailed: 'No se pudo iniciar sesión',
    errGeneric: 'No se pudo procesar la solicitud',
    recoveryKicker: 'PIZZALOG / TOOLS — RECUPERACIÓN',
    recoveryTitle: 'Se detectó un problema al mostrar el espacio de trabajo',
    recoveryDesc: 'Tus datos siguen guardados. Podés descargar un respaldo JSON, reintentar o cerrar sesión.',
    recoveryRetry: '🔄 Reintentar carga',
    recoveryDownload: '💾 Descargar respaldo JSON',
    recoveryReset: '🧪 Restaurar espacio de trabajo base',
    stagingBadge: 'STAGING',
  },
  'pt-BR': {
    kicker: 'PIZZALOG / TOOLS',
    titleLogin: 'Restaurant Profit Kit',
    leadLogin: 'Entre com a conta recebida na compra ou vincule seu usuário administrador do Pizzalog App.',
    emailOrUser: 'E-mail ou Usuário',
    password: 'Senha',
    signInBtn: 'Entrar nas minhas ferramentas',
    signingInBtn: 'Entrando…',
    forgotLink: 'Esqueceu sua senha?',
    noAccountHint: 'Ainda não tem conta? Você pode testar a demo interativa ao vivo ou assinar para acesso permanente.',
    demoBtn: '🚀 Explorar Demo ao Vivo (Sem Cadastro)',
    plansBtn: '✨ Ver Planos, Preços e Formas de Pagamento',
    titleActivate: 'Bem-vindo! Crie sua senha',
    leadActivate: 'Defina a senha para acessar o seu Restaurant Profit Kit.',
    titleReset: 'Redefinir senha',
    leadReset: 'Informe sua nova senha para voltar a acessar sua conta.',
    newPassword: 'Nova Senha (mínimo 8 caracteres)',
    confirmPassword: 'Confirmar Senha',
    activateBtn: 'Ativar conta e acessar',
    resetSaveBtn: 'Salvar nova senha',
    savingBtn: 'Salvando…',
    backToLogin: '← Voltar para o login',
    titleForgot: 'Recuperar Senha',
    leadForgot: 'Informe seu e-mail cadastrado e enviaremos um link seguro para redefinir sua senha.',
    emailLabel: 'E-mail',
    sendResetBtn: 'Enviar link de recuperação',
    sendingBtn: 'Enviando…',
    forgotSentNotice: 'Se o e-mail corresponder a uma conta ativa, enviamos um link para redefinir sua senha.',
    errPassMinLen: 'A senha deve ter pelo menos 8 caracteres',
    errPassMismatch: 'As senhas não coincidem',
    errLoadWorkspaceTitle: 'Não foi possível carregar seu espaço de trabalho',
    errLoadWorkspaceDesc: 'Sua sessão continua ativa e seus dados salvos não foram substituídos.',
    retryBtn: 'Tentar novamente',
    retryingBtn: 'Tentando…',
    signOutBtn: 'Sair',
    verifyingAccess: 'Verificando acesso…',
    errInvalidSession: 'Sua sessão expirou ou é inválida. Entre novamente.',
    errVerifySession: 'Não foi possível verificar a sessão salva',
    errLoginFailed: 'Não foi possível entrar',
    errGeneric: 'Não foi possível processar a solicitação',
    recoveryKicker: 'PIZZALOG / TOOLS — RECUPERAÇÃO',
    recoveryTitle: 'Ocorreu um problema ao exibir o espaço de trabalho',
    recoveryDesc: 'Seus dados continuam salvos. Você pode baixar um backup JSON, tentar novamente ou sair.',
    recoveryRetry: '🔄 Recarregar',
    recoveryDownload: '💾 Baixar backup JSON',
    recoveryReset: '🧪 Restaurar espaço de trabalho base',
    stagingBadge: 'STAGING',
  },
  en: {
    kicker: 'PIZZALOG / TOOLS',
    titleLogin: 'Restaurant Profit Kit',
    leadLogin: 'Sign in with the account from your purchase or link your Pizzalog App admin user.',
    emailOrUser: 'Email or Username',
    password: 'Password',
    signInBtn: 'Sign in to my tools',
    signingInBtn: 'Signing in…',
    forgotLink: 'Forgot your password?',
    noAccountHint: 'No account yet? Try the live interactive demo or subscribe for permanent cloud access.',
    demoBtn: '🚀 Explore Live Demo (No Sign-Up)',
    plansBtn: '✨ View Plans, Pricing & Payment Options',
    titleActivate: 'Welcome! Create your password',
    leadActivate: 'Set the password for your Restaurant Profit Kit account.',
    titleReset: 'Reset password',
    leadReset: 'Enter a new password to regain access to your account.',
    newPassword: 'New Password (minimum 8 characters)',
    confirmPassword: 'Confirm Password',
    activateBtn: 'Activate account & enter',
    resetSaveBtn: 'Save new password',
    savingBtn: 'Saving…',
    backToLogin: '← Back to sign in',
    titleForgot: 'Password Recovery',
    leadForgot: 'Enter your registered email and we will send you a secure reset link.',
    emailLabel: 'Email',
    sendResetBtn: 'Send recovery link',
    sendingBtn: 'Sending…',
    forgotSentNotice: 'If that email matches an active account, we sent you a password reset link.',
    errPassMinLen: 'Password must be at least 8 characters long',
    errPassMismatch: 'Passwords do not match',
    errLoadWorkspaceTitle: 'Could not load your workspace',
    errLoadWorkspaceDesc: 'Your session is still active and your saved data was preserved.',
    retryBtn: 'Retry',
    retryingBtn: 'Retrying…',
    signOutBtn: 'Sign out',
    verifyingAccess: 'Verifying access…',
    errInvalidSession: 'Session is no longer valid. Please sign in again.',
    errVerifySession: 'Could not verify the saved session',
    errLoginFailed: 'Sign in failed',
    errGeneric: 'Could not process the request',
    recoveryKicker: 'PIZZALOG / TOOLS — RECOVERY',
    recoveryTitle: 'An issue occurred displaying your workspace',
    recoveryDesc: 'Your data is still safe. You can download a JSON backup, retry, or sign out.',
    recoveryRetry: '🔄 Reload workspace',
    recoveryDownload: '💾 Download JSON backup',
    recoveryReset: '🧪 Restore base workspace',
    stagingBadge: 'STAGING',
  },
};

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
  unitSystemLabel: string;
  unitSystemMetric: string;
  unitSystemUs: string;
  targetFoodCostLabel: string;
  priceRoundingLabel: string;
  packagingDeliveryLabel: string;
  appDeliveryFeeLabel: string;
  currencyLockedHint: string;
  fxRatesBtn: string;
  guestBannerTitle: string;
  guestBannerDesc: string;
  guestBannerPlansBtn: string;
  guestBannerExitBtn: string;
  demoBannerTitle: string;
  demoBannerDesc: string;
  demoBannerClearBtn: string;
  emptyOnboardingTitle: string;
  emptyOnboardingDesc: string;
  emptyOnboardingStep1: string;
  emptyOnboardingStep2: string;
  emptyOnboardingStep3: string;
  emptyOnboardingStep4: string;
  // Common tokens
  closeBtn: string;
  cancelBtn: string;
  saveBtn: string;
  deleteTitle: string;
  noDataTag: string;
  incompleteTag: string;
  noRecipeTag: string;
  blockedTag: string;
  conflictTitle: string;
  downloadBackupJsonBtn: string;
  reloadServerBtn: string;
  restoreDemoBtn: string;
  // Ingredients Tab
  ingTitle: string;
  ingLead: string;
  ingPriceListBtn: string;
  ingNewBtn: string;
  ingColName: string;
  ingColDimBase: string;
  ingColDensity: string;
  ingColUnitWeight: string;
  ingColPrice: string;
  ingColPackQty: string;
  ingColPackUnit: string;
  ingColYield: string;
  ingColUsableUnit: string;
  ingColRefUnit: string;
  ingColRefUnitUs: string;
  ingColStatus: string;
  ingColHistory: string;
  ingFreeExplicit: string;
  ingCheckCurrencyUnit: string;
  ingNoPricePlaceholder: string;
  ingOptionalPlaceholder: string;
  ingEmptyState: string;
  ingHistoryBtn: string;
  ingHistoryTitle: string;
  ingHistoryLead: string;
  ingHistoryAddBtn: string;
  ingHistoryDate: string;
  ingHistorySupplier: string;
  ingHistoryPrice: string;
  ingHistoryPack: string;
  ingHistoryYield: string;
  ingHistoryActiveBadge: string;
  ingHistoryEmpty: string;
  // Exchange Rates Modal
  fxModalTitle: string;
  fxModalLead: string;
  fxFromCurrency: string;
  fxToCurrency: string;
  fxRate: string;
  fxEffectiveDate: string;
  fxAddBtn: string;
  // Subrecipes Tab
  subTitle: string;
  subLead: string;
  subNewDoughBtn: string;
  subNewSubrecipeBtn: string;
  subColName: string;
  subColCalcType: string;
  subColYield: string;
  subColBatchCost: string;
  subColUnitCost: string;
  subColCostPerKg: string;
  subColStatus: string;
  subColActions: string;
  subEditBtn: string;
  subEmptyState: string;
  // Recipes Tab
  recTitle: string;
  recLead: string;
  recNewBtn: string;
  recColProduct: string;
  recColMatrix: string;
  recColCost: string;
  recColSuggested: string;
  recColMenuPrice: string;
  recColFcPct: string;
  recColUnitMargin: string;
  recColMarginPct: string;
  recColMarkupPct: string;
  recColUnitsMonth: string;
  recColContribMonth: string;
  recColActions: string;
  recEditRecipeBtn: string;
  recUseSuggestedBtn: string;
  recNoRecipeHint: string;
  recMissingPriceLabel: string;
  recPartialLabel: string;
  recSuggestedPlaceholder: string;
  recEmptyState: string;
  recKpiTotalUnits: string;
  recKpiRevenue: string;
  recKpiContribution: string;
  recKpiNetResult: string;
  recKpiNetHintMissing: string;
  // Expenses Tab
  expTitle: string;
  expLead: string;
  expAddBtn: string;
  expColName: string;
  expColCategory: string;
  expColPeriod: string;
  expColAmount: string;
  expCatRent: string;
  expCatPayroll: string;
  expCatUtilities: string;
  expCatSoftware: string;
  expCatTaxes: string;
  expCatOther: string;
  expPeriodMonthly: string;
  expPeriodWeekly: string;
  expPeriodYearly: string;
  expEmptyState: string;
  expKpiTotalFixed: string;
  expKpiContrib: string;
  expKpiBreakEven: string;
  expKpiNetResult: string;
  // Sales Tab
  salesTitle: string;
  salesLead: string;
  salesManualTitle: string;
  salesAddBtn: string;
  salesColPosProduct: string;
  salesColLinkedProduct: string;
  salesColUnits: string;
  salesColPeriod: string;
  salesColChannel: string;
  salesColGrossRev: string;
  salesColNetRev: string;
  salesColSource: string;
  salesPendingLink: string;
  salesEmptyState: string;
  salesManualSourceLabel: string;
  // Snapshots Tab
  snapTitle: string;
  snapLead: string;
  snapEmpty: string;
  snapColDate: string;
  snapColRecipe: string;
  snapColHash: string;
  snapColStatus: string;
  snapColUnitCost: string;
  snapColSuggestedPrice: string;
  // Recipe Simulator Tab
  recSimTitle: string;
  recSimLead: string;
  recSimSelectLabel: string;
  recSimSelectPlaceholder: string;
  recSimBatchesLabel: string;
  recSimEmpty: string;
  recSimIncompleteErr: string;
  recSimHydrationLabel: string;
  recSimHydrationHint: string;
  recSimColComponent: string;
  recSimColOrigQty: string;
  recSimColVarPct: string;
  recSimOrigBatch: string;
  recSimSimBatch: string;
  recSimTotalProd: string;
  recSimEstYield: string;
  // Cost History Tab
  histTitle: string;
  histLead: string;
  histHelpBtn: string;
  histEmpty: string;
  histSelectProduct: string;
  histNoProductSnaps: string;
  histStaleTitle: string;
  histSaveUpdatedSnapBtn: string;
  histFirstCost: string;
  histLastCost: string;
  histAccumVar: string;
  histLastFc: string;
  histUnitContribLabel: string;
  histChartTitle: string;
  histBaseline: string;
  histColDate: string;
  histColUnitCost: string;
  histColEvalPrice: string;
  histColFcPct: string;
  histColMargin: string;
  histColVarPrev: string;
  histColStatus: string;
  // Menu Engineering Tab
  menuTitle: string;
  menuLead: string;
  menuHelpBtn: string;
  menuPeriodLabel: string;
  menuAllPeriods: string;
  menuMonthlySuffix: string;
  menuChannelLabel: string;
  menuAllChannels: string;
  menuCompareCheck: string;
  menuCompareSelectLabel: string;
  menuComparePlaceholder: string;
  menuNoSalesEmpty: string;
  menuIncompleteWarnSuffix: string;
  menuIncompleteWarnDesc: string;
  menuGoToRecipesBtn: string;
  menuPuzzleTitle: string;
  menuPuzzleBadge: string;
  menuPuzzleTip: string;
  menuStarTitle: string;
  menuStarBadge: string;
  menuStarTip: string;
  menuDogTitle: string;
  menuDogBadge: string;
  menuDogTip: string;
  menuHorseTitle: string;
  menuHorseBadge: string;
  menuHorseTip: string;
  menuEmptyQuadrant: string;
  menuColStrategy: string;
  // Production Calculator Tab
  prodTitle: string;
  prodLead: string;
  prodEmpty: string;
  prodColToProduce: string;
  prodColYield: string;
  prodColCostState: string;
  prodValidated: string;
  prodCheckRecipe: string;
  prodColIngredient: string;
  prodColTotalQty: string;
  prodColBaseUnit: string;
  prodNoExplosionEmpty: string;
  // Profit Simulator Tab
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
  simEmptyCompleteRows: string;
  simUnitLinkProduct: string;
  simUnitManualOption: string;
  simUnitUnitsMonth: string;
  simUnitPriceLabel: string;
  simUnitVarCostLabel: string;
  simUnitFixedLabel: string;
  simUnitLoadBtn: string;
  simUnitCannotLinkHint: string;
  // Recipe Builder Modal
  builderDoughTitle: string;
  builderProductTitle: string;
  builderSubrecipeTitle: string;
  builderNameLabel: string;
  builderYieldLabel: string;
  builderYieldUnitLabel: string;
  builderComponentsHeading: string;
  builderAddCompBtn: string;
  builderTypeIngredient: string;
  builderTypeSubrecipe: string;
  builderNoSubrecipesOption: string;
  builderValidateSaveBtn: string;
  builderLiveCostLabel: string;
  builderErrNameRequired: string;
  builderErrFlourSum: string;
  builderErrMeasuredYield: string;
  builderErrNoComponents: string;
  // Clear Demo Modal
  clearDemoTitle: string;
  clearDemoDesc1: string;
  clearDemoDesc2: string;
  clearDemoConfirmBtn: string;
  // Smart Import Modal
  impReviewTitle: string;
  impLocalModeLabel: string;
  impSheetKindLabel: string;
  impHeaderRowLabel: string;
  impModeTitle: string;
  impModeMergeTitle: string;
  impModeMergeDesc: string;
  impModeReplaceTitle: string;
  impModeReplaceDesc: string;
  impReplaceConfirmCheck: string;
  impConfirmBtn: string;
  // Sync Tab
  syncTitle: string;
  syncLead: string;
  syncLinkedBadge: string;
  syncUnlinkBtn: string;
  syncLinkCardTitle: string;
  syncLinkCardLead: string;
  syncLinkEmailLabel: string;
  syncLinkPassLabel: string;
  syncLinkSubmitBtn: string;
  syncPreviewBtn: string;
  syncExportTitle: string;
  syncImportTitle: string;
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
    tabSales: 'Ventas',
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
    unitSystemLabel: 'Sistema de Unidades',
    unitSystemMetric: 'Métrico (g, kg, ml, L)',
    unitSystemUs: 'US Customary (oz, lb, fl oz, gal)',
    targetFoodCostLabel: 'Food Cost Objetivo (%)',
    priceRoundingLabel: 'Redondeo Precio',
    packagingDeliveryLabel: 'Packaging Delivery',
    appDeliveryFeeLabel: 'Comisión App Delivery (%)',
    currencyLockedHint: 'Para evitar reinterpretar importes, la moneda principal queda fijada cuando hay precios, recetas o gastos. Usá Tipos de Cambio si combinás monedas.',
    fxRatesBtn: '💱 Tipos de cambio',
    guestBannerTitle: 'Estás probando la Demo Interactiva en vivo (Modo Invitado)',
    guestBannerDesc: 'Podés editar recetas, probar el simulador de rentabilidad y la matriz BCG. Los cambios se guardan localmente en tu navegador.',
    guestBannerPlansBtn: '✨ Ver Planes & Suscribirme',
    guestBannerExitBtn: 'Iniciar sesión / Salir',
    demoBannerTitle: 'Estás explorando los datos de ejemplo de «Pizzería Demo — Il Forno»',
    demoBannerDesc: 'Podés experimentar libremente con recetas, simulaciones y precios. Cuando quieras empezar con tu restaurante real, limpiá el catálogo con un clic.',
    demoBannerClearBtn: '🗑️ Limpiar datos para empezar',
    emptyOnboardingTitle: '🧭 Primeros pasos para costear tu restaurante desde cero',
    emptyOnboardingDesc: 'Seguí estos 4 pasos en orden o importá una planilla Excel/CSV existente:',
    emptyOnboardingStep1: '1. Cargá tus insumos y precios de compra reales',
    emptyOnboardingStep2: '2. Armá masas o subrecetas reutilizables (opcional)',
    emptyOnboardingStep3: '3. Creá tus productos de carta para obtener costo y precio sugerido',
    emptyOnboardingStep4: '4. Registrá tus gastos fijos y ventas mensuales para ver ganancia neta',
    closeBtn: 'Cerrar',
    cancelBtn: 'Cancelar',
    saveBtn: 'Guardar',
    deleteTitle: 'Eliminar',
    noDataTag: 'Sin datos',
    incompleteTag: 'INCOMPLETO',
    noRecipeTag: 'SIN RECETA',
    blockedTag: 'BLOQUEADO',
    conflictTitle: '⚠️ Conflicto de versión detectado:',
    downloadBackupJsonBtn: '💾 Descargar respaldo local (.json)',
    reloadServerBtn: '🔄 Recargar versión del servidor',
    restoreDemoBtn: '🔄 Restaurar demo',
    ingTitle: 'Catálogo de Insumos, Presentaciones y Rendimiento Utilizable (Merma)',
    ingLead: 'La merma se aplica una única vez como rendimiento utilizable. Si falta el precio de compra, el insumo se marca INCOMPLETO (nunca $0 silencioso).',
    ingPriceListBtn: '📋 Actualizar por lista de proveedor',
    ingNewBtn: '+ Nuevo Insumo',
    ingColName: 'Ingrediente',
    ingColDimBase: 'Dimensión / Base',
    ingColDensity: 'Densidad (g/ml)',
    ingColUnitWeight: 'Peso/Unidad (g)',
    ingColPrice: 'Precio Compra',
    ingColPackQty: 'Cant. Envase',
    ingColPackUnit: 'Unidad Envase',
    ingColYield: 'Rendimiento (%)',
    ingColUsableUnit: 'Costo Utilizable / Base',
    ingColRefUnit: 'Costo por kg / L',
    ingColRefUnitUs: 'Costo ref. (lb / fl oz)',
    ingColStatus: 'Estado',
    ingColHistory: 'Historial',
    ingFreeExplicit: 'Gratis Explícito',
    ingCheckCurrencyUnit: 'Revisar moneda/unidad',
    ingNoPricePlaceholder: 'Sin precio',
    ingOptionalPlaceholder: 'Opcional',
    ingEmptyState: 'Todavía no cargaste insumos. Creá tu primer ingrediente manualmente o importá un archivo XLSX/CSV.',
    ingHistoryBtn: '🕒 Historial',
    ingHistoryTitle: 'Historial de Precios del Insumo',
    ingHistoryLead: 'Agregá nuevas compras con fecha y proveedor sin perder los registros históricos usados en snapshots anteriores.',
    ingHistoryAddBtn: '+ Registrar nuevo precio',
    ingHistoryDate: 'Fecha de compra',
    ingHistorySupplier: 'Proveedor',
    ingHistoryPrice: 'Precio pagado',
    ingHistoryPack: 'Envase',
    ingHistoryYield: 'Rend. %',
    ingHistoryActiveBadge: 'VIGENTE',
    ingHistoryEmpty: 'Este insumo aún no tiene compras registradas.',
    fxModalTitle: 'Tipos de Cambio Explícitos',
    fxModalLead: 'El motor prohíbe conversiones implícitas entre monedas. Definí aquí la cotización explícita si tenés insumos en otra moneda (ej. USD → ARS).',
    fxFromCurrency: 'De moneda',
    fxToCurrency: 'A moneda base',
    fxRate: 'Cotización',
    fxEffectiveDate: 'Fecha vigencia',
    fxAddBtn: '+ Agregar tipo de cambio',
    subTitle: 'Masas Panaderas (Biga / Poolish) y Subrecetas Reutilizables',
    subLead: 'Creá o editá masas con porcentaje panadero o subrecetas por lote (salsas, rellenos) usando el constructor visual.',
    subNewDoughBtn: '+ Nueva Masa Panadera (Biga/Poolish)',
    subNewSubrecipeBtn: '+ Nueva Subreceta / Salsa',
    subColName: 'Subreceta',
    subColCalcType: 'Tipo de Cálculo',
    subColYield: 'Rendimiento del Batch',
    subColBatchCost: 'Costo Total Batch',
    subColUnitCost: 'Costo por Unidad Rendimiento',
    subColCostPerKg: 'Costo por kg',
    subColStatus: 'Estado',
    subColActions: 'Acciones',
    subEditBtn: '✏️ Editar',
    subEmptyState: 'Todavía no tenés masas ni subrecetas cargadas. Podés crear una fórmula panadera o una preparación por lote.',
    recTitle: 'Constructor de Recetas, Precios, Unidades Vendidas / Mes e Ingeniería de Menú',
    recLead: 'Cargá las Unidades Vendidas / Mes de cada producto para proyectar tu Contribución Marginal Mensual, clasificar platos en la Matriz de Ingeniería de Menú y calcular tu Ganancia Neta.',
    recNewBtn: '+ Nueva Receta de Producto',
    recColProduct: 'Producto',
    recColMatrix: 'Matriz Menú',
    recColCost: 'Costo Ingred.',
    recColSuggested: 'Precio Sugerido',
    recColMenuPrice: 'Precio Carta',
    recColFcPct: 'Food Cost %',
    recColUnitMargin: 'Margen Unit.',
    recColMarginPct: 'Margen %',
    recColMarkupPct: 'Markup %',
    recColUnitsMonth: 'Unidades / Mes',
    recColContribMonth: 'Contribución Mes',
    recColActions: 'Acciones',
    recEditRecipeBtn: '✏️ Receta',
    recUseSuggestedBtn: '↻ Sugerido',
    recNoRecipeHint: '📋 Sin receta cargada — hacé clic en «✏️ Receta» para asignar insumos',
    recMissingPriceLabel: '⚠️ Falta precio:',
    recPartialLabel: 'Parcial:',
    recSuggestedPlaceholder: 'Sugerido',
    recEmptyState: 'Todavía no hay productos en tu carta. Creá tu primera receta para calcular costos y precios sugeridos.',
    recKpiTotalUnits: 'Unidades Mensuales Totales',
    recKpiRevenue: 'Facturación del período',
    recKpiContribution: 'Contribución marginal del período',
    recKpiNetResult: 'Resultado operativo estimado',
    recKpiNetHintMissing: 'Requiere ventas registradas y costos completos',
    expTitle: 'Gastos Operativos Mensuales (Alquiler, Sueldos, Servicios) y Rentabilidad Neta',
    expLead: 'Los costos fijos no distorsionan el Food Cost del plato: se cubren con la Contribución Marginal Mensual generada por tus ventas.',
    expAddBtn: '+ Agregar Costo Fijo',
    expColName: 'Concepto Operativo',
    expColCategory: 'Categoría',
    expColPeriod: 'Frecuencia',
    expColAmount: 'Importe',
    expCatRent: 'Alquiler',
    expCatPayroll: 'Personal / Sueldos',
    expCatUtilities: 'Servicios (Luz/Gas/Agua)',
    expCatSoftware: 'Software / Contabilidad',
    expCatTaxes: 'Impuestos / Tasas',
    expCatOther: 'Otros Fijos',
    expPeriodMonthly: 'Mensual',
    expPeriodWeekly: 'Semanal',
    expPeriodYearly: 'Anual',
    expEmptyState: 'Todavía no registraste costos fijos operativos (alquiler, personal, servicios). Agregalos para calcular tu punto de equilibrio real.',
    expKpiTotalFixed: 'Total Costos Fijos Mensuales',
    expKpiContrib: 'Contribución Marginal (Ventas Mes)',
    expKpiBreakEven: 'Venta de equilibrio estimada',
    expKpiNetResult: 'Resultado operativo estimado',
    salesTitle: 'Historial de Ventas (Manual e Importado)',
    salesLead: 'Registrá ventas por período y canal o importalas desde tu TPV/Excel. Las filas sin coincidencia quedan pendientes de vinculación sin descartarse.',
    salesManualTitle: 'Registrar venta por período y canal',
    salesAddBtn: '+ Agregar venta al historial',
    salesColPosProduct: 'Producto del TPV',
    salesColLinkedProduct: 'Producto vinculado',
    salesColUnits: 'Unidades',
    salesColPeriod: 'Período',
    salesColChannel: 'Canal',
    salesColGrossRev: 'Venta bruta',
    salesColNetRev: 'Venta neta',
    salesColSource: 'Origen',
    salesPendingLink: 'Pendiente de vincular',
    salesEmptyState: 'Todavía no hay registros de ventas en el historial. Cargá una venta manual aquí arriba o usá «Importar XLSX / CSV».',
    salesManualSourceLabel: 'Carga manual',
    snapTitle: 'Snapshots Históricos Inmutables',
    snapLead: 'Cada snapshot congela los precios de compra, rendimientos, fórmula y hash de entrada. Cambiar precios hoy recalcula el menú actual sin sobrescribir snapshots anteriores.',
    snapEmpty: 'Aún no guardaste snapshots en esta sesión. Hacé clic en "📸 Guardar Snapshot" arriba a la derecha.',
    snapColDate: 'Fecha',
    snapColRecipe: 'Receta',
    snapColHash: 'Hash Snapshot',
    snapColStatus: 'Estado',
    snapColUnitCost: 'Costo Unitario Congelado',
    snapColSuggestedPrice: 'Precio Sugerido Congelado',
    recSimTitle: 'Simulador de recetas y costos',
    recSimLead: 'Probá cantidades de producción sin modificar la ficha guardada. El costo unitario se calcula con el Cost Engine y los precios vigentes.',
    recSimSelectLabel: 'Producto o subreceta',
    recSimSelectPlaceholder: 'Seleccionar receta',
    recSimBatchesLabel: 'Cantidad de tandas',
    recSimEmpty: 'Todavía no hay recetas para simular. Creá una receta en la pestaña correspondiente.',
    recSimIncompleteErr: 'No se puede calcular esta receta: faltan precios o componentes válidos. Revisá la ficha y los insumos.',
    recSimHydrationLabel: 'Hidratación simulada (%)',
    recSimHydrationHint: 'Recalcula la fórmula panadera completa sin modificar la receta guardada.',
    recSimColComponent: 'Componente',
    recSimColOrigQty: 'Cantidad original',
    recSimColVarPct: 'Variación simulada (%)',
    recSimOrigBatch: 'Costo original por tanda',
    recSimSimBatch: 'Costo simulado por tanda',
    recSimTotalProd: 'Costo de la producción simulada',
    recSimEstYield: 'Rendimiento total estimado',
    histTitle: 'Evolución histórica de costos y rentabilidad',
    histLead: 'Seguimiento cronológico de costos, precios y márgenes registrados en cada snapshot.',
    histHelpBtn: '❓ Ayuda sobre mermas y costos',
    histEmpty: 'Todavía no hay snapshots guardados. Tomá una captura desde «📸 Guardar Snapshot» para comenzar el registro histórico.',
    histSelectProduct: 'Seleccionar Producto',
    histNoProductSnaps: 'Este producto todavía no tiene capturas registradas. Guardá un snapshot para iniciar el seguimiento.',
    histStaleTitle: '⚠️ Costo desactualizado en el catálogo',
    histSaveUpdatedSnapBtn: '📸 Guardar nuevo snapshot con costo vigente',
    histFirstCost: 'Primer costo registrado',
    histLastCost: 'Último costo registrado',
    histAccumVar: 'Variación histórica acumulada',
    histLastFc: 'Food Cost del último snapshot',
    histUnitContribLabel: 'Margen unitario:',
    histChartTitle: 'Evolución cronológica del costo unitario',
    histBaseline: 'Línea base',
    histColDate: 'Fecha',
    histColUnitCost: 'Costo unitario',
    histColEvalPrice: 'Precio evaluado',
    histColFcPct: 'Food Cost %',
    histColMargin: 'Margen de contribución',
    histColVarPrev: 'Variación vs. anterior',
    histColStatus: 'Estado',
    menuTitle: 'Ingeniería de Menú (Matriz Kasavana & Smith / BCG)',
    menuLead: 'Análisis estratégico cruzando popularidad (volumen de ventas) y contribución marginal (ganancia por plato).',
    menuHelpBtn: '❓ ¿Cómo interpretar los cuadrantes?',
    menuPeriodLabel: 'Período de Ventas',
    menuAllPeriods: 'Todos los períodos acumulados',
    menuMonthlySuffix: '(Mensual)',
    menuChannelLabel: 'Canal de Venta',
    menuAllChannels: 'Todos los canales combinados',
    menuCompareCheck: 'Comparar con otro período',
    menuCompareSelectLabel: 'Comparar contra:',
    menuComparePlaceholder: 'Seleccionar período a comparar',
    menuNoSalesEmpty: 'No hay ventas registradas para el período y canal seleccionados. Cargá unidades en «Recetas» o registrá ventas en la pestaña «Ventas».',
    menuIncompleteWarnSuffix: 'producto(s) no clasificados por datos incompletos:',
    menuIncompleteWarnDesc: 'Estos productos tienen ventas registradas pero les falta el precio de algún insumo o su precio de venta. No son clasificados como «Perros» para no falsear tus decisiones:',
    menuGoToRecipesBtn: 'Ir a recetas',
    menuPuzzleTitle: '🧩 Rompecabezas (Puzzles)',
    menuPuzzleBadge: 'Baja popularidad · Alta contribución',
    menuPuzzleTip: '💡 Oportunidad de margen: Excelente ganancia pero baja rotación. Creá combos, promociones en días flojos o dales mayor destaque en la carta.',
    menuStarTitle: '⭐ Estrellas (Stars)',
    menuStarBadge: 'Alta popularidad · Alta contribución',
    menuStarTip: '✨ Pilares de rentabilidad: Alta rotación y excelente margen. Protegé la calidad de la receta y mantenelos como plato principal.',
    menuDogTitle: '🐕 Perros (Dogs)',
    menuDogBadge: 'Baja popularidad · Baja contribución',
    menuDogTip: '⚠️ Bajo rendimiento: Baja rotación y escaso margen. Evaluá reemplazarlos o reformular sus costos.',
    menuHorseTitle: '🐎 Caballos de Batalla (Plowhorses)',
    menuHorseBadge: 'Alta popularidad · Baja contribución',
    menuHorseTip: '💡 Oportunidad de volumen: Muy pedidos pero dejan poco margen. Ajustá precio +3% a +5% u optimizá gramajes.',
    menuEmptyQuadrant: 'Sin productos en este cuadrante',
    menuColStrategy: 'Estrategia recomendada',
    prodTitle: 'Calculadora de producción',
    prodLead: 'Indicá cuántas unidades querés producir. Se explotan subrecetas anidadas y se consolida la demanda por unidad base del catálogo.',
    prodEmpty: 'No hay productos de carta cargados.',
    prodColToProduce: 'Unidades a producir',
    prodColYield: 'Rendimiento de receta',
    prodColCostState: 'Estado del costo',
    prodValidated: 'Costo validado',
    prodCheckRecipe: 'Revisar receta / precios',
    prodColIngredient: 'Insumo requerido',
    prodColTotalQty: 'Cantidad total',
    prodColBaseUnit: 'Unidad base',
    prodNoExplosionEmpty: 'Ingresá cantidades arriba y verificá que las recetas tengan componentes y precios completos para explotar insumos.',
    simTitle: 'Simulador Estratégico de Rentabilidad y Decisiones',
    simLead: 'Proyectá el impacto real de aumentos o bajas de insumos por categoría (desglosando ingredientes y subrecetas reales en el Cost Engine), precios y volumen.',
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
    simCostDeltaLabel: 'Variación de Costo de Insumos',
    simAffectedSuppliesLabel: 'Rubro de Insumos Afectado',
    simAffectedAll: 'Todos los insumos del restaurante',
    simAffectedFlour: 'Solo Harinas, Sémolas y Masas',
    simAffectedDairy: 'Solo Lácteos y Quesos (Mozzarella, etc.)',
    simAffectedMeat: 'Solo Carnes, Pollo y Fiambres',
    simAffectedVegetables: 'Solo Vegetales, Tomate y Aceites',
    simAffectedHint: 'Aplica la variación únicamente a los insumos de este rubro y recalcula cada subreceta y receta según su proporción exacta.',
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
    simEmptyCompleteRows: 'Para simular la rentabilidad del negocio necesitás al menos una receta completa con unidades vendidas cargadas.',
    simUnitLinkProduct: 'Vincular producto del catálogo',
    simUnitManualOption: 'Escenario manual',
    simUnitUnitsMonth: 'Unidades por mes',
    simUnitPriceLabel: 'Precio de venta unitario',
    simUnitVarCostLabel: 'Costo variable unitario',
    simUnitFixedLabel: 'Gastos fijos mensuales',
    simUnitLoadBtn: 'Cargar precio, costo y gastos fijos del catálogo',
    simUnitCannotLinkHint: 'Para vincularlo necesitás costo completo y precio de venta cargado en el catálogo.',
    builderDoughTitle: '🥣 Constructor Panadero (Biga / Poolish / Hidratación)',
    builderProductTitle: '🍕 Constructor Visual de Receta de Producto',
    builderSubrecipeTitle: '🥫 Constructor Visual de Subreceta',
    builderNameLabel: 'Nombre',
    builderYieldLabel: 'Rendimiento (Yield)',
    builderYieldUnitLabel: 'Unidad de Rendimiento',
    builderComponentsHeading: 'Componentes de la Receta (Insumos y Subrecetas)',
    builderAddCompBtn: '+ Agregar Componente',
    builderTypeIngredient: 'Insumo',
    builderTypeSubrecipe: 'Subreceta',
    builderNoSubrecipesOption: '— Primero creá una subreceta en la pestaña 2 —',
    builderValidateSaveBtn: '💾 Validar y Guardar Receta',
    builderLiveCostLabel: 'Costo estimado en vivo:',
    builderErrNameRequired: 'El nombre de la receta es obligatorio.',
    builderErrFlourSum: 'La mezcla de harinas debe sumar 100%',
    builderErrMeasuredYield: 'Indicá un rendimiento medido mayor a cero.',
    builderErrNoComponents: 'Agregá al menos un componente a la receta.',
    clearDemoTitle: '⚠️ ¿Limpiar datos de demostración?',
    clearDemoDesc1: 'Esta acción vaciará las recetas, insumos, gastos y ventas de ejemplo, dejándote un espacio en blanco listo para tu restaurante.',
    clearDemoDesc2: 'Se conservarán tu moneda, idioma y parámetros globales. Podés restaurar la demo cuando quieras.',
    clearDemoConfirmBtn: 'Sí, vaciar y empezar de cero',
    impReviewTitle: 'Revisar importación',
    impLocalModeLabel: 'mapeo local, sin IA',
    impSheetKindLabel: 'Tipo de hoja',
    impHeaderRowLabel: 'Fila de encabezados',
    impModeTitle: 'Modalidad de Importación',
    impModeMergeTitle: '🔗 Combinar con datos existentes',
    impModeMergeDesc: 'Conserva recetas, insumos y precios actuales. Detecta duplicados para evitar repetidos.',
    impModeReplaceTitle: '🔄 Reemplazar espacio de trabajo',
    impModeReplaceDesc: 'Sustituye recetas, insumos y gastos por los datos de la planilla (descarga respaldo JSON).',
    impReplaceConfirmCheck: 'Confirmo que deseo reemplazar mi catálogo actual por los datos importados.',
    impConfirmBtn: 'Confirmar e incorporar datos',
    syncTitle: 'Sincronización 1-Click con Pizzalog App',
    syncLead: 'Conectá opcionalmente tu espacio de Tools con Pizzalog App para importar o exportar insumos, precios y ventas sin alterar tu operación diaria.',
    syncLinkedBadge: '🟢 Vinculado:',
    syncUnlinkBtn: 'Desvincular cuenta App',
    syncLinkCardTitle: 'Vincular con tu cuenta de Pizzalog App',
    syncLinkCardLead: 'Ingresá las credenciales de tu usuario administrador en Pizzalog App para habilitar la sincronización.',
    syncLinkEmailLabel: 'Usuario o Email en Pizzalog App',
    syncLinkPassLabel: 'Contraseña en Pizzalog App',
    syncLinkSubmitBtn: 'Vincular Restaurante',
    syncPreviewBtn: 'Previsualizar',
    syncExportTitle: '📤 Exportar a Pizzalog App (Tools → App)',
    syncImportTitle: '📥 Importar desde Pizzalog App (App → Tools)',
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
    tabSales: 'Vendas',
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
    unitSystemLabel: 'Sistema de Unidades',
    unitSystemMetric: 'Métrico (g, kg, ml, L)',
    unitSystemUs: 'US Customary (oz, lb, fl oz, gal)',
    targetFoodCostLabel: 'CMV Alvo / Food Cost (%)',
    priceRoundingLabel: 'Arredondamento de Preço',
    packagingDeliveryLabel: 'Embalagem Delivery',
    appDeliveryFeeLabel: 'Taxa App Delivery (%)',
    currencyLockedHint: 'Para evitar reinterpretar valores, a moeda principal fica bloqueada quando há preços, receitas ou despesas. Use Câmbio para moedas diferentes.',
    fxRatesBtn: '💱 Taxas de câmbio',
    guestBannerTitle: 'Você está testando a Demo Interativa ao vivo (Modo Convidado)',
    guestBannerDesc: 'Você pode editar receitas, testar o simulador de lucro e a matriz BCG. As alterações ficam salvas no seu navegador.',
    guestBannerPlansBtn: '✨ Ver Planos & Assinar',
    guestBannerExitBtn: 'Entrar / Sair',
    demoBannerTitle: 'Você está explorando os dados de exemplo da «Pizzaria Demo — Il Forno»',
    demoBannerDesc: 'Experimente livremente com fichas técnicas, simulações e preços. Quando quiser começar com seu restaurante real, limpe o catálogo com um clique.',
    demoBannerClearBtn: '🗑️ Limpar dados para começar',
    emptyOnboardingTitle: '🧭 Primeiros passos para custear seu restaurante do zero',
    emptyOnboardingDesc: 'Siga estes 4 passos em ordem ou importe uma planilha Excel/CSV existente:',
    emptyOnboardingStep1: '1. Cadastre seus insumos e preços de compra reais',
    emptyOnboardingStep2: '2. Crie massas ou sub-receitas reutilizáveis (opcional)',
    emptyOnboardingStep3: '3. Monte as fichas do cardápio para ver custo e preço sugerido',
    emptyOnboardingStep4: '4. Informe custos fixos e vendas mensais para calcular o lucro líquido',
    closeBtn: 'Fechar',
    cancelBtn: 'Cancelar',
    saveBtn: 'Salvar',
    deleteTitle: 'Excluir',
    noDataTag: 'Sem dados',
    incompleteTag: 'INCOMPLETO',
    noRecipeTag: 'SEM FICHA',
    blockedTag: 'BLOQUEADO',
    conflictTitle: '⚠️ Conflito de versão detectado:',
    downloadBackupJsonBtn: '💾 Baixar backup local (.json)',
    reloadServerBtn: '🔄 Recarregar versão do servidor',
    restoreDemoBtn: '🔄 Restaurar demo',
    ingTitle: 'Catálogo de Insumos, Embalagens e Rendimento Utilizável (Perda)',
    ingLead: 'A perda é aplicada uma única vez como rendimento utilizável. Se faltar preço de compra, o insumo fica INCOMPLETO (nunca $0 silencioso).',
    ingPriceListBtn: '📋 Atualizar por lista de fornecedor',
    ingNewBtn: '+ Novo Insumo',
    ingColName: 'Ingrediente',
    ingColDimBase: 'Dimensão / Base',
    ingColDensity: 'Densidade (g/ml)',
    ingColUnitWeight: 'Peso/Unidade (g)',
    ingColPrice: 'Preço Compra',
    ingColPackQty: 'Qtd. Embalagem',
    ingColPackUnit: 'Unidade Embalagem',
    ingColYield: 'Rendimento (%)',
    ingColUsableUnit: 'Custo Utilizável / Base',
    ingColRefUnit: 'Custo por kg / L',
    ingColRefUnitUs: 'Custo ref. (lb / fl oz)',
    ingColStatus: 'Status',
    ingColHistory: 'Histórico',
    ingFreeExplicit: 'Grátis Explícito',
    ingCheckCurrencyUnit: 'Verificar moeda/unidade',
    ingNoPricePlaceholder: 'Sem preço',
    ingOptionalPlaceholder: 'Opcional',
    ingEmptyState: 'Você ainda não cadastrou insumos. Crie seu primeiro ingrediente ou importe uma planilha XLSX/CSV.',
    ingHistoryBtn: '🕒 Histórico',
    ingHistoryTitle: 'Histórico de Preços do Insumo',
    ingHistoryLead: 'Adicione novas compras com data e fornecedor sem perder o histórico usado em snapshots anteriores.',
    ingHistoryAddBtn: '+ Registrar novo preço',
    ingHistoryDate: 'Data da compra',
    ingHistorySupplier: 'Fornecedor',
    ingHistoryPrice: 'Preço pago',
    ingHistoryPack: 'Embalagem',
    ingHistoryYield: 'Rend. %',
    ingHistoryActiveBadge: 'VIGENTE',
    ingHistoryEmpty: 'Este insumo ainda não possui compras registradas.',
    fxModalTitle: 'Taxas de Câmbio Explícitas',
    fxModalLead: 'O motor proíbe conversões implícitas entre moedas. Defina aqui a taxa explícita caso tenha insumos em outra moeda.',
    fxFromCurrency: 'De moeda',
    fxToCurrency: 'Para moeda base',
    fxRate: 'Taxa',
    fxEffectiveDate: 'Data vigência',
    fxAddBtn: '+ Adicionar taxa de câmbio',
    subTitle: 'Massas de Panificação (Biga / Poolish) e Sub-receitas Reutilizáveis',
    subLead: 'Crie ou edite massas com percentual de padeiro ou sub-receitas por lote (molhos, recheios) usando o construtor visual.',
    subNewDoughBtn: '+ Nova Massa de Panificação (Biga/Poolish)',
    subNewSubrecipeBtn: '+ Nova Sub-receita / Molho',
    subColName: 'Sub-receita',
    subColCalcType: 'Tipo de Cálculo',
    subColYield: 'Rendimento do Lote',
    subColBatchCost: 'Custo Total do Lote',
    subColUnitCost: 'Custo por Unidade',
    subColCostPerKg: 'Custo por kg',
    subColStatus: 'Status',
    subColActions: 'Ações',
    subEditBtn: '✏️ Editar',
    subEmptyState: 'Ainda não há massas ou sub-receitas cadastradas. Crie uma fórmula de massa ou preparo por lote.',
    recTitle: 'Construtor de Fichas Técnicas, Preços, Vendas/Mês e Engenharia de Cardápio',
    recLead: 'Informe as Unidades Vendidas / Mês de cada produto para projetar a Contribuição Marginal Mensal, classificar pratos na Matriz BCG e apurar o Lucro Líquido.',
    recNewBtn: '+ Nova Ficha de Produto',
    recColProduct: 'Produto',
    recColMatrix: 'Matriz Cardápio',
    recColCost: 'Custo Insumos',
    recColSuggested: 'Preço Sugerido',
    recColMenuPrice: 'Preço Cardápio',
    recColFcPct: 'CMV %',
    recColUnitMargin: 'Margem Unit.',
    recColMarginPct: 'Margem %',
    recColMarkupPct: 'Markup %',
    recColUnitsMonth: 'Unidades / Mês',
    recColContribMonth: 'Contribuição Mês',
    recColActions: 'Ações',
    recEditRecipeBtn: '✏️ Ficha',
    recUseSuggestedBtn: '↻ Sugerido',
    recNoRecipeHint: '📋 Sem ficha cadastrada — clique em «✏️ Ficha» para vincular insumos',
    recMissingPriceLabel: '⚠️ Sem preço:',
    recPartialLabel: 'Parcial:',
    recSuggestedPlaceholder: 'Sugerido',
    recEmptyState: 'Ainda não há produtos no cardápio. Crie sua primeira ficha para calcular custos e preços sugeridos.',
    recKpiTotalUnits: 'Unidades Mensais Totais',
    recKpiRevenue: 'Faturamento do período',
    recKpiContribution: 'Margem de contribuição do período',
    recKpiNetResult: 'Resultado operacional estimado',
    recKpiNetHintMissing: 'Requer vendas registradas e custos completos',
    expTitle: 'Custos Operacionais Mensais (Aluguel, Salários, Serviços) e Lucro Líquido',
    expLead: 'Custos fixos não distorcem o CMV do prato: são cobertos pela Contribuição Marginal das vendas.',
    expAddBtn: '+ Adicionar Custo Fixo',
    expColName: 'Descrição Operacional',
    expColCategory: 'Categoria',
    expColPeriod: 'Frequência',
    expColAmount: 'Valor',
    expCatRent: 'Aluguel',
    expCatPayroll: 'Equipe / Salários',
    expCatUtilities: 'Serviços (Luz/Gás/Água)',
    expCatSoftware: 'Software / Contabilidade',
    expCatTaxes: 'Impostos / Taxas',
    expCatOther: 'Outros Fixos',
    expPeriodMonthly: 'Mensal',
    expPeriodWeekly: 'Semanal',
    expPeriodYearly: 'Anual',
    expEmptyState: 'Você ainda não cadastrou custos fixos (aluguel, folha, energia). Adicione-os para calcular o ponto de equilíbrio.',
    expKpiTotalFixed: 'Total Custos Fixos Mensais',
    expKpiContrib: 'Contribuição Marginal (Vendas Mês)',
    expKpiBreakEven: 'Faturamento de equilíbrio estimado',
    expKpiNetResult: 'Resultado operacional estimado',
    salesTitle: 'Histórico de Vendas (Manual e Importado)',
    salesLead: 'Registre vendas por período e canal ou importe do seu PDV/Excel. Linhas sem vínculo ficam pendentes sem descarte silencioso.',
    salesManualTitle: 'Registrar venda por período e canal',
    salesAddBtn: '+ Adicionar venda ao histórico',
    salesColPosProduct: 'Produto do PDV',
    salesColLinkedProduct: 'Produto vinculado',
    salesColUnits: 'Unidades',
    salesColPeriod: 'Período',
    salesColChannel: 'Canal',
    salesColGrossRev: 'Venda bruta',
    salesColNetRev: 'Venda líquida',
    salesColSource: 'Origem',
    salesPendingLink: 'Pendente de vínculo',
    salesEmptyState: 'Ainda não há vendas no histórico. Registre uma venda manual acima ou use «Importar XLSX / CSV».',
    salesManualSourceLabel: 'Registro manual',
    snapTitle: 'Snapshots Históricos Imutáveis',
    snapLead: 'Cada snapshot congela preços de compra, perdas, fórmula e hash de entrada. Alterar preços hoje recalcula o cardápio atual sem sobrescrever snapshots antigos.',
    snapEmpty: 'Você ainda não salvou snapshots nesta sessão. Clique em "📸 Salvar Snapshot" no topo direito.',
    snapColDate: 'Data',
    snapColRecipe: 'Receita',
    snapColHash: 'Hash Snapshot',
    snapColStatus: 'Status',
    snapColUnitCost: 'Custo Unitário Congelado',
    snapColSuggestedPrice: 'Preço Sugerido Congelado',
    recSimTitle: 'Simulador de receitas e custos',
    recSimLead: 'Teste quantidades de produção sem alterar a ficha salva. O custo é calculado pelo Cost Engine com os preços vigentes.',
    recSimSelectLabel: 'Produto ou sub-receita',
    recSimSelectPlaceholder: 'Selecionar receita',
    recSimBatchesLabel: 'Quantidade de lotes',
    recSimEmpty: 'Ainda não há receitas para simular. Crie uma receita na aba correspondente.',
    recSimIncompleteErr: 'Não foi possível calcular esta receita: faltam preços ou componentes válidos.',
    recSimHydrationLabel: 'Hidratação simulada (%)',
    recSimHydrationHint: 'Recalcula a fórmula completa sem modificar a massa salva.',
    recSimColComponent: 'Componente',
    recSimColOrigQty: 'Quantidade original',
    recSimColVarPct: 'Variação simulada (%)',
    recSimOrigBatch: 'Custo original por lote',
    recSimSimBatch: 'Custo simulado por lote',
    recSimTotalProd: 'Custo da produção simulada',
    recSimEstYield: 'Rendimento total estimado',
    histTitle: 'Evolução histórica de custos e rentabilidade',
    histLead: 'Acompanhamento cronológico de custos, preços e margens registrados em cada snapshot.',
    histHelpBtn: '❓ Ajuda sobre perdas e custos',
    histEmpty: 'Ainda não há snapshots salvos. Salve uma captura para iniciar o histórico de evolução.',
    histSelectProduct: 'Selecionar Produto',
    histNoProductSnaps: 'Este produto ainda não tem snapshots salvos.',
    histStaleTitle: '⚠️ Custo desatualizado no catálogo',
    histSaveUpdatedSnapBtn: '📸 Salvar novo snapshot com custo vigente',
    histFirstCost: 'Primeiro custo registrado',
    histLastCost: 'Último custo registrado',
    histAccumVar: 'Variação histórica acumulada',
    histLastFc: 'CMV do último snapshot',
    histUnitContribLabel: 'Margem unitária:',
    histChartTitle: 'Evolução cronológica do custo unitário',
    histBaseline: 'Linha base',
    histColDate: 'Data',
    histColUnitCost: 'Custo unitário',
    histColEvalPrice: 'Preço avaliado',
    histColFcPct: 'CMV %',
    histColMargin: 'Margem de contribuição',
    histColVarPrev: 'Variação vs. anterior',
    histColStatus: 'Status',
    menuTitle: 'Engenharia de Cardápio (Matriz Kasavana & Smith / BCG)',
    menuLead: 'Análise estratégica cruzando popularidade (volume de vendas) e contribuição marginal (lucro por prato).',
    menuHelpBtn: '❓ Como interpretar os quadrantes?',
    menuPeriodLabel: 'Período de Vendas',
    menuAllPeriods: 'Todos os períodos acumulados',
    menuMonthlySuffix: '(Mensal)',
    menuChannelLabel: 'Canal de Venda',
    menuAllChannels: 'Todos os canais combinados',
    menuCompareCheck: 'Comparar com outro período',
    menuCompareSelectLabel: 'Comparar com:',
    menuComparePlaceholder: 'Selecionar período',
    menuNoSalesEmpty: 'Não há vendas para o período e canal selecionados. Preencha unidades em «Receitas» ou registre na aba «Vendas».',
    menuIncompleteWarnSuffix: 'produto(s) não classificados por dados incompletos:',
    menuIncompleteWarnDesc: 'Estes produtos possuem vendas, mas falta preço de algum insumo ou preço de venda. Não são classificados como «Cães» para evitar distorções:',
    menuGoToRecipesBtn: 'Ir para receitas',
    menuPuzzleTitle: '🧩 Quebra-Cabeças (Puzzles)',
    menuPuzzleBadge: 'Baixa popularidade · Alta contribuição',
    menuPuzzleTip: '💡 Oportunidade de margem: Ótimo lucro, baixa saída. Promova em combos, dias fracos ou destaque no cardápio.',
    menuStarTitle: '⭐ Estrelas (Stars)',
    menuStarBadge: 'Alta popularidade · Alta contribuição',
    menuStarTip: '✨ Pilares de lucro: Alta saída e excelente margem. Proteja a qualidade e mantenha em evidência.',
    menuDogTitle: '🐕 Cães (Dogs)',
    menuDogBadge: 'Baja popularidade · Baixa contribuição',
    menuDogTip: '⚠️ Baixo desempenho: Baixa saída e baixa margem. Avalie substituir ou reformular a ficha.',
    menuHorseTitle: '🐎 Cavalos de Batalha (Plowhorses)',
    menuHorseBadge: 'Alta popularidade · Baixa contribuição',
    menuHorseTip: '💡 Oportunidade de volume: Muito pedidos com pouca margem. Um ajuste de +3% a +5% no preço melhora muito o resultado.',
    menuEmptyQuadrant: 'Sem produtos neste quadrante',
    menuColStrategy: 'Estratégia recomendada',
    prodTitle: 'Calculadora de produção',
    prodLead: 'Informe quantas unidades deseja produzir. As sub-receitas aninhadas são explodidas e consolidadas por unidade base.',
    prodEmpty: 'Não há produtos no cardápio.',
    prodColToProduce: 'Unidades a produzir',
    prodColYield: 'Rendimento da ficha',
    prodColCostState: 'Status do custo',
    prodValidated: 'Custo validado',
    prodCheckRecipe: 'Revisar ficha / preços',
    prodColIngredient: 'Insumo necessário',
    prodColTotalQty: 'Quantidade total',
    prodColBaseUnit: 'Unidade base',
    prodNoExplosionEmpty: 'Informe quantidades acima e verifique se as receitas possuem custos completos.',
    simTitle: 'Simulador Estratégico de Rentabilidade e Decisões',
    simLead: 'Projete o impacto real de variações de insumos por categoria (decompondo ingredientes e sub-receitas reais no Cost Engine), preços e volume.',
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
    simCostDeltaLabel: 'Variação no Custo de Insumos',
    simAffectedSuppliesLabel: 'Categoria de Insumos Afetada',
    simAffectedAll: 'Todos os insumos do restaurante',
    simAffectedFlour: 'Apenas Farinhas, Sêmolas e Massas',
    simAffectedDairy: 'Apenas Laticínios e Queijos (Mussarela, etc.)',
    simAffectedMeat: 'Apenas Carnes, Frango e Embutidos',
    simAffectedVegetables: 'Apenas Vegetais, Tomate e Azeites',
    simAffectedHint: 'Aplica a variação apenas aos insumos desta categoria e recalcula cada sub-receita e produto segundo a proporção exata.',
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
    simEmptyCompleteRows: 'Para simular a rentabilidade global você precisa de pelo menos um produto completo com unidades vendidas.',
    simUnitLinkProduct: 'Vincular produto do catálogo',
    simUnitManualOption: 'Cenário manual',
    simUnitUnitsMonth: 'Unidades por mês',
    simUnitPriceLabel: 'Preço de venda unitário',
    simUnitVarCostLabel: 'Custo variável unitário',
    simUnitFixedLabel: 'Custos fixos mensais',
    simUnitLoadBtn: 'Carregar preço, custo e custos fixos do catálogo',
    simUnitCannotLinkHint: 'Para vincular, o produto precisa de custo completo e preço de venda cadastrados.',
    builderDoughTitle: '🥣 Construtor de Panificação (Biga / Poolish / Hidratação)',
    builderProductTitle: '🍕 Construtor Visual de Ficha de Produto',
    builderSubrecipeTitle: '🥫 Construtor Visual de Sub-receita',
    builderNameLabel: 'Nome',
    builderYieldLabel: 'Rendimento (Yield)',
    builderYieldUnitLabel: 'Unidade de Rendimento',
    builderComponentsHeading: 'Componentes da Receita (Insumos e Sub-receitas)',
    builderAddCompBtn: '+ Adicionar Componente',
    builderTypeIngredient: 'Insumo',
    builderTypeSubrecipe: 'Sub-receita',
    builderNoSubrecipesOption: '— Primeiro crie uma sub-receita na aba 2 —',
    builderValidateSaveBtn: '💾 Validar e Salvar Receita',
    builderLiveCostLabel: 'Custo estimado ao vivo:',
    builderErrNameRequired: 'O nome da receita é obrigatório.',
    builderErrFlourSum: 'A mistura de farinhas deve somar 100%',
    builderErrMeasuredYield: 'Informe um rendimento medido maior que zero.',
    builderErrNoComponents: 'Adicione pelo menos um componente à receita.',
    clearDemoTitle: '⚠️ Limpar dados de demonstração?',
    clearDemoDesc1: 'Esta ação esvaziará receitas, insumos, despesas e vendas de exemplo, deixando um espaço limpo para seu restaurante.',
    clearDemoDesc2: 'Sua moeda, idioma e configurações globais serão mantidos. Você pode restaurar a demo a qualquer momento.',
    clearDemoConfirmBtn: 'Sim, limpar e começar do zero',
    impReviewTitle: 'Revisar importação',
    impLocalModeLabel: 'mapeamento local, sem IA',
    impSheetKindLabel: 'Tipo de aba',
    impHeaderRowLabel: 'Linha de cabeçalho',
    impModeTitle: 'Modo de Importação',
    impModeMergeTitle: '🔗 Mesclar com dados existentes',
    impModeMergeDesc: 'Mantém receitas, insumos e preços atuais. Detecta duplicatas.',
    impModeReplaceTitle: '🔄 Substituir espaço de trabalho',
    impModeReplaceDesc: 'Substitui tudo pelos dados importados (baixa backup JSON automaticamente).',
    impReplaceConfirmCheck: 'Confirmo que desejo substituir o catálogo atual pelos dados importados.',
    impConfirmBtn: 'Confirmar e importar dados',
    syncTitle: 'Sincronização 1-Click com Pizzalog App',
    syncLead: 'Conecte opcionalmente sua conta Tools com o Pizzalog App para importar ou exportar insumos, preços e vendas.',
    syncLinkedBadge: '🟢 Vinculado:',
    syncUnlinkBtn: 'Desvincular conta App',
    syncLinkCardTitle: 'Vincular com sua conta Pizzalog App',
    syncLinkCardLead: 'Informe as credenciais do usuário administrador do Pizzalog App.',
    syncLinkEmailLabel: 'Usuário ou E-mail no Pizzalog App',
    syncLinkPassLabel: 'Senha no Pizzalog App',
    syncLinkSubmitBtn: 'Vincular Restaurante',
    syncPreviewBtn: 'Pré-visualizar',
    syncExportTitle: '📤 Exportar para Pizzalog App (Tools → App)',
    syncImportTitle: '📥 Importar do Pizzalog App (App → Tools)',
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
    tabSales: 'Sales',
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
    unitSystemLabel: 'Unit System',
    unitSystemMetric: 'Metric (g, kg, ml, L)',
    unitSystemUs: 'US Customary (oz, lb, fl oz, gal)',
    targetFoodCostLabel: 'Target Food Cost (%)',
    priceRoundingLabel: 'Price Rounding',
    packagingDeliveryLabel: 'Delivery Packaging',
    appDeliveryFeeLabel: 'Delivery App Fee (%)',
    currencyLockedHint: 'To avoid reinterpreting existing amounts, main currency is locked once prices, recipes, or expenses exist. Use FX Rates for mixed currencies.',
    fxRatesBtn: '💱 Exchange rates',
    guestBannerTitle: 'You are testing the Live Interactive Demo (Guest Mode)',
    guestBannerDesc: 'You can edit recipes, test the profitability simulator and the BCG matrix. Changes are saved locally in your browser.',
    guestBannerPlansBtn: '✨ View Plans & Subscribe',
    guestBannerExitBtn: 'Sign in / Exit',
    demoBannerTitle: 'You are exploring sample data for «Demo Pizzeria — Il Forno»',
    demoBannerDesc: 'Feel free to experiment with recipes, simulations, and prices. When ready to start with your real restaurant, clear the catalog with one click.',
    demoBannerClearBtn: '🗑️ Clear demo data to start',
    emptyOnboardingTitle: '🧭 Getting started from scratch',
    emptyOnboardingDesc: 'Follow these 4 steps in order or import an existing Excel/CSV workbook:',
    emptyOnboardingStep1: '1. Add your ingredients and real purchase prices',
    emptyOnboardingStep2: '2. Build dough formulas or reusable subrecipes (optional)',
    emptyOnboardingStep3: '3. Create menu recipes to get unit costs and suggested prices',
    emptyOnboardingStep4: '4. Enter fixed operating expenses and monthly sales for net profit',
    closeBtn: 'Close',
    cancelBtn: 'Cancel',
    saveBtn: 'Save',
    deleteTitle: 'Delete',
    noDataTag: 'No data',
    incompleteTag: 'INCOMPLETE',
    noRecipeTag: 'NO RECIPE',
    blockedTag: 'BLOCKED',
    conflictTitle: '⚠️ Version conflict detected:',
    downloadBackupJsonBtn: '💾 Download local backup (.json)',
    reloadServerBtn: '🔄 Reload server version',
    restoreDemoBtn: '🔄 Restore demo',
    ingTitle: 'Ingredient Catalog, Pack Sizes & Usable Yield (Waste)',
    ingLead: 'Trim waste is applied once as usable yield. Missing purchase prices mark the ingredient INCOMPLETE (never a silent $0).',
    ingPriceListBtn: '📋 Update from supplier price list',
    ingNewBtn: '+ New Ingredient',
    ingColName: 'Ingredient',
    ingColDimBase: 'Dimension / Base',
    ingColDensity: 'Density (g/ml)',
    ingColUnitWeight: 'Unit Weight (g)',
    ingColPrice: 'Purchase Price',
    ingColPackQty: 'Pack Qty',
    ingColPackUnit: 'Pack Unit',
    ingColYield: 'Usable Yield (%)',
    ingColUsableUnit: 'Usable Cost / Base',
    ingColRefUnit: 'Cost per kg / L',
    ingColRefUnitUs: 'Ref. Cost (lb / fl oz)',
    ingColStatus: 'Status',
    ingColHistory: 'History',
    ingFreeExplicit: 'Explicit Free',
    ingCheckCurrencyUnit: 'Check currency/unit',
    ingNoPricePlaceholder: 'No price',
    ingOptionalPlaceholder: 'Optional',
    ingEmptyState: 'No ingredients added yet. Create your first ingredient manually or import an XLSX/CSV file.',
    ingHistoryBtn: '🕒 History',
    ingHistoryTitle: 'Ingredient Price History',
    ingHistoryLead: 'Add dated supplier purchases without overwriting historical price records used in past snapshots.',
    ingHistoryAddBtn: '+ Add dated price',
    ingHistoryDate: 'Purchase date',
    ingHistorySupplier: 'Supplier',
    ingHistoryPrice: 'Amount paid',
    ingHistoryPack: 'Pack',
    ingHistoryYield: 'Yield %',
    ingHistoryActiveBadge: 'ACTIVE',
    ingHistoryEmpty: 'No purchase history recorded yet for this ingredient.',
    fxModalTitle: 'Explicit Exchange Rates',
    fxModalLead: 'The engine prohibits implicit currency mixing. Define an explicit exchange rate whenever an ingredient price uses another currency.',
    fxFromCurrency: 'From currency',
    fxToCurrency: 'To base currency',
    fxRate: 'Exchange rate',
    fxEffectiveDate: 'Effective date',
    fxAddBtn: '+ Add exchange rate',
    subTitle: 'Baker’s Dough Formulas (Biga / Poolish) & Reusable Subrecipes',
    subLead: 'Build baker’s percentage doughs or batch subrecipes (sauces, toppings) with the visual recipe builder.',
    subNewDoughBtn: '+ New Baker’s Dough (Biga/Poolish)',
    subNewSubrecipeBtn: '+ New Subrecipe / Sauce',
    subColName: 'Subrecipe',
    subColCalcType: 'Calculation Type',
    subColYield: 'Batch Yield',
    subColBatchCost: 'Total Batch Cost',
    subColUnitCost: 'Cost per Yield Unit',
    subColCostPerKg: 'Cost per kg',
    subColStatus: 'Status',
    subColActions: 'Actions',
    subEditBtn: '✏️ Edit',
    subEmptyState: 'No doughs or subrecipes yet. Create a baker’s formula or a reusable batch preparation.',
    recTitle: 'Recipe Builder, Suggested Pricing, Monthly Sales & Menu Engineering',
    recLead: 'Enter Monthly Units Sold for each menu item to project Monthly Contribution Margin, classify dishes in the BCG Matrix, and compute Net Profit.',
    recNewBtn: '+ New Menu Product Recipe',
    recColProduct: 'Product',
    recColMatrix: 'Menu Matrix',
    recColCost: 'Ingred. Cost',
    recColSuggested: 'Suggested Price',
    recColMenuPrice: 'Menu Price',
    recColFcPct: 'Food Cost %',
    recColUnitMargin: 'Unit Margin',
    recColMarginPct: 'Margin %',
    recColMarkupPct: 'Markup %',
    recColUnitsMonth: 'Units / Month',
    recColContribMonth: 'Monthly Contrib.',
    recColActions: 'Actions',
    recEditRecipeBtn: '✏️ Recipe',
    recUseSuggestedBtn: '↻ Suggested',
    recNoRecipeHint: '📋 No recipe yet — click «✏️ Recipe» to assign components',
    recMissingPriceLabel: '⚠️ Missing price:',
    recPartialLabel: 'Partial:',
    recSuggestedPlaceholder: 'Suggested',
    recEmptyState: 'No menu products added yet. Create your first product recipe to calculate cost and suggested pricing.',
    recKpiTotalUnits: 'Total Monthly Units',
    recKpiRevenue: 'Period Revenue',
    recKpiContribution: 'Period Contribution Margin',
    recKpiNetResult: 'Estimated Operating Profit',
    recKpiNetHintMissing: 'Requires recorded sales and complete recipe costs',
    expTitle: 'Monthly Operating Expenses (Rent, Payroll, Utilities) & Net Profit',
    expLead: 'Fixed overheads never distort dish Food Cost %: they are covered by total Contribution Margin across monthly sales.',
    expAddBtn: '+ Add Fixed Expense',
    expColName: 'Expense Item',
    expColCategory: 'Category',
    expColPeriod: 'Frequency',
    expColAmount: 'Amount',
    expCatRent: 'Rent',
    expCatPayroll: 'Payroll / Staff',
    expCatUtilities: 'Utilities (Power/Gas/Water)',
    expCatSoftware: 'Software / Accounting',
    expCatTaxes: 'Taxes / Fees',
    expCatOther: 'Other Fixed',
    expPeriodMonthly: 'Monthly',
    expPeriodWeekly: 'Weekly',
    expPeriodYearly: 'Yearly',
    expEmptyState: 'No fixed operating expenses recorded yet (rent, payroll, utilities). Add them to compute your true break-even point.',
    expKpiTotalFixed: 'Total Monthly Fixed Expenses',
    expKpiContrib: 'Contribution Margin (Monthly Sales)',
    expKpiBreakEven: 'Estimated Break-Even Revenue',
    expKpiNetResult: 'Estimated Operating Profit',
    salesTitle: 'Sales History (Manual & Imported)',
    salesLead: 'Log sales by period and channel or import from POS/Excel. Unmatched rows stay pending manual linking without being discarded.',
    salesManualTitle: 'Record sales by period and channel',
    salesAddBtn: '+ Add sale entry',
    salesColPosProduct: 'POS Product',
    salesColLinkedProduct: 'Linked Product',
    salesColUnits: 'Units',
    salesColPeriod: 'Period',
    salesColChannel: 'Channel',
    salesColGrossRev: 'Gross Revenue',
    salesColNetRev: 'Net Revenue',
    salesColSource: 'Source',
    salesPendingLink: 'Pending link',
    salesEmptyState: 'No sales entries recorded yet. Log a sale manually above or use «Import XLSX / CSV».',
    salesManualSourceLabel: 'Manual entry',
    snapTitle: 'Immutable Historical Cost Snapshots',
    snapLead: 'Each snapshot freezes purchase prices, yield %, formula, and input hash. Future price updates never overwrite historical snapshots.',
    snapEmpty: 'No snapshots saved yet. Click "📸 Save Snapshot" in the top bar.',
    snapColDate: 'Date',
    snapColRecipe: 'Recipe',
    snapColHash: 'Snapshot Hash',
    snapColStatus: 'Status',
    snapColUnitCost: 'Frozen Unit Cost',
    snapColSuggestedPrice: 'Frozen Suggested Price',
    recSimTitle: 'Recipe & Batch Cost Simulator',
    recSimLead: 'Test production batch multipliers or hydration tweaks without modifying your saved recipe.',
    recSimSelectLabel: 'Product or subrecipe',
    recSimSelectPlaceholder: 'Select recipe',
    recSimBatchesLabel: 'Number of batches',
    recSimEmpty: 'No recipes available to simulate yet. Create one in the Recipes or Subrecipes tab.',
    recSimIncompleteErr: 'Cannot compute this recipe: missing valid ingredient prices or components.',
    recSimHydrationLabel: 'Simulated hydration (%)',
    recSimHydrationHint: 'Recomputes the entire baker’s formula without modifying the saved dough.',
    recSimColComponent: 'Component',
    recSimColOrigQty: 'Original quantity',
    recSimColVarPct: 'Simulated scale (%)',
    recSimOrigBatch: 'Original batch cost',
    recSimSimBatch: 'Simulated batch cost',
    recSimTotalProd: 'Simulated production cost',
    recSimEstYield: 'Estimated total yield',
    histTitle: 'Historical Cost & Margin Evolution',
    histLead: 'Chronological tracking of frozen unit costs, selling prices, and margins across snapshots.',
    histHelpBtn: '❓ Yield & costing help',
    histEmpty: 'No snapshots saved yet. Take a snapshot first to start tracking historical cost evolution.',
    histSelectProduct: 'Select Product',
    histNoProductSnaps: 'This product has no saved snapshots yet.',
    histStaleTitle: '⚠️ Outdated cost in catalog',
    histSaveUpdatedSnapBtn: '📸 Save new snapshot with current costs',
    histFirstCost: 'First recorded cost',
    histLastCost: 'Latest recorded cost',
    histAccumVar: 'Cumulative variation',
    histLastFc: 'Latest snapshot Food Cost %',
    histUnitContribLabel: 'Unit margin:',
    histChartTitle: 'Unit cost timeline',
    histBaseline: 'Baseline',
    histColDate: 'Date',
    histColUnitCost: 'Unit cost',
    histColEvalPrice: 'Evaluated price',
    histColFcPct: 'Food Cost %',
    histColMargin: 'Contribution margin',
    histColVarPrev: 'Change vs. prior',
    histColStatus: 'Status',
    menuTitle: 'Menu Engineering (Kasavana & Smith / BCG Matrix)',
    menuLead: 'Strategic matrix combining item popularity (sales volume) and unit contribution margin (profit per item).',
    menuHelpBtn: '❓ How to read the quadrants?',
    menuPeriodLabel: 'Sales Period',
    menuAllPeriods: 'All accumulated periods',
    menuMonthlySuffix: '(Monthly)',
    menuChannelLabel: 'Sales Channel',
    menuAllChannels: 'All channels combined',
    menuCompareCheck: 'Compare against another period',
    menuCompareSelectLabel: 'Compare against:',
    menuComparePlaceholder: 'Select comparison period',
    menuNoSalesEmpty: 'No sales recorded for the selected period and channel. Enter monthly units in «Recipes» or log sales in «Sales».',
    menuIncompleteWarnSuffix: 'product(s) excluded from classification due to incomplete data:',
    menuIncompleteWarnDesc: 'These items have recorded sales but lack ingredient costs or a selling price. They are never misclassified as Dogs:',
    menuGoToRecipesBtn: 'Go to recipes',
    menuPuzzleTitle: '🧩 Puzzles',
    menuPuzzleBadge: 'Low popularity · High contribution',
    menuPuzzleTip: '💡 Margin opportunity: Great unit profit, lower volume. Highlight on the menu or bundle into combos.',
    menuStarTitle: '⭐ Stars',
    menuStarBadge: 'High popularity · High contribution',
    menuStarTip: '✨ Profit pillars: High demand and strong margin. Protect recipe consistency and visual prominence.',
    menuDogTitle: '🐕 Dogs',
    menuDogBadge: 'Low popularity · Low contribution',
    menuDogTip: '⚠️ Underperforming: Low volume and low margin. Re-cost ingredients or consider replacing on the menu.',
    menuHorseTitle: '🐎 Plowhorses',
    menuHorseBadge: 'High popularity · Low contribution',
    menuHorseTip: '💡 Volume lever: Very popular with thin unit margin. A +3% to +5% price increase yields high net profit lift.',
    menuEmptyQuadrant: 'No items in this quadrant',
    menuColStrategy: 'Recommended strategy',
    prodTitle: 'Production Explosion Calculator',
    prodLead: 'Enter desired production quantities. Nested subrecipes are exploded and consolidated by base catalog unit.',
    prodEmpty: 'No menu products available.',
    prodColToProduce: 'Units to produce',
    prodColYield: 'Recipe yield',
    prodColCostState: 'Cost status',
    prodValidated: 'Validated cost',
    prodCheckRecipe: 'Check recipe / prices',
    prodColIngredient: 'Required ingredient',
    prodColTotalQty: 'Total quantity',
    prodColBaseUnit: 'Base unit',
    prodNoExplosionEmpty: 'Enter units above and verify recipes have complete ingredient prices to explode total ingredient demand.',
    simTitle: 'Strategic Profitability & Decision Simulator',
    simLead: 'Project the real impact of ingredient cost increases or drops by category (decomposing actual recipe and subrecipe ingredients via Cost Engine), prices, and volume.',
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
    simCostDeltaLabel: 'Ingredient Cost Variation',
    simAffectedSuppliesLabel: 'Affected Ingredient Category',
    simAffectedAll: 'All restaurant ingredients',
    simAffectedFlour: 'Flours, Semolina & Doughs only',
    simAffectedDairy: 'Dairy & Cheeses (Mozzarella, etc.) only',
    simAffectedMeat: 'Meats, Poultry & Charcuterie only',
    simAffectedVegetables: 'Produce, Tomatoes & Oils only',
    simAffectedHint: 'Applies the cost shift strictly to matching ingredients and recalculates every subrecipe and product according to its exact recipe composition.',
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
    simEmptyCompleteRows: 'Add at least one complete recipe with monthly units sold to run the business profitability simulator.',
    simUnitLinkProduct: 'Link catalog product',
    simUnitManualOption: 'Manual scenario',
    simUnitUnitsMonth: 'Units per month',
    simUnitPriceLabel: 'Unit selling price',
    simUnitVarCostLabel: 'Unit variable cost',
    simUnitFixedLabel: 'Monthly fixed expenses',
    simUnitLoadBtn: 'Load price, cost & fixed expenses from catalog',
    simUnitCannotLinkHint: 'Requires complete recipe cost and a selling price defined in the catalog.',
    builderDoughTitle: '🥣 Baker’s Dough Builder (Biga / Poolish / Hydration)',
    builderProductTitle: '🍕 Visual Product Recipe Builder',
    builderSubrecipeTitle: '🥫 Visual Subrecipe Builder',
    builderNameLabel: 'Name',
    builderYieldLabel: 'Yield',
    builderYieldUnitLabel: 'Yield Unit',
    builderComponentsHeading: 'Recipe Components (Ingredients & Subrecipes)',
    builderAddCompBtn: '+ Add Component',
    builderTypeIngredient: 'Ingredient',
    builderTypeSubrecipe: 'Subrecipe',
    builderNoSubrecipesOption: '— Create a subrecipe in Tab 2 first —',
    builderValidateSaveBtn: '💾 Validate & Save Recipe',
    builderLiveCostLabel: 'Live estimated cost:',
    builderErrNameRequired: 'Recipe name is required.',
    builderErrFlourSum: 'Flour blend shares must total 100%',
    builderErrMeasuredYield: 'Measured yield must be greater than zero.',
    builderErrNoComponents: 'Add at least one component to the recipe.',
    clearDemoTitle: '⚠️ Clear sample demo data?',
    clearDemoDesc1: 'This clears all sample recipes, ingredients, expenses, and sales so you can start with your real restaurant catalog.',
    clearDemoDesc2: 'Your currency, language, and global settings remain intact. You can restore the demo anytime.',
    clearDemoConfirmBtn: 'Yes, clear everything and start fresh',
    impReviewTitle: 'Review Spreadsheet Import',
    impLocalModeLabel: 'local mapping, no AI',
    impSheetKindLabel: 'Sheet type',
    impHeaderRowLabel: 'Header row',
    impModeTitle: 'Import Mode',
    impModeMergeTitle: '🔗 Merge with existing data',
    impModeMergeDesc: 'Keeps existing recipes, ingredients, and prices while deduplicating matching rows.',
    impModeReplaceTitle: '🔄 Replace entire workspace',
    impModeReplaceDesc: 'Replaces current catalog with imported sheets (auto-downloads JSON backup).',
    impReplaceConfirmCheck: 'I confirm replacing my current workspace with the imported spreadsheet.',
    impConfirmBtn: 'Confirm & Apply Import',
    syncTitle: '1-Click Pizzalog App Sync',
    syncLead: 'Optionally link your Tools workspace to Pizzalog App to import or export supplies, costs, and sales without affecting daily operations.',
    syncLinkedBadge: '🟢 Linked:',
    syncUnlinkBtn: 'Unlink App account',
    syncLinkCardTitle: 'Link your Pizzalog App account',
    syncLinkCardLead: 'Enter your Pizzalog App admin credentials to enable direct sync.',
    syncLinkEmailLabel: 'Pizzalog App Email or Username',
    syncLinkPassLabel: 'Pizzalog App Password',
    syncLinkSubmitBtn: 'Link Restaurant',
    syncPreviewBtn: 'Preview',
    syncExportTitle: '📤 Export to Pizzalog App (Tools → App)',
    syncImportTitle: '📥 Import from Pizzalog App (App → Tools)',
    goldenTitle: 'Live Verification — 8 Golden Cases Battery',
    goldenLead: 'All 8 Golden Cases defined in the specification are evaluated in real time on the pure @pizzalog/cost-engine.',
    goldenColId: 'Case ID',
    goldenColDesc: 'Description',
    goldenColCalculated: 'Live Calculated Value',
    goldenColExpected: 'Expected Golden Value',
    goldenColStatus: 'Engine Status',
  },
};
