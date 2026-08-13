import React from 'react';
import { useAppStore } from '../store/appStore';
import type { Toast as ToastType } from '../types';

const toastIcons = {
  success: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  error: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  info: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

const Toast: React.FC<{ toast: ToastType }> = ({ toast }) => {
  // FIX: Destructure removeToast directly from useAppStore hook.
  const { removeToast } = useAppStore();
  
  return (
    <div className="ss-glass-surface pointer-events-auto flex w-full max-w-md overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/40">
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0 pt-0.5">
            {toastIcons[toast.type]}
          </div>
          <div className="ml-3 min-w-0 flex-1">
            <p className="break-words text-sm font-medium leading-5 text-gray-100">{toast.message}</p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 border-l border-white/10">
        <button
          onClick={() => removeToast(toast.id)}
          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  // FIX: Destructure toasts directly from useAppStore hook.
  const { toasts } = useAppStore();

  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-0 z-[100] flex items-end px-4 py-6 sm:items-start sm:p-6">
      <div className="flex w-full flex-col items-center gap-4 sm:items-end">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} />
        ))}
      </div>
    </div>
  );
};