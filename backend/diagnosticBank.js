// Server-side copy of the diagnostic question bank for authoritative marking.
// Keep this aligned with src/lib/diagnosticQuestions.js.

const DIAGNOSTIC_QUESTIONS = [
  // NUMBER (8)
  { id: 1, answer: "30", domain: "Number" },
  { id: 2, answer: "8", domain: "Number" },
  { id: 3, answer: "3/4", domain: "Number" },
  { id: 4, answer: "4", domain: "Number" },
  { id: 5, answer: "1:3", domain: "Number" },
  { id: 6, answer: "4600", domain: "Number" },
  { id: 7, answer: "30", domain: "Number" },
  { id: 8, answer: "96", domain: "Number" },

  // ALGEBRA (8)
  { id: 9, answer: "5x", domain: "Algebra" },
  { id: 10, answer: "7", domain: "Algebra" },
  { id: 11, answer: "2x+6", domain: "Algebra" },
  { id: 12, answer: "2a", domain: "Algebra" },
  { id: 13, answer: "6", domain: "Algebra" },
  { id: 14, answer: "x(x+2)", domain: "Algebra" },
  { id: 15, answer: "3", domain: "Algebra" },
  { id: 16, answer: "4y", domain: "Algebra" },

  // MEASURES (8)
  { id: 17, answer: "4400", domain: "Measures" },
  { id: 18, answer: "2.5m", domain: "Measures" },
  { id: 19, answer: "1000", domain: "Measures" },
  { id: 20, answer: "40", domain: "Measures" },
  { id: 21, answer: "2500g", domain: "Measures" },
  { id: 22, answer: "24", domain: "Measures" },
  { id: 23, answer: "3m", domain: "Measures" },
  { id: 24, answer: "1.5", domain: "Measures" },

  // SHAPE & SPACE (8)
  { id: 25, answer: "180", domain: "Shape & Space" },
  { id: 26, answer: "180", domain: "Shape & Space" },
  { id: 27, answer: "(0,0)", domain: "Shape & Space" },
  { id: 28, answer: "90", domain: "Shape & Space" },
  { id: 29, answer: "meet", domain: "Shape & Space" },
  { id: 30, answer: "Equilateral", domain: "Shape & Space" },
  // Accept either "90" or "90°" from clients (server normalizes degree symbol).
  { id: 31, answer: "90", domain: "Shape & Space" },
  { id: 32, answer: "4", domain: "Shape & Space" },

  // DATA HANDLING (8)
  { id: 33, answer: "4", domain: "Data Handling" },
  { id: 34, answer: "5", domain: "Data Handling" },
  { id: 35, answer: "2", domain: "Data Handling" },
  { id: 36, answer: "7", domain: "Data Handling" },
  { id: 37, answer: "data", domain: "Data Handling" },
  { id: 38, answer: "0-1", domain: "Data Handling" },
  { id: 39, answer: "1/2", domain: "Data Handling" },
  { id: 40, answer: "Parts of whole", domain: "Data Handling" },
];

module.exports = {
  DIAGNOSTIC_QUESTIONS,
};
