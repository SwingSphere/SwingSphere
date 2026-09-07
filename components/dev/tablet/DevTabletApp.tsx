import React from 'react';
import DevMobileApp from '../mobile/DevMobileApp';

export const DEV_TABLET_BASE = '/tablet';

const DevTabletApp: React.FC = () => (
  <div className="h-[100dvh] w-full overflow-hidden bg-[#030407]" data-device-experience="tablet">
    <DevMobileApp basePath={DEV_TABLET_BASE} experienceKind="tablet" />
  </div>
);

export default DevTabletApp;
