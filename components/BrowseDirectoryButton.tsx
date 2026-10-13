import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ListFilter } from 'lucide-react';

type BrowseDirectoryButtonProps = {
  onClick?: () => void;
  to?: string;
  className?: string;
};

const BrowseDirectoryButton: React.FC<BrowseDirectoryButtonProps> = ({
  onClick,
  to = '/discover',
  className = '',
}) => {
  return (
    <Link
      to={to}
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`ss-browse-directory-cta ${className}`.trim()}
      aria-label="Browse the Directory"
    >
      <span className="ss-browse-directory-cta__glass" aria-hidden="true" />
      <span className="ss-browse-directory-cta__content">
        <ListFilter className="ss-browse-directory-cta__icon" size={20} strokeWidth={1.9} aria-hidden="true" />
        <span className="ss-browse-directory-cta__label">Browse the Directory</span>
        <ArrowRight className="ss-browse-directory-cta__arrow" size={18} strokeWidth={2} aria-hidden="true" />
      </span>
    </Link>
  );
};

export default BrowseDirectoryButton;

