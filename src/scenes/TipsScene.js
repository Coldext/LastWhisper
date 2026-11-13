import Phaser from 'phaser';
import { THEME } from '../theme/ultimaMaoTheme.js';
import { button, label, rect } from '../ui/draw.js';
import { createCardView } from '../ui/cardView.js';
import { tableTips } from '../ui/tableTips.js';

export default class TipsScene extends Phaser.Scene {
  constructor() { super('TipsScene'); }

  init({ vira = null, handNumber = 0 } = {}) {
    this.reference = tableTips(vira);
    this.handNumber = handNumber;
    this.scrollOffset = 0;
    this.dragY = null;
  }

  create() {
    // A full-canvas hit target in the top scene blocks input, without pausing GameScene.
    this.input.setGlobalTopOnly(true);
    const table = this.scene.get('GameScene');
    const update = ({ vira, handNumber }) => {
      if (handNumber === this.handNumber && vira?.rank === this.reference.vira?.rank &&
          vira?.suit === this.reference.vira?.suit) return;
      this.reference = tableTips(vira);
      this.handNumber = handNumber;
      this.render();
    };
    const resize = () => { this.dragY = null; this.render(); };
    const inside = pointer => pointer.x >= this.left && pointer.x <= this.left + this.width &&
      pointer.y >= this.bodyTop && pointer.y <= this.bodyBottom;
    const down = pointer => { if (inside(pointer)) this.dragY = pointer.y; };
    const move = pointer => {
      if (pointer.isDown && this.dragY !== null) {
        this.scrollTo(this.scrollOffset + this.dragY - pointer.y);
        this.dragY = pointer.y;
      }
    };
    const up = () => { this.dragY = null; };
    const wheel = (pointer, objects, dx, dy) => {
      if (inside(pointer)) this.scrollTo(this.scrollOffset + dy);
    };
    const key = event => {
      if (event.key === 'Escape') this.close();
      else if (event.key === 'ArrowDown') this.scrollTo(this.scrollOffset + 48);
      else if (event.key === 'ArrowUp') this.scrollTo(this.scrollOffset - 48);
      else if (event.key === 'PageDown') this.scrollTo(this.scrollOffset + this.bodyBottom - this.bodyTop);
      else if (event.key === 'PageUp') this.scrollTo(this.scrollOffset - this.bodyBottom + this.bodyTop);
      else if (event.key === 'Home') this.scrollTo(0);
      else if (event.key === 'End') this.scrollTo(this.maxScroll);
    };
    table.events.on('tableReferenceChanged', update);
    this.scale.on('resize', resize);
    for (const [event, handler] of [['pointerdown', down], ['pointermove', move],
      ['pointerup', up], ['pointerupoutside', up], ['wheel', wheel]]) this.input.on(event, handler);
    this.input.keyboard.on('keydown', key);
    this.events.once('shutdown', () => {
      table.events.off('tableReferenceChanged', update);
      this.scale.off('resize', resize);
      for (const [event, handler] of [['pointerdown', down], ['pointermove', move],
        ['pointerup', up], ['pointerupoutside', up], ['wheel', wheel]]) this.input.off(event, handler);
      this.input.keyboard.off('keydown', key);
      this.content.clearMask(true);
      this.maskShape?.destroy();
    });
    this.render();
  }

  close() { this.scene.stop(); }

  scrollTo(offset) {
    this.scrollOffset = Phaser.Math.Clamp(offset, 0, this.maxScroll);
    this.content.y = this.bodyTop - this.scrollOffset;
    const track = this.bodyBottom - this.bodyTop;
    this.thumb.y = this.bodyTop + (track - this.thumb.height) * (this.maxScroll ? this.scrollOffset / this.maxScroll : 0);
  }

