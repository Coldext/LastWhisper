import Phaser from 'phaser';
import { MATCH_PHASES } from '../game/MatchController.js';
import { createMatchObservation } from '../game/ai/matchObservation.js';
import { THEME } from '../theme/ultimaMaoTheme.js';
import { background, button, label, rect } from './draw.js';
import { card, draggableCard } from './cardView.js';

const name = id => id === 'player' ? 'VOCÊ' : 'O ERRANTE';
const pointText = points => `${points} ${points === 1 ? 'PONTO' : 'PONTOS'}`;

function control(scene, id, options, callback) {
  const version = scene.viewVersion;
  const hit = button(scene, { ...options, onClick: () => {
    if (scene.viewVersion === version && hit.active) callback(version);
  } });
  scene.controls.set(id, hit);
  return hit;
}

function overlay(scene, { title, detail, actions = [] }) {
  const w = scene.scale.width, h = scene.scale.height;
  const shade = scene.add.zone(w / 2, (h + 64) / 2, w, h - 64).setInteractive();
  shade.setData('modalBlocker', true);
  rect(scene, 0, 64, w, h - 64, THEME.obsidian, null, 0, 0.88);
  const width = Math.min(520, w - 28), height = Math.min(230, h - 72);
  const top = (h - height) / 2;
  rect(scene, (w - width) / 2, top, width, height, THEME.panel, THEME.bronze, 10);
  label(scene, w / 2, top + 40, title, Math.min(25, width * 0.065), THEME.ivory, { serif: true, bold: true });
  label(scene, w / 2, top + 87, detail, Math.min(15, width * 0.04), THEME.paper, { wrap: width - 24 });
  const gap = 8, bw = (width - 24 - gap * (Math.max(1, actions.length) - 1)) / Math.max(1, actions.length);
  actions.forEach((action, index) => control(scene, action.id, {
    x: (w - width) / 2 + 12 + bw / 2 + index * (bw + gap), y: top + height - 40,
    w: bw, h: 48, title: action.title, primary: action.primary, fontSize: Math.min(14, bw * 0.15),
  }, action.run));
  return { width, height, top };
}

