# Callbell Shop historical catalog recovery

This tool is independent from Pizzalog at runtime. It uses the already authenticated Callbell Shop admin tab; it does not ask for Google credentials.

## Current discovery step

Callbell's public Shop documentation confirms that products have an independent visibility setting, category, catalog order, and highlighted label. Hidden products therefore must remain in scope. The public documentation does not describe the Shop admin's private product-list API.

The network probe records same-origin JSON/text responses made by the admin so we can identify the actual catalog endpoint and pagination shape rather than guessing an endpoint.

## Android / Chrome instructions

1. Sign in normally at https://admin.callbell.shop.
2. In Chrome, open the bookmarks menu and create a bookmark named `Callbell probe`.
3. Edit its URL to this one-line bookmarklet:

```javascript
javascript:(()=>{const s=document.createElement('script');s.src='https://raw.githubusercontent.com/poonkrocker/pizzalog/tools/callbell-history-extractor/network-probe.js';document.documentElement.appendChild(s)})()
```

4. While on the admin site, tap the address bar, type `Callbell probe`, and choose the bookmark suggestion.
5. Reload the page, open the Catalog section, and scroll/load additional product pages if the catalog has pagination.
6. Tap **Exportar diagnóstico JSON** in the floating panel and share that JSON here.

The diagnostic may include product descriptions, image URLs, and other catalog response data. Review it before sharing; do not share passwords, cookies, authorization headers, or tokens. The probe deliberately does not record request headers.

## Files

- `network-probe.js`: observes fetch/XHR JSON/text responses and exports a diagnostic JSON.
- `capture.js`: early manual capture helper for an individual product page; not the final bulk extractor yet.

## Inclusion rules for the final exporter

- Include products tagged `¡Pizza de la semana!` and `¡Aniversario!`.
- Include visible, hidden, and deactivated products.
- Preserve the original label and visibility state.
- Export product fields and real product/gallery images; exclude UI icons and placeholders.
- Produce CSV and JSON.
- Do not integrate the extractor into Pizzalog's runtime or UI.
