import { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function PageWrapper({ title, subtitle, action, children }: Props) {
  return (
    <div className="flex-1 p-6 overflow-auto bg-ink min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-gold text-2xl">{title}</h1>
            {subtitle && <p className="text-parchment/60 font-body mt-1 text-sm">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
