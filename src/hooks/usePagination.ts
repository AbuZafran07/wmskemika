import { useState, useMemo } from 'react';

interface UsePaginationOptions {
  defaultPageSize?: number;
}

interface UsePaginationReturn<T> {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  paginatedData: T[];
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
}

export function usePagination<T>(
  data: T[],
  options: UsePaginationOptions = {}
): UsePaginationReturn<T> {
  const { defaultPageSize = 10 } = options;

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalPages = useMemo(() => Math.ceil(data.length / pageSize), [data.length, pageSize]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage, pageSize]);

  const handleSetCurrentPage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages || 1));
    setCurrentPage(validPage);
  };

  const handleSetPageSize = (size: number) => {
    setPageSize(size);
    // Reset to first page when page size changes
    setCurrentPage(1);
  };

  const goToFirstPage = () => handleSetCurrentPage(1);
  const goToLastPage = () => handleSetCurrentPage(totalPages);
  const goToNextPage = () => handleSetCurrentPage(currentPage + 1);
  const goToPreviousPage = () => handleSetCurrentPage(currentPage - 1);

  // Reset to page 1 when data changes significantly
  useMemo(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  return {
    currentPage,
    pageSize,
    totalPages,
    paginatedData,
    setCurrentPage: handleSetCurrentPage,
    setPageSize: handleSetPageSize,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
  };
}
