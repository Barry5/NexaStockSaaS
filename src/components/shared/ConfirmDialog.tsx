import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const variants = {
  danger: {
    icon: Trash2,
    iconBg: 'bg-red-500/10 border-red-500/20 text-red-400',
    buttonBg: 'bg-red-600 hover:bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    buttonBg: 'bg-amber-600 hover:bg-amber-500',
  },
  info: {
    icon: AlertTriangle,
    iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    buttonBg: 'bg-blue-600 hover:bg-blue-500',
  },
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const config = variants[variant];
  const Icon = config.icon;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="max-w-sm">
      <div className="text-center space-y-4">
        <div className={`w-12 h-12 mx-auto rounded-xl border flex items-center justify-center ${config.iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">{title}</h4>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-xl transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-white text-xs font-bold rounded-xl transition shadow-lg ${config.buttonBg}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
