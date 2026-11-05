import React, { useState } from 'react';

declare global {
  interface Window {
    __PIZZALOG_TOOLS_CONFIG__?: {
      lemonSqueezyMonthlyUrl?: string;
      lemonSqueezyYearlyUrl?: string;
      mercadoPagoMonthlyUrl?: string;
      mercadoPagoYearlyUrl?: string;
      whatsappPhone?: string;
      supportEmail?: string;
    };
  }
}

interface CommercialPlansModalProps {
  onClose: () => void;
  userEmail?: string;
}

export function CommercialPlansModal({ onClose, userEmail }: CommercialPlansModalProps) {
  const [activeTab, setActiveTab] = useState<'plans' | 'faq' | 'terms'>('plans');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [currencyView, setCurrencyView] = useState<'USD' | 'ARS'>('USD');

  const customConfig = typeof window !== 'undefined' ? window.__PIZZALOG_TOOLS_CONFIG__ : undefined;

  // Precios base
  const monthlyPriceUsd = 19;
  const yearlyPriceUsd = 190; // Equivale a ~15.83 USD/mes (2 meses gratis)
  const exchangeRateArs = 1250; // Tipo de cambio de referencia

  const monthlyPriceArs = monthlyPriceUsd * exchangeRateArs;
  const yearlyPriceArs = yearlyPriceUsd * exchangeRateArs;

  const currentPrice = billingCycle === 'yearly'
    ? (currencyView === 'USD' ? `$${yearlyPriceUsd} USD` : `$${yearlyPriceArs.toLocaleString('es-AR')} ARS`)
    : (currencyView === 'USD' ? `$${monthlyPriceUsd} USD` : `$${monthlyPriceArs.toLocaleString('es-AR')} ARS`);

  const perMonthEquivalent = billingCycle === 'yearly'
    ? (currencyView === 'USD' ? '$15.80 USD/mes' : `$${Math.round(yearlyPriceArs / 12).toLocaleString('es-AR')} ARS/mes`)
    : (currencyView === 'USD' ? '$19.00 USD/mes' : `$${monthlyPriceArs.toLocaleString('es-AR')} ARS/mes`);

  // Enlaces de pago / checkout configurables o por defecto
  const defaultLsUrl = `https://pizzalog.lemonsqueezy.com/checkout/buy/tools-${billingCycle}`;
  const customLsUrl = billingCycle === 'yearly' ? customConfig?.lemonSqueezyYearlyUrl : customConfig?.lemonSqueezyMonthlyUrl;
  const lemonSqueezyBase = customLsUrl || defaultLsUrl;
  const lemonSqueezyUrl = userEmail
    ? `${lemonSqueezyBase}${lemonSqueezyBase.includes('?') ? '&' : '?'}checkout[email]=${encodeURIComponent(userEmail)}`
    : lemonSqueezyBase;

  const defaultMpUrl = `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=tools-${billingCycle}`;
  const customMpUrl = billingCycle === 'yearly' ? customConfig?.mercadoPagoYearlyUrl : customConfig?.mercadoPagoMonthlyUrl;
  const mercadoPagoUrl = customMpUrl || defaultMpUrl;

  const whatsappPhone = customConfig?.whatsappPhone || '5491100000000';
  const whatsappUrl = `https://wa.me/${whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola! Quisiera consultar sobre la suscripción a Pizzalog Tools (Plan ${billingCycle === 'yearly' ? 'Anual' : 'Mensual'}). Mi email es ${userEmail || ''}`)}`;
  const supportEmail = customConfig?.supportEmail || 'soporte@pizzalog.net';

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="plans-modal-title">
      <div className="modal-panel" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Pizzalog Tools · Restaurant Profit Kit
            </span>
            <h3 id="plans-modal-title" style={{ margin: '4px 0 0' }}>Elige el plan ideal para tu restaurante</h3>
          </div>
          <button type="button" className="btn btn--secondary" onClick={onClose} aria-label="Cerrar modal de planes">
            ✕
          </button>
        </div>

        {/* Barra de pestañas secundarias */}
        <div style={{ display: 'flex', gap: 8, margin: '12px 0 16px', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
          <button
            type="button"
            className={`btn ${activeTab === 'plans' ? 'btn--primary' : 'btn--secondary'}`}
            style={{ fontSize: '0.84rem', padding: '6px 14px' }}
            onClick={() => setActiveTab('plans')}
          >
            💳 Planes & Suscripción
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'faq' ? 'btn--primary' : 'btn--secondary'}`}
            style={{ fontSize: '0.84rem', padding: '6px 14px' }}
            onClick={() => setActiveTab('faq')}
          >
            ❓ Preguntas Frecuentes
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'terms' ? 'btn--primary' : 'btn--secondary'}`}
            style={{ fontSize: '0.84rem', padding: '6px 14px' }}
            onClick={() => setActiveTab('terms')}
          >
            🛡️ Términos & Garantía 7 Días
          </button>
        </div>

        {activeTab === 'plans' && (
          <>
            {/* Selector de ciclo de facturación y moneda */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18, padding: '12px 16px', background: 'var(--surface-alt)', borderRadius: 10 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--muted)' }}>Facturación:</span>
                <button
                  type="button"
                  className={`btn ${billingCycle === 'monthly' ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                  onClick={() => setBillingCycle('monthly')}
                >
                  Mensual
                </button>
                <button
                  type="button"
                  className={`btn ${billingCycle === 'yearly' ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                  onClick={() => setBillingCycle('yearly')}
                >
                  Anual <span style={{ background: '#d97706', color: '#fff', padding: '1px 6px', borderRadius: 10, fontSize: '0.72rem', marginLeft: 4 }}>2 meses gratis (-17%)</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--muted)' }}>Moneda:</span>
                <button
                  type="button"
                  className={`btn ${currencyView === 'USD' ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                  onClick={() => setCurrencyView('USD')}
                >
                  USD ($)
                </button>
                <button
                  type="button"
                  className={`btn ${currencyView === 'ARS' ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                  onClick={() => setCurrencyView('ARS')}
                >
                  ARS ($)
                </button>
              </div>
            </div>

            {/* Tarjetas de Plan */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 20 }}>
              {/* Tarjeta Plan Único / Seleccionado */}
              <div style={{ border: '2px solid var(--brand)', borderRadius: 12, padding: 22, background: 'var(--surface)', position: 'relative', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
                <div style={{ position: 'absolute', top: -11, right: 20, background: 'var(--brand)', color: '#fff', fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase' }}>
                  Acceso Completo
                </div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1.3rem' }}>
                  Restaurant Profit Kit {billingCycle === 'yearly' ? 'Anual' : 'Mensual'}
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: '0.86rem', color: 'var(--muted)' }}>
                  Todas las herramientas para dominar los costos, la carta y la rentabilidad de tu negocio gastronómico.
                </p>

                <div style={{ margin: '14px 0 20px' }}>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>
                    {currentPrice}
                  </div>
                  <div style={{ fontSize: '0.86rem', color: 'var(--muted)', marginTop: 4 }}>
                    {billingCycle === 'yearly' ? `Facturado anualmente (${perMonthEquivalent})` : 'Facturación mensual sin compromiso'}
                  </div>
                </div>

                <ul style={{ margin: '0 0 24px', paddingLeft: 20, fontSize: '0.88rem', lineHeight: 1.7 }}>
                  <li><strong>Cost Engine Ilimitado:</strong> Fichas técnicas, mermas, densidades y fórmulas panaderas.</li>
                  <li><strong>Importador Inteligente:</strong> Carga de archivos XLSX/CSV hasta 20 MB y 10.000 filas.</li>
                  <li><strong>Actualizador de Precios de Proveedores:</strong> Carga de listas de precios con detección de columnas y alias automáticos.</li>
                  <li><strong>Ingeniería de Menú (BCG):</strong> Análisis de Estrellas, Rompecabezas y Caballos de Batalla por período y canal.</li>
                  <li><strong>Simulador Estratégico:</strong> Punto de equilibrio, gastos fijos y escenarios (pesimista, base, optimista).</li>
                  <li><strong>Sincronización 1-Click con Pizzalog App:</strong> Exportá e importá costos hacia el TPV y carta online.</li>
                  <li><strong>Exportación a Excel Personalizado:</strong> Descargá tu propia plantilla con fórmulas nativas.</li>
                  <li><strong>Respaldo Offline Completo (.json):</strong> Tus recetas y fórmulas son 100% de tu propiedad.</li>
                </ul>

                {/* Botones de acción directa */}
                <div style={{ display: 'grid', gap: 10 }}>
                  <a
                    href={lemonSqueezyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--primary"
                    style={{ justifyContent: 'center', padding: '12px', fontSize: '0.94rem' }}
                  >
                    💳 Pagar Internacional (LemonSqueezy)
                  </a>
                  <a
                    href={mercadoPagoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ocre"
                    style={{ justifyContent: 'center', padding: '12px', fontSize: '0.94rem' }}
                  >
                    🇦🇷 Pagar en Argentina (Mercado Pago)
                  </a>
                </div>
              </div>

              {/* Columna de Garantías, Atención y Condiciones */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 18, background: 'var(--surface-alt)' }}>
                  <h5 style={{ margin: '0 0 8px', fontSize: '0.96rem' }}>⚡ Alta Automática Inmediata</h5>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Apenas completes el pago a través de LemonSqueezy o Mercado Pago, nuestro webhook da de alta tu cuenta y te envía automáticamente un email con el enlace para definir tu contraseña y empezar a operar en segundos.
                  </p>
                </div>

                <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 18, background: 'var(--surface-alt)' }}>
                  <h5 style={{ margin: '0 0 8px', fontSize: '0.96rem' }}>🛡️ Garantía de 7 Días y Sin Permanencia</h5>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Probá el sistema con tus propios insumos y recetas. Si no cumple con las expectativas de tu restaurante, solicitás el reintegro total del importe sin preguntas. Podés cancelar la suscripción cuando quieras con un solo clic.
                  </p>
                </div>

                <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 18, background: '#fdf8f4', borderLeft: '4px solid var(--ocre)' }}>
                  <h5 style={{ margin: '0 0 8px', fontSize: '0.96rem' }}>💬 Atención al Cliente & Soporte Humano</h5>
                  <p style={{ margin: '0 0 10px', fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                    ¿Tenés dudas sobre cómo migrar tu planilla actual o preferís abonar por transferencia bancaria?
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a
                      href={`mailto:${supportEmail}?subject=Consulta%20sobre%20Pizzalog%20Tools`}
                      className="btn btn--secondary"
                      style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                    >
                      ✉️ {supportEmail}
                    </a>
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--secondary"
                      style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                    >
                      🟢 WhatsApp Directo
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'faq' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '14px 0 20px', maxHeight: 420, overflowY: 'auto', paddingRight: 8 }}>
            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', background: 'var(--surface)' }}>
              <h5 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>¿Necesito tener contratado Pizzalog App para usar Pizzalog Tools?</h5>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                No. Pizzalog Tools es una solución 100% independiente para cualquier pizzería o restaurante que quiera profesionalizar sus escandallos, costos de masas y rentabilidad. Si además usás Pizzalog App (carta online y TPV), tenés sincronización en 1 clic para importar y exportar datos.
              </p>
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', background: 'var(--surface)' }}>
              <h5 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>¿Puedo importar mi planilla de Excel actual?</h5>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                ¡Sí! Contamos con un Importador Inteligente compatible con archivos XLSX y CSV de hasta 20 MB y 10.000 filas. Detecta automáticamente tus hojas de insumos, precios de compra y recetas para cargarlas en segundos sin tener que reescribirlas a mano.
              </p>
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', background: 'var(--surface)' }}>
              <h5 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>¿Cómo funciona el actualizador de precios de proveedores?</h5>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                Subís el PDF/Excel o lista de precios que te manda tu distribuidor (lácteos, harinas, fiambres) y el sistema reconoce los artículos mediante coincidencia inteligente de texto. Te muestra las variaciones porcentuales (ej. «Muzzarella +12%») y actualiza el costo de todas tus pizzas de manera instantánea.
              </p>
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', background: 'var(--surface)' }}>
              <h5 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>¿Mis datos y recetas están seguros? ¿Quién tiene acceso?</h5>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                Tus recetas son el secreto industrial de tu negocio. Están protegidas con aislamiento estricto por cuenta, bases de datos cifradas y autenticación segura con tokens JWT. Además, en cualquier momento podés descargar una copia de seguridad completa en formato JSON o un reporte en Excel.
              </p>
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', background: 'var(--surface)' }}>
              <h5 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>¿Cómo cancelo mi suscripción si decido no continuar?</h5>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                Podés cancelar tu suscripción con un solo clic directamente desde el enlace que recibís en cada factura de LemonSqueezy o en el panel de suscripciones de Mercado Pago, o avisándonos a soporte@pizzalog.net. No hay ningún tipo de penalidad ni permanencia obligatoria.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'terms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '14px 0 20px', maxHeight: 420, overflowY: 'auto', paddingRight: 8, fontSize: '0.86rem', color: 'var(--ink)', lineHeight: 1.6 }}>
            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 16, background: 'var(--surface)' }}>
              <h5 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Garantía Incondicional de Satisfacción (7 Días)</h5>
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Queremos que pruebes Pizzalog Tools con total tranquilidad. Si dentro de los primeros 7 días posteriores a tu pago considerás que la herramienta no es lo que necesitabas o no se adapta a la operativa de tu restaurante, escribinos a <strong>{supportEmail}</strong> y te reembolsamos el 100% del dinero abonado de inmediato.
              </p>
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 16, background: 'var(--surface)' }}>
              <h5 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Propiedad y Privacidad de las Recetas</h5>
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Toda la información volcada en el sistema (insumos, proveedores, recetas de masas, costos y márgenes) pertenece de forma exclusiva al usuario. Pizzalog no comercializa, no comparte ni utiliza las recetas de los usuarios bajo ninguna circunstancia. Podés exportar la totalidad de tus datos en cualquier momento.
              </p>
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 16, background: 'var(--surface)' }}>
              <h5 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Condiciones de Servicio y Renovación</h5>
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Las suscripciones se renuevan automáticamente al finalizar cada período facturado (mensual o anual) para garantizar el acceso continuo al servicio y a las actualizaciones automáticas. La cancelación puede solicitarse en cualquier momento y mantendrá el acceso activo hasta el fin del ciclo ya abonado.
              </p>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
