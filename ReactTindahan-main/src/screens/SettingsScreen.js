import ConfigService from '../services/ConfigService';

export default function SettingsScreen() {
  const [serverIP, setServerIP] = useState(ConfigService.SERVER_IP);
  
  const handleSave = async () => {
    const isValid = await ConfigService.setServerIP(serverIP);
    if (isValid) {
      alert('Server updated successfully');
    } else {
      alert('Cannot connect to server');
    }
  };
  
  return (
    <div>
      <h2>Server Configuration</h2>
      <input 
        value={serverIP} 
        onChange={(e) => setServerIP(e.target.value)}
      />
      <button onClick={handleSave}>Test & Save</button>
    </div>
  );
}