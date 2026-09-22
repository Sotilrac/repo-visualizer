import { createRoot } from 'react-dom/client';
import '../styles.css';
import './editor.css';
import ConfigEditor from './ConfigEditor.jsx';

createRoot(document.getElementById('root')).render(<ConfigEditor />);
