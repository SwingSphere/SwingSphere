import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function createOgImage() {
  const width = 1200;
  const height = 630;

  const bgSvg = Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg-grad" cx="50%" cy="45%" r="75%" fx="50%" fy="45%">
          <stop offset="0%" stop-color="#181a20" />
          <stop offset="60%" stop-color="#0a0b0e" />
          <stop offset="100%" stop-color="#050607" />
        </radialGradient>
        <radialGradient id="crimson-glow" cx="50%" cy="38%" r="42%">
          <stop offset="0%" stop-color="#e11d48" stop-opacity="0.25" />
          <stop offset="45%" stop-color="#9f1239" stop-opacity="0.10" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="50%" stop-color="#e11d48" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Base Background -->
      <rect width="${width}" height="${height}" fill="url(#bg-grad)" />
      <rect width="${width}" height="${height}" fill="url(#crimson-glow)" />

      <!-- Subtle Border Frame -->
      <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="24" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1.5" />

      <!-- Divider Accent Line -->
      <line x1="280" y1="435" x2="920" y2="435" stroke="url(#line-grad)" stroke-width="2" />

      <!-- Brand Name -->
      <text x="600" y="375" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="800" fill="#ffffff" letter-spacing="-1" text-anchor="middle">
        SWINGSPHERE
      </text>

      <!-- Tagline -->
      <text x="600" y="415" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="500" fill="#cbd5e1" letter-spacing="3" text-anchor="middle">
        GLOBAL LIFESTYLE DISCOVERY PLATFORM
      </text>

      <!-- Feature Pills -->
      <g transform="translate(600, 480)" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="#94a3b8">
        <text x="0" y="0" letter-spacing="2">
          CLUBS  •  PARTIES  •  EVENTS  •  HOSTS  •  RESORTS  •  CRUISES
        </text>
      </g>

      <!-- Domain Watermark -->
      <text x="600" y="555" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#e11d48" letter-spacing="2" text-anchor="middle">
        SWINGSPHERE.CO
      </text>
    </svg>
  `);

  const logoBuffer = await sharp('public/swingsphere-logo_2.png')
    .resize(200, 200, { fit: 'contain' })
    .toBuffer();

  const finalImage = await sharp(bgSvg)
    .composite([
      {
        input: logoBuffer,
        top: 85,
        left: Math.round((width - 200) / 2),
      }
    ])
    .png({ quality: 95 })
    .toFile('public/og-image.png');

  console.log('Created public/og-image.png:', finalImage);
}

createOgImage().catch(console.error);
