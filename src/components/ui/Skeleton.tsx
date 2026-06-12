interface SkeletonProps {
  className?: string;
  height?: number | string;
  width?: number | string;
}

export function Skeleton({ className = "", height, width }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width }}
      aria-hidden="true"
      role="presentation"
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <Skeleton height={24} width="60%" />
      <Skeleton height={16} width="90%" />
      <Skeleton height={16} width="75%" />
      <div className="flex gap-2 mt-2">
        <Skeleton height={24} width={60} />
        <Skeleton height={24} width={80} />
      </div>
    </div>
  );
}

export function DayPlanSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card p-4 flex gap-4">
          <div className="space-y-2 w-24 shrink-0">
            <Skeleton height={20} width={80} />
            <Skeleton height={16} width={60} />
          </div>
          <div className="flex-1 space-y-2">
            <Skeleton height={20} width="70%" />
            <Skeleton height={16} width="85%" />
          </div>
        </div>
      ))}
    </div>
  );
}
