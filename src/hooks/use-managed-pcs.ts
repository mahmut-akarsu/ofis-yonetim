import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { pcApi } from '@/lib/pc-api'
import { usePcStore } from '@/store/pc-store'
import type { ManagedPc } from '@/types/pc'

export function useManagedPcs() {
  const queryClient = useQueryClient()
  const setPcs = usePcStore(state => state.setPcs)

  const query = useQuery({
    queryKey: ['managed-pcs'],
    queryFn: async () => {
      const result = await pcApi.loadManagedPcs()
      if (result.status === 'error') throw new Error(result.error)
      return result.data
    },
  })

  useEffect(() => {
    if (query.data) {
      setPcs(query.data)
    }
  }, [query.data, setPcs])

  const saveMutation = useMutation({
    mutationFn: async (pcs: ManagedPc[]) => {
      const result = await pcApi.saveManagedPcs(pcs)
      if (result.status === 'error') throw new Error(result.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-pcs'] })
    },
    onError: (error: Error) => {
      toast.error(`Kayıt hatası: ${error.message}`)
    },
  })

  return { ...query, savePcs: saveMutation.mutateAsync }
}
