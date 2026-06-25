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
  remoteDirsByPcId: Record<string, string>
  connectionStatus: Record<string, PcConnectionStatus>
  results: RemoteOperationResult[]
  isRunning: boolean
  activeTab: 'quick' | 'custom' | 'file' | 'terminal'

  setPcs: (pcs: ManagedPc[]) => void
  addPc: (pc: ManagedPc) => void
  removePc: (id: string) => void
  updatePc: (pc: ManagedPc) => void
  toggleSelection: (id: string) => void
  selectOnly: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  setRemoteDirForPc: (pcId: string, dir: string) => void
  getRemoteDirForPc: (pcId: string) => string
  setConnectionStatus: (statuses: PcConnectionStatus[]) => void
  setResults: (results: RemoteOperationResult[]) => void
  setIsRunning: (running: boolean) => void
  setActiveTab: (tab: 'quick' | 'custom' | 'file' | 'terminal') => void
  getSelectedPcs: () => ManagedPc[]
}

export const usePcStore = create<PcState>()(
  devtools(
    (set, get) => ({
      pcs: [],
      selectedIds: new Set(),
      remoteDirsByPcId: {},
      connectionStatus: {},
      results: [],
      isRunning: false,
      activeTab: 'quick',

      setPcs: pcs =>
        set(
          state => {
            const validIds = new Set(pcs.map(p => p.id))
            const selectedIds = new Set(
              [...state.selectedIds].filter(id => validIds.has(id))
            )
            const remoteDirsByPcId = Object.fromEntries(
              Object.entries(state.remoteDirsByPcId).filter(([id]) =>
                validIds.has(id)
              )
            )
            return { pcs, selectedIds, remoteDirsByPcId }
          },
          undefined,
          'setPcs'
        ),

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
            const { [id]: _, ...remoteDirsByPcId } = state.remoteDirsByPcId
            return {
              pcs: state.pcs.filter(p => p.id !== id),
              selectedIds,
              remoteDirsByPcId,
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

      selectOnly: id =>
        set({ selectedIds: new Set([id]) }, undefined, 'selectOnly'),

      selectAll: () =>
        set(
          state => ({ selectedIds: new Set(state.pcs.map(p => p.id)) }),
          undefined,
          'selectAll'
        ),

      clearSelection: () =>
        set({ selectedIds: new Set() }, undefined, 'clearSelection'),

      setRemoteDirForPc: (pcId, dir) =>
        set(
          state => ({
            remoteDirsByPcId: { ...state.remoteDirsByPcId, [pcId]: dir },
          }),
          undefined,
          'setRemoteDirForPc'
        ),

      getRemoteDirForPc: pcId => get().remoteDirsByPcId[pcId] ?? '',

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
