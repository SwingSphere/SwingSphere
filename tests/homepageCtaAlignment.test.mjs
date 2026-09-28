import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const indexCssPath = path.join(repoRoot, 'index.css');
const landingPagePath = path.join(repoRoot, 'components', 'LandingPage.tsx');
const exploreGlobeButtonPath = path.join(repoRoot, 'components', 'ExploreGlobeButton.tsx');
const browseDirectoryButtonPath = path.join(repoRoot, 'components', 'BrowseDirectoryButton.tsx');

const indexCss = fs.readFileSync(indexCssPath, 'utf8');
const landingPage = fs.readFileSync(landingPagePath, 'utf8');
const exploreGlobeButton = fs.readFileSync(exploreGlobeButtonPath, 'utf8');
const browseDirectoryButton = fs.readFileSync(browseDirectoryButtonPath, 'utf8');

test('Homepage CTA Alignment: Shared sizing, height, radius, and typography', () => {
  // Height: Both buttons must be 56px min-height / height
  assert.match(indexCss, /\.ss-explore-globe-cta__button\s*\{[^}]*height:\s*56px;[^}]*min-height:\s*56px;/s);
  assert.match(indexCss, /\.ss-browse-directory-cta\s*\{[^}]*height:\s*56px;[^}]*min-height:\s*56px;/s);

  // Border radius: Both buttons must have 16px border-radius
  assert.match(indexCss, /\.ss-explore-globe-cta__button\s*\{[^}]*border-radius:\s*16px;/s);
  assert.match(indexCss, /\.ss-browse-directory-cta\s*\{[^}]*border-radius:\s*16px;/s);

  // Typography: Both must share font-size 1rem, font-weight 700, letter-spacing -0.015em, line-height 1
  assert.match(indexCss, /\.ss-explore-globe-cta__content\s*\{[^}]*font-size:\s*1rem;[^}]*font-weight:\s*700;[^}]*letter-spacing:\s*-0.015em;[^}]*line-height:\s*1;/s);
  assert.match(indexCss, /\.ss-browse-directory-cta__content\s*\{[^}]*font-size:\s*1rem;[^}]*font-weight:\s*700;[^}]*letter-spacing:\s*-0.015em;[^}]*line-height:\s*1;/s);
});

test('Homepage CTA Alignment: Icon sizing, arrow alignment, and flex properties', () => {
  // Leading icon sizes (20px, strokeWidth 1.9)
  assert.match(exploreGlobeButton, /<Globe2[^>]*size=\{20\}[^>]*strokeWidth=\{1\.9\}/);
  assert.match(browseDirectoryButton, /<ListFilter[^>]*size=\{20\}[^>]*strokeWidth=\{1\.9\}/);

  // Trailing arrow sizes (18px, strokeWidth 2)
  assert.match(exploreGlobeButton, /<ArrowRight[^>]*size=\{18\}[^>]*strokeWidth=\{2\}/);
  assert.match(browseDirectoryButton, /<ArrowRight[^>]*size=\{18\}[^>]*strokeWidth=\{2\}/);

  // Icons should have flex-shrink: 0 so they never distort on narrow screens
  assert.match(indexCss, /\.ss-explore-globe-cta__icon\s*\{[^}]*flex-shrink:\s*0;/s);
  assert.match(indexCss, /\.ss-browse-directory-cta__icon\s*\{[^}]*flex-shrink:\s*0;/s);
  assert.match(indexCss, /\.ss-explore-globe-cta__arrow\s*\{[^}]*flex-shrink:\s*0;/s);
  assert.match(indexCss, /\.ss-browse-directory-cta__arrow\s*\{[^}]*flex-shrink:\s*0;/s);
});

test('Homepage CTA Alignment: Mobile width parity and layout', () => {
  // Mobile: both buttons have width: 100% on their root classes and elements
  assert.match(indexCss, /\.ss-explore-globe-cta\s*\{[^}]*width:\s*100%;/s);
  assert.match(indexCss, /\.ss-explore-globe-cta__button\s*\{[^}]*width:\s*100%;/s);
  assert.match(indexCss, /\.ss-browse-directory-cta\s*\{[^}]*width:\s*100%;/s);

  // In LandingPage, both buttons receive "w-full sm:w-auto"
  assert.match(landingPage, /<ExploreGlobeButton[\s\S]*?className="w-full sm:w-auto"/);
  assert.match(landingPage, /<BrowseDirectoryButton[\s\S]*?className="w-full sm:w-auto"/);

  // ExploreGlobeButton root supports custom className
  assert.match(exploreGlobeButton, /className=\{`ss-explore-globe-cta \$\{className\}`\.trim\(\)\}/);
});

