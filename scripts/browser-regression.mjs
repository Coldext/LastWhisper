// Optional real-browser checks, using the Chromium DevTools protocol and Node built-ins.
// Run: node scripts/browser-regression.mjs (BROWSER_PATH may override the Edge executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createServer } from 'vite';

const profile = await mkdtemp(join(tmpdir(), 'ultima-mao-browser-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
let socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, description) {
  const deadline = Date.now() + 15000;
  do {
    const value = await fn();
    if (value) return value;
    await delay(20);
  } while (Date.now() < deadline);
  throw new Error(`Timeout: ${description}`);
}

try {
  await server.listen();
  const address = server.httpServer.address();
  browser = spawn(process.env.BROWSER_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let launchError;
  browser.on('error', error => { launchError = error; });
  const port = await until(async () => {
    if (launchError) throw launchError;
    try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
    catch { return null; }
  }, 'browser debugging port');
  console.log('Browser debugging port ready');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; }),
    delay(5000).then(() => { throw new Error('Browser WebSocket timeout'); }),
  ]);
  console.log('Browser debugging connected');
  const pending = new Map();
  const errors = [];
  let seq = 0;
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timeout);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  };
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`DevTools timeout: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  const frames = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  async function mouse(type, x, y) {
    await cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
    await frames();
  }
  let touch = false;
  async function press(x, y) {
    if (!touch) return mouse('mousePressed', x, y);
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
    await frames();
  }
  async function move(x, y) {
    if (!touch) return mouse('mouseMoved', x, y);
    await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 0 }] });
    await frames();
  }
  async function release(x, y) {
    if (!touch) return mouse('mouseReleased', x, y);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frames();
  }
  async function click(x, y) { await press(x, y); await release(x, y); }
  async function drag(from, to, expectDrag = true) {
    await press(from.x, from.y);
    await move(from.x + 15, from.y - 15);
    await move(to.x, to.y);
    if (from.id) {
      const state = await evaluate(`window.__scene.interaction.cards.get(${JSON.stringify(from.id)})?.state`);
      assert.equal(state, expectDrag ? 'dragging' : 'played');
    }
    await release(to.x, to.y);
  }
  async function snapshot() {
    return evaluate(`(() => {
      const s=window.__scene;
      return { hand:s.gameState.playerHand.map(c=>c.instanceId), table:s.gameState.table.map(c=>c.instanceId),
        remaining:s.gameState.deck.remaining, number:s.gameState.handNumber,
        states:[...s.interaction.cards].map(([id,c])=>({id,state:c.state})),
        cards:[...s.cardObjects].map(([id,c])=>({id,x:c.x,y:c.y,enabled:c.input.enabled,width:c.width,height:c.height})),
        area:{x:s.dropArea.x,y:s.dropArea.y,width:s.dropArea.width,height:s.dropArea.height},
        listeners:s.input.listenerCount('dragstart'), width:s.scale.width, height:s.scale.height };
    })()`);
  }
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await mkdir('artifacts/cards-v0.2', { recursive: true });

  for (const mode of [
    { name: 'desktop', width: 1100, height: 760, touch: false },
    { name: 'portrait-touch', width: 390, height: 844, touch: true },
    { name: 'landscape-touch', width: 844, height: 390, touch: true },
  ]) {
    touch = mode.touch;
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
    await cdp('Emulation.setDeviceMetricsOverride', { width: mode.width, height: mode.height, deviceScaleFactor: 1, mobile: touch });
    // Boot with touch emulation already enabled, as on a real touch device.
    // Phaser selects its input managers during game construction.
    await cdp('Page.navigate', { url: `http://127.0.0.1:${address.port}/?mode=${mode.name}` });
    await until(() => evaluate("!!document.querySelector('canvas')"), 'menu canvas');
    await evaluate(`(async()=>{
      const {default:Scene}=await import('/src/scenes/GameScene.js');
      const create=Scene.prototype.create;
      Scene.prototype.create=function(){window.__scene=this; return create.call(this);};
    })()`);
    await click(mode.width / 2, Math.min(mode.height - 92, mode.height * .73));
    await until(() => evaluate('!!window.__scene?.dropArea'), 'game scene');
    let state = await snapshot();
    assert.equal(state.remaining, 45);
    assert.equal(state.hand.length, 3);
    const firstId = state.hand[0];
    for (let repeat = 0; repeat < 3; repeat++) {
      state = await snapshot();
      const card = state.cards.find(card => card.id === firstId);
      await drag(card, { x: 30, y: mode.height * .6 });
      await until(async () => (await snapshot()).states.find(card => card.id === firstId).state === 'inHand', 'return completion');
      assert.equal((await snapshot()).hand.length, 3);
    }
    // The next down follows return completion immediately, without an artificial lock delay.
    for (let index = 0; index < 3; index++) {
      state = await snapshot();
      const card = state.cards.find(card => card.id === state.hand[0]);
      const to = { x: state.area.x + state.area.width * (.3 + index * .25), y: state.area.y + state.area.height * .55 };
      await drag(card, to);
      const after = await snapshot();
      assert.equal(after.table.length, index + 1);
      assert.equal(after.hand.length, 2 - index);
      const placed = after.cards.find(item => item.id === card.id);
      assert.equal(placed.enabled, false);
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      assert.ok(Math.abs(placed.x - clamp(to.x, state.area.x + placed.width/2,
        state.area.x + state.area.width - placed.width/2)) < 1);
      assert.ok(Math.abs(placed.y - clamp(to.y, state.area.y + placed.height/2,
        state.area.y + state.area.height - placed.height/2)) < 1);
      for (let count = 0; count < 20; count++) await click(placed.x, placed.y);
      await drag(placed, { x: 25, y: 90 }, false);
      assert.equal((await snapshot()).table.length, index + 1);
    }
    const beforeResize = (await snapshot()).table;
    const resizeWidth = mode.width === 390 ? 430 : mode.width - 60;
    await cdp('Emulation.setDeviceMetricsOverride', { width: resizeWidth, height: mode.height, deviceScaleFactor: 1, mobile: touch });
    await until(async () => (await snapshot()).width === resizeWidth, 'resize after play');
    assert.deepEqual((await snapshot()).table, beforeResize);
    assert.equal(await evaluate(`window.__scene.children.list.filter(c=>c.type==='Container' && c.getData('instanceId')).length`), 4);
    assert.equal(await evaluate(`(() => {
      const s=window.__scene, area=s.dropArea;
      return s.gameState.table.every(card => {
        const view=s.children.list.find(child=>child.getData('instanceId')===card.instanceId);
        return view && view.x-view.width/2>=area.x-.01 && view.x+view.width/2<=area.right+.01 &&
          view.y-view.height/2>=area.y-.01 && view.y+view.height/2<=area.bottom+.01;
      });
    })()`), true);
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(`artifacts/cards-v0.2/${mode.name}.png`, Buffer.from(screenshot.data, 'base64'));
    // Exercise the actual new-hand button and demo-reset header hit zone.
    await click(resizeWidth / 2, mode.height - (mode.height < 510 ? 27 : 38));
    assert.equal((await snapshot()).remaining, 38);
    assert.equal((await snapshot()).number, 2);
    await click(resizeWidth - 66, mode.height < 510 ? 44 : 53);
    assert.equal((await snapshot()).remaining, 45);
    assert.equal((await snapshot()).number, 1);
    for (let hand = 0; hand < 6; hand++) {
      await click(resizeWidth / 2, mode.height - (mode.height < 510 ? 27 : 38));
    }
    assert.equal((await snapshot()).remaining, 3);
    const exhausted = await evaluate('JSON.stringify(window.__scene.gameState.deck)');
    await click(resizeWidth / 2, mode.height - (mode.height < 510 ? 27 : 38));
    assert.equal(await evaluate('JSON.stringify(window.__scene.gameState.deck)'), exhausted);
    assert.equal(await evaluate("window.__scene.dealBlocked && window.__scene.children.list.some(c=>c.text==='MONTE INSUFICIENTE · REINICIE A DEMO')"), true);
    await click(resizeWidth - 66, mode.height < 510 ? 44 : 53);
    assert.equal((await snapshot()).remaining, 45);
    console.log(`PASS ${mode.name}: invalid returns, three plays, 60 clicks, blocked re-drags, resize, new hand, demo restart`);
  }
  // Actual menu navigation, reentry and listener cleanup.
  touch = false;
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await click(48, 21);
  await until(() => evaluate("window.__scene.scene.isActive('MenuScene')"), 'menu navigation');
  const size = await evaluate('({width:innerWidth,height:innerHeight})');
  await click(size.width / 2, Math.min(size.height - 92, size.height * .73));
  await until(() => evaluate("window.__scene.scene.isActive('GameScene')"), 'game reentry');
  assert.equal((await snapshot()).listeners, 1);
  assert.deepEqual(errors, []);
  console.log('PASS menu navigation and reentry; no browser exceptions');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(3000)]);
  }
  await Promise.race([server.close(), delay(3000)]);
  // Only the exact temp directory created above is removed, after the browser exits.
  if (dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith('ultima-mao-browser-')) {
    throw new Error(`Refusing to remove unexpected browser profile: ${profile}`);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
