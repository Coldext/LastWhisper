import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runScenarios({ cdp, evaluate, frames, press, move, release, click, setTouch, baseURL }) {
  async function until(expression) {
    const deadline = Date.now() + 15000;
    while (!await evaluate(expression)) {
      if (Date.now() > deadline) throw new Error(`Timeout: ${expression}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  const sceneURL = name => JSON.stringify(`${baseURL}/src/scenes/${name}.js`);
  const snapshot = () => evaluate(`(() => {
    const s=window.__menu.scene.get('HowToPlayScene');
    const c=document.querySelector('canvas').getBoundingClientRect();
    const point=o=>({x:c.left+o.x,y:c.top+o.y});
    return {active:s.scene.isActive(),offset:s.scrollOffset,max:s.maxScroll,
      top:s.bodyTop,bottom:s.bodyBottom,back:point(s.backButton),
      thumbBottom:s.thumb.y+s.thumb.height,contentBottom:s.content.y+s.contentHeight,
      labels:s.content.list.filter(o=>o.type==='Text').map(o=>o.text),
      overflow:s.content.list.filter(o=>o.type==='Text' && (o.x-o.width*o.originX<0 || o.x+o.width*(1-o.originX)>Math.min(820,s.scale.width-48)+1)).map(o=>o.text),
      gameStarts:window.__gameStarts, width:s.scale.width,height:s.scale.height};
  })()`);
  const menuPoint = name => evaluate(`(() => {const s=window.__menu,b=s.${name},r=document.querySelector('canvas').getBoundingClientRect();return {x:r.left+b.x,y:r.top+b.y};})()`);
  const back = async () => { const s = await snapshot(); await click(s.back.x, s.back.y); await until("window.__menu.scene.isActive('MenuScene')"); };
  await mkdir('artifacts/how-to-play-v0.3.1', { recursive: true });
  for (const [width, height] of [[1100,760],[320,568],[568,320],[375,667],[667,375],[390,844],[844,390],[768,1024],[1024,768]]) {
    const touch = width !== 1100;
    setTouch(touch);
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch });
    const metrics = { width, height, deviceScaleFactor: 1, mobile: touch };
    await cdp('Emulation.setDeviceMetricsOverride', metrics);
    await cdp('Page.navigate', { url: `${baseURL}/` });
    await until("!!document.querySelector('canvas')");
    await evaluate(`(async()=>{
      const {default:Menu}=await import(${sceneURL('MenuScene')});
      const render=Menu.prototype.render;
      Menu.prototype.render=function(){window.__menu=this;return render.call(this);};
      const {default:Game}=await import(${sceneURL('GameScene')});
      const create=Game.prototype.create;window.__gameStarts=0;
      Game.prototype.create=function(){window.__gameStarts++;return create.call(this);};
    })()`);
    await cdp('Emulation.setDeviceMetricsOverride', { ...metrics, width: width + 1 });
    await until('!!window.__menu?.howToPlayButton');
    await cdp('Emulation.setDeviceMetricsOverride', metrics);
    await until(`window.__menu.scale.width===${width}`);
    const play = await menuPoint('playButton'), help = await menuPoint('howToPlayButton');
    assert.ok(help.y > play.y + 46);
    await click(help.x, help.y);
    await until("window.__menu.scene.isActive('HowToPlayScene')");
    let s = await snapshot();
    assert.equal(s.gameStarts, 0);
    assert.deepEqual(s.labels.filter(t=>/^0[1-4] /.test(t)), ['01  OBJETIVO','02  FORÇA DAS CARTAS','03  MANILHA','04  COMO FUNCIONA']);
    assert.ok(s.labels.includes('3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4'));
    assert.ok(s.labels.some(t=>t.includes('♣ > ♥ > ♠ > ♦')));
    assert.deepEqual(s.overflow, []);
    assert.ok(s.back.y + 24 <= height);
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(`artifacts/how-to-play-v0.3.1/${width}x${height}-top.png`, Buffer.from(shot.data, 'base64'));
    if (touch) {
      for (let i=0;i<20 && s.offset<s.max;i++) {
        await press(width/2, s.bottom-10);
        await move(width/2, s.top+10);
        await release(width/2, s.top+10);
        s=await snapshot();
      }
    } else {
      await cdp('Input.dispatchMouseEvent', { type:'mouseWheel', x:width/2, y:height/2, deltaX:0, deltaY:10000 });
      await until("window.__menu.scene.get('HowToPlayScene').scrollOffset>0");
      s=await snapshot();
    }
    assert.equal(s.offset,s.max);
    assert.ok(Math.abs(s.contentBottom-s.bottom)<1);
    assert.ok(s.thumbBottom<=s.bottom+1);
    const end = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(`artifacts/how-to-play-v0.3.1/${width}x${height}-bottom.png`, Buffer.from(end.data, 'base64'));
    // Rotate while scrolled, then apply the same safe-area padding used by the app.
    await cdp('Emulation.setDeviceMetricsOverride', { ...metrics, width:height, height:width });
    await until(`window.__menu.scale.width===${height}`);
    await evaluate("document.getElementById('app').style.padding='13px 17px 19px 23px'");
    await cdp('Emulation.setDeviceMetricsOverride', { ...metrics, width:height+1, height:width });
    await frames();
    s=await snapshot();
    assert.ok(s.back.x>23 && s.back.y+24<width-19);
    await back();
    const reopen=await menuPoint('howToPlayButton');
    await click(reopen.x,reopen.y);
    await until("window.__menu.scene.isActive('HowToPlayScene')");
    assert.equal((await snapshot()).offset,0);
    await back();
    const start=await menuPoint('playButton');
    await click(start.x,start.y);
    await until('window.__gameStarts===1');
    assert.equal(await evaluate("window.__menu.scene.get('GameScene').gameState.handOf('player').length"),3);
    console.log(`PASS how-to-play ${width}x${height}: content, ${touch?'touch':'wheel'} scroll, rotation, safe areas, return, reentry, play`);
  }
}
