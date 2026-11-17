(function () {
  "use strict";
  if (window.__callbellCapture && window.__callbellCapture.installed) {
    var existing = document.getElementById("cb-capture-panel");
    if (existing) existing.style.display = "block";
    return;
  }
  var state = window.__callbellCapture = {
    installed: true, startedAt: new Date().toISOString(), responses: [], errors: [], active: true
  };
  var MAX_BODY = 8 * 1024 * 1024, MAX_RECORDS = 500;
  function isJson(type) { return /json/i.test(type || ""); }
  function isRelevantUrl(url) {
    var value = String(url || "").toLowerCase();
    return !/(auth|login|logout|session|customer|contact|conversation|message|chat|order|checkout|payment|invoice|profile|account)/i.test(value);
  }
  function save(url, status, type, body, source) {
    if (!state.active || !body || body.length > MAX_BODY || !isJson(type) || !isRelevantUrl(url)) return;
    try {
      var data = JSON.parse(body);
      if (!data || typeof data !== "object") return;
      state.responses.push({ capturedAt: new Date().toISOString(), source: source,
        url: String(url || "").slice(0, 2000), status: status,
        contentType: String(type || "").slice(0, 200), data: data });
      if (state.responses.length > MAX_RECORDS) state.responses.shift();
      render();
    } catch (_) {}
  }
  var originalFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    return originalFetch.apply(this, args).then(function (response) {
      try {
        var clone = response.clone(), type = clone.headers.get("content-type") || "";
        if (isJson(type)) clone.text().then(function (body) {
          save(response.url || args[0], response.status, type, body, "fetch");
        }).catch(function () {});
      } catch (_) {}
      return response;
    });
  };
  var originalOpen = XMLHttpRequest.prototype.open, originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cbUrl = url;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", function () {
      try {
        var type = this.getResponseHeader("content-type") || "", body = "";
        if (isJson(type)) {
          if (this.responseType === "json" && this.response && typeof this.response === "object") body = JSON.stringify(this.response);
          else if (this.responseType === "" || this.responseType === "text") body = this.responseText || "";
          save(this.responseURL || this.__cbUrl, this.status, type, body, "xhr");
        }
      } catch (_) {}
    });
    return originalSend.apply(this, arguments);
  };
  var style = document.createElement("style");
  style.textContent = "#cb-capture-panel{position:fixed;z-index:2147483647;right:12px;bottom:12px;width:min(360px,calc(100vw - 24px));max-height:72vh;overflow:auto;background:#171717;color:#fff;border:1px solid #777;border-radius:12px;padding:14px;font:13px/1.45 system-ui;box-shadow:0 8px 32px #0008}#cb-capture-panel *{box-sizing:border-box}#cb-capture-panel button{background:#eee;color:#111;border:0;border-radius:7px;padding:8px 10px;margin:4px 4px 4px 0;font-weight:600}#cb-capture-panel .muted{color:#bbb;font-size:11px}#cb-capture-panel .count{font-size:26px;font-weight:700}";
  document.documentElement.appendChild(style);
  var panel = document.createElement("section");
  panel.id = "cb-capture-panel";
  panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong>Callbell · Captura local</strong><button data-action="close">×</button></div><p class="muted">No envía datos ni guarda credenciales. Captura respuestas JSON cargadas desde ahora.</p><div class="count" id="cb-count">0</div><div class="muted">respuestas JSON capturadas</div><p id="cb-state">Captura activa. Volvé a cargar el catálogo y abrí sus páginas/listados.</p><button data-action="download">Descargar diagnóstico JSON</button><button data-action="copy">Copiar resumen</button><button data-action="pause">Pausar</button><button data-action="clear">Limpiar</button><p class="muted">No incluye cookies, contraseñas ni encabezados de autenticación. Revisá el archivo antes de compartirlo: puede contener información de productos y clientes.</p>';
  document.documentElement.appendChild(panel);
  function preview(data) {
    var found = [], seen = {};
    function walk(value, path, depth) {
      if (depth > 5 || found.length >= 12 || value == null) return;
      if (Array.isArray(value)) {
        if (value.length && typeof value[0] === "object") {
          var keys = [];
          value.slice(0, 5).forEach(function (item) {
            if (item && typeof item === "object") Object.keys(item).forEach(function (key) {
              if (keys.indexOf(key) < 0) keys.push(key);
            });
          });
          var score = keys.filter(function (key) { return /name|title|price|description|image|category|product|visible|active|status/i.test(key); }).length;
          if (score >= 2 && !seen[path]) {
            seen[path] = true;
            found.push({ path: path, arrayLength: value.length, sampleKeys: keys.slice(0, 35), sample: value.slice(0, 2) });
          }
        }
        value.slice(0, 20).forEach(function (v, i) { walk(v, path + "[" + i + "]", depth + 1); });
      } else if (typeof value === "object") {
        Object.keys(value).slice(0, 60).forEach(function (key) {
          walk(value[key], path ? path + "." + key : key, depth + 1);
        });
      }
    }
    walk(data, "$", 0);
    return found;
  }
  function summary() {
    return { tool: "Callbell Shop local discovery capture", version: "0.1.0",
      startedAt: state.startedAt, capturedAt: new Date().toISOString(),
      page: location.origin + location.pathname, title: document.title,
      responseCount: state.responses.length,
      responses: state.responses.map(function (r, i) {
        return { index: i, source: r.source, status: r.status, contentType: r.contentType,
          url: r.url, topLevelKeys: Array.isArray(r.data) ? ["<array>"] : Object.keys(r.data || {}),
          preview: preview(r.data) };
      }), errors: state.errors };
  }
  function render() {
    var count = document.getElementById("cb-count"), status = document.getElementById("cb-state");
    if (count) count.textContent = String(state.responses.length);
    if (status) status.textContent = state.active ? "Captura activa. Navegá por el catálogo para cargar productos." : "Captura pausada.";
  }
  function download() {
    var payload = JSON.stringify({ summary: summary(), rawResponses: state.responses }, null, 2);
    var blob = new Blob([payload], { type: "application/json" }), url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "callbell-discovery-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }
  panel.addEventListener("click", function (event) {
    var action = event.target && event.target.getAttribute("data-action");
    if (action === "close") panel.style.display = "none";
    if (action === "download") download();
    if (action === "copy") {
      var value = JSON.stringify(summary(), null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { alert("Resumen copiado."); }).catch(function () { prompt("Copiá este resumen:", value); });
      else prompt("Copiá este resumen:", value);
    }
    if (action === "pause") { state.active = !state.active; event.target.textContent = state.active ? "Pausar" : "Reanudar"; render(); }
    if (action === "clear" && confirm("¿Borrar las respuestas capturadas de esta pestaña?")) { state.responses = []; state.errors = []; render(); }
  });
  render();
  console.info("[Callbell capture] listo. Navegá/recargá el catálogo para capturar respuestas.");
})();