import { chromium } from './node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.keyboard.press('`');
await page.getByLabel('Forced command').fill('/session');
await page.getByRole('button', { name: 'Store Command' }).click();
await page.getByRole('button', { name: 'Pick a Command' }).click();
await page.waitForTimeout(1400);
await page.screenshot({ path: '/tmp/learn-copilot-cli-smooth-flow-mid.png', fullPage: true });
const mid = await page.evaluate(() => {
  const reel = document.querySelector('[data-testid="reel-window"]');
  const strip = document.querySelector('.reelStrip');
  return {
    state: reel?.getAttribute('data-state'),
    transition: getComputedStyle(strip).transition,
    transform: getComputedStyle(strip).transform,
    itemCount: document.querySelectorAll('[data-testid="reel-item"]').length,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
});
await page.waitForSelector('[data-testid="details-card"]', { timeout: 5000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/learn-copilot-cli-smooth-flow-final.png', fullPage: true });
const final = await page.evaluate(() => {
  const reel = document.querySelector('[data-testid="reel-window"]');
  const item = document.querySelector('[data-testid="reel-item"]');
  const rr = reel?.getBoundingClientRect();
  const ir = item?.getBoundingClientRect();
  return {
    state: reel?.getAttribute('data-state'),
    title: item?.textContent,
    itemCount: document.querySelectorAll('[data-testid="reel-item"]').length,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    reelHeight: rr?.height,
    itemHeight: ir?.height,
    centerDeltaY: rr && ir ? Math.round(((ir.top + ir.height / 2) - (rr.top + rr.height / 2)) * 100) / 100 : null,
  };
});
console.log(JSON.stringify({ mid, final }, null, 2));
await browser.close();
