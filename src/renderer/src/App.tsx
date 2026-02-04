/**
 * ルートアプリケーションコンポーネント
 */

import { useState } from 'react'
import type { OCROptions } from '@shared/types'
import { ConfigPanel } from './components/ConfigPanel'
import { FileDropzone } from './components/FileDropzone'
import { ProgressLog } from './components/ProgressLog'
import { ResultActions } from './components/ResultActions'
import { useOCRProcess } from './hooks/useOCRProcess'
import './App.css'

export function App() {
  const [showConfig, setShowConfig] = useState(false)
  const { status, progress, error, result, startOCR, reset } = useOCRProcess()

  const handleFileSelect = async (file: File, options: OCROptions) => {
    await startOCR(file, options)
  }

  const handleReset = () => {
    reset()
  }

  const isProcessing = ['uploading', 'processing', 'downloading', 'parsing'].includes(status)
  const isComplete = status === 'complete'
  const hasError = status === 'error'

  return (
    <div className="app">
      <header className="app-header">
        <h1>📄 Cloud Vision OCR</h1>
        <button onClick={() => setShowConfig(!showConfig)} className="btn-icon">
          ⚙️
        </button>
      </header>

      <main className="app-main">
        {showConfig && (
          <div className="config-section">
            <ConfigPanel />
          </div>
        )}

        <div className="content-section">
          {!isProcessing && !isComplete && !hasError && (
            <div className="upload-section">
              <FileDropzone onFileSelect={handleFileSelect} disabled={isProcessing} />
            </div>
          )}

          {(isProcessing || isComplete || hasError) && (
            <>
              <div className="progress-section">
                <ProgressLog status={status} progress={progress} />
              </div>

              {(isComplete || hasError) && (
                <div className="result-section">
                  <ResultActions result={result} error={error} onReset={handleReset} />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Powered by Google Cloud Vision API | Built with Electron + React + Vite
        </p>
      </footer>
    </div>
  )
}
