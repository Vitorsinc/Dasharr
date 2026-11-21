import type { ReactNode } from "react";

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 pb-6 pt-5 md:gap-6 md:px-8 md:pb-8 md:pt-7">
      <header className="flex flex-wrap items-center justify-between gap-3 md:gap-4">
        <h1 className="text-2xl leading-none md:text-3xl">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
