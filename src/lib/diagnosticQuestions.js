// Shared diagnostic question bank used by both student + teacher UIs.
// Keeping it in one place avoids mismatches between views.

export const DIAGNOSTIC_QUESTIONS = [
  // NUMBER (8)
  { id: 1, question: "Find 15% of 200.", options: ["20", "25", "30", "35"], answer: "30", domain: "Number" },
  { id: 2, question: "Calculate: 48 ÷ 6", options: ["6", "7", "8", "9"], answer: "8", domain: "Number" },
  { id: 3, question: "Convert 0.75 to a fraction.", options: ["3/4", "2/3", "1/4", "4/5"], answer: "3/4", domain: "Number" },
  { id: 4, question: "Find the value of -3 + 7", options: ["4", "-4", "10", "-10"], answer: "4", domain: "Number" },
  { id: 5, question: "Express 3:9 in simplest form.", options: ["1:3", "3:1", "2:3", "1:2"], answer: "1:3", domain: "Number" },
  { id: 6, question: "Round 4567 to nearest 100.", options: ["4500", "4600", "4560", "4570"], answer: "4600", domain: "Number" },
  { id: 7, question: "Find 20% of 150.", options: ["25", "30", "35", "40"], answer: "30", domain: "Number" },
  { id: 8, question: "Calculate: 12 × 8", options: ["84", "96", "88", "108"], answer: "96", domain: "Number" },

  // ALGEBRA (8)
  { id: 9, question: "Simplify: 3x + 2x", options: ["5x", "6x", "3x²", "2x"], answer: "5x", domain: "Algebra" },
  { id: 10, question: "Solve: x + 5 = 12", options: ["5", "6", "7", "8"], answer: "7", domain: "Algebra" },
  { id: 11, question: "Expand: 2(x + 3)", options: ["2x+3", "2x+6", "x+6", "2x+9"], answer: "2x+6", domain: "Algebra" },
  { id: 12, question: "Simplify: 4a - 2a", options: ["2a", "6a", "8a", "-2a"], answer: "2a", domain: "Algebra" },
  { id: 13, question: "Solve: 3x = 18", options: ["5", "6", "7", "8"], answer: "6", domain: "Algebra" },
  { id: 14, question: "Factorise: x² + 2x", options: ["x(x+2)", "(x+1)(x+2)", "x(x-2)", "x²(2x)"], answer: "x(x+2)", domain: "Algebra" },
  { id: 15, question: "Solve: 2x + 4 = 10", options: ["2", "3", "4", "5"], answer: "3", domain: "Algebra" },
  { id: 16, question: "Simplify: 5y + y - 2y", options: ["4y", "3y", "5y", "6y"], answer: "4y", domain: "Algebra" },

  // MEASURES (8)
  { id: 17, question: "Round 4,378 to nearest 100.", options: ["4300", "4400", "4380", "4370"], answer: "4400", domain: "Measures" },
  { id: 18, question: "Convert 250 cm to metres.", options: ["2.5m", "25m", "0.25m", "2500m"], answer: "2.5m", domain: "Measures" },
  { id: 19, question: "Estimate: 49 × 19", options: ["900", "1000", "800", "1200"], answer: "1000", domain: "Measures" },
  { id: 20, question: "Area of rectangle 8cm × 5cm?", options: ["40", "26", "13", "80"], answer: "40", domain: "Measures" },
  { id: 21, question: "Convert 2.5kg to grams.", options: ["250g", "2500g", "25g", "2000g"], answer: "2500g", domain: "Measures" },
  { id: 22, question: "Perimeter of square side 6cm?", options: ["12", "18", "24", "36"], answer: "24", domain: "Measures" },
  { id: 23, question: "Best estimate for classroom height?", options: ["3m", "30m", "0.3m", "300m"], answer: "3m", domain: "Measures" },
  { id: 24, question: "Convert 90 minutes to hours.", options: ["1.5", "1.9", "2", "0.9"], answer: "1.5", domain: "Measures" },

  // SHAPE & SPACE (8)
  { id: 25, question: "Angles on straight line sum to?", options: ["90", "180", "270", "360"], answer: "180", domain: "Shape & Space" },
  { id: 26, question: "Sum of angles in triangle?", options: ["90", "180", "360", "270"], answer: "180", domain: "Shape & Space" },
  { id: 27, question: "Coordinates of origin?", options: ["(0,0)", "(1,0)", "(0,1)", "(1,1)"], answer: "(0,0)", domain: "Shape & Space" },
  { id: 28, question: "Right angle equals?", options: ["45", "90", "180", "360"], answer: "90", domain: "Shape & Space" },
  { id: 29, question: "Parallel lines never?", options: ["meet", "cross", "touch", "bend"], answer: "meet", domain: "Shape & Space" },
  { id: 30, question: "Triangle with 3 equal sides?", options: ["Isosceles", "Scalene", "Equilateral", "Right"], answer: "Equilateral", domain: "Shape & Space" },
  { id: 31, question: "Perpendicular lines meet at?", options: ["45°", "90°", "180°", "0°"], answer: "90°", domain: "Shape & Space" },
  { id: 32, question: "A square has how many sides?", options: ["3", "4", "5", "6"], answer: "4", domain: "Shape & Space" },

  // DATA HANDLING (8)
  { id: 33, question: "Mean of 2,4,6?", options: ["3", "4", "5", "6"], answer: "4", domain: "Data Handling" },
  { id: 34, question: "Median of 3,5,7?", options: ["3", "5", "7", "4"], answer: "5", domain: "Data Handling" },
  { id: 35, question: "Mode of 2,2,3?", options: ["2", "3", "1", "0"], answer: "2", domain: "Data Handling" },
  { id: 36, question: "Range of 2,5,9?", options: ["7", "6", "4", "5"], answer: "7", domain: "Data Handling" },
  { id: 37, question: "Bar charts display?", options: ["data", "angles", "lines", "equations"], answer: "data", domain: "Data Handling" },
  { id: 38, question: "Probability ranges between?", options: ["0-1", "1-10", "0-100", "-1-1"], answer: "0-1", domain: "Data Handling" },
  { id: 39, question: "If 4 out of 8 like apples, fraction?", options: ["1/2", "1/4", "2/3", "3/4"], answer: "1/2", domain: "Data Handling" },
  { id: 40, question: "Pie charts represent?", options: ["Parts of whole", "Lines", "Equations", "Shapes"], answer: "Parts of whole", domain: "Data Handling" },
];
