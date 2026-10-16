import {test,expect} from '@playwright/test';
test('produkční PWA načte aplikaci a rozepsané série i offline',async({page,context})=>{
 test.skip(!process.env.FITLOG_PWA_TEST,'Vyžaduje npm run build a npm run preview.');
 await page.goto('http://127.0.0.1:4173');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await page.locator('input[inputmode=decimal]').first().fill('17,5');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('fitlog-demo-drafts'))).toContain('17,5');
 await context.setOffline(true);await page.reload();
 await expect(page.getByRole('heading',{name:'Dnes je den pro progres.'})).toBeVisible();
 await expect(page.locator('input[inputmode=decimal]').first()).toHaveValue('17,5');
});
