import { useState, useCallback } from 'react'

interface UseApiOptions {
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
}

interface UseApiReturn<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
  execute: (...args: any[]) => Promise<T>
  reset: () => void
}

export const useApi = <T,>(
  apiFunction: (...args: any[]) => Promise<any>,
  options?: UseApiOptions
): UseApiReturn<T> => {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(
    async (...args: any[]): Promise<T> => {
      try {
        setIsLoading(true)
        setError(null)

        const response = await apiFunction(...args)
        const result = response.data

        setData(result)
        options?.onSuccess?.(result)

        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        options?.onError?.(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [apiFunction, options]
  )

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return {
    data,
    isLoading,
    error,
    execute,
    reset
  }
}
