import { THEME, FONT, cssColor } from '../theme/ultimaMaoTheme.js';

export function rect(scene, x, y, width, height, fill, stroke = null, radius = 0, alpha = 1) {
  const g = scene.add.graphics();
  g.fillStyle(fill, alpha);
  if (radius) g.fillRoundedRect(x, y, width, height, radius);
  else g.fillRect(x, y, width, height);
  if (stroke != null) {
    g.lineStyle(1, stroke, 1);
    if (radius) g.strokeRoundedRect(x + .5, y + .5, width - 1, height - 1, radius);
    else g.strokeRect(x + .5, y + .5, width - 1, height - 1);
  }
  return g;
}

export function label(scene, x, y, value, size = 16, color = THEME.ivory, opts = {}) {
  return scene.add.text(x, y, value, {
    fontFamily: opts.serif ? FONT.title : FONT.ui,
    fontSize: `${size}px`,
    color: cssColor(color),
    fontStyle: opts.bold ? 'bold' : 'normal',
    align: opts.align || 'center',
    wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
  }).setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5);
}

export function button(scene, { x, y, w, h, title, primary = false, onClick, fontSize = 15 }) {
  const fill = primary ? THEME.blood : THEME.panel;
  const border = primary ? 0xc66d6b : THEME.bronze;
  const bg = rect(scene, x - w / 2, y - h / 2, w, h, fill, border, 5);
  const txt = label(scene, x, y, title, fontSize, THEME.ivory, { bold: true });
  const hit = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', onClick);
  // Feedback também funciona com toque (sem depender de hover).
  hit.on('pointerdown', () => { bg.setAlpha(0.75); txt.setAlpha(0.75); });
  hit.on('pointerup', () => { bg.setAlpha(1); txt.setAlpha(1); });
  hit.on('pointerout', () => { bg.setAlpha(1); txt.setAlpha(1); });
  return hit;
}

export function background(scene, w, h) {
  scene.cameras.main.setBackgroundColor(cssColor(THEME.obsidian));
  // Camadas discretas: mesa / ritual / borda, sem excesso de ornamentos.
  rect(scene, 8, 8, w-16, h-16, THEME.obsidian, THEME.line, 8);
  const g = scene.add.graphics();
  g.lineStyle(1, THEME.bronze, .18);
  g.strokeEllipse(w/2, h/2, Math.max(w*.72, 210), Math.max(h*.55, 180));
  g.lineStyle(1, THEME.blood, .22);
  g.strokeEllipse(w/2, h/2, Math.max(w*.62, 180), Math.max(h*.45, 140));
}


