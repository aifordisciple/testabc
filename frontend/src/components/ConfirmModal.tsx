'use client';

import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  confirmColor?: 'red' | 'blue' | 'emerald';
  onClose: () => void;
  onConfirm: () => void;
}

export default function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Confirm', 
  confirmColor = 'red',
  onClose, 
  onConfirm 
}: ConfirmModalProps) {
  const variantMap = {
    red: 'destructive',
    blue: 'default',
    emerald: 'default',
  } as const;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <ModalBody>
        <p className="text-gray-400 text-sm">{message}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button 
          variant={variantMap[confirmColor]} 
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmText}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
