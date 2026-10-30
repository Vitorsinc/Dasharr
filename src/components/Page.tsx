import type { ReactNode } from "react";

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 pb-8 pt-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl leading-none">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
