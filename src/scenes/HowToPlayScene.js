import Phaser from 'phaser';
import { THEME } from '../theme/ultimaMaoTheme.js';
import { background, button, label, rect } from '../ui/draw.js';
import { createCardView } from '../ui/cardView.js';
import { cardPresentation } from '../ui/cardPresentation.js';
import { getCardDefinition } from '../game/cards/cardDefinitions.js';
import { RANK_ORDER, SUIT_ORDER, getManilhaRank } from '../game/rules/CardStrength.js';
import { BET_VALUES, MATCH_TARGET } from '../game/MatchController.js';

export default class HowToPlayScene extends Phaser.Scene {
  constructor() { super('HowToPlayScene'); }

  create() {
    this.scrollOffset = 0;
    this.dragY = null;
    const inBody = pointer => pointer.y >= this.bodyTop && pointer.y <= this.bodyBottom;
    const resize = () => { this.dragY = null; this.render(); };
    const down = pointer => { if (inBody(pointer)) this.dragY = pointer.y; };
    const move = pointer => {
      if (!pointer.isDown || this.dragY === null) return;
      this.scrollTo(this.scrollOffset + this.dragY - pointer.y);
      this.dragY = pointer.y;
    };
    const up = () => { this.dragY = null; };
    const wheel = (pointer, objects, dx, dy) => {
      if (inBody(pointer)) this.scrollTo(this.scrollOffset + dy);
    };
    const key = event => {
      if (event.key === 'Escape') this.scene.start('MenuScene');
      else if (event.key === 'ArrowDown') this.scrollTo(this.scrollOffset + 48);
      else if (event.key === 'ArrowUp') this.scrollTo(this.scrollOffset - 48);
      else if (event.key === 'PageDown') this.scrollTo(this.scrollOffset + this.bodyBottom - this.bodyTop);
      else if (event.key === 'PageUp') this.scrollTo(this.scrollOffset - this.bodyBottom + this.bodyTop);
      else if (event.key === 'Home') this.scrollTo(0);
      else if (event.key === 'End') this.scrollTo(this.maxScroll);
    };
    this.scale.on('resize', resize);
    this.input.on('pointerdown', down);
    this.input.on('pointermove', move);
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    this.input.on('wheel', wheel);
    this.input.keyboard.on('keydown', key);
    this.events.once('shutdown', () => {
      this.scale.off('resize', resize);
      for (const [event, handler] of [['pointerdown', down], ['pointermove', move],
        ['pointerup', up], ['pointerupoutside', up], ['wheel', wheel]]) this.input.off(event, handler);
      this.input.keyboard.off('keydown', key);
      this.content.clearMask(true);
      this.maskShape?.destroy();
    });
    this.render();
  }

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
    const width = Math.min(820, w - 48);
    const left = (w - width) / 2;
    const small = w < 560;
    this.bodyTop = h < 480 ? 68 : 86;
    this.bodyBottom = h - 82;
    background(this, w, h);
    label(this, w / 2, this.bodyTop / 2 - 5, 'COMO JOGAR', small ? 27 : 34, THEME.ivory, { serif: true, bold: true });
    rect(this, left, this.bodyTop - 9, width, 1, THEME.bronze);
    this.content = this.add.container(left, this.bodyTop);
    let y = 12;
    const text = (value, size = small ? 16 : 18, color = THEME.ivory, options = {}) => {
      const item = label(this, 0, y, value, size, color,
        { originX: 0, originY: 0, align: 'left', wrap: width, ...options });
      this.content.add(item);
      y += item.height + 12;
      return item;
    };
    const section = (number, title) => {
      if (number > 1) {
        y += 10;
        this.content.add(rect(this, 0, y, width, 1, THEME.line));
        y += 22;
      }
      text(`${number.toString().padStart(2, '0')}  ${title}`, small ? 20 : 23, THEME.ivory, { serif: true, bold: true });
    };

    section(1, 'OBJETIVO');
    text(`Vença as disputas de cartas para derrotar seu adversário. Quem alcançar ou ultrapassar ${MATCH_TARGET} pontos vence a partida.`);

