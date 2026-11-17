(() => {
  const KEY = '__callbell_history_capture_v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{"products":{},"links":[]}'); } catch { return {products:{},links:[]}; } };
  const save = x => localStorage.setItem(KEY, JSON.stringify(x));
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const idFromUrl = location.pathname.match(/\/administrar\/productos\/([^/?#]+)/)?.[1] || null;
  const isUiImage = (img) => {
    const s = ((img.src || '') + ' ' + (img.alt || '')).toLowerCase();
    return !img.src || img.src.startsWith('data:') || /mostrar|ocultar|visibility|eye|logo|placeholder|avatar|icon/.test(s);
  };
  const collectDetail = () => {
    const fields = [...document.querySelectorAll('input,textarea,select')].map(el => ({
      tag: el.tagName.toLowerCase(), type: el.type || null, name: el.name || null,
      id: el.id || null, value: el.value ?? '', placeholder: el.placeholder || '',
      ariaLabel: el.getAttribute('aria-label') || ''
    })).filter(x => clean(x.value) || x.name || x.id || x.placeholder || x.ariaLabel);
    const images = [...document.images].filter(img => !isUiImage(img)).map(img => ({
      src: img.currentSrc || img.src, alt: img.alt || '', title: img.title || ''
    }));
    const links = [...document.querySelectorAll('a[href]')].map(a => ({
      text: clean(a.innerText), href: a.href
    })).filter(x => x.href);
    const text = clean(document.body?.innerText || '');
    const product = {
      id: idFromUrl, url: location.href, title: clean(document.title),
      capturedAt: new Date().toISOString(), fields, images, links, pageText: text
    };
    const data = read();
    const key = idFromUrl || location.href;
    data.products[key] = product;
    save(data);
    return product;
  };
  const collectLinks = () => {
    const urls = [...document.querySelectorAll('a[href]')]
      .map(a => a.href)
      .filter(h => /\/administrar\/productos\/[^/?#]+/.test(h));
    const data = read();
    data.links = [...new Set([...(data.links || []), ...urls])];
    save(data);
    return data.links.length;
  };
  const exportFile = (name, value, type) => {
    const blob = new Blob([value], {type});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };
  const data = read();
  if (idFromUrl) {
    const p = collectDetail();
    alert('Ficha capturada: ' + (p.id || p.url) + '\nProductos acumulados: ' + Object.keys(read().products).length);
  } else {
    const n = collectLinks();
    const d = read();
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;z-index:2147483647;right:12px;bottom:12px;background:#211b18;color:white;padding:14px;border-radius:10px;font:14px sans-serif;max-width:300px;box-shadow:0 4px 24px #0008';
    box.innerHTML = '<b>Callbell · recuperación histórica</b><p>Enlaces detectados en esta vista: ' + n + '</p><p>Fichas acumuladas: ' + Object.keys(d.products).length + '</p>';
    const btn = (label, fn) => { const b=document.createElement('button'); b.textContent=label; b.style.cssText='margin:4px;padding:8px;border:0;border-radius:6px'; b.onclick=fn; box.appendChild(b); };
    btn('Exportar JSON', () => exportFile('callbell-captura.json', JSON.stringify(read(), null, 2), 'application/json'));
    btn('Exportar enlaces', () => exportFile('callbell-enlaces.json', JSON.stringify(read().links, null, 2), 'application/json'));
    btn('Cerrar', () => box.remove());
    document.body.appendChild(box);
  }
})();