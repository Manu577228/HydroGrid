import * as Dialog from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { clsx, type ClassValue } from 'clsx'
import { CircleAlert, LoaderCircle, X } from 'lucide-react'
import { type ComponentPropsWithRef, type PropsWithChildren, type ReactNode, type RefObject, useRef } from 'react'
import { twMerge } from 'tailwind-merge'
import type { Hazard, IncidentStatus, Severity } from '../types'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

const buttonVariants = cva('button', {
  variants: {
    variant: { default: 'button-primary', secondary: 'button-secondary', outline: 'button-outline', ghost: 'button-ghost', danger: 'button-danger' },
    size: { default: 'button-normal', sm: 'button-sm', lg: 'button-lg', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export function Button({ className, variant, size, type = 'button', ref, ...props }: ComponentPropsWithRef<'button'> & VariantProps<typeof buttonVariants>) {
  return <button type={type} ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export function Modal({ open, onOpenChange, title, description, initialFocus, children }: PropsWithChildren<{
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  initialFocus?: RefObject<HTMLElement | null>
}>) {
  const returnFocus = useRef<HTMLElement>(null)
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-overlay" />
      <Dialog.Content className="modal-content" onOpenAutoFocus={(event) => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        if (initialFocus?.current) { event.preventDefault(); initialFocus.current.focus() }
      }} onCloseAutoFocus={(event) => {
        event.preventDefault()
        const target = returnFocus.current?.isConnected ? returnFocus.current : document.getElementById('main')
        target?.focus()
      }}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{description}</Dialog.Description>
        <Dialog.Close asChild><button className="modal-close" aria-label="Close dialog"><X size={18} /></button></Dialog.Close>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

export const hazardLabels: Record<Hazard, string> = {
  FLOOD: 'Flood', MEDICAL: 'Medical', LANDSLIDE: 'Landslide', INFRASTRUCTURE: 'Infrastructure', OTHER: 'Other',
}
export const statusLabels: Record<IncidentStatus, string> = {
  REPORTED: 'Reported', ASSIGNED: 'Assigned', EN_ROUTE: 'En route', ON_SCENE: 'On scene', RESOLVED: 'Resolved',
}
export const severityColors: Record<Severity, string> = { LOW: '#7ee6c2', MEDIUM: '#ffde84', HIGH: '#ffa06d', CRITICAL: '#ff83ad' }
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cn('tag', 'tag-' + severity.toLowerCase())}><span className="tag-dot" />{severity.toLowerCase()}</span>
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={cn('tag', status === 'RESOLVED' ? 'tag-green' : 'tag-neutral')}>{statusLabels[status]}</span>
}

export function PageTitle({ title, description, actions, icon }: { title: string; description: string; actions?: ReactNode; icon?: ReactNode }) {
  return <header className="page-title">
    <div><div className="page-heading">{icon && <span className="page-heading-icon" aria-hidden="true">{icon}</span>}<h1>{title}</h1></div><p>{description}</p></div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
}

export function PanelTitle({ icon, title, detail, actions }: { icon?: ReactNode; title: string; detail?: string; actions?: ReactNode }) {
  return <header className="panel-title">
    <div className="panel-title-label">{icon && <span className="panel-title-icon">{icon}</span>}<div><h2>{title}</h2>{detail && <span>{detail}</span>}</div></div>
    {actions}
  </header>
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null
  return <div className="notice notice-error" role="alert"><CircleAlert size={17} /><span>{error instanceof Error ? error.message : String(error)}</span></div>
}

export function Loading({ label = 'Loading HydroGrid' }: { label?: string }) {
  return <div className="empty-state platform-loading" role="status">
    <span><LoaderCircle className="animate-spin" size={17} aria-hidden="true" />{label}</span>
    <div className="platform-skeleton" aria-hidden="true"><i /><i /></div>
  </div>
}

export function Empty({ children }: PropsWithChildren) {
  return <div className="empty-state">{children}</div>
}

export function timestamp(date: string | number) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }).format(new Date(date))
}

export function equipmentLabel(equipment: string | string[]) {
  return (Array.isArray(equipment) ? equipment.join(', ') : equipment).replaceAll('_', ' ').toLowerCase()
}
