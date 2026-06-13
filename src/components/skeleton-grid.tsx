export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="bg-white border border-gray-200 rounded-xl overflow-hidden min-h-[300px] flex flex-col"
        >
          {/* Image placeholder */}
          <div className="aspect-[3/2] bg-gray-100 animate-pulse relative overflow-hidden" />
          
          {/* Content placeholder */}
          <div className="p-8 flex flex-col flex-1">
            <div className="flex flex-col items-start mb-4">
              <div className="h-6 bg-gray-200 rounded animate-pulse w-2/3" />
              <div className="h-3 bg-gray-200 rounded animate-pulse w-1/3 mt-2" />
            </div>
            <div className="mt-auto pt-4">
              <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
