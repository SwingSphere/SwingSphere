import React from 'react';
import { Instagram } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TrackedExternalLink from './analytics/TrackedExternalLink';

type SocialIconName = 'x' | 'instagram' | 'bluesky' | 'threads' | 'patreon';

const socialLinks: Array<{
  label: string;
  icon: SocialIconName;
  href: string;
  placement: string;
  destinationType: 'social' | 'other';
}> = [
  { label: 'X', icon: 'x', href: 'https://x.com/SwingSphere_CO', placement: 'footer_social_x', destinationType: 'social' },
  { label: 'Instagram', icon: 'instagram', href: 'https://www.instagram.com/swingsphere/', placement: 'footer_social_instagram', destinationType: 'social' },
  { label: 'Bluesky', icon: 'bluesky', href: 'https://bsky.app/profile/swingsphere.bsky.social', placement: 'footer_social_bluesky', destinationType: 'social' },
  { label: 'Threads', icon: 'threads', href: 'https://www.threads.com/@swingsphere', placement: 'footer_social_threads', destinationType: 'social' },
  { label: 'Patreon', icon: 'patreon', href: 'https://www.patreon.com/c/SwingSphere', placement: 'footer_patreon', destinationType: 'other' },
];

const PATREON_ICON_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABKCAYAAAAG7CL/AAAFmElEQVR42u2bT4gcRRTGf92zm+wGowaDq/gHkSBGiCCKCB4MRA8eFC9hj6Ie9CIevIpePHmIB3MNKBL/gigeRCKYRHA9iKgrimh0BUNUsms2mZmdma7u9jCv8G1tz273bM9MzaQ/KGa6Zrqr3tdfvX6vqhoqVKhQocLQEXjQh73AdcCcfJ8FZuQ3AzSB88A5KecnlZiHgAeA24A7gRsVEYHTp1TVJ0ADqAM/AIvAKWBhWGSVjT3APPAJsCIqiMVQWwzQAdpSOkAknx353f6vJd/b8nkJ+Bh4QpTnPfYDR4BVMaCjPuty91tyrImKpMRS7LFR/2lInT225/8OvOIrIXPAMXVHjep821GKNkyXJENRLkFNdb0mcFH99idw2CdS5oFlZVxDfY96kGDUkImd//Qir6PqjPO/jmrrDR9IOarG/oqjFrfDJmN4WPLaGf/JIilxfE0kyomdIfn5KEl5TwxoZDjURGSeOL7GiFGbGW8cZRl1jTjjPOOo05aFUZDyZsZQaWYoJlFPlI5ysIlysvrpk2W0cdRlMoaUrtMqfXeYpLwgjV5QHW5m+JFhF+MQX5e654ZByoOigFV1Bxs9HOywS5ZajUTOc3mMq22DmI+A64GdcpwAU0DoyRMyUdGzkb5dIXUnBtXo88q5GsfpGQ8UE/fwbcsy7HcPSjHvAzukGLmOzWdqHqglcFRj+zcrCl+UfKsn+pH9MzKEZoA1YFrqY5Fr4gExqVKNTUR1DPXwVhfoh5gnpbFI7sCa3I2akxGPWjE15fMCuYF1qTuw1QWmCjZ4ALhLGrMEzMpdCKXUPCEnEUJi6VcCXCl93Vu2Yh5TjQTKudkxnHpCilFKMY6dNeAqKaUp5m5FgM+YEkICNQkWKt8TSfxVimJ2A/eN0QRZquyLlO+Zksmt0obSPuBaYdy3eeMsUqZV36yfsX0/VyYx+x2nFnhKiutrUjWcbED6XZlPpdtVMOc7AqWcQJE0I8enylTMLUJkOgbEJE5kb9OXAPgH+KxMYvY4jsx3x+umPruEsBPkWG4pQszN0uAOTwzXPk77vCTDPvuYDoCX8z7v82LaI2ebKnJSRUaY4QNtZr2L7urFz0WcVB78CtzqUT7kZtGpinYtITvV8VngpiIRYl6EnhGi05FQERSriNcowh6hoLFF745PQylLvTazbslvU8Ah4NtBEZN4FNSlYnxNRbaJ8jGxKCYGDgKnizZQhJiOZ/7FfULZrN/OD31KdyfFF/1ctAgxkfME8IEQ40wrtCSAe5zuLN3KdtLzvFhVTm+7KwHBFupz45Q1uhNi9gZNO/2vS5h/DPiwrHmLvGg6YXaZkelmT57QCe2n5fzv6a5Lnwa+Av4qe0InLy6o9H3QCPl/NXFWRdvfAG/TXdNaGmQHihCznJGxblcxm13HTmYb4CTwoihjKChCzN/S2YjiU6L9xCgh8C/wLPDWsD17EQP/cFL6ssL5LCWFwG9018eXGAGKEHOmj3PykKJXF1KlzvvlcyQICw6llHJn8Hqp5tFRktIPzrJ+d1MZi+52Q4CdHniJMcSXbNzx1C8pejNiS76f8cXQojHJ1yW2rYekDdpeY0wxX5Ji9OZBu1nxJ58MLaqYBZVlb1ctiTO5dJwxx2JJPsZuZEwkI756nBUD8EEJ7bpB4juSi4017ilBMfrcBjl3Uo4DTjqxR+TEJO6bIu4e4I4673UmCIfV3XZ3RmYdN9m4k3JV6vYxYfiR9dvX3e3vLjltVWffLTjCBOJeUYzer99WBLWdIdVk/ZsjvzDBeFUZHbHxlRm76bjDxjfTDjHhOK58TdMZQu0MJxwBT3OZ4Kgioa0SxIsOYQ3gKS4zHKS796TFxneILomy7hgXYwax3HqDOOZr6O42WKI7ib1MhQoVKlSoUKFChQoVKowH/gOkbjI6TYa2nwAAAABJRU5ErkJggg==';

