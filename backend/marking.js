function normalizeAnswerRaw(value) {
  // Basic normalization for MVP.
  // - trim
  // - case-fold
  // - collapse whitespace
  // - normalize common unicode math symbols
  const s = String(value ?? '')
    .replace(/\u2212/g, '-') // unicode minus
    .replace(/\u00D7/g, '*') // multiplication sign
    .replace(/\u00F7/g, '/') // division sign
    .trim()
    .toLowerCase();
  return s.replace(/\s+/g, ' ');
}

function normalizeAlgebraLike(value) {
  // For simple algebra strings, compare after removing whitespace.
  // This does NOT do full symbolic equivalence.
  return normalizeAnswerRaw(value).replace(/\s+/g, '');
}

function nearlyEqual(a, b, { absTol = 1e-9, relTol = 1e-9 } = {}) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return diff <= relTol * scale;
}

function tryParseNumberLike(value) {
  let s = normalizeAnswerRaw(value);
  if (!s) return { ok: false };

  // Strip thousands separators for common inputs: 1,234.56
  s = s.replace(/,/g, '');

  // Percentages: 12.5% -> 0.125
  const pct = s.match(/^([+-]?[\d.]+)%$/);
  if (pct) {
    const n = Number(pct[1]);
    if (!Number.isFinite(n)) return { ok: false };
    return { ok: true, value: n / 100 };
  }

  // Mixed fractions: 1 1/2 or -1 1/2
  const mixed = s.match(/^([+-]?\d+)\s+([+-]?\d+)\s*\/\s*([+-]?\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (!Number.isFinite(whole) || !Number.isFinite(num) || !Number.isFinite(den) || den === 0) return { ok: false };
    const sign = whole < 0 ? -1 : 1;
    return { ok: true, value: whole + sign * (Math.abs(num) / den) };
  }

  // Fractions like -3/4
  const frac = s.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return { ok: false };
    return { ok: true, value: num / den };
  }

  // Plain number / decimal
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

function splitTopLevelSignedTerms(expr) {
  // Splits an expression into terms separated by + or - at top level.
  // Does NOT support parentheses beyond rejecting them.
  const s = normalizeAlgebraLike(expr);
  if (!s) return null;
  if (s.includes('(') || s.includes(')')) return null;

  const terms = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ((ch === '+' || ch === '-') && i > 0) {
      terms.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) terms.push(cur);
  return terms;
}

function tryParseLinear1Var(expr, varName = 'x') {
  // Parses forms like: x+2, 2x-3, -x-7, 3+x
  // Returns { ok, a, b } for ax + b
  const terms = splitTopLevelSignedTerms(expr);
  if (!terms) return { ok: false };

  let a = 0;
  let b = 0;
  for (const t0 of terms) {
    const t = t0 || '';
    if (!t) continue;
    const hasVar = t.includes(varName);
    if (!hasVar) {
      const n = tryParseNumberLike(t);
      if (!n.ok) return { ok: false };
      b += n.value;
      continue;
    }

    // Term with variable should be like: "x", "-x", "2x", "-2x", "2*x"
    const m = t.match(new RegExp(`^([+-]?)(?:([\\d.]+)\\*?)?${varName}$`));
    if (!m) return { ok: false };
    const sign = m[1] === '-' ? -1 : 1;
    const coeffRaw = m[2];
    const coeff = coeffRaw === undefined ? 1 : Number(coeffRaw);
    if (!Number.isFinite(coeff)) return { ok: false };
    a += sign * coeff;
  }

  return { ok: true, a, b };
}

function tryParsePolynomial1Var(expr, varName = 'x') {
  // Very small polynomial parser for ax^2 + bx + c style strings.
  // Supports reordering and optional * (e.g. 2*x^2).
  const terms = splitTopLevelSignedTerms(expr);
  if (!terms) return { ok: false };

  const coeffByExp = new Map();

  for (const t0 of terms) {
    const t = t0 || '';
    if (!t) continue;

    if (!t.includes(varName)) {
      const n = tryParseNumberLike(t);
      if (!n.ok) return { ok: false };
      coeffByExp.set(0, (coeffByExp.get(0) || 0) + n.value);
      continue;
    }

    // Remove optional '*' characters for easier matching.
    const tt = t.replace(/\*/g, '');

    // Match: [sign][coeff?]x[^exp?]
    // Note: RegExp is built from a JS string; backslashes must be doubled.
    const m = tt.match(new RegExp(`^([+-]?)(?:([\\d.]+))?${varName}(?:\\^(\\d+))?$`));
    if (!m) return { ok: false };

    const sign = m[1] === '-' ? -1 : 1;
    const coeffRaw = m[2];
    const expRaw = m[3];
    const coeff = coeffRaw === undefined ? 1 : Number(coeffRaw);
    const exp = expRaw === undefined ? 1 : Number(expRaw);
    if (!Number.isFinite(coeff) || !Number.isInteger(exp) || exp < 0 || exp > 10) return { ok: false };

    const prev = coeffByExp.get(exp) || 0;
    coeffByExp.set(exp, prev + sign * coeff);
  }

  return { ok: true, coeffByExp };
}

function tryParseBinomialProduct(expr, varName = 'x') {
  // Parses (ax+b)(cx+d) where each factor is linear.
  // Handles optional whitespace. Only 2 factors.
  const s = normalizeAnswerRaw(expr);
  if (!s) return { ok: false };

  // Remove outer whitespace, keep inner structure. We only support exactly two (...) blocks.
  const compact = s.replace(/\s+/g, '');
  const m = compact.match(/^\(([^()]+)\)\(([^()]+)\)$/);
  if (!m) return { ok: false };

  const f1 = tryParseLinear1Var(m[1], varName);
  const f2 = tryParseLinear1Var(m[2], varName);
  if (!f1.ok || !f2.ok) return { ok: false };

  // (a1 x + b1)(a2 x + b2) => (a1*a2) x^2 + (a1*b2 + a2*b1)x + (b1*b2)
  const a2 = f1.a * f2.a;
  const a1 = f1.a * f2.b + f2.a * f1.b;
  const a0 = f1.b * f2.b;

  const coeffByExp = new Map();
  coeffByExp.set(2, a2);
  coeffByExp.set(1, a1);
  coeffByExp.set(0, a0);
  return { ok: true, coeffByExp };
}

function polynomialsEquivalent(aPoly, bPoly) {
  const exps = new Set([...aPoly.coeffByExp.keys(), ...bPoly.coeffByExp.keys()]);
  for (const exp of exps) {
    const av = aPoly.coeffByExp.get(exp) || 0;
    const bv = bPoly.coeffByExp.get(exp) || 0;
    if (!nearlyEqual(av, bv, { absTol: 1e-9, relTol: 1e-9 })) return false;
  }
  return true;
}

function answersEquivalent(submitted, expected) {
  // 1) If both look numeric/fractional, compare numerically with tolerance.
  const a = tryParseNumberLike(submitted);
  const b = tryParseNumberLike(expected);
  if (a.ok && b.ok) return nearlyEqual(a.value, b.value);

  // 2) Try polynomial equivalence for common algebra final answers.
  // This makes "x^2+7x+10" match "10 + x^2 + 7x" and matches factorised binomials.
  const subPoly = tryParsePolynomial1Var(submitted, 'x');
  const expPoly = tryParsePolynomial1Var(expected, 'x');
  if (subPoly.ok && expPoly.ok) return polynomialsEquivalent(subPoly, expPoly);

  const subBinom = tryParseBinomialProduct(submitted, 'x');
  if (subBinom.ok && expPoly.ok) return polynomialsEquivalent(subBinom, expPoly);

  const expBinom = tryParseBinomialProduct(expected, 'x');
  if (subPoly.ok && expBinom.ok) return polynomialsEquivalent(subPoly, expBinom);

  // 3) Fallback: strict string compare after light normalization.
  return normalizeAlgebraLike(submitted) === normalizeAlgebraLike(expected);
}

module.exports = {
  normalizeAnswerRaw,
  answersEquivalent,
  // Expose internals for local debugging/tests (not used by app code).
  __debug: {
    tryParseNumberLike,
    tryParseLinear1Var,
    tryParsePolynomial1Var,
    tryParseBinomialProduct,
    nearlyEqual,
    splitTopLevelSignedTerms,
    normalizeAlgebraLike,
  },
};
