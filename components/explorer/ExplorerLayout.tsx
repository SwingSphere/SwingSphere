import React from 'react';
import { Outlet } from 'react-router-dom';
import { ExplorerProvider } from './ExplorerProvider';

const ExplorerLayout: React.FC = () => (
  <ExplorerProvider>
    <Outlet />
  </ExplorerProvider>
);

export default ExplorerLayout;