const SocialIcon: React.FC<{ name: SocialIconName }> = ({ name }) => {
  if (name === 'instagram') return <Instagram size={20} strokeWidth={1.9} aria-hidden="true" />;

  if (name === 'x') {
    return (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
      </svg>
    );
  }

  if (name === 'bluesky') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M12 10.65C10.9 8.52 7.9 4.55 5.08 2.63 2.38.79 1.35 1.1.68 1.4.02 1.7-.16 2.72-.16 3.33c0 .62.34 5.08.56 5.82.73 2.45 3.32 3.27 5.71 2.84-4.18.75-7.9 2.59-3.03 8.03 5.35 5.55 7.34-1.19 7.92-3.17.1-.36.15-.52.16-.38.01-.14.06.02.16.38.58 1.98 2.57 8.72 7.92 3.17 4.87-5.44 1.15-7.28-3.03-8.03 2.39.43 4.98-.39 5.71-2.84.22-.74.56-5.2.56-5.82 0-.61-.18-1.63-.84-1.93-.67-.3-1.7-.61-4.4 1.23C16.1 4.55 13.1 8.52 12 10.65Z" transform="scale(.82) translate(2.6 1.5)" />
      </svg>
    );
  }

  if (name === 'threads') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M12.1 3.25c-4.95 0-8.1 3.4-8.1 8.8 0 5.28 3.16 8.7 8.12 8.7 4.46 0 7.46-2.47 7.46-6.2 0-2.7-1.6-4.65-4.35-5.35-.49-2.02-1.88-3.17-3.95-3.17-1.8 0-3.2.85-3.98 2.38l2.05.82c.42-.77 1.06-1.16 1.93-1.16.92 0 1.52.44 1.82 1.32-.4-.03-.8-.04-1.18-.04-3.16 0-5.2 1.5-5.2 3.86 0 2.14 1.74 3.58 4.22 3.58 2.57 0 4.35-1.5 4.55-3.77.98.5 1.47 1.32 1.47 2.44 0 2.2-1.83 3.58-4.76 3.58-3.57 0-5.88-2.64-5.88-6.99 0-4.44 2.28-7.1 5.8-7.1 2.93 0 4.9 1.37 5.88 4.08l2.11-.74C18.88 5.34 16.2 3.25 12.1 3.25Zm-1.06 11.49c-1.17 0-1.95-.6-1.95-1.52 0-1.08 1-1.75 2.84-1.75.45 0 .9.03 1.35.08-.03 2.02-.8 3.19-2.24 3.19Z" fill="currentColor" />
      </svg>
    );
  }

  return <img src={PATREON_ICON_DATA_URI} alt="" className="h-5 w-5 object-contain opacity-90 invert transition-opacity group-hover:opacity-100" aria-hidden="true" />;
};

