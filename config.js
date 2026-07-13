/* ====================================================================
   Configuración de la Carta Pizzalog
   --------------------------------------------------------------------
   apiUrl:      dirección del backend.
   defaultSlug: si alguien entra a la raíz (pizzalog.net) se lo lleva a
                este local. Dejalo vacío ("") para mostrar una portada.
   La URL de cada local es pizzalog.net/{slug} — el slug se administra
   desde el panel, en "Mi local".
   ==================================================================== */
window.__PIZZALOG_CONFIG__ = {
  apiUrl: "https://api.pizzalog.net",
  defaultSlug: "arrabbiata"
};
