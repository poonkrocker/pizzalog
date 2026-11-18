import React, { useState } from 'react';
import type { LocaleCode } from './demoData';

export type HelpTopic = 'units' | 'yield' | 'density' | 'bakers' | 'matrix' | 'import';

interface ContextualHelpModalProps {
  initialTopic?: HelpTopic;
  locale?: LocaleCode;
  onClose: () => void;
}

const HELP_UI: Record<LocaleCode, {
  title: string;
  tabUnits: string;
  tabYield: string;
  tabDensity: string;
  tabBakers: string;
  tabMatrix: string;
  tabImport: string;
  gotIt: string;
}> = {
  'es-AR': {
    title: 'Guía y Ayuda Contextual de Pizzalog Tools v2',
    tabUnits: '📏 Unidades y Conversión',
    tabYield: '🥩 Rendimiento y Merma',
    tabDensity: '💧 Densidad de Líquidos',
    tabBakers: '🍞 Fórmulas Panaderas',
    tabMatrix: '📊 Matriz de Menú (BCG)',
    tabImport: '📥 Importador (20 MB)',
    gotIt: 'Entendido',
  },
  'pt-BR': {
    title: 'Guia e Ajuda Contextual do Pizzalog Tools v2',
    tabUnits: '📏 Unidades e Conversão',
    tabYield: '🥩 Rendimento e Perda',
    tabDensity: '💧 Densidade de Líquidos',
    tabBakers: '🍞 Fórmulas de Panificação',
    tabMatrix: '📊 Matriz de Cardápio (BCG)',
    tabImport: '📥 Importador (20 MB)',
    gotIt: 'Entendi',
  },
  en: {
    title: 'Pizzalog Tools v2 Contextual Guide & Help',
    tabUnits: '📏 Units & Conversion',
    tabYield: '🥩 Usable Yield & Waste',
    tabDensity: '💧 Liquid Density',
    tabBakers: '🍞 Baker’s Percentages',
    tabMatrix: '📊 Menu Matrix (BCG)',
    tabImport: '📥 Smart Importer (20 MB)',
    gotIt: 'Got it',
  },
};

