
import { RawRowData, RowLevel, Category, MetricSet, ComparisonRow, Rank } from '../types';

export interface FullComparisonRow {
  label: string;
  level: RowLevel;
  grade: string | null;
  totalOld: number;
  totalNew: number;
  results: {
    good: MetricDiff;
    fair: MetricDiff;
    passed: MetricDiff;
    failed: MetricDiff;
  };
}

interface MetricDiff {
  oldCount: number;
  newCount: number;
  oldRate: number;
  newRate: number;
}

// Fixed: Added the missing recalculateAndCompare function required by App.tsx
export const recalculateAndCompare = (
  oldData: RawRowData[],
  newData: RawRowData[],
  selectedIdsOld: Set<string>,
  selectedIdsNew: Set<string>,
  category: Category,
  rank: Rank
): ComparisonRow[] => {
  const getMetricKey = (r: Rank): { count: keyof MetricSet; rate: keyof MetricSet } => {
    switch (r) {
      case 'good': return { count: 'goodCount', rate: 'goodRate' };
      case 'fair': return { count: 'fairCount', rate: 'fairRate' };
      case 'passed': return { count: 'passedCount', rate: 'passedRate' };
      case 'failed': return { count: 'failedCount', rate: 'failedRate' };
    }
  };

  const keys = getMetricKey(rank);

  const aggregateOne = (data: RawRowData[], selectedIds: Set<string>) => {
    const active = data.filter(r => r.level === RowLevel.CLASS && selectedIds.has(r.id));
    const gradeGroups: Record<string, RawRowData[]> = {};
    active.forEach(c => {
      const g = c.grade || 'KHÁC';
      if (!gradeGroups[g]) gradeGroups[g] = [];
      gradeGroups[g].push(c);
    });

    const gradeTotals: Record<string, { total: number; count: number }> = {};
    Object.entries(gradeGroups).forEach(([g, classes]) => {
      gradeTotals[g] = {
        total: classes.reduce((s, c) => s + c.totalStudents, 0),
        count: classes.reduce((s, c) => s + c[category][keys.count], 0),
      };
    });

    const schoolTotal = Object.values(gradeTotals).reduce((s, g) => s + g.total, 0);
    const schoolCount = Object.values(gradeTotals).reduce((s, g) => s + g.count, 0);

    return { 
      school: { total: schoolTotal, count: schoolCount }, 
      grades: gradeTotals, 
      classes: active 
    };
  };

  const oldAgg = aggregateOne(oldData, selectedIdsOld);
  const newAgg = aggregateOne(newData, selectedIdsNew);

  const results: ComparisonRow[] = [];

  const createRow = (label: string, grade: string | null, level: RowLevel, oCount: number, oTotal: number, nCount: number, nTotal: number): ComparisonRow => {
    const oRate = oTotal > 0 ? (oCount / oTotal) * 100 : 0;
    const nRate = nTotal > 0 ? (nCount / nTotal) * 100 : 0;
    return {
      label, grade, level,
      totalStudentsOld: oTotal,
      totalStudentsNew: nTotal,
      metrics: {
        oldCount: oCount,
        newCount: nCount,
        diffCount: nCount - oCount,
        oldRate: oRate,
        newRate: nRate,
        diffRate: nRate - oRate
      }
    };
  };

  // 1. School level summary
  results.push(createRow('TOÀN TRƯỜNG', null, RowLevel.SCHOOL, oldAgg.school.count, oldAgg.school.total, newAgg.school.count, newAgg.school.total));

  // 2. Grade & Class levels
  const allGrades = Array.from(new Set([...Object.keys(oldAgg.grades), ...Object.keys(newAgg.grades)])).sort();

  allGrades.forEach(g => {
    const og = oldAgg.grades[g];
    const ng = newAgg.grades[g];
    results.push(createRow(g, g, RowLevel.GRADE, og?.count || 0, og?.total || 0, ng?.count || 0, ng?.total || 0));

    // Align and include classes within this grade
    const oldClasses = oldAgg.classes.filter(c => (c.grade || 'KHÁC') === g);
    const newClasses = newAgg.classes.filter(c => (c.grade || 'KHÁC') === g);
    const allClassLabels = Array.from(new Set([...oldClasses.map(c => c.label), ...newClasses.map(c => c.label)]))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    allClassLabels.forEach(cl => {
      const oc = oldClasses.find(c => c.label === cl);
      const nc = newClasses.find(c => c.label === cl);
      results.push(createRow(cl, g, RowLevel.CLASS, 
        oc ? oc[category][keys.count] : 0, oc?.totalStudents || 0,
        nc ? nc[category][keys.count] : 0, nc?.totalStudents || 0
      ));
    });
  });

  return results;
};

