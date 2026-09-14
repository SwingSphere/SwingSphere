type PagesContext = {
  request: Request & { cf?: Record<string, unknown> };
};

const clean = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || null;
};

export const onRequestGet = async ({ request }: PagesContext): Promise<Response> => {
  const cf = request.cf ?? {};
  const countryCode = clean(cf.country, 2)?.toUpperCase() ?? null;
  const regionCode = clean(cf.regionCode, 40);
  const regionName = clean(cf.region, 120);

  return new Response(JSON.stringify({ countryCode, regionCode, regionName }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
