import React from 'react';

type GlassTier = 'ambient' | 'liquid' | 'refractive';
type GlassTone = 'neutral' | 'crimson';

type GlassSurfaceProps<T extends React.ElementType = 'div'> = {
  as?: T;
  tier?: GlassTier;
  tone?: GlassTone;
  interactive?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

export function GlassSurface<T extends React.ElementType = 'div'>({
  as,
  tier = 'ambient',
  tone = 'neutral',
  interactive = false,
  className = '',
  children,
  ...props
}: GlassSurfaceProps<T>) {
  const Component = as || 'div';
  const classes = [
    'ss-glass',
    `ss-glass--${tier}`,
    tone === 'crimson' ? 'ss-glass--crimson' : '',
    interactive ? 'ss-glass--interactive' : '',
    className,
  ].filter(Boolean).join(' ');

  return <Component className={classes} {...props}>{children}</Component>;
}

export default GlassSurface;
