import { generateSitemapXml, resolvePageSeo } from './lib/seoMetadata';

type PagesContext = {
  request: Request;
  env?: Record<string, unknown>;
  next: () => Promise<Response>;
};

class TitleHandler {
  constructor(private readonly titleText: string) {}
  element(element: Element) {
    element.setInnerContent(this.titleText);
  }
}

class AttributeHandler {
  constructor(private readonly attributeName: string, private readonly attributeValue: string) {}
  element(element: Element) {
    element.setAttribute(this.attributeName, this.attributeValue);
  }
}

class JsonLdHandler {
  constructor(private readonly rawJson: string) {}
  element(element: Element) {
    element.setInnerContent(this.rawJson, { html: true });
  }
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const url = new URL(context.request.url);

  // 1. Dynamic XML sitemap handler
  if (url.pathname === '/sitemap.xml') {
    const xml = await generateSitemapXml(context.env);
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  // 2. Fetch the downstream response
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';

  // Only rewrite HTML responses
  if (!contentType.includes('text/html')) {
    return response;
  }

  // 3. Resolve page-specific SEO metadata (with live Supabase sync when env is provided)
  const seo = await resolvePageSeo(url.pathname, context.env);
  const jsonLdString = JSON.stringify(seo.structuredData);

  // 4. Update response headers (send X-Robots-Tag so search engines read noindex directly)
  const responseHeaders = new Headers(response.headers);
  if (seo.noIndex) {
    responseHeaders.set('X-Robots-Tag', 'noindex, nofollow');
  } else {
    responseHeaders.set('X-Robots-Tag', 'index, follow, max-image-preview:large');
  }

  // 5. Edge HTML rewriting
  const transformed = new HTMLRewriter()
    .on('#ss-title', new TitleHandler(seo.title))
    .on('#ss-description', new AttributeHandler('content', seo.description))
    .on('#ss-robots', new AttributeHandler('content', seo.noIndex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'))
    .on('#ss-canonical', new AttributeHandler('href', seo.canonicalUrl))
    .on('#ss-og-type', new AttributeHandler('content', seo.ogType))
    .on('#ss-og-title', new AttributeHandler('content', seo.title))
    .on('#ss-og-desc', new AttributeHandler('content', seo.description))
    .on('#ss-og-url', new AttributeHandler('content', seo.canonicalUrl))
    .on('#ss-og-image', new AttributeHandler('content', seo.imageUrl))
    .on('#ss-og-image-alt', new AttributeHandler('content', seo.imageAlt))
    .on('#ss-og-image-width', new AttributeHandler('content', String(seo.imageWidth)))
    .on('#ss-og-image-height', new AttributeHandler('content', String(seo.imageHeight)))
    .on('#ss-twitter-card', new AttributeHandler('content', seo.twitterCard))
    .on('#ss-twitter-title', new AttributeHandler('content', seo.title))
    .on('#ss-twitter-desc', new AttributeHandler('content', seo.description))
    .on('#ss-twitter-image', new AttributeHandler('content', seo.imageUrl))
    .on('#ss-structured-data', new JsonLdHandler(jsonLdString))
    .transform(response);

  return new Response(transformed.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};
