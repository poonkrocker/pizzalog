/**
 * Constructor de tickets ESC/POS.
 *
 * Genera el chorro de bytes como string ASCII (códigos 0–127): los comandos
 * ESC/POS son bytes de control y el texto se translitera (á→a, ñ→n) para que
 * cualquier comandera térmica lo imprima bien, sin depender de la página de
 * códigos configurada en la impresora. El ajuste de acentos, si la impresora
 * de Arrabbiata los soporta, se hace después con el equipo real.
 */

const ESC = '\x1b';
const GS = '\x1d';

/** Reemplaza acentos y caracteres fuera de ASCII. */
export function transliterate(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // saca diacríticos (á→a, ü→u)
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/[«»“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/[¡¿]/g, '') // los signos de apertura no existen en ASCII: se omiten
    .replace(/[^\x20-\x7e\n]/g, '?'); // cualquier otro no-ASCII
}

export class Esc {
  private out = '';

  constructor(public readonly width: number = 32) {}

  /** Inicializa la impresora (limpia estilos previos). */
  init(): this {
    this.out += ESC + '@';
    return this;
  }

  align(a: 'left' | 'center' | 'right'): this {
    this.out += ESC + 'a' + String.fromCharCode(a === 'left' ? 0 : a === 'center' ? 1 : 2);
    return this;
  }

  bold(on: boolean): this {
    this.out += ESC + 'E' + String.fromCharCode(on ? 1 : 0);
    return this;
  }

  /**
   * Tamaño de letra: 1 = normal · 'tall' = doble alto (mismo ancho, entra
   * la línea completa) · 2 = doble alto y ancho (solo títulos cortos).
   */
  size(n: 1 | 2 | 'tall'): this {
    const code = n === 2 ? 0x11 : n === 'tall' ? 0x01 : 0x00;
    this.out += GS + '!' + String.fromCharCode(code);
    return this;
  }

  /** Texto sin salto de línea. */
  text(s: string): this {
    this.out += transliterate(s);
    return this;
  }

  /** Una línea de texto (con salto). */
  line(s = ''): this {
    this.out += transliterate(s) + '\n';
    return this;
  }

  /** Línea divisoria a lo ancho. */
  hr(ch = '-'): this {
    this.out += ch.repeat(this.width) + '\n';
    return this;
  }

  /** Izquierda y derecha en la misma línea, relleno al ancho. */
  row(left: string, right: string): this {
    const l = transliterate(left);
    const r = transliterate(right);
    const space = this.width - l.length - r.length;
    if (space >= 1) {
      this.out += l + ' '.repeat(space) + r + '\n';
    } else {
      // No entra en una línea: derecha abajo, alineada.
      this.out += l + '\n' + ' '.repeat(Math.max(0, this.width - r.length)) + r + '\n';
    }
    return this;
  }

  /** Texto largo envuelto al ancho, con sangría opcional. */
  wrapped(s: string, indent = 0): this {
    const pad = ' '.repeat(indent);
    const words = transliterate(s).split(/\s+/);
    let line = pad;
    for (const w of words) {
      if (line.length + w.length + 1 > this.width && line.trim() !== '') {
        this.out += line + '\n';
        line = pad + w;
      } else {
        line = line.trim() === '' ? pad + w : line + ' ' + w;
      }
    }
    if (line.trim() !== '') this.out += line + '\n';
    return this;
  }

  feed(n = 1): this {
    this.out += '\n'.repeat(n);
    return this;
  }

  /** Alimenta papel y corta (si la impresora tiene cortador). */
  cut(): this {
    this.out += '\n\n\n' + GS + 'V' + String.fromCharCode(66) + String.fromCharCode(0);
    return this;
  }

  toString(): string {
    return this.out;
  }
}
