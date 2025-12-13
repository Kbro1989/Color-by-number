import React from 'react';
import { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
            animate-slide-in-right transition-all duration-300 transform
            ${toast.type === 'error' ? 'bg-red-900/90 text-red-100 border-l-4 border-red-500' : ''}
            ${toast.type === 'success' ? 'bg-green-900/90 text-green-100 border-l-4 border-green-500' : ''}
            ${toast.type === 'info' ? 'bg-blue-900/90 text-blue-100 border-l-4 border-blue-500' : ''}
          `}
          onClick={() => removeToast(toast.id)}
        >
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;