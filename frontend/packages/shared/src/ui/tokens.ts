// Tokens de marca Pizzalog/Arrabbiata. Punto de partida para el design system
// que consumen el panel y el TPV.
//
// Colores oficiales de marca (convertidos desde los RGB de la guía Pantone).
export const tokens = {
  color: {
    // Paleta de marca
    red: '#D73828', // PANTONE P 45-16 C       · rgb(215, 56, 40)
    ocre: '#FDB740', // PANTONE P 14-7 C        · rgb(253, 183, 64)
    cream: '#F0E6D0', // PANTONE P 8-9 C         · rgb(240, 230, 208)
    blue: '#005DAC', // PANTONE P 104-8 C       · rgb(0, 93, 172)
    skyBlue: '#58A6CF', // PANTONE P 113-4 C       · rgb(88, 166, 207)
    charcoal: '#231F20', // PANTONE P Process Black · rgb(35, 31, 32)

    // Roles semánticos (derivados de la paleta)
    bg: '#231F20',
    surface: '#2C2829',
    text: '#F0E6D0',
    muted: '#9A9490',
    accent: '#D73828',
    success: '#2E9E5B',
    danger: '#D73828',
  },
  font: {
    display: '"Alberdini", system-ui, sans-serif',
    body: '"DM Sans", system-ui, sans-serif',
  },
  radius: { sm: '6px', md: '10px', lg: '16px' },
  // Escala de espaciado en múltiplos de 4px.
  space: (n: number): string => `${n * 4}px`,
} as const;

export type Tokens = typeof tokens;
