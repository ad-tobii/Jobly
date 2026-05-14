import { create } from 'zustand'

const useDialogStore = create((set) => ({
  dialog: null,

  // ── confirm ───────────────────────────────────────────────────────────────────
  // Usage: confirm({ title, body, onConfirm, destructive? })
  confirm: ({ title, body, onConfirm, destructive = false }) => {
    set({ dialog: { title, body, onConfirm, destructive } })
  },

  // ── close ─────────────────────────────────────────────────────────────────────
  close: () => {
    set({ dialog: null })
  },
}))

export default useDialogStore
