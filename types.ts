
export enum RowLevel {
  SCHOOL = 0,
  GRADE = 1,
  CLASS = 2
}

export interface MetricSet {
  goodCount: number;
  goodRate: number;
  fairCount: number;
  fairRate: number;
  passedCount: number;
  passedRate: number;
  failedCount: number;
  failedRate: number;
}

export interface RawRowData {
  id: string;
  label: string;
  grade: string | null;
  level: RowLevel;
  totalStudents: number;
  conduct: MetricSet;
  study: MetricSet;
  originalData: Record<string, any>;
}

export interface ComparisonRow {
  label: string;
  grade: string | null;
  level: RowLevel;
  totalStudentsOld: number;
  totalStudentsNew: number;
  metrics: {
    oldCount: number;
    newCount: number;
    diffCount: number;
    oldRate: number;
    newRate: number;
    diffRate: number;
  };
}

export type Category = 'conduct' | 'study';
export type Rank = 'good' | 'fair' | 'passed' | 'failed';

export interface ReportData {
  rows: RawRowData[];
  fileName: string;
}
