import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()} ${msg.text()}`);
  });
  
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.toString()}`);
  });

  page.on('requestfailed', request => {
    console.log(`[REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`);
  });

  try {
    const response = await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 10000 });
    console.log('[STATUS]', response?.status());
    
    const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML);
    console.log('[ROOT HTML]', rootHtml);
  } catch(e) {
    console.error('Error during navigation', e);
  }
  
  await browser.close();
})();