test('Homepage CTA Alignment: Tablet and Desktop visual balance', () => {
  // On sm: (min-width: 640px), width switches to auto with balanced min-widths
  assert.match(indexCss, /@media \(min-width: 640px\)[\s\S]*?\.ss-explore-globe-cta\s*\{[\s\S]*?width:\s*auto;/);
  assert.match(indexCss, /@media \(min-width: 640px\)[\s\S]*?\.ss-explore-globe-cta__button\s*\{[\s\S]*?width:\s*auto;[\s\S]*?min-width:\s*232px;/);
  assert.match(indexCss, /@media \(min-width: 640px\)[\s\S]*?\.ss-browse-directory-cta\s*\{[\s\S]*?width:\s*auto;[\s\S]*?min-width:\s*232px;/);

  // Balanced padding: Globe has 26px padding, Directory has 19px padding
  assert.match(indexCss, /\.ss-explore-globe-cta__button\s*\{[^}]*padding:\s*0 26px;/s);
  assert.match(indexCss, /\.ss-browse-directory-cta\s*\{[^}]*padding:\s*0 19px;/s);
});

test('Homepage CTA Alignment: Visual hierarchy (Crimson Primary vs Dark Translucent Secondary)', () => {
  // Primary Globe button has crimson gradient background and crimson border
  assert.match(indexCss, /\.ss-explore-globe-cta__button\s*\{[^}]*rgba\(127, 12, 34/s);
  assert.match(indexCss, /\.ss-explore-globe-cta__button\s*\{[^}]*border:\s*1px solid rgba\(255, 82, 111/s);

  // Secondary Directory button has dark translucent background and subtle border
  assert.match(indexCss, /\.ss-browse-directory-cta\s*\{[^}]*rgba\(28, 31, 40, 0\.74\)/s);
  assert.match(indexCss, /\.ss-browse-directory-cta\s*\{[^}]*border:\s*1px solid rgba\(255, 255, 255, 0\.14\)/s);
});

test('Homepage CTA Alignment: Directory hover treatment', () => {
  // Lift: translateY(-2px)
  assert.match(indexCss, /\.ss-browse-directory-cta:hover\s*\{[^}]*transform:\s*translateY\(-2px\);/s);

  // Increased border visibility
  assert.match(indexCss, /\.ss-browse-directory-cta:hover\s*\{[^}]*border-color:\s*rgba\(255, 115, 138/s);

  // Subtle crimson edge glow
  assert.match(indexCss, /\.ss-browse-directory-cta:hover\s*\{[^}]*0 0 20px rgba\(220, 20, 52, 0\.16\)/s);

  // Brightened directory icon
  assert.match(indexCss, /\.ss-browse-directory-cta:hover \.ss-browse-directory-cta__icon\s*\{[^}]*color:\s*#ff9fb1;[^}]*filter:\s*drop-shadow\(0 0 6px rgba\(255, 43, 79, 0\.45\)\);/s);

  // Translated arrow (+3px)
  assert.match(indexCss, /\.ss-browse-directory-cta:hover \.ss-browse-directory-cta__arrow\s*\{[^}]*transform:\s*translateX\(3px\);/s);

  // Transition duration/easing matches Globe CTA
  assert.match(indexCss, /\.ss-explore-globe-cta__button\s*\{[^}]*transition:[^;]*170ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/s);
  assert.match(indexCss, /\.ss-browse-directory-cta\s*\{[^}]*transition:[^;]*170ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/s);
});

test('Homepage CTA Alignment: Interaction consistency (focus-visible, active/pressed, touch, reduced motion)', () => {
  // Focus-visible: identical 2px outline and 4px offset
  assert.match(indexCss, /\.ss-explore-globe-cta__button:focus-visible\s*\{[^}]*outline:\s*2px solid rgba\(255, 155, 171, 0\.96\);[^}]*outline-offset:\s*4px;/s);
  assert.match(indexCss, /\.ss-browse-directory-cta:focus-visible\s*\{[^}]*outline:\s*2px solid rgba\(255, 155, 171, 0\.96\);[^}]*outline-offset:\s*4px;/s);

  // Active / pressed: scale(0.985) and translateY(0px)
  assert.match(indexCss, /\.ss-explore-globe-cta__button:active\s*\{[^}]*transform:\s*translateY\(0px\) scale\(0\.985\);/s);
  assert.match(indexCss, /\.ss-browse-directory-cta:active\s*\{[^}]*transform:\s*translateY\(0px\) scale\(0\.985\);/s);

  // Touch safety: pointer events ignore touch type in ExploreGlobeButton
  assert.match(exploreGlobeButton, /event\.pointerType === 'touch'/);

  // Reduced motion: transforms and transitions disabled
  assert.match(indexCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ss-browse-directory-cta/);
});
