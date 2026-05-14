import { create } from 'zustand'

let _nextId = 1

const DURATIONS = {
  success: 3000,
  info: 5000,
  error: null, // manual dismiss only
}

const useToastStore = create((set) => ({
  toasts: [],

  _add: (type, message) => {
    const id = _nextId++
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }))

    const duration = DURATIONS[type]
    if (duration) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, duration)
    }

    return id
  },

  success: (message) => useToastStore.getState()._add('success', message),
  error: (message) => useToastStore.getState()._add('error', message),
  info: (message) => useToastStore.getState()._add('info', message),

  dismiss: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
}))

export default useToastStore
