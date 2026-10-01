import { generateSitemapXml } from './lib/seoMetadata';

export const onRequestGet = async (context: { env?: Record<string, unknown> }): Promise<Response> => {
  const xml = await generateSitemapXml(context?.env);
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
