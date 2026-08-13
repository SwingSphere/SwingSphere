import React from 'react';

type EditorTone = 'dark' | 'light';

const toneClasses = {
  dark: {
    label: 'text-gray-300',
    control: 'ss-form-control text-white placeholder:text-gray-500 border-white/10 focus:border-red-400',
    errorControl: 'border-red-500/80 focus:border-red-400',
    help: 'text-gray-400',
    error: 'text-red-300',
  },
  light: {
    label: 'text-gray-700',
    control: 'border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-100',
    errorControl: 'border-red-500 focus:border-red-500 focus:ring-red-100',
    help: 'text-gray-500',
    error: 'text-red-600',
  },
} as const;

type SharedFieldProps = {
  label: string;
  error?: string;
  helpText?: string;
  tone?: EditorTone;
};

export const EditorSurface: React.FC<React.PropsWithChildren<{ title: string; eyebrow?: string; tone?: EditorTone }>> = ({
  title,
  eyebrow,
  tone = 'dark',
  children,
}) => (
  <section className={tone === 'dark'
    ? 'ss-glass ss-glass--ambient rounded-3xl p-5 md:p-6'
    : 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:p-6'}>
    {eyebrow && <p className={tone === 'dark'
      ? 'mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-red-300/90'
      : 'mb-2 text-xs font-bold uppercase tracking-[0.18em] text-red-600'}>{eyebrow}</p>}
    <h2 className={tone === 'dark' ? 'mb-4 text-xl font-semibold text-white' : 'mb-4 text-xl font-bold text-gray-900'}>{title}</h2>
    {children}
  </section>
);

export const EditorInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & SharedFieldProps> = ({
  label,
  error,
  helpText,
  tone = 'dark',
  className,
  ...props
}) => {
  const styles = toneClasses[tone];
  return (
    <label className="block">
      <span className={`mb-1 block text-sm font-medium ${styles.label}`}>{label}</span>
      <input
        {...props}
        className={[
          'w-full rounded-2xl px-4 py-3 text-sm outline-none transition',
          error ? styles.errorControl : styles.control,
          props.disabled ? 'opacity-60' : '',
          className ?? '',
        ].join(' ')}
      />
      {helpText && !error && <span className={`mt-1 block text-xs ${styles.help}`}>{helpText}</span>}
      {error && <span className={`mt-1 block text-xs ${styles.error}`}>{error}</span>}
    </label>
  );
};

export const EditorTextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & SharedFieldProps> = ({
  label,
  error,
  helpText,
  tone = 'dark',
  maxLength,
  className,
  ...props
}) => {
  const styles = toneClasses[tone];
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className={`block text-sm font-medium ${styles.label}`}>{label}</span>
        {typeof maxLength === 'number' && <span className={`text-xs ${styles.help}`}>{String(props.value ?? '').length} / {maxLength}</span>}
      </div>
      <textarea
        {...props}
        maxLength={maxLength}
        rows={props.rows ?? 4}
        className={[
          'w-full rounded-2xl px-4 py-3 text-sm outline-none transition',
          error ? styles.errorControl : styles.control,
          className ?? '',
        ].join(' ')}
      />
      {helpText && !error && <span className={`mt-1 block text-xs ${styles.help}`}>{helpText}</span>}
      {error && <span className={`mt-1 block text-xs ${styles.error}`}>{error}</span>}
    </label>
  );
};

export const EditorSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & SharedFieldProps> = ({
  label,
  error,
  helpText,
  tone = 'dark',
  children,
  className,
  ...props
}) => {
  const styles = toneClasses[tone];
  return (
    <label className="block">
      <span className={`mb-1 block text-sm font-medium ${styles.label}`}>{label}</span>
      <select
        {...props}
        className={[
          'w-full rounded-2xl px-4 py-3 text-sm outline-none transition',
          error ? styles.errorControl : styles.control,
          className ?? '',
        ].join(' ')}
      >
        {children}
      </select>
      {helpText && !error && <span className={`mt-1 block text-xs ${styles.help}`}>{helpText}</span>}
      {error && <span className={`mt-1 block text-xs ${styles.error}`}>{error}</span>}
    </label>
  );
};
