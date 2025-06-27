import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const exportCSV = async (data) => {
  const csv = data.map(d => `${d.link},${d.email || ''},${d.phone || ''}`).join('\n');
  const filePath = path.join(__dirname, '../../leads.csv');
  fs.writeFileSync(filePath, csv);
  return filePath;
};

export const exportExcel = async (data) => {
  // ExcelJS functionality would need to be installed and imported
  // For now, just return a placeholder
  const filePath = path.join(__dirname, '../../leads.xlsx');
  return filePath;
};

export const exportLeads = (req, res) => {
  // Your export logic here
  res.json({ message: 'Exported!' });
};
