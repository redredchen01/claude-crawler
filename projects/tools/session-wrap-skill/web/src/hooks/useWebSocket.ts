import { useEffect, useRef, useCallback } from 'react'

export interface WsMessage {
  type: 'TaskCreated' | 'TaskUpdated' | 'TaskDeleted' | 'DecisionLogged' | 'CommentAdded' | 'ActivityEvent' | 'SyncStatus'
  data: any
  timestamp: string
  agent: string
}

interface UseWebSocketOptions {
  url: string
  onMessage: (message: WsMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
  fallbackPoll?: () => Promise<void>
  pollInterval?: number
}

export const useWebSocket = ({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  fallbackPoll,
  pollInterval = 5000,
}: UseWebSocketOptions) => {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 10

  const connect = useCallback(() => {
    // Prevent multiple concurrent connections
    if (wsRef.current?.readyState === WebSocket.CONNECTING || wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const wsUrl = url.replace('http://', 'ws://').replace('https://', 'wss://')
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        console.log('✓ WebSocket connected')
        reconnectAttemptsRef.current = 0

        // Clear polling when WS connects
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }

        onConnect?.()
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data)
          onMessage(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      wsRef.current.onerror = (event) => {
        console.error('WebSocket error:', event)
        const error = new Error('WebSocket connection failed')
        onError?.(error)
      }

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected')
        onDisconnect?.()
        wsRef.current = null

        // Attempt reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          console.log(`Reconnecting in ${backoffMs}ms (attempt ${reconnectAttemptsRef.current + 1})`)

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++
            connect()
          }, backoffMs)

          // Fallback to polling if WS unavailable
          if (!pollIntervalRef.current && fallbackPoll) {
            pollIntervalRef.current = setInterval(fallbackPoll, pollInterval)
          }
        } else {
          console.error('Max reconnect attempts reached. Polling only.')
          if (!pollIntervalRef.current && fallbackPoll) {
            pollIntervalRef.current = setInterval(fallbackPoll, pollInterval)
          }
        }
      }
    } catch (error) {
      console.error('Failed to establish WebSocket:', error)
      const err = error instanceof Error ? error : new Error(String(error))
      onError?.(err)

      // Fallback to polling
      if (!pollIntervalRef.current && fallbackPoll) {
        console.log(`WebSocket failed, falling back to polling every ${pollInterval}ms`)
        pollIntervalRef.current = setInterval(fallbackPoll, pollInterval)
      }
    }
  }, [url, onMessage, onConnect, onDisconnect, onError, fallbackPoll, pollInterval])

  const send = useCallback((message: Partial<WsMessage>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, message not sent:', message)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
  }, [])

  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    send,
    disconnect,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  }
}
