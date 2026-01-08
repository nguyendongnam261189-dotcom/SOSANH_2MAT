
import React from 'react';
import { ComparisonRow, RowLevel, Category, Rank } from '../types';

interface ComparisonTableProps {
  data: ComparisonRow[];
  category: Category;
  rank: Rank;
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({ data, category, rank }) => {
  const getRankLabel = (r: Rank) => {
    switch(r) {
      case 'good': return 'TỐT';
      case 'fair': return 'KHÁ';
      case 'passed': return 'ĐẠT';
      case 'failed': return 'CĐ';
    }
  };

  const getCategoryLabel = (c: Category) => c === 'conduct' ? 'Rèn luyện' : 'Học tập';

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm bg-white">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="bg-slate-100 border-b border-slate-200">
            <th className="px-4 py-3 font-semibold text-slate-700 border-r w-48">Lớp / Khối</th>
            <th colSpan={3} className="px-4 py-2 font-semibold text-slate-700 border-r text-center bg-blue-50">
              {getCategoryLabel(category)} - {getRankLabel(rank)} (Số Lượng)
            </th>
            <th colSpan={3} className="px-4 py-2 font-semibold text-slate-700 text-center bg-emerald-50">
              {getCategoryLabel(category)} - {getRankLabel(rank)} (Tỉ Lệ %)
            </th>
          </tr>
          <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2 border-r">Tên</th>
            <th className="px-4 py-2 bg-blue-50/50">Năm Cũ</th>
            <th className="px-4 py-2 bg-blue-50/50">Năm Mới</th>
            <th className="px-4 py-2 border-r bg-blue-50/50">Biến Động</th>
            <th className="px-4 py-2 bg-emerald-50/50">Cũ (%)</th>
            <th className="px-4 py-2 bg-emerald-50/50">Mới (%)</th>
            <th className="px-4 py-2 bg-emerald-50/50">Biến Động (%)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const bgClass = row.level === RowLevel.SCHOOL 
              ? 'bg-blue-100 font-bold text-blue-900' 
              : row.level === RowLevel.GRADE 
                ? 'bg-slate-100 font-semibold' 
                : 'bg-white hover:bg-slate-50 transition-colors';
            
            const diffValue = row.metrics.diffCount;
            const diffRate = row.metrics.diffRate;

            return (
              <tr key={`${row.label}-${idx}`} className={`${bgClass} border-b border-slate-100 last:border-0`}>
                <td className={`px-4 py-2.5 border-r ${row.level === RowLevel.CLASS ? 'pl-8 text-slate-600' : ''}`}>
                  {row.label}
                </td>
                <td className="px-4 py-2.5 text-center">{row.metrics.oldCount}</td>
                <td className="px-4 py-2.5 text-center font-medium">{row.metrics.newCount}</td>
                <td className={`px-4 py-2.5 text-center border-r font-bold ${diffValue > 0 ? 'text-emerald-600' : diffValue < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {diffValue > 0 ? `+${diffValue}` : diffValue}
                </td>
                <td className="px-4 py-2.5 text-center">{row.metrics.oldRate.toFixed(2)}%</td>
                <td className="px-4 py-2.5 text-center font-medium">{row.metrics.newRate.toFixed(2)}%</td>
                <td className={`px-4 py-2.5 text-center font-bold ${diffRate > 0 ? 'text-emerald-600' : diffRate < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {diffRate > 0 ? `+${diffRate.toFixed(2)}` : diffRate.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ComparisonTable;
