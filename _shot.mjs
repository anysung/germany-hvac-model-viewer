import { chromium } from 'playwright';
const S = process.argv[2];
const b = await chromium.launch();
const pg = await (await b.newContext({ viewport: { width: 1200, height: 628 }, deviceScaleFactor: 2 })).newPage();
for (const n of ['eu-sales', 'de-share']) {
  await pg.goto(`file://${S}/li/${n}.html`);
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: `${S}/li/${n}.png` });
  console.log('  ✓', n + '.png');
}
await b.close();
