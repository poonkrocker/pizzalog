/* Configuración pública del Panel Pizzalog.
 * El backend se selecciona por hostname para mantener staging aislado.
 * Este archivo no contiene secretos.
 */
const isStagingHost = window.location.hostname === 'app-staging.pizzalog.net';
window.__PIZZALOG_CONFIG__ = {
  apiUrl: isStagingHost
    ? 'https://api-staging.pizzalog.net'
    : 'https://api.pizzalog.net',
};
