import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = process.argv[2] ? await import(pathToFileURL(process.argv[2]).href) : await import('playwright');
const origin = process.argv[3] || 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width, routePath, expectedCategory] of [[390,'/mobile/clubs/verification','listing'], [1280,'/clubs/verification','listing'], [390,'/login','bug']]) {
    const page = await browser.newPage({ viewport: { width, height: 820 } });
    const errors = []; const payloads = [];
    let submitCount = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().url().includes('rpc/submit_site_issue')) {
        payloads.push(route.request().postDataJSON());
        submitCount++;
        if (submitCount === 1) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'Reporting is busy. Please try again later.' } });
        return route.fulfill({ json: '11111111-2222-4333-8444-555555555555' });
      }
      await route.fulfill({ json: [] });
    });
    await page.goto(origin + '/tests/fixtures/adminAnalyticsDialog.html?mode=report&route=' + encodeURIComponent(routePath));
    const trigger = page.getByRole('button',{ name: 'Report issue', exact: true });
    await trigger.waitFor();
    const buttonBounds = await trigger.boundingBox();
    assert.ok(buttonBounds.y + buttonBounds.height <= 820);
    if (routePath.startsWith('/mobile')) {
      const navBounds = await page.getByRole('navigation').boundingBox();
      assert.ok(buttonBounds.y + buttonBounds.height <= navBounds.y, 'Reporting control overlaps mobile navigation');
    }
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await page.getByLabel('What would you like to report?').inputValue(), expectedCategory);
    const submit = page.getByRole('button',{ name:'Send report',exact:true });
    assert.equal(await submit.isDisabled(),true);
    const details = page.getByRole('textbox', { name: /^Details/ });
    await details.fill('This page does not show the correct event hours.');
    await submit.click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Thanks for letting us know.',{exact:true}).count(),0);
    assert.equal(await details.inputValue(),'This page does not show the correct event hours.');
    await submit.click();
    await page.getByText('Thanks for letting us know.',{exact:true}).waitFor();
    assert.equal(payloads.length,2);
    assert.equal(payloads[1].p_page_path,routePath);
    assert.equal(payloads[1].p_category,expectedCategory);
    assert.equal(payloads[1].p_website,'');
    const rect=await dialog.boundingBox();
    assert.ok(rect.x >= 0 && rect.x+rect.width <= width+1 && rect.y+rect.height <= 821);
    await page.getByRole('button',{name:'Done',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.deepEqual(errors,[]);
    console.log('Report form ' + width + 'px ' + routePath + ': discreet placement, context, validation, retained failure draft, confirmed success passed');
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const issue = { id:'11111111-2222-4333-8444-555555555555', pagePath:'/clubs/verification',pageTitle:'Verification Club',category:'listing',description:'The listing hours are outdated and need correction.',status:'new',createdAt:'2026-10-06T01:00:00Z',updatedAt:'2026-10-06T01:00:00Z',fromMember:false,actions:[] };
  let status='new'; let update;
  await page.route('**/rest/v1/**',async(route)=>{
    if(route.request().url().includes('rpc/admin_list_site_issues')) return route.fulfill({json:{total:1,items:[{...issue,status}]}});
    if(route.request().url().includes('rpc/admin_update_site_issue')) { update=route.request().postDataJSON(); status=update.p_status; return route.fulfill({json:null}); }
    await route.fulfill({json:[]});
  });
  await page.goto(origin+'/tests/fixtures/adminAnalyticsDialog.html?mode=queue');
  await page.getByRole('button').filter({hasText:'Verification Club'}).click();
  await page.getByRole('dialog').getByRole('combobox').selectOption('in_review');
  await page.getByLabel('Private admin note',{exact:false}).fill('Checking the official event schedule.');
  await page.getByRole('button',{name:'Save review',exact:true}).click();
  await page.getByRole('button').filter({hasText:'Verification Club'}).filter({hasText:'In review'}).waitFor();
  assert.equal(update.p_id,issue.id); assert.equal(update.p_status,'in_review');
  assert.equal(update.p_note,'Checking the official event schedule.');
  assert.equal(await page.getByRole('dialog').count(),0);
  console.log('Moderation queue: persistent report rendering, review dialog, status and note submission passed');
  await page.close();
} finally { await browser.close(); }
