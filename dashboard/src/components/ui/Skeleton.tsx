'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string;
  height?: string;
}

const Skeleton = ({
  className,
  variant = 'text',
  width,
  height,
}: SkeletonProps) => {
  const variants = {
    text: 'rounded-md',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  return (
    <div
      className={cn(
        'skeleton',
        variants[variant],
        className
      )}
      style={{ width, height }}
    />
  );
};

// Skeleton card layout
const SkeletonCard = () => (
  <div className="card space-y-4">
    <div className="flex items-start justify-between">
      <Skeleton variant="circular" className="w-10 h-10" />
      <Skeleton width="60px" height="20px" />
    </div>
    <div className="space-y-2">
      <Skeleton width="70%" height="24px" />
      <Skeleton width="50%" height="16px" />
    </div>
  </div>
);

// Skeleton table row
const SkeletonTableRow = ({ columns = 4 }: { columns?: number }) => (
  <tr>
    {Array.from({ length: columns }).map((_, i) => (
      <td key={i} className="py-4 px-4">
        <Skeleton width={i === 0 ? '120px' : '80%'} height="16px" />
      </td>
    ))}
  </tr>
);

// Skeleton stat card
const SkeletonStat = () => (
  <div className="card space-y-3">
    <Skeleton variant="circular" className="w-8 h-8" />
    <div className="space-y-1">
      <Skeleton width="60%" height="14px" />
      <Skeleton width="40%" height="32px" />
    </div>
  </div>
);

export { Skeleton, SkeletonCard, SkeletonTableRow, SkeletonStat };
export default Skeleton;
