import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runScenarios({ cdp, evaluate, frames, press, move, release, click, setTouch, baseURL }) {
  const moduleURL = path => JSON.stringify(new URL(path, `${baseURL}/`).href);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(fn, description) {
    const deadline = Date.now() + 15000;
    do { const value = await fn(); if (value) return value; await delay(25); } while (Date.now() < deadline);
    throw new Error(`Timeout: ${description}`);
  }
  const snapshot = () => evaluate(`(() => {
    const s = window.__scene, m = s.gameState, canvas = document.querySelector('canvas').getBoundingClientRect();
    const point = (x,y) => ({x:canvas.left+x*canvas.width/s.scale.width,y:canvas.top+y*canvas.height/s.scale.height});
    return {phase:m.phase, hand:m.handNumber, score:m.score, busy:s.presenter.busy, error:s.presenter.error?.message,
      active:m.activePlayerId, accepted:m.acceptedBet, pending:m.pendingBet, winner:m.matchWinnerId,
      remaining:m.deck.remaining, version:s.viewVersion, width:s.scale.width,height:s.scale.height,
      area:{...point(s.dropArea.centerX,s.dropArea.centerY)},
      cards:[...s.cardObjects].map(([id,c])=>({id,...point(c.x,c.y),enabled:!!c.input?.enabled,
        bottom:point(c.x,c.y+c.height/2).y,strength:window.__strength(m.deck.getCard(id),m.vira)})),
      table:m.deck.cardsIn('table').map(c=>c.instanceId),
      controls:Object.fromEntries([...s.controls].map(([id,c])=>[id,{...point(c.x,c.y),top:point(c.x,c.y-c.height/2).y,
        enabled:!!c.input?.enabled,width:c.width,labelWidth:c.getData('label').width}])),
      hidden:s.children.list.filter(c=>c.type==='Container'&&!c.getData('instanceId')).length,
      enemyCount:m.handOf('opponent').length, listeners:s.input.listenerCount('dragstart'),
      labels:s.children.list.filter(c=>typeof c.text==='string').map(c=>c.text),
      canvas:{left:canvas.left,top:canvas.top,right:canvas.right,bottom:canvas.bottom},
      viewport:{width:innerWidth,height:innerHeight}};
  })()`);
  function assertButtonLabels(state) {
    for (const [id, control] of Object.entries(state.controls)) {
      assert.ok(control.labelWidth <= control.width - 16, `button label must fit: ${id}`);
    }
  }
  async function control(id) {
    const item = await until(async () => { const s = await snapshot(); return s.controls[id]?.enabled && s.controls[id]; }, `control ${id}`);
    await click(item.x, item.y);
  }
  async function drag(card, destination) {
    await press(card.x, card.y);
    await move(card.x + 14, card.y - 14);
    await move(destination.x, destination.y);
    await release(destination.x, destination.y);
  }
  async function configure(kind) {
    await evaluate(`(async () => {
      const s=window.__scene;
      const {createTrucoAI}=await import(${moduleURL('src/game/ai/BettingAI.js')});
      const {createCardAI}=await import(${moduleURL('src/game/ai/CardAI.js')});
      s.aiFactory=${kind === 'real' ? '() => createTrucoAI({rng:()=>0.5})' : kind === 'cards'
    ? '() => createCardAI({rng:()=>0.5})' : `() => ({chooseAction:view=>view.legalActions.find(a=>a.type==='counterRaise')??
        view.legalActions.find(a=>a.type==='acceptBet')??view.legalActions.find(a=>a.type==='playCard')})`};
      s.restartMatch();
    })()`);
    await frames();
  }
  async function screenshot(name) {
    if (process.env.BROWSER_SCREENSHOTS === '0') return;
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(`artifacts/truco-v0.3/${name}.png`, Buffer.from(shot.data, 'base64'));
  }
  async function playToEnd(preferLast = false) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const state = await snapshot();
      assert.equal(state.error, undefined);
      assert.equal(state.hidden, state.enemyCount);
      if (state.phase === 'matchComplete') return state;
      if (state.pending?.responderId === 'player' && !state.busy) await control('acceptBet');
      else if (state.active === 'player' && !state.busy) {
        const cards = state.cards.filter(card => card.enabled).sort((a,b)=>a.strength-b.strength);
        assert.ok(cards.length);
        await drag(preferLast ? cards.at(-1) : cards[0], state.area);
      } else await delay(30);
    }
    throw new Error('Timeout: full browser match');
  }
  await mkdir('artifacts/truco-v0.3', { recursive: true });
  for (const mode of [
    { name: 'desktop', width: 1100, height: 760, touch: false },
    { name: 'portrait-320-touch', width: 320, height: 568, touch: true },
    { name: 'landscape-320-touch', width: 568, height: 320, touch: true },
    { name: 'portrait-375-touch', width: 375, height: 667, touch: true },
    { name: 'landscape-375-touch', width: 667, height: 375, touch: true },
    { name: 'portrait-touch', width: 390, height: 844, touch: true },
    { name: 'landscape-touch', width: 844, height: 390, touch: true },
    { name: 'portrait-768-touch', width: 768, height: 1024, touch: true },
    { name: 'landscape-768-touch', width: 1024, height: 768, touch: true },
  ]) {
    setTouch(mode.touch);
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: mode.touch, maxTouchPoints: 5 });
    await cdp('Emulation.setDeviceMetricsOverride', { width: mode.width, height: mode.height, deviceScaleFactor: 1, mobile: mode.touch });
    await cdp('Page.navigate', { url: `${baseURL}/?mode=${mode.name}` });
    await until(() => evaluate("!!document.querySelector('canvas')"), 'menu canvas');
    await evaluate(`(async()=>{
      const {default:Scene}=await import(${moduleURL('src/scenes/GameScene.js')});
      const {MatchController}=await import(${moduleURL('src/game/MatchController.js')});
      const {createCardAI}=await import(${moduleURL('src/game/ai/CardAI.js')});
      const {getCardStrength}=await import(${moduleURL('src/game/rules/CardStrength.js')});
      window.__strength=getCardStrength;
      Scene.prototype.matchFactory=()=>new MatchController({rng:()=>0});
      Scene.prototype.aiFactory=()=>createCardAI({rng:()=>0.5});
      Scene.prototype.presentationTimings={ai:100,card:80,trick:120,result:500};
      const create=Scene.prototype.create;
      Scene.prototype.create=function(){window.__scene=this;return create.call(this);};
    })()`);
    await click(mode.width / 2, Math.min(mode.height - (mode.height < 480 ? 138 : 150), mode.height * 0.73));
    await until(() => evaluate('!!window.__scene?.dropArea'), 'game scene');
    let state = await snapshot();
    assert.equal(state.remaining, 45);
    assert.equal(state.cards.length, 3);
    assert.equal(state.hidden, 3);
    assertButtonLabels(state);
    assert.ok(state.cards.every(card => card.bottom <= state.controls.raise.top - 1), 'hand stays above action bar');
    const firstId = state.cards[0].id;
    for (let i = 0; i < 3; i++) {
      state = await snapshot();
      await drag(state.cards.find(card => card.id === firstId), { x: 12, y: mode.height * 0.6 });
      await until(() => evaluate(`window.__scene.interaction.cards.get(${JSON.stringify(firstId)})?.state==='inHand'`), 'invalid return');
      assert.equal((await snapshot()).cards.length, 3);
    }
    // A rotation interrupts an in-progress drag without committing a play.
    state = await snapshot();
    await press(state.cards[0].x, state.cards[0].y);
    await move(state.cards[0].x + 18, state.cards[0].y - 18);
    await cdp('Emulation.setDeviceMetricsOverride', { width: mode.height, height: mode.width,
      deviceScaleFactor: 1, mobile: mode.touch });
    await until(async () => (await snapshot()).width === mode.height, 'rotation during drag');
    await release(15, 100);
    assert.equal((await snapshot()).table.length, 0);
    assert.equal((await snapshot()).cards.length, 3);
    await cdp('Emulation.setDeviceMetricsOverride', { width: mode.width, height: mode.height,
      deviceScaleFactor: 1, mobile: mode.touch });
    await until(async () => (await snapshot()).width === mode.width, 'restore after cancelled drag');
    state = await snapshot();
    await drag(state.cards[0], state.area);
    assert.ok((await snapshot()).table.includes(firstId));
    // Repeated events on an old card cannot cause another player play.
    await evaluate(`(() => {
      const s=window.__scene,id=${JSON.stringify(firstId)};
      const old={active:true,getData:key=>key==='instanceId'?id:true};
      for(let i=0;i<20;i++){s.onDragStart({id:0},old);s.onDragEnd({id:0},old);}
    })()`);
    assert.equal((await snapshot()).cards.length, 2);
    // Rotate while AI callbacks/animations may be pending. Model cards stay valid.
    const width = mode.touch ? mode.height : mode.width - 60;
    const height = mode.touch ? mode.width : mode.height;
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: mode.touch });
    await until(async () => (await snapshot()).width === width, 'rotation');
    assert.ok((await snapshot()).table.includes(firstId));
    assert.equal((await snapshot()).hand, 1);
    assert.equal((await snapshot()).error, undefined);
    state = await snapshot();
    assert.ok(state.cards.every(card => card.bottom <= state.controls.raise.top - 1), 'rotated hand stays above actions');
    await screenshot(`${mode.name}-table`);

    await configure('scripted');
    await control('raise');
    await until(async () => (await snapshot()).pending?.responderId === 'player', 'counter-offer modal');
    state = await snapshot();
    assert.equal(state.pending.value, 6);
    assertButtonLabels(state);
    for (const id of ['acceptBet', 'fold', 'counterRaise']) assert.ok(state.controls[id]?.enabled);
    assert.ok(state.cards.every(card => !card.enabled));
    // Modal remains functional after resizing, including touch hit boxes.
    await cdp('Emulation.setDeviceMetricsOverride', { width: mode.width, height: mode.height, deviceScaleFactor: 1, mobile: mode.touch });
    await until(async () => (await snapshot()).width === mode.width, 'modal rotation');
    assert.equal((await snapshot()).pending.value, 6);
    await screenshot(`${mode.name}-bet`);
    await control('acceptBet');
    assert.equal((await snapshot()).accepted, 6);
    assert.equal((await snapshot()).active, 'player');

    await configure('scripted');
    await control('raise');
    await until(async () => (await snapshot()).pending?.responderId === 'player', 'fold modal');
    await control('fold');
    state = await snapshot();
    assert.equal(state.phase, 'handComplete');
    assert.equal(state.score.opponent, 3);
    assert.ok(state.labels.some(text => text.includes('RECUSA')));
    await until(async () => (await snapshot()).hand === 2, 'automatic next hand');
    assert.equal((await snapshot()).score.opponent, 3);

    // Header restart is available even during a modal; old schedules are cancelled.
    await configure('scripted');
    await control('raise');
    await control('restart');
    await delay(400);
    assert.equal((await snapshot()).pending, null);
    assert.deepEqual((await snapshot()).score, { player: 0, opponent: 0 });

    await control('raise');
    await until(async () => (await snapshot()).pending?.responderId === 'player', 'raise to nine');
    await control('counterRaise');
    await until(async () => (await snapshot()).pending?.value === 12, 'maximum offer');
    state = await snapshot();
    assert.equal(state.controls.counterRaise, undefined);
    await control('acceptBet');
    const final = await playToEnd(mode.height > mode.width);
    assert.ok(final.score[final.winner] >= 12);
    assert.ok(final.controls.playAgain.enabled && final.controls.finalMenu.enabled);
    assertButtonLabels(final);
    assert.ok(final.labels.includes(mode.height > mode.width ? 'DERROTA' : 'VITÓRIA'));
    await screenshot(`${mode.name}-final`);
    await control('playAgain');
    assert.equal((await snapshot()).hand, 1);
    assert.deepEqual((await snapshot()).score, { player: 0, opponent: 0 });

    // Simulated safe-area insets: canvas and input coordinates follow the parent.
    await evaluate("document.getElementById('app').style.padding='12px 20px 14px 18px';window.dispatchEvent(new Event('resize'))");
    await until(async () => (await snapshot()).canvas.left >= 17, 'safe-area canvas');
    state = await snapshot();
    assert.ok(state.canvas.right <= state.viewport.width + 1);
    assert.ok(state.canvas.bottom <= state.viewport.height + 1);
    await control('raise');
    await until(async () => (await snapshot()).pending?.responderId === 'player', 'safe-area modal input');
    await control('acceptBet');
    await evaluate("document.getElementById('app').style.padding='';window.dispatchEvent(new Event('resize'))");

    if (!mode.touch) {
      await configure('real');
      const complete = await playToEnd();
      assert.ok(complete.score[complete.winner] >= 12);
    }
    await control('menu');
    await until(() => evaluate("window.__scene.scene.isActive('MenuScene')"), 'menu navigation');
    await click(mode.width / 2, Math.min(mode.height - (mode.height < 480 ? 138 : 150), mode.height * 0.73));
    await until(() => evaluate("window.__scene.scene.isActive('GameScene')"), 'reentry');
    assert.equal((await snapshot()).listeners, 1);
    console.log(`PASS ${mode.name}: drag/drop, AI, rotation, betting, hand results, final screen, restart, safe areas, menu`);
  }
}
