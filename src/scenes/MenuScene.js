import Phaser from 'phaser';
import { THEME } from '../theme/ultimaMaoTheme.js';
import { background, button, label, rect } from '../ui/draw.js';

export default class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    this.onResize = () => this.render();
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize));
    this.render();
  }

  render() {
    this.children.removeAll(true);
    const w = this.scale.width, h = this.scale.height;
    if (w < 1 || h < 1) return;
    const small = w < 560;
    background(this, w, h);
    const cx = w/2;
    const headingSize = Math.min(small ? 45 : 76, w * .105);

    label(this, cx, h*.16, '✦  UM  ✦', Math.max(13, Math.min(19,w*.035)), THEME.bronze, {serif:true});
    label(this, cx, h*.35, 'ÚLTIMA MÃO', headingSize, THEME.ivory, {serif:true,bold:true});
    rect(this, cx-Math.min(140,w*.3), h*.425, Math.min(280,w*.6), 1, THEME.blood);
    label(this, cx, h*.51, 'Um baralho amaldiçoado.', Math.min(19,Math.max(13,w*.035)), THEME.paper, {serif:true});
    label(this, cx, h*.56, 'Uma aposta além da vida.', Math.min(19,Math.max(13,w*.035)), THEME.paper, {serif:true});

    const btnY = Math.min(h - 92, h*.73);
    button(this, {x:cx, y:btnY, w:Math.min(292,w-50), h:Math.max(46, Math.min(62,h*.095)),
      title:'INICIAR PARTIDA', primary:true, fontSize:small?15:18,
      onClick:()=>this.scene.start('GameScene')});
    label(this, cx, h-35, 'TRUCO · UMA PARTIDA ATÉ 12 PONTOS', Math.max(9,Math.min(12,w*.023)), THEME.muted);
  }
}
