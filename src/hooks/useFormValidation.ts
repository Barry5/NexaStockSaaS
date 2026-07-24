import { useState, useCallback } from 'react';
import type { z } from 'zod';

interface FieldError {
  field: string;
  message: string;
}

interface UseFormValidationResult<T> {
  data: T;
  errors: Record<string, string>;
  setField: <K extends keyof T>(field: K, value: T[K]) => void;
  setData: (data: T) => void;
  validate: () => boolean;
  validateField: (field: keyof T) => string | null;
  reset: () => void;
  clearErrors: () => void;
}

export function useFormValidation<T extends Record<string, any>>(
  schema: z.ZodSchema<T>,
  initialData: T
): UseFormValidationResult<T> {
  const [data, setData] = useState<T>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[field as string];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const result = schema.safeParse(data);
    if (result.success) {
      setErrors({});
      return true;
    }
    const newErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (!newErrors[path]) {
        newErrors[path] = issue.message;
      }
    }
    setErrors(newErrors);
    return false;
  }, [schema, data]);

  const validateField = useCallback((field: keyof T): string | null => {
    const result = schema.safeParse(data);
    if (result.success) return null;
    for (const issue of result.error.issues) {
      if (issue.path.join('.') === field) {
        setErrors(prev => ({ ...prev, [field as string]: issue.message }));
        return issue.message;
      }
    }
    setErrors(prev => {
      const next = { ...prev };
      delete next[field as string];
      return next;
    });
    return null;
  }, [schema, data]);

  const reset = useCallback(() => {
    setData(initialData);
    setErrors({});
  }, [initialData]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  return { data, errors, setField, setData, validate, validateField, reset, clearErrors };
}
