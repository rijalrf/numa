const ITEMS = [
  'INTERVIEW', 'PRD', 'TECH STACK', 'ARCHITECTURE',
  'TASK BOARD', 'CLI AGENT', 'CHECKPOINT', 'DEPLOY',
];

export function TickerSection() {
  const allItems = [...ITEMS, ...ITEMS];

  return (
    <div className="border-y border-border/70 py-4 overflow-hidden select-none dark:border-white/[.04]">
      <div className="animate-ticker flex items-center gap-8 whitespace-nowrap w-max">
        {allItems.map((label, i) => (
          <span key={i}>
            <span className="text-sm font-medium text-numa-primary/70 dark:text-numa-primary/60">{label}</span>
            <span className="text-numa-primary/30 ml-8 dark:text-numa-primary/20">--</span>
          </span>
        ))}
      </div>
    </div>
  );
}
