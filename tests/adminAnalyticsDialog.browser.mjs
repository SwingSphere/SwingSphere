// Usage: node tests/adminAnalyticsDialog.browser.mjs <playwright-module-path> [vite-origin]
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.argv[2];
const { chromium } = modulePath ? await import(pathToFileURL(modulePath).href) : await import('playwright');
const origin = process.argv[3] || 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1280]) {
    for (const mode of ['outbound', 'inbound']) {
      const page = await browser.newPage({ viewport: { width, height: 820 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/rest/v1/**', async (route) => {
        const url = route.request().url();
        let data = [];
        if (url.includes('rpc/outbound_admin_summary')) data = { from: '2026-10-01', to: '2026-10-06', totalClicks: 50, qualifiedClicks: 40, uniqueCountsComplete: true, byDestination: [{ destinationType: 'website', totalClicks: 50, qualifiedClicks: 40 }], byPlacement: [], byLink: [], byEntity: [] };
        if (url.includes('rpc/inbound_admin_summary')) data = { from: '2026-10-01', to: '2026-10-06', totalSessions: 50, bySource: [{ sourceName: 'reddit', sourceCategory: 'social', sessions: 50 }], byReferrer: [], byLanding: [], byDevice: [], byCountry: [], byRegion: [], byCampaign: [] };
        if (url.includes('rpc/outbound_admin_detail')) data = { totalClicks: 50, qualifiedClicks: 40, rawRetentionDays: 90, byLink: [{ destinationType: 'website', destinationDomain: 'example.com', destinationPath: '/an-extremely-long-destination-path-to-check-wrapping', qualifiedClicks: 40 }], byEntity: [], recentClicks: Array.from({ length: 60 }, (_, i) => ({ occurredAt: new Date(2026, 9, 5, 12, i).toISOString(), entityType: 'club', entityId: 'verification', destinationDomain: 'example.com', destinationPath: '/tickets', destinationType: 'website', placement: 'entity_page', surface: 'entity_page', deviceClass: 'mobile', qualified: true })) };
        if (url.includes('rpc/inbound_admin_source_detail')) data = { totalSessions: 50, rawRetentionDays: 90, topReferrerPaths: [], topLandings: [], campaigns: [], recentSessions: Array.from({ length: 60 }, (_, i) => ({ occurredAt: new Date(2026, 9, 5, 12, i).toISOString(), sourceName: 'reddit', referrerDomain: 'reddit.com', referrerPath: '', landingPath: '/clubs/verification', deviceClass: 'mobile', countryCode: 'US' })) };
        await route.fulfill({ json: data });
      });
      await page.goto(origin + '/tests/fixtures/adminAnalyticsDialog.html?mode=' + mode);
      const trigger = page.locator('button[aria-haspopup="dialog"]').first();
      await trigger.waitFor({ timeout: 10000 }).catch(async (error) => { console.log('Page errors:', errors); console.log('Page text:', await page.locator('body').innerText()); throw error; });
      await trigger.scrollIntoViewIfNeeded();
      const before = await trigger.boundingBox();
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.getByText(mode === 'outbound' ? 'Recent outbound clicks' : 'Recent arrivals', { exact: true }).waitFor();
      const dimensions = await dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const body = node.lastElementChild;
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, overflowY: getComputedStyle(body).overflowY };
      });
      assert.ok(dimensions.left >= 0 && dimensions.right <= width + 1, mode + ': dialog exceeds viewport width');
      assert.ok(dimensions.top >= 0 && dimensions.bottom <= 821, mode + ': dialog exceeds viewport height');
      assert.equal(dimensions.overflowY, 'auto');
      assert.ok(dimensions.scrollHeight > dimensions.clientHeight, mode + ': long report is not independently scrollable');
      await page.keyboard.press('Tab');
      assert.ok(await dialog.evaluate((node) => node.contains(document.activeElement)), 'Focus left dialog');
      await page.keyboard.press('Shift+Tab');
      assert.ok(await dialog.evaluate((node) => node.contains(document.activeElement)), 'Reverse focus left dialog');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.ok(await trigger.evaluate((node) => document.activeElement === node), 'Trigger focus was not restored');
      const after = await trigger.boundingBox();
      assert.equal(Math.round(before.y), Math.round(after.y), 'Summary moved after closing details');
      assert.deepEqual(errors, []);
      console.log(mode + ' at ' + width + 'px: viewport bounds, internal scrolling, keyboard focus, Escape, focus restoration passed');
      await page.close();
    }
  }
  for (const sharingEnabled of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 820 } });
    await page.route('**/rest/v1/**', async (route) => {
      const data = route.request().url().includes('rpc/admin_get_member_activity') ? { sharingEnabled, since: '2026-10-05T20:00:00Z', retentionDays: 30, pageViews: 1, outboundClicks: 1, saveActions: 1, savedCount: 1, topPages: [{ path: '/clubs/verification', views: 1 }], recent: [{ id: 'event', kind: 'outbound', path: '/clubs/verification', entityType: 'club', entityId: 'verification', destination: 'https://example.com/tickets', occurredAt: '2026-10-05T20:00:00Z' }], saved: [{ id: 'save', name: 'Verification Club', entityType: 'club', entityId: 'verification', savedAt: '2026-10-05T20:00:00Z' }] } : [];
      await route.fulfill({ json: data });
    });
    await page.goto(origin + '/tests/fixtures/adminAnalyticsDialog.html?mode=activity');
    if (!sharingEnabled) {
      await page.getByRole('heading', { name: 'Activity sharing is off' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Saved items', exact: true }).count(), 0);
    } else {
      await page.getByRole('button', { name: 'Saved items', exact: true }).click();
      await page.getByText('Verification Club', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Recent activity', exact: true }).click();
      await page.getByText('https://example.com/tickets', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Top pages', exact: true }).click();
      await page.getByText('/clubs/verification', { exact: true }).first().waitFor();
    }
    console.log('Member activity: sharing ' + (sharingEnabled ? 'on — pages, timeline, saves tabs passed' : 'off — unavailable state passed'));
    await page.close();
  }
} finally { await browser.close(); }
