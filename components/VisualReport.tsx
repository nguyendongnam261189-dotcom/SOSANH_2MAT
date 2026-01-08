
import React from 'react';
import { FullComparisonRow } from '../services/aggregatorService';
import { Category } from '../types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface VisualReportProps {
  data: FullComparisonRow[];
  oldYear: string;
  newYear: string;
}

const VisualReport: React.FC<VisualReportProps> = ({ data, oldYear, newYear }) => {
  // Đồng nhất nhãn cho cả 2 hạng mục
  const labels = ['Tốt (%)', 'Khá (%)', 'Đạt (%)', 'CĐ (%)'];

  const DiffIndicator = ({ val }: { val: number }) => {
    if (val > 0) return <span className="text-emerald-600 flex items-center justify-center gap-1"><TrendingUp size={14} /> +{val.toFixed(2)}%</span>;
    if (val < 0) return <span className="text-rose-600 flex items-center justify-center gap-1"><TrendingDown size={14} /> -{Math.abs(val).toFixed(2)}%</span>;
    return <span className="text-slate-400 flex items-center justify-center gap-1"><Minus size={14} /> 0.00%</span>;
  };

  return (
    <div className="space-y-16 py-8" id="presentation-report">
      {data.map((row, idx) => (
        <div key={idx} className="report-card bg-white p-2 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden break-inside-avoid mb-10">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="border border-slate-700 p-5 text-2xl font-black w-1/5">{row.label}</th>
                <th colSpan={2} className="border border-slate-700 p-3 text-center text-lg">{labels[0]}</th>
                <th colSpan={2} className="border border-slate-700 p-3 text-center text-lg">{labels[1]}</th>
                <th colSpan={2} className="border border-slate-700 p-3 text-center text-lg">{labels[2]}</th>
                <th colSpan={2} className="border border-slate-700 p-3 text-center text-lg">{labels[3]}</th>
              </tr>
              <tr className="bg-slate-100 text-slate-500 font-black uppercase text-[11px] tracking-[0.2em]">
                <th className="border border-slate-200 p-2">NĂM HỌC</th>
                <th className="border border-slate-200 p-2 w-[10%] text-center">SL</th>
                <th className="border border-slate-200 p-2 w-[10%] text-center">TL</th>
                <th className="border border-slate-200 p-2 w-[10%] text-center">SL</th>
                <th className="border border-slate-200 p-2 w-[10%] text-center">TL</th>
                <th className="border border-slate-200 p-2 w-[10%] text-center">SL</th>
                <th className="border border-slate-200 p-2 w-[10%] text-center">TL</th>
                <th className="border border-slate-200 p-2 w-[10%] text-center">SL</th>
                <th className="border border-slate-200 p-2 w-[10%] text-center">TL</th>
              </tr>
            </thead>
            <tbody className="font-bold text-slate-800">
              <tr className="hover:bg-slate-50 transition-colors">
                <td className="border border-slate-200 p-5 text-center bg-indigo-50/30 text-indigo-900">{newYear}</td>
                <td className="border border-slate-200 p-5 text-center text-lg">{row.results.good.newCount}</td>
                <td className="border border-slate-200 p-5 text-center text-lg text-indigo-700">{row.results.good.newRate.toFixed(2)}%</td>
                <td className="border border-slate-200 p-5 text-center text-lg">{row.results.fair.newCount}</td>
                <td className="border border-slate-200 p-5 text-center text-lg text-indigo-700">{row.results.fair.newRate.toFixed(2)}%</td>
                <td className="border border-slate-200 p-5 text-center text-lg">{row.results.passed.newCount}</td>
                <td className="border border-slate-200 p-5 text-center text-lg text-indigo-700">{row.results.passed.newRate.toFixed(2)}%</td>
                <td className="border border-slate-200 p-5 text-center text-lg">{row.results.failed.newCount}</td>
                <td className="border border-slate-200 p-5 text-center text-lg text-indigo-700">{row.results.failed.newRate.toFixed(2)}%</td>
              </tr>
              <tr className="hover:bg-slate-50 transition-colors">
                <td className="border border-slate-200 p-5 text-center bg-slate-50 text-slate-500">{oldYear}</td>
                <td className="border border-slate-200 p-5 text-center text-lg">{row.results.good.oldCount}</td>
                <td className="border border-slate-200 p-5 text-center text-lg text-slate-400">{row.results.good.oldRate.toFixed(2)}%</td>
                <td className="border border-slate-200 p-5 text-center text-lg">{row.results.fair.oldCount}</td>
                <td className="border border-slate-200 p-5 text-center text-lg text-slate-400">{row.results.fair.oldRate.toFixed(2)}%</td>
                <td className="border border-slate-200 p-5 text-center text-lg">{row.results.passed.oldCount}</td>
                <td className="border border-slate-200 p-5 text-center text-lg text-slate-400">{row.results.passed.oldRate.toFixed(2)}%</td>
                <td className="border border-slate-200 p-5 text-center text-lg">{row.results.failed.oldCount}</td>
                <td className="border border-slate-200 p-5 text-center text-lg text-slate-400">{row.results.failed.oldRate.toFixed(2)}%</td>
              </tr>
              <tr className="bg-slate-50 font-black">
                <td className="border border-slate-200 p-5 text-center text-slate-600 uppercase tracking-wider text-xs">Tăng/giảm tỉ lệ</td>
                <td colSpan={2} className="border border-slate-200 p-5 text-center text-xl"><DiffIndicator val={row.results.good.newRate - row.results.good.oldRate} /></td>
                <td colSpan={2} className="border border-slate-200 p-5 text-center text-xl"><DiffIndicator val={row.results.fair.newRate - row.results.fair.oldRate} /></td>
                <td colSpan={2} className="border border-slate-200 p-5 text-center text-xl"><DiffIndicator val={row.results.passed.newRate - row.results.passed.oldRate} /></td>
                <td colSpan={2} className="border border-slate-200 p-5 text-center text-xl"><DiffIndicator val={row.results.failed.newRate - row.results.failed.oldRate} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

export default VisualReport;
