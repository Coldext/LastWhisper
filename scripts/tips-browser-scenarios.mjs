import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runScenarios({ cdp, evaluate, frames, press, move, release, click, setTouch, baseURL }) {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(expression) {
    const deadline = Date.now() + 15000;
    while (!await evaluate(expression)) {
      if (Date.now() > deadline) throw new Error(`Timeout: ${expression}`);
      await delay(25);
    }
  }
  const snapshot = () => evaluate(`(() => {
    const s=window.__game,m=s.gameState,t=s.scene.get('TipsScene');
    const r=document.querySelector('canvas').getBoundingClientRect();
    const point=o=>({x:r.left+o.x,y:r.top+o.y});
    return {phase:m.phase,hand:m.handNumber,active:m.activePlayerId,busy:s.presenter.busy,
      events:m.events.length,score:m.score,accepted:m.acceptedBet,error:s.presenter.error?.message,
      fingerprint:JSON.stringify({phase:m.phase,events:m.events,deck:m.deck,score:m.score}),
      controls:Object.fromEntries([...s.controls].map(([id,o])=>[id,{...point(o),w:o.width,h:o.height}])),
      cards:[...s.cardObjects.values()].filter(o=>o.input?.enabled).map(o=>point(o)),
      drop:point({x:s.dropArea.centerX,y:s.dropArea.centerY}),
      tips:s.scene.isActive('TipsScene')?{hand:t.handNumber,reference:t.reference,
        offset:t.scrollOffset,max:t.maxScroll,top:t.bodyTop,bottom:t.bodyBottom,
        contentBottom:t.content.y+t.contentHeight,close:{...point(t.closeButton),w:t.closeButton.width,h:t.closeButton.height},
        labels:t.content.list.filter(o=>o.type==='Text').map(o=>o.text),
        overflow:t.content.list.filter(o=>o.type==='Text' && (o.x-o.width*o.originX<0 || o.x+o.width*(1-o.originX)>t.width+1)).map(o=>o.text),
        instanceIds:t.content.list.filter(o=>o.type==='Container').map(o=>o.getData('instanceId')??null),
        publicVira:{rank:m.vira.rank,suit:m.vira.suit},manilha:m.manilhaRank}:null};
  })()`);
  async function control(id) {
    const s=await snapshot(),b=s.controls[id];
    await click(b.x,b.y);
  }
  async function open() { await control('tips'); await until("window.__game.scene.isActive('TipsScene')"); }
  async function close() {
    const s=await snapshot(); await click(s.tips.close.x,s.tips.close.y);
    await until("!window.__game.scene.isActive('TipsScene')");
  }
  async function drag(card,drop) {
    await press(card.x,card.y); await move(card.x+12,card.y-12);
    await move(drop.x,drop.y); await release(drop.x,drop.y);
  }
  function verify(s) {
    assert.equal(s.error,undefined);
    assert.deepEqual(s.tips.reference.vira,s.tips.publicVira);
    assert.equal(s.tips.reference.manilhaRank,s.tips.manilha);
    assert.equal(s.tips.hand,s.hand);
    assert.equal(s.tips.reference.ranks,'3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4');
    assert.deepEqual(s.tips.reference.suits.map(o=>o.suit),['clubs','hearts','spades','diamonds']);
    assert.deepEqual(s.tips.instanceIds,[null,null,null,null,null]);
    assert.deepEqual(s.tips.overflow,[]);
    for(const title of ['FORÇA DAS CARTAS','FORÇA DOS NAIPES','MANILHA ATUAL']) assert.ok(s.tips.labels.includes(title));
  }
  await mkdir('artifacts/tips-v0.3.2',{recursive:true});
  for (const [width,height] of [[1100,760],[320,568],[568,320],[375,667],[667,375],[390,844],[844,390],[768,1024],[1024,768]]) {
    const touch=width!==1100;
    setTouch(touch);
    const metrics={width,height,deviceScaleFactor:1,mobile:touch};
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:touch});
    await cdp('Emulation.setDeviceMetricsOverride',metrics);
    await cdp('Page.navigate',{url:`${baseURL}/`});
    await until("!!document.querySelector('canvas')");
    await evaluate(`(async()=>{
      const {default:Game}=await import(${JSON.stringify(`${baseURL}/src/scenes/GameScene.js`)});
      const {MatchController}=await import(${JSON.stringify(`${baseURL}/src/game/MatchController.js`)});
      Game.prototype.matchFactory=()=>new MatchController({rng:()=>0});
      Game.prototype.aiFactory=()=>({chooseAction:v=>v.legalActions.find(a=>a.type==='acceptBet')??v.legalActions.find(a=>a.type==='playCard')});
      Game.prototype.presentationTimings={ai:700,card:80,trick:250,result:700};
      const create=Game.prototype.create;
      Game.prototype.create=function(){window.__game=this;return create.call(this);};
    })()`);
    await click(width/2,Math.min(height-(height<480?138:150),height*.73));
    await until('!!window.__game?.dropArea');
    let s=await snapshot();
    const before=s.fingerprint,card=s.cards[0],drop=s.drop;
    // Header controls must have distinct touch targets.
    const header=['menu','restart','tips'].map(id=>s.controls[id]).sort((a,b)=>a.x-b.x);
    for(let i=1;i<header.length;i++) assert.ok(header[i-1].x+header[i-1].w/2<=header[i].x-header[i].w/2);
    assert.ok(s.controls.tips.h>=44);
    await open(); s=await snapshot(); verify(s);
    assert.equal(s.fingerprint,before,'opening is read-only');
    // A covered card can lie under FECHAR itself on tall tablets; that target is intentionally active.
    const closing=s.tips.close;
    if(Math.abs(card.x-closing.x)>closing.w/2 || Math.abs(card.y-closing.y)>closing.h/2) await drag(card,drop);
    await click(s.controls.restart.x,s.controls.restart.y);
    assert.ok((await snapshot()).fingerprint===before,'overlay blocks cards and table controls');
    assert.equal(await evaluate("window.__game.perform({type:'requestRaise',playerId:'player',value:3})"),false);
    // Reopen to scroll from the beginning, independent of gestures used in the blocker check.
    await close(); await open(); s=await snapshot();
    const topShot=await cdp('Page.captureScreenshot',{format:'png'});
    await writeFile(`artifacts/tips-v0.3.2/${width}x${height}-top.png`,Buffer.from(topShot.data,'base64'));
    if(touch) {
      for(let i=0;i<12 && s.tips.offset<s.tips.max;i++) {
        await press(width/2,s.tips.bottom-8); await move(width/2,s.tips.top+8); await release(width/2,s.tips.top+8);
        s=await snapshot();
      }
    } else if(s.tips.max) {
      await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:width/2,y:height/2,deltaX:0,deltaY:10000});
      await until("window.__game.scene.get('TipsScene').scrollOffset===window.__game.scene.get('TipsScene').maxScroll");
      s=await snapshot();
    }
    assert.equal(s.tips.offset,s.tips.max);
    assert.ok(s.tips.contentBottom<=s.tips.bottom+1 || !s.tips.max);
    const bottomShot=await cdp('Page.captureScreenshot',{format:'png'});
    await writeFile(`artifacts/tips-v0.3.2/${width}x${height}-bottom.png`,Buffer.from(bottomShot.data,'base64'));
    await cdp('Emulation.setDeviceMetricsOverride',{...metrics,width:height,height:width});
    await until(`window.__game.scale.width===${height}`);
    await evaluate("document.getElementById('app').style.padding='13px 17px 19px 23px'");
    await cdp('Emulation.setDeviceMetricsOverride',{...metrics,width:height+1,height:width});
    await frames(); s=await snapshot(); verify(s);
    assert.ok(s.tips.close.y+24<width-19);
    await close();
    assert.equal((await snapshot()).fingerprint,before,'closing and rotation preserve progress');
    // Real betting/AI timers keep running beneath the reference.
    await control('raise'); await open();
    await until('window.__game.gameState.acceptedBet===3');
    s=await snapshot(); verify(s); assert.equal(s.accepted,3);
    await close();
    s=await snapshot(); await drag(s.cards[0],s.drop); await open();
    const events=(await snapshot()).events;
    await until(`window.__game.gameState.events.length>${events}`);
    assert.ok((await snapshot()).tips,'AI continued while panel stayed open');
    await close();
    const deadline=Date.now()+15000;
    while((s=await snapshot()).phase!=='handComplete') {
      if(Date.now()>deadline) throw new Error('Hand did not complete');
      assert.equal(s.error,undefined);
      if(s.active==='player'&&!s.busy) await drag(s.cards[0],s.drop);
      else await delay(20);
    }
    await open();
    await until('window.__game.gameState.handNumber===2');
    s=await snapshot(); verify(s);
    assert.equal(s.tips.hand,2,'new hand refreshes live reference');
    await close();
    await evaluate('window.__game.returnToMenu()');
    await until("window.__game.scene.isActive('MenuScene')");
    assert.equal(await evaluate("window.__game.scene.isActive('TipsScene')"),false);
    console.log(`PASS tips ${width}x${height}: read-only, input blocking, scroll, rotation, safe areas, betting/AI timers, live next hand, close`);
  }
}
