import React, { useState } from 'react';
import './App.css';

function App() {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Connects directly to the Python FastAPI backend port 8000
      const response = await fetch('http://localhost:8000/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: inputText }),
      });

      if (!response.ok) {
        throw new Error('Failed to get a valid response from the AI model server.');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err.message || 'Something went wrong while executing prediction.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>DistilBERT Sentiment Analyzer</h1>
        <p>Type text below to classify sentiment output via your model pipeline.</p>
      </header>

      <main className="main-content">
        <form onSubmit={handleAnalyze} className="input-form">
          <textarea
            rows="5"
            className="text-input"
            placeholder="Enter the phrase or paragraph you want to evaluate..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Processing Model...' : 'Analyze Sentiment'}
          </button>
        </form>

        {error && <div className="error-message">Error: {error}</div>}

        {result && (
          <div className="result-card">
            <h3>Prediction Output</h3>
            <div className="label-badge-container">
              <span>Status Label: </span>
              <span className={`badge ${result.label.toLowerCase()}`}>
                {result.label}
              </span>
            </div>
            <p><strong>Confidence Score:</strong> {(result.confidence * 100).toFixed(2)}%</p>
            
            <div className="probability-section">
              <h4>Class Breakdown Distributions:</h4>
              <div className="bar-wrapper">
                <span className="bar-label">Positive: {(result.probabilities.POSITIVE * 100).toFixed(0)}%</span>
                <div className="bar-bg">
                  <div className="bar-fill positive-bar" style={{ width: `${result.probabilities.POSITIVE * 100}%` }}></div>
                </div>
              </div>
              <div className="bar-wrapper">
                <span className="bar-label">Negative: {(result.probabilities.NEGATIVE * 100).toFixed(0)}%</span>
                <div className="bar-bg">
                  <div className="bar-fill negative-bar" style={{ width: `${result.probabilities.NEGATIVE * 100}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;