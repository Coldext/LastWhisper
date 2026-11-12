import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Exercise the compiled artifact, without importing /src or adding globals to the game.
export async function runScenarios({ cdp, evaluate, frames, click, baseURL }) {
  assert.equal(new URL(baseURL).pathname, '/LastWhisper');
  const html = await readFile('dist/index.html', 'utf8');
  const page = await fetch(`${baseURL}/`);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), html);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(assets.length >= 2);
  for (const path of assets) {
    assert.ok(path.startsWith('/LastWhisper/assets/'), `Unexpected build URL: ${path}`);
    const response = await fetch(new URL(path, baseURL));
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /javascript|css/, path);
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
  const publicAsset = await fetch(`${baseURL}/favicon.svg`);
  assert.equal(publicAsset.status, 200);
  assert.match(publicAsset.headers.get('content-type'), /svg/);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${baseURL}/` });
  const deadline = Date.now() + 15000;
  while (!(await evaluate("!!document.querySelector('canvas')"))) {
    if (Date.now() > deadline) throw new Error('Compiled Phaser canvas did not start');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await frames();
  const menu = await cdp('Page.captureScreenshot', { format: 'png' });
  await click(550, Math.min(760 - 92, 760 * 0.73));
  await frames();
  const game = await cdp('Page.captureScreenshot', { format: 'png' });
  assert.notEqual(game.data, menu.data, 'Start button must transition from the compiled menu to the table');
  assert.equal(await evaluate('location.pathname'), '/LastWhisper/');
  await mkdir('artifacts/pages', { recursive: true });
  await writeFile('artifacts/pages/preview.png', Buffer.from(game.data, 'base64'));
  console.log(`PASS compiled Phaser under /LastWhisper/: ${assets.length} bundled assets and public SVG returned HTTP 200; menu entered table`);
}
