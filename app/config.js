/* Configuración pública del Panel Pizzalog.
 * No contiene secretos. Staging usa una API y una base de datos separadas.
 * Cualquier hostname distinto del staging explícito utiliza producción.
 */
(function () {
  const hostname = window.location.hostname.toLowerCase();
  const isStaging = hostname === "app-staging.pizzalog.net";

  window.__PIZZALOG_CONFIG__ = {
    apiUrl: isStaging
      ? "https://api-staging.pizzalog.net"
      : "https://api.pizzalog.net"
  };
})();
