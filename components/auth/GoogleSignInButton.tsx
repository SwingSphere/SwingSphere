import React from 'react';

type GoogleSignInButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
};

const GoogleMark: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
    <path fill="#4285F4" d="M21.35 12.2c0-.71-.06-1.23-.2-1.77H12v3.31h5.37a4.57 4.57 0 0 1-1.99 3v2.15h3.22c1.89-1.74 2.75-4.3 2.75-6.69Z" />
    <path fill="#34A853" d="M12 21.7c2.62 0 4.83-.86 6.44-2.34l-3.22-2.15c-.89.6-2.03.95-3.22.95-2.53 0-4.67-1.71-5.44-4.01H3.23v2.22A9.72 9.72 0 0 0 12 21.7Z" />
    <path fill="#FBBC05" d="M6.56 14.15A5.84 5.84 0 0 1 6.25 12c0-.75.13-1.48.36-2.15V7.63H3.23A9.7 9.7 0 0 0 2.2 12c0 1.57.38 3.06 1.03 4.37l3.33-2.22Z" />
    <path fill="#EA4335" d="M12 5.84c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.36 9.36 0 0 0 12 2.3a9.72 9.72 0 0 0-8.77 5.33l3.38 2.22C7.33 7.55 9.47 5.84 12 5.84Z" />
  </svg>
);

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onClick, disabled = false, label = 'Continue with Google' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex w-full items-center justify-center gap-3 rounded-md border border-white/15 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
  >
    <GoogleMark />
    <span>{label}</span>
  </button>
);

export default GoogleSignInButton;
