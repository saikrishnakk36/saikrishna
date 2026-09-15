import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Deliberately not wrapped in StrictMode: its double-invoked effects would
// start and immediately tear down every RTSP stream twice on mount.
createRoot(document.getElementById('root')).render(<App />);
