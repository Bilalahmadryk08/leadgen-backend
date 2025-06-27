// backend/src/utils/exportUtils.js

const fs = require("fs");
const ExcelJS = require("exceljs");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const creds = require("../../credentials.json"); // Google service account credentials

// Deduplication function (by phone)
const deduplicateLeads = (leads) => {
  const seen = new Set();
  return leads.filter((lead) => {
    if (!lead.phone || seen.has(lead.phone)) return false;
    seen.add(lead.phone);
    return true;
  });
};

// Export to CSV
export const exportToCSV = (leads) => {
  const header = "Name,Phone,Email,Website\n";
  const rows = leads
    .map((l) => `${l.name},${l.phone},${l.email},${l.website}`)
    .join("\n");
  fs.writeFileSync(filename, header + rows, "utf8");
};

// Export to Excel
const exportToExcel = async (leads, filename) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  sheet.columns = [
    { header: "Name", key: "name" },
    { header: "Phone", key: "phone" },
    { header: "Email", key: "email" },
    { header: "Website", key: "website" },
  ];
  sheet.addRows(leads);
  await workbook.xlsx.writeFile(filename);
};

// Append to Google Sheet (with deduplication)
const appendToGoogleSheet = async (leads, sheetId) => {
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  await sheet.loadHeaderRow();

  const existingRows = await sheet.getRows();
  const existingPhones = new Set(existingRows.map((r) => r.Phone));

  const newLeads = leads.filter((lead) => !existingPhones.has(lead.phone));

  for (const lead of newLeads) {
    await sheet.addRow({
      Name: lead.name,
      Phone: lead.phone,
      Email: lead.email,
      Website: lead.website,
    });
  }
};

module.exports = {
  deduplicateLeads,
  exportToCSV,
  exportToExcel,
  appendToGoogleSheet,
};
