import { useState, useRef, useCallback } from 'react'
import { CatalogItem } from '@/lib/types'
import { getCatalogPage } from '@/lib/services/catalog.service'

interface UseCatalogProps {
  initialItems: CatalogItem[]
  initialNextCursor: string | null
  initialHasNext: boolean
}

export function useCatalog({ initialItems, initialNextCursor, initialHasNext }: UseCatalogProps) {
  const [activeFilter, setActiveFilter] = useState('All')
  const [sortBy, setSortBy] = useState('default')
  
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  
  const [items, setItems] = useState<CatalogItem[]>(initialItems)
  const [isLoading, setIsLoading] = useState(false)
  const [pageCursors, setPageCursors] = useState<string[]>(['', initialNextCursor || '']) 
  const [currentPage, setCurrentPage] = useState(0)
  const [hasNext, setHasNext] = useState(initialHasNext)

  const fetchPage = async (pageIndex: number, filters: {category: string, sortBy: string, searchQuery: string}, currentCursors: string[]) => {
    setIsLoading(true)
    try {
      const cursor = pageIndex === 0 ? null : currentCursors[pageIndex];
      const result = await getCatalogPage(6, filters, cursor)
      setItems(result.items)
      setHasNext(result.hasNext)
      
      if (result.hasNext && result.lastCursor) {
        setPageCursors(prev => {
          const newCursors = [...prev];
          newCursors[pageIndex + 1] = result.lastCursor!;
          return newCursors;
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchExecute = useCallback((query: string, currentCat: string, currentSort: string) => {
    if (query === activeSearch) return;
    setActiveSearch(query);
    setCurrentPage(0);
    setPageCursors(['']);
    fetchPage(0, { category: currentCat, sortBy: currentSort, searchQuery: query }, ['']);
  }, [activeSearch]);

  const debouncedSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    
    if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
    debouncedSearchRef.current = setTimeout(() => {
      handleSearchExecute(val, activeFilter, sortBy);
    }, 400);
  }

  const handleCategoryChange = (category: string) => {
    if (category === activeFilter) return;
    setActiveFilter(category)
    setCurrentPage(0)
    setPageCursors([''])
    fetchPage(0, { category, sortBy, searchQuery: activeSearch }, [''])
  }

  const handleSortChange = (newSortBy: string) => {
    if (newSortBy === sortBy) return;
    setSortBy(newSortBy)
    setCurrentPage(0)
    setPageCursors([''])
    fetchPage(0, { category: activeFilter, sortBy: newSortBy, searchQuery: activeSearch }, [''])
  }

  const handleNextPage = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage)
    fetchPage(nextPage, { category: activeFilter, sortBy, searchQuery: activeSearch }, pageCursors)
  }

  const handlePrevPage = () => {
    const prevPage = currentPage - 1;
    setCurrentPage(prevPage)
    fetchPage(prevPage, { category: activeFilter, sortBy, searchQuery: activeSearch }, pageCursors)
  }

  return {
    items,
    isLoading,
    activeFilter,
    sortBy,
    searchInput,
    activeSearch,
    currentPage,
    hasNext,
    onSearchInputChange,
    handleCategoryChange,
    handleSortChange,
    handleNextPage,
    handlePrevPage
  }
}
