import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export function AppShell({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cx(
        "workshop-page mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-8 md:px-8 md:py-10",
        className
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          {kicker ? <div className="workshop-kicker">{kicker}</div> : null}
          <h1 className="workshop-title mt-1 text-3xl font-semibold leading-tight md:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--muted-ink)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function SectionPanel({
  children,
  strong = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  strong?: boolean;
}) {
  return (
    <section
      className={cx(
        strong ? "workshop-panel-strong" : "workshop-panel",
        "workshop-reveal space-y-4 p-4",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function ActionButton({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      className={cx(
        variant === "primary" && "workshop-button",
        variant === "secondary" && "workshop-button-secondary",
        variant === "danger" &&
          "rounded-lg border border-rose-300 bg-rose-50 text-rose-700",
        "px-3 py-2 text-sm disabled:opacity-60",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusPill({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "workshop-pill inline-flex items-center px-2.5 py-1 text-xs",
        className
      )}
    >
      {children}
    </span>
  );
}
