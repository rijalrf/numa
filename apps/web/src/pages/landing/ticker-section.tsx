const ITEMS = [
  'INTERVIEW', 'BRD', 'TECH STACK', 'ARCHITECTURE',
  'TASK BOARD', 'CLI AGENT', 'CHECKPOINT', 'DEPLOY',
];

export function TickerSection() {
  const allItems = [...ITEMS, ...ITEMS];

  return (
    <div className="border-y border-white/[.04] py-4 overflow-hidden select-none">
      <div className="animate-ticker flex items-center gap-8 whitespace-nowrap w-max">
        {allItems.map((label, i) => (
          <span key={i}>
            <span className="text-sm font-medium text-numa-primary/60">{label}</span>
            <span className="text-numa-primary/20 ml-8">--</span>
          </span>
        ))}
      </div>
    </div>
  );
}
