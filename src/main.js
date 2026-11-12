import Phaser from 'phaser';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import './style.css';

const config = {
  type: Phaser.AUTO,
  antialias: true,
  roundPixels: true,
  parent: 'game',
  backgroundColor: '#151515',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: document.getElementById('game').clientWidth,
    height: document.getElementById('game').clientHeight,
  },
  scene: [MenuScene, GameScene],
};

new Phaser.Game(config);
