export function TableSkeleton({ columns = 4, rows = 5 }: { columns?: number, rows?: number }) {
  return (
    <div className="w-full">
      <div className="border-b border-gray-200 bg-gray-50/50 flex">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={`th-${i}`} className="flex-1 py-4 px-6">
            <div className={`skeleton h-4 rounded w-20 ${i > 0 ? 'ml-auto' : ''}`} />
          </div>
        ))}
      </div>
      <div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`tr-${rowIndex}`} className="flex border-b border-gray-100 last:border-0">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div key={`td-${rowIndex}-${colIndex}`} className="flex-1 py-4 px-6">
                <div className={`skeleton h-5 rounded ${colIndex === 0 ? 'w-24' : 'w-12 ml-auto'}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="glass-card p-6 mb-8">
      <div className="skeleton h-4 w-32 rounded mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <div className="skeleton h-4 w-16 rounded" />
              <div className="skeleton h-6 w-12 rounded" />
            </div>
            <div className="skeleton h-5 w-24 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
