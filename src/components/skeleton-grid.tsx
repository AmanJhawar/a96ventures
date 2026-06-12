export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="bg-white border border-gray-200 rounded-xl overflow-hidden min-h-[300px] flex flex-col"
        >
          {/* Image placeholder */}
          <div className="aspect-[3/2] bg-gray-100 animate-pulse" />
          
          {/* Content placeholder */}
          <div className="p-8 flex flex-col gap-4 flex-1">
            <div className="h-6 bg-gray-100 rounded animate-pulse w-3/4" />
            <div className="space-y-2 mt-2">
              <div className="h-4 bg-gray-100 rounded animate-pulse w-full" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-5/6" />
            </div>
            <div className="mt-auto pt-4 flex gap-2">
              <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
