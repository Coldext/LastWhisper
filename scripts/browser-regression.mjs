// Optional real-browser checks, using the Chromium DevTools protocol and Node built-ins.
// Run: node scripts/browser-regression.mjs (BROWSER_PATH may override the Edge executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createServer, preview } from 'vite';

const profile = await mkdtemp(join(tmpdir(), 'ultima-mao-browser-'));
const productionPreview = process.argv.includes('--preview');
const server = productionPreview
  ? await preview({ preview: { host: '127.0.0.1', port: 0 } })
  : await createServer({ server: { host: '127.0.0.1', port: 0 } });
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
  if (!productionPreview) await server.listen();
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
  const failedAssets = [];
  let seq = 0;
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400 &&
        new URL(message.params.response.url).pathname.startsWith(server.config.base)) {
      failedAssets.push({ url: message.params.response.url, status: message.params.response.status });
    }
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
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Network.enable');
  const { runScenarios } = await import(process.argv.includes('--tips') ? './tips-browser-scenarios.mjs'
    : process.argv.includes('--how-to-play') ? './how-to-play-browser-scenarios.mjs'
    : productionPreview ? './pages-browser-smoke.mjs' : './truco-browser-scenarios.mjs');
  await runScenarios({ cdp, evaluate, frames, press, move, release, click,
    setTouch: value => { touch = value; },
    baseURL: `http://127.0.0.1:${address.port}${server.config.base.replace(/\/$/, '')}` });
  assert.deepEqual(errors, []);
  assert.deepEqual(failedAssets, []);
  console.log(productionPreview ? 'PASS production assets; no browser exceptions'
    : 'PASS menu navigation and reentry; no browser exceptions');
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
