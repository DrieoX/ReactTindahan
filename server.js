const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// --- In-memory storage (replace later with real DB if needed) ---
let reports = [];
let inventory = [];
let resupply = [];

// --- Routes ---
// Get all reports
app.get('/api/reports', (req, res) => {
  res.json(reports);
});

// Add a report
app.post('/api/reports', (req, res) => {
  const newReport = { id: Date.now(), ...req.body };
  reports.push(newReport);
  res.json(newReport);
});

// Get inventory
app.get('/api/inventory', (req, res) => {
  res.json(inventory);
});

// Update inventory
app.post('/api/inventory', (req, res) => {
  const newItem = { id: Date.now(), ...req.body };
  inventory.push(newItem);
  res.json(newItem);
});

// --- Resupply Routes ---
// Get resupply history
app.get('/api/resupply', (req, res) => {
  res.json(resupply);
});

// Add resupply
app.post('/api/resupply', (req, res) => {
  const newResupply = { id: Date.now(), ...req.body };
  resupply.push(newResupply);
  res.json(newResupply);
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ API running at http://localhost:${PORT}`);
});
