// DropdownMenu: komponen dropdown dengan context state dan deteksi klik di luar.
import * as React from 'react';
import { cn } from '@/lib/utils';

type DropdownContextType = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const DropdownMenuContext = React.createContext<DropdownContextType>({
  open: false,
  setOpen: () => {},
});

export interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DropdownMenu({ children, open: controlledOpen, onOpenChange }: DropdownMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (action) => {
      const next = typeof action === 'function' ? action(open) : action;
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, open, onOpenChange]
  );

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen]);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div ref={containerRef} className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function DropdownMenuTrigger({ children, onClick, ...props }: DropdownMenuTriggerProps) {
  const { setOpen } = React.useContext(DropdownMenuContext);
  return (
    <button
      type="button"
      {...props}
      onClick={(e) => {
        onClick?.(e);
        setOpen((prev) => !prev);
      }}
    >
      {children}
    </button>
  );
}

export interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
}

export function DropdownMenuContent({
  className,
  align = 'end',
  style,
  ...props
}: DropdownMenuContentProps) {
  const { open } = React.useContext(DropdownMenuContext);
  if (!open) return null;

  return (
    <div
      role="menu"
      className={cn(
        'absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 justify-start mt-1',
        align === 'end' ? 'right-0 top-full' : 'left-0 top-full',
        className
      )}
      style={{ ...style, top: '100%' }}
      {...props}
    />
  );
}

export interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export const DropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, onClick, disabled, children, ...props }, ref) => {
    const { setOpen } = React.useContext(DropdownMenuContext);
    return (
      <div
        role="menuitem"
        tabIndex={-1}
        className={cn(
          'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          className
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          onClick?.();
          setOpen(false);
        }}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  }
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      role="separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      ref={ref}
      {...props}
    />
  )
);
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export const DropdownMenuLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn('px-2 py-1.5 text-xs font-semibold text-foreground', className)}
      ref={ref}
      {...props}
    />
  )
);
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

