import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  isLoading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  ghost: 'border border-border-default bg-transparent text-secondary hover:bg-overlay hover:text-primary',
  subtle: 'bg-overlay text-primary hover:bg-border-default',
  danger: 'bg-error text-white hover:brightness-90',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-10 px-4 text-[13px]',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading = false, disabled, className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium ' +
        'transition-colors duration-[120ms] outline-none ' +
        'focus-visible:ring-2 focus-visible:ring-accent-muted focus-visible:ring-offset-1 focus-visible:ring-offset-app ' +
        'disabled:cursor-not-allowed disabled:opacity-40 ' +
        `${VARIANTS[variant]} ${SIZES[size]} ${className}`
      }
      {...props}
    >
      {isLoading && <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" />}
      {children}
    </button>
  )
})

export default Button
