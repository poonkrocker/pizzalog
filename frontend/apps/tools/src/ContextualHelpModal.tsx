import React, { useState } from 'react';

export type HelpTopic = 'units' | 'yield' | 'density' | 'bakers' | 'matrix';

interface ContextualHelpModalProps {
  initialTopic?: HelpTopic;
  onClose: () => void;
}

export function ContextualHelpModal({ initialTopic = 'units', onClose }: ContextualHelpModalProps) {
  const [topic, setTopic] = useState<HelpTopic>(initialTopic);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="help-modal-title">
      <div className="modal-panel" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="help-modal-title">Guía y Ayuda Contextual de Pizzalog Tools</h3>
          <button type="button" className="btn btn--secondary" onClick={onClose} aria-label="Cerrar ayuda">
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
          <button
            type="button"
            className={`btn ${topic === 'units' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setTopic('units')}
          >
            📏 Unidades y Conversión
          </button>
          <button
            type="button"
            className={`btn ${topic === 'yield' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setTopic('yield')}
          >
            🥩 Rendimiento y Merma
          </button>
          <button
            type="button"
            className={`btn ${topic === 'density' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setTopic('density')}
          >
            💧 Densidad de Líquidos
          </button>
          <button
            type="button"
            className={`btn ${topic === 'bakers' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setTopic('bakers')}
          >
            🍞 Fórmulas Panaderas
          </button>
          <button
            type="button"
            className={`btn ${topic === 'matrix' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setTopic('matrix')}
          >
            📊 Matriz de Menú (BCG)
          </button>
        </div>

        <div style={{ fontSize: '0.94rem', lineHeight: 1.6 }}>
          {topic === 'units' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>Sistema de Unidades y Conversión Automática</h4>
              <p>
                Pizzalog Cost Engine opera con dimensiones físicas estrictas para evitar errores culinarios y de costeo. Las unidades se dividen en:
              </p>
              <ul>
                <li><strong>Masa (Peso):</strong> Gramos (<code>g</code>) y Kilogramos (<code>kg</code>). 1 kg = 1.000 g.</li>
                <li><strong>Volumen:</strong> Mililitros (<code>ml</code>) y Litros (<code>L</code>). 1 L = 1.000 ml.</li>
                <li><strong>Unidades discretas:</strong> <code>unit</code> (porciones, huevos, panes, envases).</li>
              </ul>
              <div className="notice-banner" style={{ margin: '14px 0' }}>
                💡 <strong>Conversión automática:</strong> Podés comprar en bolsas de 25 kg o bidones de 5 L, y en la receta especificar gramos (ej. 220 g) o mililitros (ej. 15 ml). El motor calcula el costo exacto por porción sin conversiones manuales.
              </div>
              <p>
                <strong>Regla de oro:</strong> Nunca intentes convertir masa a volumen (ej. kg a L) sin haber definido la <em>densidad</em> del insumo.
              </p>
            </div>
          )}

          {topic === 'yield' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>Rendimiento Utilizable (Merma / Desperdicio)</h4>
              <p>
                En gastronomía, casi ningún insumo fresco se utiliza al 100%. La limpieza de carnes, pelado de vegetales o recortes generan una pérdida de peso.
              </p>
              <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8, margin: '12px 0' }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Fórmula de Costo Real con Merma:</p>
                <div style={{ fontFamily: 'monospace', background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}>
                  Costo Real Utilizable ($/kg) = Precio de Compra ($/kg) ÷ (Rendimiento % ÷ 100)
                </div>
              </div>
              <p><strong>Ejemplo práctico (Pollo Crudo):</strong></p>
              <ul>
                <li>Comprás 1 kg de pollo a <strong>$1.000 ARS</strong>.</li>
                <li>Al retirar grasa, hueso y pellejo, te quedan 900 g utilizables. El rendimiento es <strong>90%</strong> (10% de merma).</li>
                <li>El costo real de cada kilo de carne limpia en tu receta es <strong>$1.000 / 0.90 = $1.111,11 ARS</strong>.</li>
              </ul>
              <div className="notice-banner">
                🎯 <strong>En Pizzalog Tools:</strong> Ingresás el rendimiento utilizable en la pestaña de <em>Insumos</em>. El motor aplica la merma automáticamente y de forma única a cada componente, protegiendo tus márgenes.
              </div>
            </div>
          )}

          {topic === 'density' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>Densidad de Líquidos (g/ml)</h4>
              <p>
                La densidad permite al motor traducir cantidades entre <strong>volumen</strong> (litros o mililitros) y <strong>peso</strong> (kilos o gramos).
              </p>
              <div className="table-wrap" style={{ margin: '12px 0' }}>
                <table className="kit-table">
                  <thead>
                    <tr>
                      <th>Líquido común</th>
                      <th>Densidad recomendada (g/ml)</th>
                      <th>Explicación culinaria</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Agua filtrada</strong></td>
                      <td><code>1.00</code></td>
                      <td>1 litro de agua pesa exactamente 1.000 g (1 kg).</td>
                    </tr>
                    <tr>
                      <td><strong>Aceite de oliva / girasol</strong></td>
                      <td><code>0.92</code></td>
                      <td>El aceite es más liviano que el agua; 1 litro pesa 920 gramos.</td>
                    </tr>
                    <tr>
                      <td><strong>Leche entera</strong></td>
                      <td><code>1.03</code></td>
                      <td>Levemente más densa por azúcares y proteínas lácteas.</td>
                    </tr>
                    <tr>
                      <td><strong>Miel de abejas</strong></td>
                      <td><code>1.42</code></td>
                      <td>Alta viscosidad; 1 litro pesa aproximadamente 1.420 gramos.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                Si dejás la densidad vacía en un líquido y tratás de usarlo en gramos, el sistema te advertirá para que no se produzcan desviaciones de costo.
              </p>
            </div>
          )}

          {topic === 'bakers' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>Fórmulas Panaderas (Baker's Percentages)</h4>
              <p>
                En panadería y pizzería profesional, todas las cantidades se calculan como porcentaje relativo al peso total de la <strong>harina (100%)</strong>.
              </p>
              <ul>
                <li><strong>Harina base:</strong> Siempre representa el 100%. Si combinás varias harinas (ej. 70% 000 y 30% integral), la suma debe ser exactamente 100%.</li>
                <li><strong>Hidratación (%):</strong> Gramos de agua por cada 100 g de harina. Ej: 70% de hidratación = 700 g de agua por 1.000 g de harina.</li>
                <li><strong>Sal (%):</strong> Típicamente entre 2.0% y 3.0%.</li>
                <li><strong>Levadura (%):</strong> Levadura fresca (1% a 2%) o seca instantánea (0.3% a 0.7%).</li>
                <li><strong>Prefermentos:</strong> Poolish o Biga con sus propios porcentajes de harina y agua descontados proporcionalmente del amasado final.</li>
              </ul>
              <div className="notice-banner" style={{ margin: '14px 0' }}>
                ⚖️ <strong>Rendimiento Medido:</strong> En la cocción o fermentación se evapora agua. Podés registrar el <em>peso real de masa obtenida</em> luego del amasado para tener el costo exacto por bollo de pizza (ej. 220 g o 280 g).
              </div>
            </div>
          )}

          {topic === 'matrix' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem' }}>Ingeniería de Menú (Matriz Kasavana & Smith)</h4>
              <p>
                Cruza la <strong>Popularidad</strong> (unidades vendidas respecto al promedio) y la <strong>Contribución Marginal</strong> ($ que deja cada plato respecto al promedio) en 4 cuadrantes estratégicos:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '12px 0' }}>
                <div style={{ background: '#fef3c7', padding: 12, borderRadius: 8, border: '1px solid #f59e0b' }}>
                  <strong style={{ color: '#92400e' }}>⭐ Estrellas</strong>
                  <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                    <strong>Alta venta · Alto margen</strong><br />
                    Tus productos estrella. Mantené la consistencia de la receta, protegé la calidad y dales el lugar central en tu carta.
                  </div>
                </div>

                <div style={{ background: '#dbeafe', padding: 12, borderRadius: 8, border: '1px solid #3b82f6' }}>
                  <strong style={{ color: '#1e40af' }}>🐎 Caballos de Batalla</strong>
                  <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                    <strong>Alta venta · Bajo margen</strong><br />
                    Tus clientes los aman pero te dejan poca ganancia. <em>Estrategia:</em> Reducí ligeramente la porción, renegociá insumos o subí el precio entre un +3% y +5%.
                  </div>
                </div>

                <div style={{ background: '#f3e8ff', padding: 12, borderRadius: 8, border: '1px solid #a855f7' }}>
                  <strong style={{ color: '#6b21a8' }}>🧩 Rompecabezas</strong>
                  <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                    <strong>Baja venta · Alto margen</strong><br />
                    Dejan excelente ganancia pero salen poco. <em>Estrategia:</em> Ofrecelos en combos o promociones, cambiales el nombre o dale incentivos al equipo de salón.
                  </div>
                </div>

                <div style={{ background: '#fee2e2', padding: 12, borderRadius: 8, border: '1px solid #ef4444' }}>
                  <strong style={{ color: '#991b1b' }}>🐕 Perros</strong>
                  <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                    <strong>Baja venta · Bajo margen</strong><br />
                    Ocupan espacio en stock y carta sin aportar volumen ni beneficio. <em>Estrategia:</em> Reformulá la receta con mejores costos o retiralos definitivamente de la carta.
                  </div>
                </div>
              </div>
              <div className="notice-banner">
                ⚠️ <strong>Diferencia clave con "Datos Incompletos":</strong> Un plato al que le falta el precio de un ingrediente o su precio de venta <em>nunca</em> se clasifica como perro. Se marca con badge <code>⚠️ Incompleto</code> para que puedas cargar el dato faltante sin distorsionar tus métricas.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
