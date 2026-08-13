import React, { useEffect, useState } from 'react';
import LivingLowPolyBackground from './LivingLowPolyBackground';
import {
  readLivingBackgroundSettings,
  subscribeToLivingBackgroundSettings,
  toLivingBackgroundProps,
} from '../lib/livingBackgroundSettings';

type SavedLivingLowPolyBackgroundProps = {
  className?: string;
  interactive?: boolean;
};

export default function SavedLivingLowPolyBackground({
  className = '',
  interactive = true,
}: SavedLivingLowPolyBackgroundProps) {
  const [settings, setSettings] = useState(readLivingBackgroundSettings);

  useEffect(() => subscribeToLivingBackgroundSettings(setSettings), []);

  return (
    <LivingLowPolyBackground
      {...toLivingBackgroundProps(settings)}
      className={className}
      interactive={interactive}
    />
  );
}
