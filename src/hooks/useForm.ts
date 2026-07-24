import { useState, useCallback } from 'react';

export function useForm<T extends Record<string, any>>(initial: T) {
  const [form, setForm] = useState<T>(initial);
  const [isDirty, setIsDirty] = useState(false);

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  const reset = useCallback(() => {
    setForm(initial);
    setIsDirty(false);
  }, [initial]);

  return { form, setForm, updateField, reset, isDirty };
}
