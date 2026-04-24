import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Settings, 
  Globe, 
  Layers, 
  Users, 
  Zap, 
  Terminal,
  Image as ImageIcon,
  ExternalLink,
  ChevronRight
} from 'lucide-react'

const API_BASE = 'http://localhost:8000'

function App() {
  const [config, setConfig] = useState({
    url: 'https://www.techcrunch.com/',
    max_pages: 50,
    max_depth: 3,
    workers: 5,
    force_playwright: false,
    req_per_sec: 2.0
  })

  const [activeJobId, setActiveJobId] = useState(null)
  const [status, setStatus] = useState(null)
  const [logs, setLogs] = useState([])
  const [resources, setResources] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [scans, setScans] = useState([])

  const logsEndRef = useRef(null)

  useEffect(() => {
    fetchScans()
  }, [])

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const fetchScans = async () => {
    try {
      const res = await fetch(`${API_BASE}/scans`)
      const data = await res.json()
      setScans(data)
    } catch (e) {
      console.error('Failed to fetch scans', e)
    }
  }

  const startScan = async () => {
    setIsScanning(true)
    setLogs([])
    setResources([])
    try {
      const res = await fetch(`${API_BASE}/scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      const { job_id } = await res.json()
      setActiveJobId(job_id)
      connectStream(job_id)
    } catch (e) {
      console.error('Failed to start scan', e)
      setIsScanning(false)
    }
  }

  const connectStream = (jobId) => {
    const eventSource = new EventSource(`${API_BASE}/scans/${jobId}/stream`)
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setStatus(data)
      
      if (data.logs) {
        setLogs(data.logs)
      }
      
      if (data.status === 'completed' || data.status === 'failed') {
        eventSource.close()
        setIsScanning(false)
        fetchScans()
        fetchResources(jobId)
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      setIsScanning(false)
    }
  }

  const fetchResources = async (jobId) => {
    try {
      const res = await fetch(`${API_BASE}/scans/${jobId}/resources`)
      const data = await res.json()
      setResources(data)
    } catch (e) {
      console.error('Failed to fetch resources', e)
    }
  }

  const progress = status ? (status.pages_done / status.pages_total) * 100 : 0
  const circumference = 2 * Math.PI * 110

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar glass-panel">
        <div className="brand">
          <h1 className="gradient-text">Claude Crawler</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phase 2 / Production Ready</p>
        </div>

        <div className="scan-config">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} /> Configuration
          </h3>
          
          <div className="input-group">
            <label><Globe size={14} /> Entry URL</label>
            <input 
              type="text" 
              value={config.url} 
              onChange={(e) => setConfig({...config, url: e.target.value})}
              disabled={isScanning}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="input-group">
              <label><Layers size={14} /> Max Pages</label>
              <input 
                type="number" 
                value={config.max_pages} 
                onChange={(e) => setConfig({...config, max_pages: parseInt(e.target.value)})}
                disabled={isScanning}
              />
            </div>
            <div className="input-group">
              <label><ChevronRight size={14} /> Max Depth</label>
              <input 
                type="number" 
                value={config.max_depth} 
                onChange={(e) => setConfig({...config, max_depth: parseInt(e.target.value)})}
                disabled={isScanning}
              />
            </div>
          </div>

          <div className="input-group" style={{ marginTop: '1rem' }}>
            <label><Users size={14} /> Parallel Workers</label>
            <input 
              type="range" min="1" max="20"
              value={config.workers} 
              onChange={(e) => setConfig({...config, workers: parseInt(e.target.value)})}
              disabled={isScanning}
            />
            <div style={{ textAlign: 'right', fontSize: '0.75rem' }}>{config.workers} threads</div>
          </div>

          <div className="input-group" style={{ marginTop: '1rem', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input 
              type="checkbox" 
              checked={config.force_playwright}
              onChange={(e) => setConfig({...config, force_playwright: e.target.checked})}
              disabled={isScanning}
            />
            <label style={{ cursor: 'pointer' }}>Force JS Rendering</label>
          </div>

          <button 
            style={{ marginTop: '2rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            onClick={startScan}
            disabled={isScanning}
          >
            {isScanning ? <RotateCcw className="animate-spin" size={18} /> : <Play size={18} />}
            {isScanning ? 'Scanning...' : 'Launch Scan'}
          </button>
        </div>

        <div className="recent-scans" style={{ marginTop: 'auto' }}>
          <label>Recent Scans</label>
          <div style={{ marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
            {scans.map(s => (
              <div 
                key={s.id} 
                className="recent-scan-item"
                onClick={() => fetchResources(s.id)}
                style={{ cursor: 'pointer', padding: '0.5rem', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}
              >
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.entry_url}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{s.status} • {s.resources_found} found</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <section className="dashboard-view">
          <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
            <h2 className="gradient-text">Live Progress</h2>
            
            <div className="progress-circle-container" style={{ marginTop: '2rem' }}>
              <svg width="240" height="240">
                <circle className="progress-circle-bg" cx="120" cy="120" r="110" />
                <circle 
                  className="progress-circle-val" 
                  cx="120" cy="120" r="110" 
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (progress / 100) * circumference}
                />
              </svg>
              <div className="progress-text">
                <div style={{ fontSize: '2.5rem', fontWeight: 800 }}>{Math.round(progress)}%</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  {status ? `${status.pages_done} / ${status.pages_total}` : '0 / 0'} pages
                </div>
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '3rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Discovered</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>{status?.resources_found || resources.length}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Status</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, textTransform: 'capitalize' }}>{status?.status || 'Idle'}</div>
              </div>
            </div>
          </div>

          <div className="resource-grid">
            <AnimatePresence>
              {resources.map((res, idx) => (
                <motion.div 
                  key={res.id || idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="resource-card glass-panel"
                >
                  {res.cover_url ? (
                    <img src={res.cover_url} className="resource-image" alt={res.title} />
                  ) : (
                    <div className="resource-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ImageIcon size={48} color="var(--text-muted)" />
                    </div>
                  )}
                  <div className="resource-info">
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>{res.title || 'Untitled'}</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                      {res.tags?.map(t => (
                        <span key={t} className="tag-badge">{t}</span>
                      ))}
                    </div>
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {res.views?.toLocaleString()} views
                      </div>
                      <a href={res.url} target="_blank" rel="noreferrer" className="text-primary">
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>

        {/* Activity Log Panel */}
        <section className="activity-panel">
          <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Terminal size={16} /> Activity Log
            </div>
            <div className="activity-log">
              {logs.map((log, i) => (
                <div key={i} className="log-entry">
                  <span className="log-msg">{log}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </section>
      </main>


    </div>
  )
}

export default App
