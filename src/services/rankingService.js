// PURE FUNCTIONS ONLY — no Mongoose/DB imports, no framework dependencies.
// Standard competition ranking (ties share a rank, the next distinct value's
// rank equals its 1-based position in the sorted list, e.g. 1,2,2,4).

const rankStudents = (studentTotals) => {
  // studentTotals: [{studentId, totalObtained, percentage, ...anything else the caller wants passed through}]
  const sorted = [...studentTotals].sort((a, b) => (b.percentage - a.percentage) || (b.totalObtained - a.totalObtained));

  let rank = 0;
  let seen = 0;
  let lastPercentage = null;
  let lastTotal = null;

  return sorted.map((s) => {
    seen += 1;
    if (s.percentage !== lastPercentage || s.totalObtained !== lastTotal) {
      rank = seen;
      lastPercentage = s.percentage;
      lastTotal = s.totalObtained;
    }
    return { ...s, rank };
  });
};

module.exports = { rankStudents };
