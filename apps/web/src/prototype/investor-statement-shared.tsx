// PROTOTYPE — throwaway. The paper a statement is printed on: A4, farm letterhead, the legally required footer.
import { FARM } from "./investor-statement-data";

export const Sheet = ({
  title,
  titleEn,
  children,
}: {
  title: string;
  titleEn: string;
  children: React.ReactNode;
}) => (
  <div
    lang="bn"
    className="mx-auto my-6 min-h-[297mm] w-[210mm] bg-white px-[18mm] py-[16mm] text-[13px] leading-relaxed text-neutral-900 shadow-lg print:my-0 print:shadow-none"
  >
    <header className="border-b-2 border-neutral-900 pb-3">
      <h1 className="text-xl font-bold">{FARM.name}</h1>
      <p className="text-[11px] text-neutral-600">{FARM.address}</p>
      <p className="text-[11px] text-neutral-600">
        ফোন: {FARM.phone} · নিবন্ধন নং (DLS Registration): {FARM.registration}
      </p>
    </header>
    <div className="mt-4 flex items-baseline justify-between">
      <h2 className="text-lg font-bold">{title}</h2>
      <span className="text-[11px] tracking-wide text-neutral-500 uppercase">
        {titleEn}
      </span>
    </div>
    {children}
    <footer className="mt-8 border-t border-neutral-300 pt-3 text-[10px] leading-snug text-neutral-600">
      <p className="font-semibold text-neutral-800">
        এই বিনিয়োগে লাভ বা মূলধন ফেরতের কোনো নিশ্চয়তা দেওয়া হয়নি। লোকসান হলে তা মূলধন
        থেকেই যাবে।
      </p>
      <p>
        No return and no repayment of capital is promised or guaranteed. A loss
        is borne by the capital. Profit is a share of actual profit only.
        Mudarabah agreement between the Owner and the Investor.
      </p>
    </footer>
  </div>
);

export const Field = ({
  label,
  labelEn,
  value,
}: {
  label: string;
  labelEn?: string;
  value: React.ReactNode;
}) => (
  <div className="flex gap-2 py-[3px]">
    <span className="w-[62mm] shrink-0 text-neutral-600">
      {label}
      {labelEn ? (
        <span className="text-[10px] text-neutral-400"> {labelEn}</span>
      ) : null}
    </span>
    <span className="font-medium">{value}</span>
  </div>
);

export const Row = ({
  label,
  labelEn,
  value,
  bold,
  indent,
  rule,
}: {
  label: string;
  labelEn?: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
  rule?: boolean;
}) => (
  <div
    className={`flex items-baseline justify-between py-[3px] ${rule ? "border-t border-neutral-400 pt-1" : ""} ${
      bold ? "font-bold" : ""
    }`}
  >
    <span className={indent ? "pl-5 text-neutral-600" : ""}>
      {label}
      {labelEn ? (
        <span className="text-[10px] text-neutral-400"> {labelEn}</span>
      ) : null}
    </span>
    <span className="tabular-nums">{value}</span>
  </div>
);

export const Signatures = ({
  left,
  right,
}: {
  left: string;
  right: string;
}) => (
  <div className="mt-12 flex justify-between text-[11px]">
    <div className="w-[60mm] border-t border-neutral-500 pt-1 text-center">
      {left}
    </div>
    <div className="w-[60mm] border-t border-neutral-500 pt-1 text-center">
      {right}
    </div>
  </div>
);
