'use client';

import { useState, useEffect } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface InputModalProps {
  isOpen: boolean;
  title: string;
  defaultValue?: string;
  placeholder?: string;
  submitText?: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

export default function InputModal({
  isOpen,
  title,
  defaultValue = '',
  placeholder = '',
  submitText = 'Submit',
  onClose,
  onSubmit
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  const handleSubmit = () => {
    if (!value.trim()) return;
    onSubmit(value);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <ModalBody>
        <Input
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') onClose();
          }}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!value.trim()}>
          {submitText}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
