// services/DiscoveryService.js
import Zeroconf from 'react-native-zeroconf';

class DiscoveryService {
  constructor() {
    this.zeroconf = new Zeroconf();
    this.discoveredServers = [];
    this.isScanning = false;
    
    // Set up event listeners
    this.zeroconf.on('start', () => {
      console.log('Zeroconf discovery started');
      this.isScanning = true;
    });
    
    this.zeroconf.on('stop', () => {
      console.log('Zeroconf discovery stopped');
      this.isScanning = false;
    });
    
    this.zeroconf.on('found', (service) => {
      console.log('Service found:', service);
      if (service.name.includes('POS Desktop') || service.name.includes('pos')) {
        const server = {
          name: service.name,
          ip: service.addresses[0],
          port: service.port,
          type: 'mdns',
          txt: service.txt || {}
        };
        this.discoveredServers.push(server);
      }
    });
    
    this.zeroconf.on('remove', (serviceName) => {
      console.log('Service removed:', serviceName);
      this.discoveredServers = this.discoveredServers.filter(
        s => s.name !== serviceName
      );
    });
    
    this.zeroconf.on('error', (err) => {
      console.error('Zeroconf error:', err);
    });
  }
  
  startDiscovery() {
    this.discoveredServers = [];
    this.zeroconf.scan('http', 'tcp', 'local.');
    return new Promise(resolve => {
      setTimeout(() => {
        this.zeroconf.stop();
        resolve(this.discoveredServers);
      }, 5000); // Scan for 5 seconds
    });
  }
  
  stopDiscovery() {
    this.zeroconf.stop();
  }
  
  getDiscoveredServers() {
    return [...this.discoveredServers];
  }
}

export default new DiscoveryService();