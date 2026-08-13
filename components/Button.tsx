

import React from 'react';

type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  size?: 'normal' | 'large';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
};

const Button: React.FC<ButtonProps> = ({ children, onClick, variant = 'primary', size = 'normal', disabled = false, type }) => {
  // FIX: Added disabled styles for cursor and opacity.
  const baseClasses = 'ss-glass ss-glass--interactive font-semibold rounded-xl transition-[transform,box-shadow,opacity] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-red-300 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'ss-glass--liquid ss-glass--crimson text-white',
    secondary: 'ss-glass--ambient text-gray-200 hover:text-white',
  };

  const sizeClasses = {
    normal: 'px-4 py-2 text-sm',
    large: 'px-8 py-3 text-base',
  };

  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`;

  return (
    // FIX: Pass the disabled prop to the underlying button element.
    // FIX: Pass the type prop to the underlying button element.
    <button className={combinedClasses} onClick={onClick} disabled={disabled} type={type}>
      {children}
    </button>
  );
};

export default Button;