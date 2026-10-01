import React, { useEffect } from 'react';

type SeoProps = {
  title: string;
  description: string;
  canonicalPath?: string;
  imageUrl?: string | null;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  ogType?: 'website' | 'article' | 'profile';
  noIndex?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
};

const SITE_ORIGIN = 'https://swingsphere.co';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/og-image.png`;

const ensureMeta = (selector: string, attributes: Record<string, string>): HTMLMetaElement => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([key, value]) => element!.setAttribute(key, value));
    document.head.appendChild(element);
  }
  return element;
};

const toAbsoluteUrl = (value: string): string => {
  try {
    return new URL(value, SITE_ORIGIN).toString();
  } catch {
    return SITE_ORIGIN;
  }
};

const Seo: React.FC<SeoProps> = ({
  title,
  description,
  canonicalPath,
  imageUrl,
  imageAlt = 'SwingSphere | Global Lifestyle Discovery Platform',
  imageWidth = 1200,
  imageHeight = 630,
  ogType = 'website',
  noIndex = false,
  structuredData,
}) => {
  useEffect(() => {
    const canonicalUrl = toAbsoluteUrl(canonicalPath || window.location.pathname);
    const socialImage = imageUrl ? toAbsoluteUrl(imageUrl) : DEFAULT_IMAGE;
    document.title = title;

    const descriptionMeta = ensureMeta('meta[name="description"]', { name: 'description' });
    descriptionMeta.setAttribute('content', description);

    const robotsMeta = ensureMeta('meta[name="robots"]', { name: 'robots' });
    robotsMeta.setAttribute('content', noIndex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large');

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const fields: Array<[string, string, string, string]> = [
      ['meta[property="og:title"]', 'property', 'og:title', title],
      ['meta[property="og:description"]', 'property', 'og:description', description],
      ['meta[property="og:url"]', 'property', 'og:url', canonicalUrl],
      ['meta[property="og:type"]', 'property', 'og:type', ogType],
      ['meta[property="og:image"]', 'property', 'og:image', socialImage],
      ['meta[property="og:image:alt"]', 'property', 'og:image:alt', imageAlt],
      ['meta[property="og:image:width"]', 'property', 'og:image:width', String(imageWidth)],
      ['meta[property="og:image:height"]', 'property', 'og:image:height', String(imageHeight)],
      ['meta[name="twitter:title"]', 'name', 'twitter:title', title],
      ['meta[name="twitter:description"]', 'name', 'twitter:description', description],
      ['meta[name="twitter:image"]', 'name', 'twitter:image', socialImage],
    ];

    fields.forEach(([selector, attributeName, attributeValue, value]) => {
      const meta = ensureMeta(selector, { [attributeName]: attributeValue });
      meta.setAttribute('content', value);
    });

    // Update structured data JSON-LD if provided
    if (structuredData) {
      let script = document.getElementById('ss-structured-data') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = 'ss-structured-data';
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    }
  }, [canonicalPath, description, imageAlt, imageHeight, imageWidth, imageUrl, noIndex, ogType, structuredData, title]);

  return null;
};

export default Seo;
