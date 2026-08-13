import React from 'react';
import { ExternalLink, Globe, Instagram, Link2, Mail } from 'lucide-react';
import TrackedExternalLink from '../analytics/TrackedExternalLink';
import type { OutboundDestinationType } from '../../lib/analytics/outboundTracking';

type HostExternalLinksProps = {
  organizationId: string;
  website?: string;
  instagram?: string;
  fetlife?: string;
  email?: string;
};

const displayHref = (href: string): string => {
  if (href.startsWith('mailto:')) return href.replace('mailto:', '');
  try {
    const url = new URL(href);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
};

const ExternalRow: React.FC<{
  organizationId: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  destinationType: OutboundDestinationType;
  placement: string;
}> = ({ organizationId, icon, label, href, destinationType, placement }) => (
  <li>
    <TrackedExternalLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      tracking={{
        entityType: 'organization',
        entityId: organizationId,
        organizationId,
        destinationType,
        placement,
        surface: 'entity_page',
      }}
      className="ss-glass ss-glass--ambient ss-glass--interactive flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-gray-300"
    >
      <span className="text-red-300">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block font-semibold text-gray-200">{label}</span><span className="block truncate text-[11px] text-gray-500">{displayHref(href)}</span></span>
      <ExternalLink size={13} className="shrink-0 text-gray-500" />
    </TrackedExternalLink>
  </li>
);

const HostExternalLinks: React.FC<HostExternalLinksProps> = ({
  organizationId,
  website,
  instagram,
  fetlife,
  email,
}) => {
  const hasLinks = Boolean(website || instagram || fetlife || email);
  if (!hasLinks) return null;

  return (
    <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-gray-100">Links & contact</h2>
      <p className="mt-1 text-xs text-gray-500">Official website, social profiles, and contact options.</p>
      <ul className="mt-3 space-y-2">
        {website ? <ExternalRow organizationId={organizationId} icon={<Globe size={14} />} label="Website" href={website} destinationType="website" placement="host_page_external_website" /> : null}
        {fetlife ? <ExternalRow organizationId={organizationId} icon={<Link2 size={14} />} label="FetLife" href={fetlife} destinationType="social" placement="host_page_external_fetlife" /> : null}
        {instagram ? <ExternalRow organizationId={organizationId} icon={<Instagram size={14} />} label="Instagram" href={instagram} destinationType="social" placement="host_page_external_instagram" /> : null}
        {email ? <ExternalRow organizationId={organizationId} icon={<Mail size={14} />} label="Email" href={email} destinationType="email" placement="host_page_external_email" /> : null}
      </ul>
    </section>
  );
};

export default HostExternalLinks;
