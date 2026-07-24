import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForm } from './useForm';

describe('useForm', () => {
  it('initializes with provided values', () => {
    const { result } = renderHook(() => useForm({ name: '', age: 0 }));
    expect(result.current.form).toEqual({ name: '', age: 0 });
    expect(result.current.isDirty).toBe(false);
  });

  it('updates a single field', () => {
    const { result } = renderHook(() => useForm({ name: '', age: 0 }));
    act(() => {
      result.current.updateField('name', 'John');
    });
    expect(result.current.form.name).toBe('John');
    expect(result.current.form.age).toBe(0);
    expect(result.current.isDirty).toBe(true);
  });

  it('updates multiple fields sequentially', () => {
    const { result } = renderHook(() => useForm({ name: '', age: 0 }));
    act(() => {
      result.current.updateField('name', 'Jane');
    });
    act(() => {
      result.current.updateField('age', 25);
    });
    expect(result.current.form.name).toBe('Jane');
    expect(result.current.form.age).toBe(25);
  });

  it('resets to initial values', () => {
    const { result } = renderHook(() => useForm({ name: 'test', age: 10 }));
    act(() => {
      result.current.updateField('name', 'modified');
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.form).toEqual({ name: 'test', age: 10 });
    expect(result.current.isDirty).toBe(false);
  });
});
