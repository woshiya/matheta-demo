// Safe subset: topics that are usually reliable for early-stage AI question generation.
// This list is also the gating set used to decide if a (domain, topic) is AI-supported.
export const MATH_DOMAINS_AI_SAFE = [
  {
    id: "number",
    label: "Number",
    topics: [
      // Keep to HKDSE-aligned, high-reliability topics for early AI generation.
      { id: "integers", label: "Integers (Positive/Negative)" },
      { id: "fractions", label: "Fractions" },
      { id: "decimals", label: "Decimals" },
      { id: "percentages", label: "Percentages" },
      { id: "ratio_rate", label: "Ratio & Rate" },
      { id: "proportion", label: "Direct Proportion" },
    ],
  },
  {
    id: "algebra",
    label: "Algebra",
    topics: [
      { id: "expressions", label: "Algebraic Expressions" },
      { id: "linear_equations", label: "Linear Equations" },
      { id: "simultaneous", label: "Simultaneous Equations" },
      { id: "quadratics", label: "Quadratic Equations" },
      { id: "indices", label: "Indices" },
      { id: "expansion_factorisation", label: "Expansion & Factorisation" },
      { id: "inequalities", label: "Linear Inequalities" },
    ],
  },
  {
    id: "measures",
    label: "Measures",
    topics: [
      { id: "units", label: "Units & Conversion" },
      { id: "perimeter_area", label: "Perimeter & Area" },
      { id: "volume", label: "Volume" },
      { id: "time", label: "Time" },
      { id: "speed_distance_time", label: "Speed / Distance / Time" },
    ],
  },
  {
    id: "shape_space",
    label: "Shape & Space",
    topics: [
      { id: "angles", label: "Angles & Parallel Lines" },
      { id: "triangles", label: "Triangles & Quadrilaterals" },
      { id: "circle", label: "Circles" },
      { id: "coordinates", label: "Coordinates (2D)" },
      { id: "transformations", label: "Transformations" },
    ],
  },
  {
    id: "data_handling",
    label: "Data Handling",
    topics: [
      { id: "averages", label: "Mean / Median / Mode" },
      { id: "charts", label: "Charts (Bar/Line/Pie)" },
      { id: "probability", label: "Probability" },
      { id: "range", label: "Range" },
    ],
  },
];

// Full list: used for Custom and Mixed modes so teachers can pick any HKDSE-aligned topic.
// This is intentionally broader than the AI-safe set.
export const MATH_DOMAINS_HKDSE_FULL = [
  {
    id: "number",
    label: "Number",
    topics: [
      { id: "integers", label: "Integers (Positive/Negative)" },
      { id: "factors_multiples", label: "Factors & Multiples" },
      { id: "primes_hcf_lcm", label: "Primes / HCF / LCM" },
      { id: "fractions", label: "Fractions" },
      { id: "decimals", label: "Decimals" },
      { id: "percentages", label: "Percentages" },
      { id: "ratio_rate", label: "Ratio & Rate" },
      { id: "proportion", label: "Direct Proportion" },
      { id: "approximation", label: "Approximation (Rounding/Estimation)" },
      { id: "standard_form", label: "Standard Form" },
      { id: "sig_fig_dp", label: "Significant Figures & Decimal Places" },
    ],
  },
  {
    id: "algebra",
    label: "Algebra",
    topics: [
      { id: "expressions", label: "Algebraic Expressions" },
      { id: "substitution", label: "Substitution" },
      { id: "formulae", label: "Formulas (Change of Subject)" },
      { id: "expansion_factorisation", label: "Expansion & Factorisation" },
      { id: "linear_equations", label: "Linear Equations" },
      { id: "inequalities", label: "Linear Inequalities" },
      { id: "simultaneous", label: "Simultaneous Equations" },
      { id: "quadratics", label: "Quadratic Equations" },
      { id: "indices", label: "Indices" },
      { id: "polynomials", label: "Polynomials" },
      { id: "variation", label: "Variation (Direct/Inverse)" },
      { id: "graphs", label: "Graphs of Functions" },
      { id: "sequences", label: "Sequences" },
    ],
  },
  {
    id: "measures",
    label: "Measures",
    topics: [
      { id: "units", label: "Units & Conversion" },
      { id: "time", label: "Time" },
      { id: "speed_distance_time", label: "Speed / Distance / Time" },
      { id: "perimeter_area", label: "Perimeter & Area" },
      { id: "volume", label: "Volume" },
      { id: "surface_area", label: "Surface Area" },
      { id: "density", label: "Density" },
    ],
  },
  {
    id: "shape_space",
    label: "Shape & Space",
    topics: [
      { id: "angles", label: "Angles & Parallel Lines" },
      { id: "triangles", label: "Triangles & Quadrilaterals" },
      { id: "congruence_similarity", label: "Congruence & Similarity" },
      { id: "pythagoras", label: "Pythagoras' Theorem" },
      { id: "trigonometry", label: "Trigonometry (Right-angled)" },
      { id: "circle", label: "Circles" },
      { id: "coordinates", label: "Coordinates (2D)" },
      { id: "transformations", label: "Transformations" },
      { id: "symmetry", label: "Symmetry" },
      { id: "vectors", label: "Vectors (Basic)" },
      { id: "three_d", label: "3D Solids" },
    ],
  },
  {
    id: "data_handling",
    label: "Data Handling",
    topics: [
      { id: "charts", label: "Charts (Bar/Line/Pie)" },
      { id: "averages", label: "Mean / Median / Mode" },
      { id: "range", label: "Range" },
      { id: "probability", label: "Probability" },
    ],
  },
];

// Backwards-compatible export for any existing imports.
// Defaulting to the full HKDSE-aligned list.
export const MATH_DOMAINS = MATH_DOMAINS_HKDSE_FULL;

export function getDomainById(domainId) {
  return MATH_DOMAINS_HKDSE_FULL.find((d) => d.id === domainId) || null;
}

export function getTopicById(domainId, topicId) {
  const domain = getDomainById(domainId);
  if (!domain) return null;
  return domain.topics.find((t) => t.id === topicId) || null;
}
