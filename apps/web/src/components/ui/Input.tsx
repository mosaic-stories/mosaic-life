import { InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import './Input.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, error, helpText, fullWidth = false, className, id, required, ...props },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const helpTextId = helpText ? `${inputId}-help` : undefined;

    return (
      <div className={clsx('input-wrapper', fullWidth && 'input-full-width')}>
        {label && (
          <label htmlFor={inputId} className="input-label">
            {label}
            {required && (
              <span className="input-required" aria-label="required">
                {' '}
                *
              </span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx('input', error && 'input-error', className)}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={clsx(errorId, helpTextId).trim() || undefined}
          required={required}
          {...props}
        />
        {error && (
          <p id={errorId} className="input-error-text" role="alert">
            {error}
          </p>
        )}
        {helpText && !error && (
          <p id={helpTextId} className="input-help-text">
            {helpText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
