import ConfigService from './ConfigService';

// All URLs now use ConfigService
const SERVER_URL = ConfigService.getServerURL();

// All your existing API functions remain the same
export const fetchSuppliers = async () => getJSON(`${SERVER_URL}/api/suppliers`);
// ... rest of your functions