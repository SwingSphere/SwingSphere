const testUrls = [
  { label: 'Homepage', url: 'http://127.0.0.1:8788/' },
  { label: 'Club: The Power Exchange', url: 'http://127.0.0.1:8788/clubs/the-power-exchange--01ygwpjt' },
  { label: 'Host: Community Host', url: 'http://127.0.0.1:8788/hosts/community-host' },
  { label: 'Resort: Hedonism II', url: 'http://127.0.0.1:8788/resorts/hedonism-ii' },
  { label: 'Cruise: Margarita Pleasures', url: 'http://127.0.0.1:8788/cruises/margarita-pleasures-select-cruise' },
  { label: 'City Discovery: San Francisco Clubs', url: 'http://127.0.0.1:8788/swinger-clubs/san-francisco' },
  { label: 'City Discovery: San Francisco Parties', url: 'http://127.0.0.1:8788/swinger-parties/san-francisco' },
  { label: 'Unlisted City (Thin Page Protection - should be noindex)', url: 'http://127.0.0.1:8788/swinger-clubs/nonexistent-antarctica-city' },
  { label: 'Admin Route (should be noindex)', url: 'http://127.0.0.1:8788/admin' },
];

async function run() {
  console.log('--- TESTING CLOUDFLARE PAGES EDGE RESPONSES (INITIAL RAW HTML) ---\n');

  for (const { label, url } of testUrls) {
    try {
      const res = await fetch(url);
      const html = await res.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i);
      const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      const ogWidthMatch = html.match(/<meta[^>]*property=["']og:image:width["'][^>]*content=["']([^"']+)["']/i);
      const ogHeightMatch = html.match(/<meta[^>]*property=["']og:image:height["'][^>]*content=["']([^"']+)["']/i);
      const twitterCardMatch = html.match(/<meta[^>]*name=["']twitter:card["'][^>]*content=["']([^"']+)["']/i);
      const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);

      console.log(`=== ${label} (${url}) ===`);
      console.log(`Status: ${res.status}`);
      console.log(`Title: ${titleMatch ? titleMatch[1] : 'NOT FOUND'}`);
      console.log(`Description: ${descMatch ? descMatch[1] : 'NOT FOUND'}`);
      console.log(`Robots Meta: ${robotsMatch ? robotsMatch[1] : 'NOT FOUND'}`);
      console.log(`X-Robots-Tag Header: ${res.headers.get('x-robots-tag') || 'NOT FOUND'}`);
      console.log(`Canonical: ${canonicalMatch ? canonicalMatch[1] : 'NOT FOUND'}`);
      console.log(`OG Title: ${ogTitleMatch ? ogTitleMatch[1] : 'NOT FOUND'}`);
      console.log(`OG Image: ${ogImageMatch ? ogImageMatch[1] : 'NOT FOUND'}`);
      console.log(`OG Dimensions: ${ogWidthMatch ? ogWidthMatch[1] : '?'} x ${ogHeightMatch ? ogHeightMatch[1] : '?'}`);
      console.log(`Twitter Card: ${twitterCardMatch ? twitterCardMatch[1] : 'NOT FOUND'}`);
      if (jsonLdMatch) {
        try {
          const parsed = JSON.parse(jsonLdMatch[1]);
          const types = Array.isArray(parsed) ? parsed.map((x) => x['@type']).join(', ') : parsed['@type'];
          console.log(`Structured Data Schema: ${types}`);
        } catch {
          console.log('Structured Data: Malformed JSON');
        }
      } else {
        console.log('Structured Data: NOT FOUND');
      }
      console.log('\n');
    } catch (err) {
      console.error(`Failed ${label}:`, err.message);
    }
  }

  // Test Sitemap
  console.log('=== SITEMAP (/sitemap.xml) ===');
  try {
    const res = await fetch('http://127.0.0.1:8788/sitemap.xml');
    const xml = await res.text();
    const count = (xml.match(/<url>/g) || []).length;
    console.log(`Status: ${res.status}`);
    console.log(`Content-Type: ${res.headers.get('content-type')}`);
    console.log(`Sitemap Total URLs: ${count}`);
    console.log(`Valid XML opening: ${xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')}`);
    console.log(`Contains clubs: ${xml.includes('/clubs/')}`);
    console.log(`Contains events: ${xml.includes('/events/')}`);
    console.log(`Contains resorts: ${xml.includes('/resorts/')}`);
    console.log(`Contains cruises: ${xml.includes('/cruises/')}`);
    console.log(`Contains hosts: ${xml.includes('/hosts/')}`);
    console.log(`Contains regional pages: ${xml.includes('/swinger-clubs/')}`);
    console.log(`Excludes /admin: ${!xml.includes('/admin')}`);
    console.log(`Excludes /dev: ${!xml.includes('/dev')}`);
  } catch (err) {
    console.error('Failed sitemap:', err.message);
  }
}

run();
