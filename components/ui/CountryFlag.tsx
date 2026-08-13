import React from 'react';
import { getCountryFlagImageUrl, resolveCountryCode } from '../../lib/formatting';

interface CountryFlagProps {
  country: string;
  className?: string;
  title?: string;
}

const CountryFlag: React.FC<CountryFlagProps> = ({ country, className = '', title }) => {
  const code = resolveCountryCode(country);
  const src = getCountryFlagImageUrl(code);
  if (!code || !src) return null;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      title={title ?? `${code} flag`}
      className={`inline-block shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.16)] ${className}`}
      loading="lazy"
      decoding="async"
    />
  );
};

export default CountryFlag;
