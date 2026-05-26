import { chromium } from './node_modules/playwright/index.mjs';

const command = process.argv[2] || '/agent';
const screenshotPath = process.argv[3] || '/tmp/learn-copilot-cli-centered-final.png';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.keyboard.press('`');
await page.getByLabel('Forced command').fill(command);
await page.getByRole('button', { name: 'Store Command' }).click();
await page.getByRole('button', { name: 'Pick a Command' }).click();
await page.waitForSelector('[data-testid="details-card"]', { timeout: 5000 });
await page.waitForTimeout(550);
await page.screenshot({ path: screenshotPath, fullPage: true });
const metrics = await page.evaluate(() => {
  const reel = document.querySelector('[data-testid="reel-window"]');
  const item = document.querySelector('[data-testid="reel-item"]');
  const text = document.querySelector('.reelText');
  const rr = reel?.getBoundingClientRect();
  const ir = item?.getBoundingClientRect();
  const tr = text?.getBoundingClientRect();
  return {
    title: item?.textContent,
    itemCount: document.querySelectorAll('[data-testid="reel-item"]').length,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    reelWidth: rr?.width,
    reelHeight: rr?.height,
    itemWidth: ir?.width,
    itemHeight: ir?.height,
    itemBoxCenterDeltaX: rr && ir ? Math.round(((ir.left + ir.width / 2) - (rr.left + rr.width / 2)) * 100) / 100 : null,
    itemBoxCenterDeltaY: rr && ir ? Math.round(((ir.top + ir.height / 2) - (rr.top + rr.height / 2)) * 100) / 100 : null,
    textCenterDeltaX: rr && tr ? Math.round(((tr.left + tr.width / 2) - (rr.left + rr.width / 2)) * 100) / 100 : null,
    textCenterDeltaY: rr && tr ? Math.round(((tr.top + tr.height / 2) - (rr.top + rr.height / 2)) * 100) / 100 : null,
  };
});
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
