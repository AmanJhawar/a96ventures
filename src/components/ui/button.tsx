'use client'

import React, { forwardRef } from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  loadingText?: string
  icon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      icon,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    const baseStyles =
      'inline-flex items-center justify-center font-medium select-none focus:outline-none transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none disabled:active:scale-100'

    const sizeStyles = {
      sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
      md: 'h-9 px-4 text-xs font-semibold gap-2 rounded-lg',
      lg: 'h-11 px-5 text-sm font-semibold gap-2.5 rounded-lg'
    }[size]

    const variantStyles = {
      primary:
        'bg-black text-white hover:bg-black/85 shadow-xs border border-transparent',
      secondary:
        'bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 hover:text-black hover:border-gray-300 shadow-xs',
      outline:
        'bg-transparent text-gray-700 border border-gray-300 hover:border-black hover:text-black hover:bg-gray-50/50',
      ghost:
        'bg-transparent text-gray-600 hover:text-black hover:bg-gray-100/80 border border-transparent',
      danger:
        'bg-rose-600 text-white hover:bg-rose-700 shadow-xs border border-transparent'
    }[variant]

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`.trim()}
        {...props}
      >
        {loading ? (
          <>
            <span
              className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"
              aria-hidden="true"
            />
            <span>{loadingText || children}</span>
          </>
        ) : (
          <>
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
          </>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