    section(2, 'FORÇA DAS CARTAS');
    text('Cartas comuns, da mais forte para a mais fraca:', undefined, THEME.paper);
    text([...RANK_ORDER].reverse().join(' > '), small ? 20 : 24, THEME.ivory, { serif: true, bold: true });
    text('A carta mais forte vence a disputa, exceto quando uma manilha entra em jogo.');
    const suits = [...SUIT_ORDER].reverse().map(suit => cardPresentation({ rank: '4', suit }).symbol).join(' > ');
    text(`Mesmo valor? O naipe desempata: ${suits} (paus, copas, espadas, ouros). Isso vale para cartas comuns e manilhas.`);

    section(3, 'MANILHA');
    text('A carta vira define a manilha da mão. O valor seguinte ao da vira na ordem crescente se torna o mais forte, em todos os naipes. Depois do 3, a ordem volta ao 4.');
    const vira = getCardDefinition('diamonds-3');
    const manilha = getCardDefinition(`clubs-${getManilhaRank(vira)}`);
    const cardWidth = small ? 60 : 70;
    const center = width / 2;
    const distance = Math.min(112, width * .30);
    for (const [x, title, definition] of [[center - distance, 'VIRA', vira], [center + distance, 'MANILHA', manilha]]) {
      this.content.add(label(this, x, y + 8, title, 13, THEME.bronze, { bold: true }));
      this.content.add(createCardView(this, x, y + 30 + cardWidth * .7, cardWidth, definition));
    }
    this.content.add(label(this, center, y + 30 + cardWidth * .7, '→', 28, THEME.bronze));
    y += 48 + cardWidth * 1.4;
    text('Exemplo: vira 3♦ → todos os 4 são manilhas. Entre eles, 4♣ é o mais forte.', undefined, THEME.paper);

    section(4, 'COMO FUNCIONA');
    for (const step of [
      '1. Cada jogador recebe 3 cartas; outra carta é revelada como vira.',
      '2. Na sua vez, arraste uma carta para a mesa. Cada jogador joga uma carta por vaza.',
      '3. A carta mais forte vence a vaza. O vencedor começa a próxima.',
      '4. Quem vencer duas vazas ganha a mão, mesmo que a terceira não seja jogada.',
    ]) text(step);
    text('Não há empates entre cartas distintas: o naipe desempata e o baralho não tem faces repetidas.');
    text(`Cada mão começa valendo ${BET_VALUES[0]} ponto. Antes de jogar, no seu turno, você pode pedir Truco ou o próximo aumento: ${BET_VALUES.join(' → ')}.`);
    text('A proposta pausa as jogadas. Quem recebe pode aceitar, correr ou aumentar, até 12. Após um aceite, só o outro jogador pode pedir o próximo aumento, na sua vez.');
    text('O vencedor da mão ganha o valor aceito. Se alguém correr, quem fez a proposta ganha o último valor aceito, anterior ao pedido recusado. Ao aumentar uma proposta, você aceita o valor anterior.');
    text('Ao terminar a mão, uma nova distribuição acontece automaticamente, até alguém alcançar 12 pontos.');
    this.contentHeight = y + 12;
    this.maxScroll = Math.max(0, this.contentHeight - (this.bodyBottom - this.bodyTop));
    this.maskShape = this.add.graphics().fillStyle(0xffffff).fillRect(left - 2, this.bodyTop, width + 4, this.bodyBottom - this.bodyTop);
    this.children.remove(this.maskShape);
    // Phaser 4 uses filter masks in WebGL and geometry masks in Canvas.
    if (this.renderer.type === Phaser.WEBGL) {
      this.content.enableFilters().filters.external.addMask(this.maskShape, false, this.cameras.main);
    } else {
      this.content.setMask(this.maskShape.createGeometryMask());
    }
    const track = this.bodyBottom - this.bodyTop;
    this.thumb = this.add.rectangle(left + width + 12, this.bodyTop, 3,
      Math.max(24, track * Math.min(1, track / this.contentHeight)), THEME.bronze).setOrigin(.5, 0);
    this.thumb.setVisible(this.maxScroll > 0);
    this.scrollTo(this.scrollOffset);
    rect(this, left, this.bodyBottom + 8, width, 1, THEME.line);
    this.backButton = button(this, { x: w / 2, y: h - 36, w: Math.min(292, w - 50), h: 48,
      title: 'VOLTAR', onClick: () => this.scene.start('MenuScene') });
  }
}
