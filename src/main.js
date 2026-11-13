import Phaser from 'phaser';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import HowToPlayScene from './scenes/HowToPlayScene.js';
import { GAME_TITLE } from './version.js';
import './style.css';

document.title = GAME_TITLE;

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
  scene: [MenuScene, GameScene, HowToPlayScene],
};

new Phaser.Game(config);