  render() {
    this.content?.clearMask(true);
    this.children.removeAll(true);
    this.maskShape?.destroy();
    const w = this.scale.width, h = this.scale.height;
    if (w < 1 || h < 1) return;
    const panelWidth = Math.min(660, w - 24), panelHeight = Math.min(680, h - 24);
    const panelLeft = (w - panelWidth) / 2, top = (h - panelHeight) / 2;
    this.left = panelLeft + 16;
    this.width = panelWidth - 32;
    this.bodyTop = top + 64;
    this.bodyBottom = top + panelHeight - 76;
    this.add.zone(w / 2, h / 2, w, h).setInteractive().setData('modalBlocker', true);
    rect(this, 0, 0, w, h, THEME.obsidian, null, 0, .88);
    rect(this, panelLeft, top, panelWidth, panelHeight, THEME.panel, THEME.bronze, 8);
    label(this, w / 2, top + 30, 'DICAS', 28, THEME.ivory, { serif: true, bold: true });
    rect(this, this.left, this.bodyTop - 8, this.width, 1, THEME.line);
    this.content = this.add.container(this.left, this.bodyTop);
    let y = 8;
    const text = (value, size = 16, color = THEME.ivory, options = {}) => {
      const item = label(this, 0, y, value, size, color,
        { originX: 0, originY: 0, align: 'left', wrap: this.width, ...options });
      this.content.add(item);
      y += item.height + 12;
    };
    const heading = title => {
      if (y > 8) {
        this.content.add(rect(this, 0, y + 4, this.width, 1, THEME.line));
        y += 24;
      }
      text(title, 20, THEME.ivory, { serif: true, bold: true });
    };
    heading('FORÇA DAS CARTAS');
    text(this.reference.ranks, 21, THEME.ivory, { serif: true, bold: true });
    text('Da esquerda para a direita: mais forte para mais fraca.', 16, THEME.paper);
    heading('FORÇA DOS NAIPES');
    // Each suit keeps its symbol, name and red/ivory distinction at small widths.
    const columns = this.width < 400 ? 2 : 4;
    const cellWidth = this.width / columns;
    this.reference.suits.forEach((suit, index) => {
      const x = index % columns * cellWidth;
      const sy = y + Math.floor(index / columns) * 34;
      this.content.add(label(this, x, sy, `${index + 1}. ${suit.symbol} ${suit.name}`, 17,
        suit.red ? 0xe98d91 : THEME.ivory, { originX: 0, originY: 0 }));
    });
    y += Math.ceil(4 / columns) * 34;
    text('Mais forte → mais fraco. O naipe desempata cartas de mesmo valor, comuns e manilhas.', 16, THEME.paper);
    heading('MANILHA ATUAL');
    text(`Mão ${this.handNumber}`, 14, THEME.bronze);
    if (this.reference.vira) {
      const small = this.width < 400, cw = small ? 34 : 48, viraWidth = small ? 46 : 62;
      const viraX = this.width * .13, manilhaX = this.width * .68;
      const cardY = y + 30 + viraWidth * .7;
      this.content.add(label(this, viraX, y + 8, 'VIRA', 13, THEME.bronze, { bold: true }));
      this.content.add(createCardView(this, viraX, cardY, viraWidth, this.reference.vira));
      this.content.add(label(this, this.width * .32, cardY, '→', 24, THEME.bronze));
      this.content.add(label(this, manilhaX, y + 8, `MANILHAS · ${this.reference.manilhaRank}`, 13, THEME.bronze, { bold: true }));
      this.reference.suits.forEach((suit, index) => {
        this.content.add(createCardView(this, manilhaX + (index - 1.5) * (cw + 3), cardY,
          cw, { rank: this.reference.manilhaRank, suit: suit.suit }));
      });
      y += 46 + viraWidth * 1.4;
      text(`Todas as cartas de valor ${this.reference.manilhaRank} são manilhas nesta mão.`);
    } else {
      text('Aguardando a vira da mão.');
    }
    text('A vira define o valor das manilhas. As manilhas são mais fortes que as cartas comuns.', 16, THEME.paper);
    this.contentHeight = y + 8;
    const track = this.bodyBottom - this.bodyTop;
    this.maxScroll = Math.max(0, this.contentHeight - track);
    this.maskShape = this.add.graphics().fillStyle(0xffffff).fillRect(this.left - 1, this.bodyTop, this.width + 2, track);
    this.children.remove(this.maskShape);
    if (this.renderer.type === Phaser.WEBGL) {
      this.content.enableFilters().filters.external.addMask(this.maskShape, false, this.cameras.main);
    } else this.content.setMask(this.maskShape.createGeometryMask());
    this.thumb = this.add.rectangle(this.left + this.width + 7, this.bodyTop, 3,
      Math.max(24, track * Math.min(1, track / this.contentHeight)), THEME.bronze).setOrigin(.5, 0);
    this.thumb.setVisible(this.maxScroll > 0);
    this.scrollTo(this.scrollOffset);
    rect(this, this.left, this.bodyBottom + 8, this.width, 1, THEME.line);
    this.closeButton = button(this, { x: w / 2, y: top + panelHeight - 34,
      w: Math.min(260, panelWidth - 32), h: 48, title: 'FECHAR', onClick: () => this.close() });
  }
}
