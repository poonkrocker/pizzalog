# Pizzalog — iconos SVG

Iconos lineales para la navegación inferior de Pizzalog.

## Archivos
- `inicio.svg`
- `turno-open.svg`
- `turno-closed.svg`
- `venta.svg`
- `cuentas.svg`
- `cocina.svg`
- `ajustes.svg`

## Uso de color
Los iconos de navegación (excepto Turno, cuyo color indica el estado operativo) usan `currentColor`.
Así se puede controlar el color desde CSS:
- Inactivo: `#85817D`
- Activo: `#C92D32`

Ejemplo:
```html
<img src="/assets/icons/inicio.svg" alt="" />
```
Para que `currentColor` herede el color CSS, es preferible insertar el SVG inline o usar una máscara CSS. Un SVG cargado con `<img>` no hereda el `color` del documento.

Colores sugeridos para Turno:
- Abierto: `#789B69`
- Cerrado: `#B95B56`

Los archivos usan `viewBox="0 0 24 24"` y trazo redondeado de 1.8 px.
