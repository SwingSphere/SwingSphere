import React from 'react';
import {
  trackOutboundClick,
  type OutboundInteractionType,
  type OutboundTrackingMetadata,
} from '../../lib/analytics/outboundTracking';

type TrackedExternalLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  tracking: OutboundTrackingMetadata;
};

const TrackedExternalLink: React.FC<TrackedExternalLinkProps> = ({
  href,
  tracking,
  onClick,
  onAuxClick,
  children,
  ...anchorProps
}) => {
  const record = (interactionType: OutboundInteractionType) => {
    void trackOutboundClick(href, tracking, interactionType);
  };

  return (
    <a
      {...anchorProps}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        record(event.detail === 0 ? 'keyboard' : 'click');
      }}
      onAuxClick={(event) => {
        onAuxClick?.(event);
        if (event.defaultPrevented) return;
        record('auxclick');
      }}
    >
      {children}
    </a>
  );
};

export default TrackedExternalLink;
