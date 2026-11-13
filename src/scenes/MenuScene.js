import Phaser from 'phaser';
import { THEME } from '../theme/ultimaMaoTheme.js';
import { background, button, label, rect } from '../ui/draw.js';
import { GAME_TITLE } from '../version.js';

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
    const compact = h < 480;
    background(this, w, h);
    const cx = w/2;
    const headingSize = Math.min(small ? 45 : 76, w * .105);

    label(this, cx, h*(compact ? .09 : .16), '✦  UM  ✦', Math.max(13, Math.min(19,w*.035)), THEME.bronze, {serif:true});
    label(this, cx, h*(compact ? .22 : .35), 'ÚLTIMA MÃO', compact ? Math.min(42, headingSize) : headingSize, THEME.ivory, {serif:true,bold:true});
    rect(this, cx-Math.min(140,w*.3), h*(compact ? .30 : .425), Math.min(280,w*.6), 1, THEME.blood);
    label(this, cx, h*(compact ? .36 : .51), 'Um baralho amaldiçoado.', Math.min(19,Math.max(13,w*.035)), THEME.paper, {serif:true});
    label(this, cx, h*(compact ? .42 : .56), 'Uma aposta além da vida.', Math.min(19,Math.max(13,w*.035)), THEME.paper, {serif:true});

    const btnY = Math.min(h - (compact ? 138 : 150), h*.73);
    const btnH = Math.max(46, Math.min(52,h*.095));
    this.playButton = button(this, {x:cx, y:btnY, w:Math.min(292,w-50), h:btnH,
      title:'JOGAR', primary:true, fontSize:small?15:18,
      onClick:()=>this.scene.start('GameScene')});
    this.howToPlayButton = button(this, {x:cx, y:btnY+btnH+10, w:Math.min(292,w-50), h:btnH,
      title:'COMO JOGAR', fontSize:small?15:18,
      onClick:()=>this.scene.start('HowToPlayScene')});
    label(this, cx, h-46, 'TRUCO · UMA PARTIDA ATÉ 12 PONTOS', Math.max(9,Math.min(12,w*.023)), THEME.muted);
    label(this, cx, h-24, GAME_TITLE, 12, THEME.bronze);
  }
}
