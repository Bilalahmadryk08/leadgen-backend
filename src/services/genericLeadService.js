// File: backend/src/services/genericLeadService.js
export const fetchGenericLeads = async (niche, location, quantity) => {
  // This is a mock function. Replace this with real API logic (Apollo, Google, etc.)
  const dummyLeads = Array.from({ length: quantity }, (_, i) => ({
    name: `${niche} Company ${i + 1}`,
    location,
    phone: `+1-555-000${i}`,
    email: `contact${i}@${niche.toLowerCase()}.com`
  }));
  return dummyLeads;
};
