import React from 'react';

type AdminEntityIdentityProps = {
  name: string;
  imageUrl?: string;
  imageSourceLabel?: string;
  secondary?: string;
  shape?: 'rounded' | 'square';
};

const initialsFor = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';

const AdminEntityIdentity: React.FC<AdminEntityIdentityProps> = ({
  name,
  imageUrl,
  imageSourceLabel,
  secondary,
  shape = 'rounded',
}) => (
  <div className="flex min-w-[220px] items-center gap-3">
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-gray-200 bg-gray-50 text-sm font-bold text-gray-500 shadow-sm ${shape === 'square' ? 'rounded-lg' : 'rounded-xl'}`}>
      {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-contain p-1" /> : initialsFor(name)}
    </div>
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold text-gray-900">{name}</div>
      {secondary ? <div className="mt-0.5 truncate text-xs text-gray-500">{secondary}</div> : null}
      {imageSourceLabel ? <div className="mt-0.5 truncate text-[10px] font-semibold text-blue-500">{imageSourceLabel}</div> : null}
    </div>
  </div>
);

export default AdminEntityIdentity;
