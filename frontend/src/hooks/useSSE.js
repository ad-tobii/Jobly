import { useState, useEffect, useRef } from 'react'

const TOKEN_KEY = 'jobly_token'
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/**
 * useSSE — subscribes to a server-sent event stream.
 *
 * @param {string} url           - Full path e.g. '/cv/abc123/status-stream'
 * @param {string[]} terminalStates - SSE stops when data.status is one of these
 * @returns {{ status, data, error, isConnected }}
 */
export function useSSE(url, terminalStates = []) {
  const [status, setStatus] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const esRef = useRef(null)

  useEffect(() => {
    if (!url) return

    const token = localStorage.getItem(TOKEN_KEY)
    const streamUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`
    const separator = url.includes('?') ? '&' : '?'
    const fullUrl = token ? `${streamUrl}${separator}token=${encodeURIComponent(token)}` : streamUrl

    const es = new EventSource(fullUrl)
    esRef.current = es
    setIsConnected(true)
    setError(null)

    es.onmessage = (event) => {
      let parsed
      try {
        parsed = JSON.parse(event.data)
      } catch {
        setError('Failed to parse SSE message')
        return
      }

      setData(parsed)
      if (parsed?.status) setStatus(parsed.status)

      // Close when we hit a terminal state
      if (terminalStates.includes(parsed?.status)) {
        es.close()
        esRef.current = null
        setIsConnected(false)
      }
    }

    es.onerror = () => {
      setError('SSE connection error')
      setIsConnected(false)
      es.close()
      esRef.current = null
    }

    return () => {
      es.close()
      esRef.current = null
      setIsConnected(false)
    }
  }, [url])

  return { status, data, error, isConnected }
}

export default useSSE
