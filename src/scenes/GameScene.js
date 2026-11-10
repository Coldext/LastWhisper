import Phaser from 'phaser';
import { DemoGame } from '../game/DemoGame.js';
import { card, draggableCard } from '../ui/cardView.js';
import { cardPresentation } from '../ui/cardPresentation.js';
import { HandState } from '../logic/HandState.js';
import { THEME } from '../theme/ultimaMaoTheme.js';
import { background, button, label, rect } from '../ui/draw.js';

// Protótipo de interface: NÃO resolve forças, vazas ou turnos.
const clamp = Phaser.Math.Clamp;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.gameState = null;
    this.message = 'Arraste uma carta até a área central da mesa';
  }

  create() {
    this.resetDemoState();
    this.message = 'Arraste uma carta até a área central da mesa';
    this.input.dragDistanceThreshold = 9; // diferencia toque de arrastar

    this.onResize = () => this.render();
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize);
      this.input.off('dragstart', this.onDragStart);
      this.input.off('drag', this.onDrag);
      this.input.off('dragend', this.onDragEnd);
    });

    this.onDragStart = (pointer, obj) => {
      if (!this.isCurrentCard(obj) || !this.gameState.canPlay(obj.getData('instanceId')) || !this.interaction.start(obj.getData('instanceId'), pointer.id)) return;
      obj.setDepth(50);
      obj.setScale(1.06);
    };
    this.onDrag = (pointer, obj, dragX, dragY) => {
      if (!this.isCurrentCard(obj) || !this.gameState.canPlay(obj.getData('instanceId')) || !this.interaction.isDragging(obj.getData('instanceId'), pointer.id)) return;
      obj.setPosition(dragX, dragY);
      // Verde/marfim claro: sinaliza apenas posição válida, sem revelar regras.
      this.dropHighlight?.setVisible(this.isOverDropArea(pointer.x, pointer.y));
    };
    this.onDragEnd = (pointer, obj) => {
      if (!this.isCurrentCard(obj) || !this.gameState.canPlay(obj.getData('instanceId')) || !this.interaction.isDragging(obj.getData('instanceId'), pointer.id)) return;
      this.dropHighlight?.setVisible(false);
      const instanceId = obj.getData('instanceId');
      if (this.isOverDropArea(pointer.x, pointer.y)) {
        const area = this.dropArea;
        // Impede que a carta fique cortada pela borda.
        const px = clamp(pointer.x, area.x + this.cardWidth/2, area.x + area.width - this.cardWidth/2);
        const py = clamp(pointer.y, area.y + this.cardHeight/2, area.y + area.height - this.cardHeight/2);
        if (!this.gameState.play(instanceId)) return;
        if (!this.interaction.play(instanceId, pointer.id, {
          // Posição relativa à área útil: permanece coerente após resize.
          rx: (px - area.x) / area.width,
          ry: (py - area.y) / area.height,
        })) return;
        this.input.setDraggable(obj, false);
        obj.disableInteractive();
        obj.setPosition(px, py).setScale(1).setDepth(0);
        this.message = `${cardPresentation(this.gameState.deck.getCard(instanceId)).face} colocada na mesa (demonstração)`;
        this.statusText?.setText(this.message);
        this.dropHint?.setVisible(false);
      } else {
        this.interaction.returnCard(instanceId, pointer.id);
        this.input.setDraggable(obj, false);
        obj.disableInteractive();
        const home = obj.getData('home');
        this.tweens.add({targets:obj, x:home.x, y:home.y,
          scale:1, duration:170, ease:'Sine.easeOut',
          onComplete:()=>{
            if (!this.isCurrentCard(obj) || !this.interaction.finishReturn(instanceId)) return;
            obj.setDepth(0);
            obj.input.enabled = true;
            this.input.setDraggable(obj, true);
          }});
        this.message = 'Solte dentro da mesa para jogar a carta';
        this.statusText?.setText(this.message);
      }
    };
    this.input.on('dragstart', this.onDragStart);
    this.input.on('drag', this.onDrag);
    this.input.on('dragend', this.onDragEnd);
    this.render();
  }

  resetDemoState() {
    this.gameState = new DemoGame();
    this.prepareHandView();
    this.dealBlocked = false;
    this.message = 'Arraste uma carta até a área central da mesa';
  }

  prepareHandView() {
    this.handSlots = this.gameState.playerHand.map(card => card.instanceId);
    this.interaction = new HandState(this.handSlots);
    this.played = this.interaction.played;
  }

  startNewHand() {
    try {
      this.gameState.newHand();
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.message = 'Monte insuficiente. Use REINICIAR DEMO para começar de novo.';
      this.dealBlocked = true;
      this.render();
      return;
    }
    this.prepareHandView();
    this.dealBlocked = false;
    this.message = 'Arraste uma carta até a mesa';
    this.render();
  }

  isCurrentCard(obj) {
    return obj.active && obj.getData('handCard') &&
      this.cardObjects.get(obj.getData('instanceId')) === obj;
  }

  isOverDropArea(x,y) {
    return !!this.dropArea && Phaser.Geom.Rectangle.Contains(this.dropArea,x,y);
  }

  render() {
    this.interaction.cancelTransient();
    this.cardObjects = new Map();
    this.dropHint = null;
    this.tweens.killAll();
    this.children.removeAll(true);
    const w = this.scale.width, h = this.scale.height;
    if (w < 200 || h < 260) return;
    const portrait = h > w;
    const compact = h < 510;
    const cx = w/2;
    background(this,w,h);

    const topY = compact ? 21 : 27;
    label(this,16,topY,'‹ MENU',Math.max(11,Math.min(15,w*.028)),THEME.ivory,{originX:0});
    this.add.zone(48,topY,96,44).setInteractive({useHandCursor:true})
      .on('pointerdown',()=>this.scene.start('MenuScene'));
    label(this,cx,topY,'O ERRANTE',Math.max(13,Math.min(20,w*.037)),THEME.ivory,{serif:true,bold:true});
    label(this,w-16,topY,`MÃO ${String(this.gameState.handNumber).padStart(2,'0')}`,Math.max(10,Math.min(14,w*.027)),THEME.paper,{originX:1});
    label(this,w-16,compact?44:53,'REINICIAR DEMO',9,THEME.muted,{originX:1});
    this.add.zone(w-66,compact?44:53,120,24).setInteractive({useHandCursor:true})
      .on('pointerdown',()=>{this.resetDemoState();this.render();});
    rect(this,16,compact?58:67,w-32,1,THEME.line);

    // Adversário: três versos; seus tokens permanecem apenas como quantidade pública.
    const enemyY = portrait || compact ? h*.18 : h*.20;
    const enemyW = portrait ? Math.min(47,w*.12) : Math.min(44,h*(compact ? .08 : .16));
    for (let i=0;i<this.gameState.opponentHand.length;i++) card(this,cx+(i-1)*(enemyW+8),enemyY,enemyW,null,false,true);
    label(this,cx,enemyY+enemyW*.9,'TOKENS OCULTOS: 2',Math.max(10,Math.min(12,w*.025)),THEME.muted);

    // Mesa alongada: área da vira à esquerda e espaço de jogada à direita.
    // Em portrait ela cresce em altura; em landscape cresce em largura.
    const outerX = Math.max(16,w*.04);
    const outerW = w - outerX*2;
    const boardTop = portrait ? h*.295 : h*.29;
    const boardBottom = portrait ? h*.635 : h*.67;
    const boardH = boardBottom-boardTop;
    rect(this,outerX,boardTop,outerW,boardH,THEME.panel,THEME.line,12,.97);
    label(this,cx,boardTop+21,this.dealBlocked ? 'MONTE INSUFICIENTE · REINICIE A DEMO' : 'MESA · VAZA 1/3',
      this.dealBlocked ? 10 : Math.max(11,Math.min(15,w*.028)),THEME.paper);

    this.cardWidth = portrait
      ? Math.min(90,Math.max(59,w*.205),h*.14)
      : Math.min(100,Math.max(55,h*.20),w*.115);
    // A carta inteira precisa caber na área de soltura, inclusive em landscape baixo.
    this.cardWidth = Math.min(this.cardWidth, Math.max(42,(boardH-66)/1.4));
    this.cardHeight = this.cardWidth*1.4;
    const viraW = Math.min(this.cardWidth*.68,boardH*.35);
    const viraX = outerX + Math.max(36,outerW*.14);
    const viraY = boardTop+boardH*.55;
    label(this,viraX,boardTop+49,'VIRA',11,THEME.muted);
    card(this,viraX,viraY,viraW,this.gameState.vira);

    // A área de soltura não inclui a vira. Reservamos margens para a carta inteira.
    const dropLeft = outerX + Math.max(75,outerW*.27);
    const dropTop = boardTop+42;
    this.dropArea = new Phaser.Geom.Rectangle(
      dropLeft, dropTop,
      outerX+outerW-11-dropLeft,
      boardBottom-12-dropTop
    );
    const highlight = rect(this,this.dropArea.x,this.dropArea.y,
      this.dropArea.width,this.dropArea.height,THEME.bronze,THEME.ivory,7,.13);
    highlight.setVisible(false);
    this.dropHighlight = highlight;
    if (!this.played.length) {
      this.dropHint = label(this,this.dropArea.centerX,this.dropArea.centerY,
        'SOLTE A CARTA AQUI',Math.max(10,Math.min(14,w*.027)),THEME.muted,
        {wrap:this.dropArea.width-8});
    }
    for (const p of this.played) {
      const px=clamp(this.dropArea.x+p.rx*this.dropArea.width,
        this.dropArea.x+this.cardWidth/2,this.dropArea.right-this.cardWidth/2);
      const py=clamp(this.dropArea.y+p.ry*this.dropArea.height,
        this.dropArea.y+this.cardHeight/2,this.dropArea.bottom-this.cardHeight/2);
      card(this,px,py,this.cardWidth,this.gameState.deck.getCard(p.instanceId));
    }

    // Cartas da mão maiores. Cada carta é um Container arrastável.
    const handY = portrait ? h*.745 : h*.795;
    const gap = Math.min(15,w*.025);
    const spacing = Math.min(this.cardWidth+gap,(w-28-this.cardWidth)/2);
    this.handSlots.forEach((instanceId,index)=>{
      if (!this.gameState.canPlay(instanceId)) return;
      const value = this.gameState.deck.getCard(instanceId);
      const x = cx + (index-1)*spacing;
      const group = draggableCard(this,x,handY,this.cardWidth,value);
      this.cardObjects.set(instanceId, group);
      group.setData('handCard',true);
      group.setData('instanceId',instanceId);
      group.setData('home',{x,y:handY});
    });

    const actionsY = h-(compact?27:38);
    const side = Math.min(14,w*.035), gapBtn=8;
    const bw=(w-side*2-gapBtn*2)/3;
    const bh=Math.min(53,Math.max(42,h*.067));
    const fs=Math.max(10,Math.min(15,bw*.12));
    button(this,{x:side+bw/2,y:actionsY,w:bw,h:bh,title:'TRUCO',primary:true,fontSize:fs,
      onClick:()=>{this.message='Truco será implementado na fase de regras';this.statusText?.setText(this.message);}});
    button(this,{x:cx,y:actionsY,w:bw,h:bh,title:'NOVA MÃO',fontSize:fs,
      onClick:()=>this.startNewHand()});
    button(this,{x:w-side-bw/2,y:actionsY,w:bw,h:bh,title:'TOKENS',fontSize:fs,
      onClick:()=>{this.message='Tokens serão implementados depois';this.statusText?.setText(this.message);}});
    const messageY=actionsY-bh/2-16;
    // Não desenhe mensagens sobre as cartas da mão em telas baixas.
    if(messageY>handY+this.cardHeight*.58+8){
      this.statusText=label(this,cx,messageY,this.message,Math.max(10,Math.min(12,w*.025)),THEME.muted,{wrap:w-22});
    } else this.statusText=null;
  }
}
