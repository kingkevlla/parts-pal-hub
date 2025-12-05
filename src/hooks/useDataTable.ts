import { useState, useMemo } from 'react';

interface UseDataTableOptions<T> {
  data: T[];
  searchFields?: (keyof T)[];
  defaultPageSize?: number;
}

export function useDataTable<T extends { id: string }>({
  data,
  searchFields = [],
  defaultPageSize = 100,
}: UseDataTableOptions<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    
    const term = searchTerm.toLowerCase();
    return data.filter(item => 
      searchFields.some(field => {
        const value = item[field];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(term);
      })
    );
  }, [data, searchTerm, searchFields]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === paginatedData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedData.map(item => item.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const isAllSelected = paginatedData.length > 0 && selectedIds.size === paginatedData.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < paginatedData.length;

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      clearSelection();
    }
  };

  const changePageSize = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    clearSelection();
  };

  return {
    searchTerm,
    setSearchTerm,
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    isAllSelected,
    isSomeSelected,
    currentPage,
    totalPages,
    pageSize,
    goToPage,
    changePageSize,
    filteredData,
    paginatedData,
    totalItems: filteredData.length,
  };
}