export const getFullExportData = (
  oldData: RawRowData[],
  newData: RawRowData[],
  selectedIdsOld: Set<string>,
  selectedIdsNew: Set<string>,
  category: Category
): FullComparisonRow[] => {
  const aggregate = (data: RawRowData[], selectedIds: Set<string>) => {
    const active = data.filter(r => r.level === RowLevel.CLASS && selectedIds.has(r.id));
    const gradeGroups: Record<string, RawRowData[]> = {};
    active.forEach(c => {
      const g = c.grade || 'KHT';
      if (!gradeGroups[g]) gradeGroups[g] = [];
      gradeGroups[g].push(c);
    });

    const gradeTotals: Record<string, any> = {};
    Object.entries(gradeGroups).forEach(([label, classes]) => {
      const total = classes.reduce((s, c) => s + c.totalStudents, 0);
      const getSum = (rk: keyof MetricSet) => classes.reduce((s, c) => s + c[category][rk], 0);
      
      gradeTotals[label] = {
        total,
        metrics: {
          good: { count: getSum('goodCount'), rate: total > 0 ? (getSum('goodCount') / total) * 100 : 0 },
          fair: { count: getSum('fairCount'), rate: total > 0 ? (getSum('fairCount') / total) * 100 : 0 },
          passed: { count: getSum('passedCount'), rate: total > 0 ? (getSum('passedCount') / total) * 100 : 0 },
          failed: { count: getSum('failedCount'), rate: total > 0 ? (getSum('failedCount') / total) * 100 : 0 },
        }
      };
    });

    const schoolTotalVal = Object.values(gradeTotals).reduce((s, g) => s + g.total, 0);
    const schoolMetrics = {
      good: { 
        count: Object.values(gradeTotals).reduce((s, g) => s + g.metrics.good.count, 0),
        rate: schoolTotalVal > 0 ? (Object.values(gradeTotals).reduce((s, g) => s + g.metrics.good.count, 0) / schoolTotalVal) * 100 : 0
      },
      fair: { 
        count: Object.values(gradeTotals).reduce((s, g) => s + g.metrics.fair.count, 0),
        rate: schoolTotalVal > 0 ? (Object.values(gradeTotals).reduce((s, g) => s + g.metrics.fair.count, 0) / schoolTotalVal) * 100 : 0
      },
      passed: { 
        count: Object.values(gradeTotals).reduce((s, g) => s + g.metrics.passed.count, 0),
        rate: schoolTotalVal > 0 ? (Object.values(gradeTotals).reduce((s, g) => s + g.metrics.passed.count, 0) / schoolTotalVal) * 100 : 0
      },
      failed: { 
        count: Object.values(gradeTotals).reduce((s, g) => s + g.metrics.failed.count, 0),
        rate: schoolTotalVal > 0 ? (Object.values(gradeTotals).reduce((s, g) => s + g.metrics.failed.count, 0) / schoolTotalVal) * 100 : 0
      }
    };

    return { school: { total: schoolTotalVal, metrics: schoolMetrics }, grades: gradeTotals };
  };

  const oldAgg = aggregate(oldData, selectedIdsOld);
  const newAgg = aggregate(newData, selectedIdsNew);

  const allGrades = Array.from(new Set([...Object.keys(oldAgg.grades), ...Object.keys(newAgg.grades)])).sort();
  
  const results: FullComparisonRow[] = [];

  const mapRow = (label: string, level: RowLevel, o: any, n: any): FullComparisonRow => ({
    label, level, grade: null,
    totalOld: o?.total || 0,
    totalNew: n?.total || 0,
    results: {
      good: { oldCount: o?.metrics.good.count || 0, newCount: n?.metrics.good.count || 0, oldRate: o?.metrics.good.rate || 0, newRate: n?.metrics.good.rate || 0 },
      fair: { oldCount: o?.metrics.fair.count || 0, newCount: n?.metrics.fair.count || 0, oldRate: o?.metrics.fair.rate || 0, newRate: n?.metrics.fair.rate || 0 },
      passed: { oldCount: o?.metrics.passed.count || 0, newCount: n?.metrics.passed.count || 0, oldRate: o?.metrics.passed.rate || 0, newRate: n?.metrics.passed.rate || 0 },
      failed: { oldCount: o?.metrics.failed.count || 0, newCount: n?.metrics.failed.count || 0, oldRate: o?.metrics.failed.rate || 0, newRate: n?.metrics.failed.rate || 0 },
    }
  });

  results.push(mapRow('TOÀN TRƯỜNG', RowLevel.SCHOOL, oldAgg.school, newAgg.school));
  allGrades.forEach(g => {
    results.push(mapRow(g, RowLevel.GRADE, oldAgg.grades[g], newAgg.grades[g]));
  });

  return results;
};
