// Paleta inicial baseada no Guia de Identidade Visual v1.0.
export const THEME = {
  obsidian: 0x151515,
  deep: 0x0b0b0d,
  panel: 0x1c1b1c,
  graphite: 0x36383a,
  blood: 0xa51f28,
  ivory: 0xd2cab9,
  bronze: 0x82715a,
  muted: 0xa7a095,
  line: 0x51463f,
  paper: 0xb2a99a,
  cardFace: 0xc4c0b6,
  ink: 0x141414,
};

export const FONT = {
  title: 'Georgia, "Times New Roman", serif',
  ui: 'Arial, sans-serif',
};

export const cssColor = (color) => `#${color.toString(16).padStart(6, '0')}`;
