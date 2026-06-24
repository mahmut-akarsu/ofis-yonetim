import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  ManagedPc,
  RemoteOperationResult,
  PcConnectionStatus,
} from '@/types/pc'

interface PcState {
  pcs: ManagedPc[]
  selectedIds: Set<string>
  connectionStatus: Record<string, PcConnectionStatus>
  results: RemoteOperationResult[]
  isRunning: boolean
  activeTab: 'quick' | 'custom' | 'file'

  setPcs: (pcs: ManagedPc[]) => void
  addPc: (pc: ManagedPc) => void
  removePc: (id: string) => void
  updatePc: (pc: ManagedPc) => void
  toggleSelection: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  setConnectionStatus: (statuses: PcConnectionStatus[]) => void
  setResults: (results: RemoteOperationResult[]) => void
  setIsRunning: (running: boolean) => void
  setActiveTab: (tab: 'quick' | 'custom' | 'file') => void
  getSelectedPcs: () => ManagedPc[]
}

export const usePcStore = create<PcState>()(
  devtools(
    (set, get) => ({
      pcs: [],
      selectedIds: new Set(),
      connectionStatus: {},
      results: [],
      isRunning: false,
      activeTab: 'quick',

      setPcs: pcs =>
        set({ pcs, selectedIds: new Set(pcs.map(p => p.id)) }, undefined, 'setPcs'),

      addPc: pc =>
        set(
          state => ({
            pcs: [...state.pcs, pc],
            selectedIds: new Set([...state.selectedIds, pc.id]),
          }),
          undefined,
          'addPc'
        ),

      removePc: id =>
        set(
          state => {
            const selectedIds = new Set(state.selectedIds)
            selectedIds.delete(id)
            return {
              pcs: state.pcs.filter(p => p.id !== id),
              selectedIds,
            }
          },
          undefined,
          'removePc'
        ),

      updatePc: pc =>
        set(
          state => ({
            pcs: state.pcs.map(p => (p.id === pc.id ? pc : p)),
          }),
          undefined,
          'updatePc'
        ),

      toggleSelection: id =>
        set(
          state => {
            const selectedIds = new Set(state.selectedIds)
            if (selectedIds.has(id)) {
              selectedIds.delete(id)
            } else {
              selectedIds.add(id)
            }
            return { selectedIds }
          },
          undefined,
          'toggleSelection'
        ),

      selectAll: () =>
        set(
          state => ({ selectedIds: new Set(state.pcs.map(p => p.id)) }),
          undefined,
          'selectAll'
        ),

      clearSelection: () =>
        set({ selectedIds: new Set() }, undefined, 'clearSelection'),

      setConnectionStatus: statuses =>
        set(
          {
            connectionStatus: Object.fromEntries(
              statuses.map(s => [s.pc_id, s])
            ),
          },
          undefined,
          'setConnectionStatus'
        ),

      setResults: results => set({ results }, undefined, 'setResults'),

      setIsRunning: isRunning => set({ isRunning }, undefined, 'setIsRunning'),

      setActiveTab: activeTab => set({ activeTab }, undefined, 'setActiveTab'),

      getSelectedPcs: () => {
        const { pcs, selectedIds } = get()
        return pcs.filter(p => selectedIds.has(p.id))
      },
    }),
    { name: 'pc-store' }
  )
)