const Footer: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const navigate = useNavigate();

  return (
    <footer className={`bg-black/50 text-gray-500 border-t border-gray-800/50 ${compact ? 'py-4' : 'py-12'}`}>
      <div className="container mx-auto px-6 lg:px-8">
        <div className={compact
          ? 'flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between'
          : 'grid grid-cols-2 md:grid-cols-4 gap-8 mb-8 text-sm'}>
          <div className={compact ? 'flex items-center gap-3' : 'col-span-2 md:col-span-1'}>
            <h4 className={`font-bold text-gray-200 tracking-widest uppercase ${compact ? 'text-sm' : 'mb-3 text-base'}`}><span className="text-red-500">Swing</span>Sphere</h4>
            {!compact && <p className="pr-4">Discover Your Scene. Connect with Your Community.</p>}
          </div>
          <div className={compact ? 'flex flex-wrap gap-x-5 gap-y-2' : ''}>
            {!compact && <h4 className="font-bold text-gray-300 mb-3">Navigate</h4>}
            <ul className={compact ? 'flex flex-wrap gap-x-4 gap-y-2' : 'space-y-2'}>
              <li><button type="button" onClick={() => navigate('/about')} className="hover:text-white transition-colors bg-transparent p-0 text-left">About Us</button></li>
              <li><button type="button" onClick={() => navigate('/faq')} className="hover:text-white transition-colors bg-transparent p-0 text-left">FAQ</button></li>
              <li><button type="button" onClick={() => navigate('/contact')} className="hover:text-white transition-colors bg-transparent p-0 text-left">Contact</button></li>
            </ul>
          </div>
          <div>
            {!compact && <h4 className="font-bold text-gray-300 mb-3">Legal</h4>}
            <ul className={compact ? 'flex flex-wrap gap-x-4 gap-y-2' : 'space-y-2'}>
              <li><button type="button" onClick={() => navigate('/privacy')} className="hover:text-white transition-colors bg-transparent p-0 text-left">Privacy Policy</button></li>
              <li><button type="button" onClick={() => navigate('/tos')} className="hover:text-white transition-colors bg-transparent p-0 text-left">Terms of Service</button></li>
            </ul>
          </div>
          {!compact ? (
            <div className="flex items-end md:self-end">
              <div className="flex items-center gap-2.5" aria-label="SwingSphere social links">
                {socialLinks.map((link) => (
                  <TrackedExternalLink
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`SwingSphere on ${link.label}`}
                    title={link.label}
                    tracking={{
                      entityType: 'organization',
                      entityId: 'swingsphere',
                      destinationType: link.destinationType,
                      placement: link.placement,
                    }}
                    className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-gray-400 transition-all hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70"
                  >
                    <SocialIcon name={link.icon} />
                  </TrackedExternalLink>
                ))}
              </div>
            </div>
          ) : null}
          {compact && <p className="text-gray-600">&copy; 2026 <span className="text-red-500">Swing</span>Sphere</p>}
        </div>
        {!compact && (
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; 2026 <span className="text-red-500">Swing</span>Sphere. All rights reserved.</p>
          </div>
        )}
      </div>
    </footer>
  );
};

export default Footer;
