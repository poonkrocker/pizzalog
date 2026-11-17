/* Callbell Shop admin network probe.
 * Run as a bookmarklet while logged into admin.callbell.shop, then reload and open Catalog.
 * It only observes same-origin requests made by the page; it does not modify requests or data.
 */
(() => {
  const KEY = '__cb_shop_network_probe_v1';
  const state = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) || '{"events":[]}'); } catch { return {events:[]}; } })();
  const save = () => sessionStorage.setItem(KEY, JSON.stringify(state));
  const relevant = url => /product|catalog|store|item|firebase|firestore/i.test(String(url));
  const safeUrl = url => {
    try { const u = new URL(url, location.href); return u.origin + u.pathname + (u.search ? '?[query]' : ''); }
    catch { return String(url).slice(0,300); }
  };
  const summarize = (body, url, status) => {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}
    const text = typeof body === 'string' ? body : '';
    const productLike = parsed && (Array.isArray(parsed) ||
      /product|catalog|item/i.test(JSON.stringify(Object.keys(parsed)).slice(0,1000)) ||
      /product|catalog|item/i.test(url));
    if (!relevant(url) && !productLike) return;
    state.events.push({
      at: new Date().toISOString(), url: safeUrl(url), status,
      contentType: 'json/text', length: text.length,
      topKeys: parsed && !Array.isArray(parsed) ? Object.keys(parsed).slice(0,80) : [],
      arrayLength: Array.isArray(parsed) ? parsed.length : null,
      preview: text.slice(0,1800),
      body: text.length <= 1500000 ? text : '[omitted: response > 1.5MB]'
    });
    if (state.events.length > 150) state.events.shift();
    save();
  };
  if (!window.__cbProbeInstalled) {
    window.__cbProbeInstalled = true;
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this,args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const clone = response.clone();
        const type = clone.headers.get('content-type') || '';
        if (/json|text/i.test(type)) clone.text().then(t => summarize(t,url,response.status)).catch(()=>{});
      } catch {}
      return response;
    };
    const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method,url,...rest) { this.__cbUrl=url; return open.call(this,method,url,...rest); };
    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('load', () => {
        try { if (/json|text/i.test(this.getResponseHeader('content-type')||'')) summarize(this.responseText,this.__cbUrl,this.status); } catch {}
      });
      return send.apply(this,args);
    };
  }
  const panel = document.createElement('div');
  panel.style.cssText='position:fixed;z-index:2147483647;right:10px;bottom:10px;background:#211b18;color:#fff;padding:12px;border-radius:10px;font:13px sans-serif;max-width:290px;box-shadow:0 4px 24px #0008';
  const title=document.createElement('b'); title.textContent='Callbell · detector de catálogo'; panel.append(title);
  const info=document.createElement('p'); info.textContent='Detector activo. Recargá la página y abrí Catálogo. Respuestas guardadas: '+state.events.length; panel.append(info);
  const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='margin:3px;padding:7px;border:0;border-radius:5px';b.onclick=fn;panel.append(b);};
  button('Exportar diagnóstico JSON',()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='callbell-network-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  });
  button('Vaciar captura',()=>{state.events=[];save();info.textContent='Captura vacía. Recargá y abrí Catálogo.';});
  button('Cerrar',()=>panel.remove());
  document.body.append(panel);
  save();
})();