export function renderGameTable(scene) {
  const match = scene.gameState;
  const view = createMatchObservation(match, 'player');
  const w = scene.scale.width, h = scene.scale.height;
  if (w < 200 || h < 260) return;
  const compact = h < 510, cx = w / 2;
  background(scene, w, h);
  control(scene, 'menu', { x: 48, y: 25, w: 88, h: 40, title: '‹ MENU', fontSize: 11 }, () => scene.returnToMenu());
  control(scene, 'restart', { x: w - 62, y: 25, w: 112, h: 40, title: 'REINICIAR', fontSize: 10 }, () => scene.restartMatch());
  label(scene, cx, 21, 'O ERRANTE', Math.min(20, w * 0.038), THEME.ivory, { serif: true, bold: true });
  label(scene, cx, !compact && w < 400 ? 54 : 48,
    `VOCÊ ${view.score.player}  ·  ${view.score.opponent} ERRANTE`, compact ? 12 : 15, THEME.paper);
  scene.enemyY = compact ? h * 0.235 : h * 0.185;
  const enemyWidth = compact ? 25 : Math.min(42, w * 0.1);
  for (let i = 0; i < view.opponentCardCount; i++) {
    card(scene, cx + (i - (view.opponentCardCount - 1) / 2) * (enemyWidth + 8), scene.enemyY, enemyWidth, null, false, true);
  }

  const x = Math.max(14, w * 0.04), width = w - x * 2;
  const top = h * (compact ? 0.33 : 0.29), bottom = h * 0.64, height = bottom - top;
  const playLeft = x + width * 0.28, playWidth = x + width - 12 - playLeft;
  scene.dropArea = new Phaser.Geom.Rectangle(playLeft, top + 34, playWidth * 0.49, height - 44);
  scene.cardWidth = Math.min(90, w * 0.205, h * 0.15, (height - 52) / 1.4, scene.dropArea.width - 8);
  scene.cardHeight = scene.cardWidth * 1.4;
  rect(scene, x, top, width, height, THEME.panel, THEME.line, 12);
  const trickNumber = Math.min(3, view.tricks.length + (match.phase === MATCH_PHASES.AWAITING_PLAY ||
    match.phase === MATCH_PHASES.AWAITING_BET_RESPONSE || match.phase === MATCH_PHASES.RESOLVING_TRICK ? 1 : 0));
  label(scene, cx, top + 17, `MÃO ${match.handNumber}  ·  VAZA ${Math.max(1, trickNumber)}/3  ·  VALE ${match.acceptedBet}`,
    Math.min(14, w * 0.03), THEME.paper);
  const viraX = x + width * 0.135;
  label(scene, viraX, top + 43, 'VIRA', 10, THEME.muted);
  card(scene, viraX, top + height * 0.62, scene.cardWidth * 0.72, view.vira);
  scene.dropHighlight = rect(scene, scene.dropArea.x, scene.dropArea.y, scene.dropArea.width,
    scene.dropArea.height, THEME.bronze, THEME.ivory, 6, 0.15).setVisible(false);
  const shown = view.plays.length ? view.plays : view.tricks.at(-1)?.plays ?? [];
  if (!shown.length) label(scene, scene.dropArea.centerX, scene.dropArea.centerY,
    'SOLTE AQUI', Math.min(12, w * 0.028), THEME.muted);
  for (const play of shown) {
    const position = scene.played.find(item => item.instanceId === play.instanceId);
    const area = scene.dropArea;
    const px = play.playerId === 'opponent' ? playLeft + playWidth * 0.76
      : Phaser.Math.Clamp(area.x + (position?.rx ?? 0.5) * area.width, area.x + scene.cardWidth / 2, area.right - scene.cardWidth / 2);
    const py = Phaser.Math.Clamp(area.y + (position?.ry ?? 0.5) * area.height,
      area.y + scene.cardHeight / 2, area.bottom - scene.cardHeight / 2);
    const group = card(scene, px, py, scene.cardWidth, play);
    scene.tableObjects.set(play.instanceId, group);
  }
  const results = view.tricks.map(trick => `${trick.trickNumber}ª: ${name(trick.winnerId)}`).join('   ·   ');
  label(scene, cx, bottom + (compact ? 9 : 14), results || 'TRÊS VAZAS · DUAS VITÓRIAS', compact ? 9 : 11, THEME.bronze, { wrap: w - 24 });

  const handY = compact ? Math.min(h * 0.775, h - 54 - scene.cardHeight / 2) : h * 0.79;
  const spacing = Math.min(scene.cardWidth + 15, (w - 28 - scene.cardWidth) / 2);
  for (const value of view.ownHand) {
    const index = scene.handSlots.indexOf(value.instanceId);
    const group = draggableCard(scene, cx + (index - 1) * spacing, handY, scene.cardWidth, value);
    scene.cardObjects.set(value.instanceId, group);
    group.setData('handCard', true).setData('home', { x: group.x, y: group.y });
    if (!scene.canDrag(value.instanceId)) {
      scene.input.setDraggable(group, false);
      group.disableInteractive();
      group.setAlpha(0.65);
    }
  }
  const status = scene.presenter.error ? `Falha: ${scene.presenter.error.message}. Reinicie a partida.`
    : scene.message || (match.pendingBet ? `${name(match.pendingBet.responderId)} RESPONDE À APOSTA`
      : match.phase === MATCH_PHASES.RESOLVING_TRICK ? 'CONFERINDO A VAZA'
        : match.activePlayerId === 'player' && !scene.presenter.busy ? 'SUA VEZ · ARRASTE UMA CARTA' : 'O ERRANTE ESTÁ PENSANDO');
  scene.statusText = label(scene, cx, compact ? top - 12 : handY - scene.cardHeight / 2 - 14,
    status, compact ? 10 : 12, THEME.paper, { wrap: w - 24 });
  const raise = view.legalActions.find(action => action.type === 'requestRaise');
  control(scene, 'raise', { x: cx, y: h - 29, w: Math.min(280, w - 40), h: 44,
    title: raise ? (raise.value === 3 ? 'TRUCO' : `PEDIR ${raise.value}`) : `MÃO VALE ${match.acceptedBet}`,
    primary: true, enabled: !!raise && !scene.presenter.busy, fontSize: 14 }, version => scene.perform(raise, version));

  if (match.pendingBet) {
    const pending = match.pendingBet;
    const responding = pending.responderId === 'player' && !scene.presenter.busy;
    const titles = { acceptBet: 'ACEITAR', fold: 'CORRER', counterRaise: 'AUMENTAR' };
    const actions = responding ? view.legalActions.filter(action => titles[action.type]).map(action => ({
      id: action.type, title: action.type === 'counterRaise' ? `AUMENTAR ${action.value}` : titles[action.type],
      primary: action.type === 'acceptBet', run: version => scene.perform(action, version),
    })) : [];
    const modal = overlay(scene, { title: `${name(pending.proposerId)} PEDE ${pending.value}`,
      detail: `Aceito: ${match.acceptedBet} · Proposta: ${pending.value}\n${responding ? 'Aceite, corra ou aumente.' : 'Aguardando o Errante…'}`, actions });
    scene.presentationHooks?.decorateBet?.(scene, modal, { ...pending });
  } else if ([MATCH_PHASES.HAND_COMPLETE, MATCH_PHASES.MATCH_COMPLETE].includes(match.phase)) {
    const final = match.phase === MATCH_PHASES.MATCH_COMPLETE;
    const result = match.handResult;
    overlay(scene, { title: final ? (match.matchWinnerId === 'player' ? 'VITÓRIA' : 'DERROTA') : `${name(result.winnerId)} VENCEU A MÃO`,
      detail: `${name(result.winnerId)} +${pointText(result.points)}${result.reason === 'fold' ? ' · RECUSA' : ''}\n` +
        `VOCÊ ${view.score.player}  ·  ${view.score.opponent} ERRANTE${final ? '' : '\nPreparando a próxima mão…'}`,
      actions: final ? [
        { id: 'playAgain', title: 'JOGAR NOVAMENTE', primary: true, run: () => scene.restartMatch() },
        { id: 'finalMenu', title: 'MENU', run: () => scene.returnToMenu() },
      ] : [] });
  }
}