export function ContextualHelpModal({ initialTopic = 'units', locale = 'es-AR', onClose }: ContextualHelpModalProps) {
  const [topic, setTopic] = useState<HelpTopic>(initialTopic);
  const loc: LocaleCode = locale === 'pt-BR' || locale === 'en' ? locale : 'es-AR';
  const ui = HELP_UI[loc];

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="help-modal-title">
      <div className="modal-panel" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="help-modal-title">{ui.title}</h3>
          <button type="button" className="btn btn--secondary" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
          <button type="button" className={`btn ${topic === 'units' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTopic('units')}>
            {ui.tabUnits}
          </button>
          <button type="button" className={`btn ${topic === 'yield' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTopic('yield')}>
            {ui.tabYield}
          </button>
          <button type="button" className={`btn ${topic === 'density' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTopic('density')}>
            {ui.tabDensity}
          </button>
          <button type="button" className={`btn ${topic === 'bakers' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTopic('bakers')}>
            {ui.tabBakers}
          </button>
          <button type="button" className={`btn ${topic === 'matrix' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTopic('matrix')}>
            {ui.tabMatrix}
          </button>
          <button type="button" className={`btn ${topic === 'import' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTopic('import')}>
            {ui.tabImport}
          </button>
        </div>

        <div style={{ fontSize: '0.94rem', lineHeight: 1.6 }}>
          {topic === 'units' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>
                {loc === 'en' ? 'Unit System & Automatic Conversion' : loc === 'pt-BR' ? 'Sistema de Unidades e Conversão Automática' : 'Sistema de Unidades y Conversión Automática'}
              </h4>
              <p>
                {loc === 'en'
                  ? 'Pizzalog Cost Engine enforces strict physical dimensions to prevent culinary costing errors:'
                  : loc === 'pt-BR'
                  ? 'O Pizzalog Cost Engine opera com dimensões físicas estritas para evitar erros de custeio:'
                  : 'Pizzalog Cost Engine opera con dimensiones físicas estrictas para evitar errores culinarios y de costeo:'}
              </p>
              <ul>
                <li><strong>{loc === 'en' ? 'Mass' : loc === 'pt-BR' ? 'Massa' : 'Masa'}:</strong> <code>mg</code>, <code>g</code>, <code>kg</code>, <code>oz</code>, <code>lb</code> ({loc === 'en' ? '1 kg = 1,000 g' : '1 kg = 1.000 g'}).</li>
                <li><strong>{loc === 'en' ? 'Volume' : 'Volume'}:</strong> <code>ml</code>, <code>cc</code>, <code>L</code>, <code>fl_oz_us</code>, <code>gal_us</code> ({loc === 'en' ? '1 L = 1,000 ml' : '1 L = 1.000 ml'}).</li>
                <li><strong>{loc === 'en' ? 'Count' : loc === 'pt-BR' ? 'Contagem' : 'Conteo'}:</strong> <code>unit</code>, <code>dozen</code> ({loc === 'en' ? '1 dozen = 12 units' : loc === 'pt-BR' ? '1 dúzia = 12 unidades' : '1 docena = 12 unidades'}).</li>
              </ul>
            </div>
          )}

          {topic === 'yield' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>{ui.tabYield}</h4>
              <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8, margin: '12px 0' }}>
                <div style={{ fontFamily: 'monospace', background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}>
                  Usable Cost = Gross Cost ÷ (Usable Yield % ÷ 100)
                </div>
              </div>
              <p>
                {loc === 'en'
                  ? 'Example: 1 kg of raw chicken at $1,000 with 90% usable yield (10% trim waste) has a true usable cost of $1,000 / 0.90 = $1,111.11/kg (Golden Case CE-006).'
                  : loc === 'pt-BR'
                  ? 'Exemplo: 1 kg de frango cru a $1.000 com 90% de rendimento utilizável (10% de perda) tem custo real de $1.000 / 0.90 = $1.111,11/kg (Caso Golden CE-006).'
                  : 'Ejemplo: 1 kg de pollo crudo a $1.000 con 90% de rendimiento utilizable (10% de merma) tiene un costo real de $1.000 / 0.90 = $1.111,11/kg (Caso Golden CE-006).'}
              </p>
            </div>
          )}

          {topic === 'density' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>{ui.tabDensity} (g/ml)</h4>
              <p>
                {loc === 'en'
                  ? 'Explicit density (g/ml) is required when converting between mass (g/kg) and volume (ml/L): Water = 1.00, Olive Oil = 0.92, Milk = 1.03, Honey = 1.42.'
                  : loc === 'pt-BR'
                  ? 'A densidade explícita (g/ml) é exigida para converter entre massa (g/kg) e volume (ml/L): Água = 1.00, Azeite = 0.92, Leite = 1.03, Mel = 1.42.'
                  : 'La densidad explícita (g/ml) es obligatoria para convertir entre masa (g/kg) y volumen (ml/L): Agua = 1.00, Aceite de oliva = 0.92, Leche = 1.03, Miel = 1.42.'}
              </p>
            </div>
          )}

          {topic === 'bakers' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>{ui.tabBakers}</h4>
              <p>
                {loc === 'en'
                  ? 'All dough ingredients are expressed as percentages relative to total flour weight (100%). Preferments (Biga / Poolish) deduct their flour and water from the final mix so nothing is double-counted.'
                  : loc === 'pt-BR'
                  ? 'Todos os ingredientes da massa são expressos como percentual sobre a farinha total (100%). Pré-fermentos (Biga / Poolish) descontam sua farinha e água da mistura final sem duplicar insumos.'
                  : 'Todos los ingredientes de la masa se expresan como porcentaje sobre la harina total (100%). Los prefermentos (Biga / Poolish) descuentan su harina y agua del amasado final sin duplicar insumos.'}
              </p>
            </div>
          )}

          {topic === 'import' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>
                {loc === 'en' ? 'Smart Importer: Verified 20 MB Capacity' : loc === 'pt-BR' ? 'Importador Inteligente: Capacidade de até 20 MB' : 'Importador Inteligente: Capacidad de hasta 20 MB'}
              </h4>
              <ul>
                <li><strong>{loc === 'en' ? 'Max file size:' : loc === 'pt-BR' ? 'Tamanho máximo:' : 'Tamaño máximo:'}</strong> <strong>20 MB</strong> (.xlsx / .csv).</li>
                <li><strong>{loc === 'en' ? 'Max sheets:' : loc === 'pt-BR' ? 'Máximo de abas:' : 'Máximo de hojas:'}</strong> <strong>30 {loc === 'en' ? 'sheets' : loc === 'pt-BR' ? 'abas' : 'hojas'}</strong>.</li>
                <li><strong>{loc === 'en' ? 'Max rows:' : loc === 'pt-BR' ? 'Máximo de linhas:' : 'Máximo de filas:'}</strong> <strong>{loc === 'en' ? '10,000 rows' : loc === 'pt-BR' ? '10.000 linhas' : '10.000 filas'}</strong>.</li>
              </ul>
            </div>
          )}

          {topic === 'matrix' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>{ui.tabMatrix}</h4>
              <p>
                {loc === 'en'
                  ? 'Crosses Popularity (units sold vs. average) and Unit Gross Margin (profit per item vs. average) into Stars, Plowhorses, Puzzles, and Dogs. Incomplete items are never misclassified as Dogs.'
                  : loc === 'pt-BR'
                  ? 'Cruza Popularidade (unidades vendidas vs. média) e Margem Unitária (lucro por prato vs. média) em Estrelas, Cavalos, Quebra-Cabeças e Cães. Pratos incompletos nunca são classificados como Cães.'
                  : 'Cruza Popularidad (unidades vendidas vs. promedio) y Margen Unitario (ganancia por plato vs. promedio) en Estrellas, Caballos, Rompecabezas y Perros. Los platos incompletos nunca se clasifican como Perros.'}
              </p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {ui.gotIt}
          </button>
        </div>
      </div>
    </div>
  );
}
