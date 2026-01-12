import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Upload, FileText, CheckCircle2, ChevronRight, BarChart3, Settings2, Trash2, TrendingUp, Users, LayoutList, Download, PieChart, Calendar, Presentation, Table as TableIcon, Image as ImageIcon, FileJson, School, Edit3, Type } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { RawRowData, RowLevel, ComparisonRow, Category, Rank } from './types';
import { parseExcelReport } from './services/excelService';
import { recalculateAndCompare, getFullExportData, FullComparisonRow } from './services/aggregatorService';
import ComparisonTable from './components/ComparisonTable';
import SummaryChart from './components/SummaryChart';
import VisualReport from './components/VisualReport';

const App: React.FC = () => {
  const [oldReport, setOldReport] = useState<RawRowData[] | null>(null);
  const [newReport, setNewReport] = useState<RawRowData[] | null>(null);
  const [selectedIdsOld, setSelectedIdsOld] = useState<Set<string>>(new Set());
  const [selectedIdsNew, setSelectedIdsNew] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>('conduct');
  const [activeRank, setActiveRank] = useState<Rank>('good');
  const [sidebarTab, setSidebarTab] = useState<'old' | 'new'>('new');
  const [viewMode, setViewMode] = useState<'table' | 'visual'>('table'); 
  
  const [oldYear, setOldYear] = useState('2023 - 2024');
  const [newYear, setNewYear] = useState('2024 - 2025');
  const [reportTitle, setReportTitle] = useState('');

  const reportRef = useRef<HTMLDivElement>(null);
  const chartSectionRef = useRef<HTMLDivElement>(null);

  // Đồng nhất tên hiển thị cho Rank
  const getRankLabel = (r: Rank) => {
    switch(r) {
      case 'good': return 'TỐT';
      case 'fair': return 'KHÁ';
      case 'passed': return 'ĐẠT';
      case 'failed': return 'CHƯA ĐẠT (CĐ)';
      default: return '';
    }
  };

  // Sync title with category, rank, and viewMode
  useEffect(() => {
    const categoryName = activeCategory === 'study' ? 'HỌC TẬP' : 'RÈN LUYỆN';
    if (viewMode === 'table') {
      const rankName = getRankLabel(activeRank);
      setReportTitle(`SO SÁNH KẾT QUẢ ${categoryName} XẾP LOẠI ${rankName}\nNĂM HỌC ${oldYear} VÀ ${newYear}`);
    } else {
      // Chế độ trình chiếu: Thêm chữ SO SÁNH theo yêu cầu người dùng
      setReportTitle(`SO SÁNH KẾT QUẢ ${categoryName}\nNĂM HỌC ${oldYear} VÀ ${newYear}`);
    }
  }, [activeCategory, activeRank, oldYear, newYear, viewMode]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'old' | 'new') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await parseExcelReport(file);
      const classIds = data.filter(r => r.level === RowLevel.CLASS).map(r => r.id);
      if (type === 'old') {
        setOldReport(data);
        setSelectedIdsOld(new Set(classIds));
        setSidebarTab('old');
      } else {
        setNewReport(data);
        setSelectedIdsNew(new Set(classIds));
        setSidebarTab('new');
      }
    } catch (err) {
      setError("Không thể đọc file. Vui lòng kiểm tra định dạng Excel đúng cấu trúc báo cáo.");
    } finally {
      setLoading(false);
    }
  };

  const toggleClass = (id: string, type: 'old' | 'new') => {
    if (type === 'old') {
      const next = new Set(selectedIdsOld);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectedIdsOld(next);
    } else {
      const next = new Set(selectedIdsNew);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectedIdsNew(next);
    }
  };

  const toggleGrade = (gradeLabel: string, type: 'old' | 'new') => {
    const report = type === 'old' ? oldReport : newReport;
    if (!report) return;
    const ids = report.filter(r => r.level === RowLevel.CLASS && r.grade === gradeLabel).map(c => c.id);
    const currentSet = type === 'old' ? selectedIdsOld : selectedIdsNew;
    const allSelected = ids.every(id => currentSet.has(id));
    const next = new Set(currentSet);
    ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
    if (type === 'old') setSelectedIdsOld(next); else setSelectedIdsNew(next);
  };

  const resetReports = () => {
    setOldReport(null);
    setNewReport(null);
    setSelectedIdsOld(new Set());
    setSelectedIdsNew(new Set());
  };

  const comparisonData = useMemo(() => {
    if (!oldReport || !newReport) return [];
    return recalculateAndCompare(oldReport, newReport, selectedIdsOld, selectedIdsNew, activeCategory, activeRank);
  }, [oldReport, newReport, selectedIdsOld, selectedIdsNew, activeCategory, activeRank]);

  const fullExportData = useMemo(() => {
    if (!oldReport || !newReport) return [];
    return getFullExportData(oldReport, newReport, selectedIdsOld, selectedIdsNew, activeCategory);
  }, [oldReport, newReport, selectedIdsOld, selectedIdsNew, activeCategory]);

  const sidebarOld = useMemo(() => {
    if (!oldReport) return [];
    const grades = Array.from(new Set(oldReport.filter(r => r.level === RowLevel.GRADE).map(r => r.label))).sort();
    return grades.map(g => ({ label: g, classes: oldReport.filter(r => r.level === RowLevel.CLASS && r.grade === g).sort((a,b)=>a.label.localeCompare(b.label, undefined, {numeric:true})) }));
  }, [oldReport]);

  const sidebarNew = useMemo(() => {
    if (!newReport) return [];
    const grades = Array.from(new Set(newReport.filter(r => r.level === RowLevel.GRADE).map(r => r.label))).sort();
    return grades.map(g => ({ label: g, classes: newReport.filter(r => r.level === RowLevel.CLASS && r.grade === g).sort((a,b)=>a.label.localeCompare(b.label, undefined, {numeric:true})) }));
  }, [newReport]);

  const exportAsImage = async (targetRef: React.RefObject<HTMLDivElement | null>, name: string) => {
    if (!targetRef.current) return;
    try {
      setLoading(true);
      const dataUrl = await toPng(targetRef.current, { 
        backgroundColor: '#ffffff', 
        cacheBust: true,
        pixelRatio: 3 
      });
      const link = document.createElement('a');
      link.download = `${name}_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const exportAsPDF = async (targetRef: React.RefObject<HTMLDivElement | null>, name: string) => {
    if (!targetRef.current) return;
    try {
      setLoading(true);
      const canvas = await toPng(targetRef.current, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true });
      const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgProps = pdf.getImageProperties(canvas);
      const ratio = imgProps.width / (pdfWidth - 20);
      pdf.addImage(canvas, 'PNG', 10, 10, pdfWidth - 20, imgProps.height / ratio);
      pdf.save(`${name}_${Date.now()}.pdf`);
    } catch (err) {
      console.error("PDF Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ FULL FIXED EXCEL EXPORT: có tiêu đề + có tăng/giảm SL & TL + không mất số vì merge
  const exportSummaryExcel = () => {
    if (!oldReport || !newReport) return;

    const fullData = fullExportData;
    const wb = XLSX.utils.book_new();

    const ws_data: any[][] = [];
    const merges: XLSX.Range[] = [];
    let currentRow = 0;

    // --- Helpers ---
    const fmtPct = (v: number) => `${(Number.isFinite(v) ? v : 0).toFixed(2)}%`;
    const diffCount = (n: number, o: number) => {
      const d = (Number.isFinite(n) ? n : 0) - (Number.isFinite(o) ? o : 0);
      const sign = d >= 0 ? '+ ' : '- ';
      return sign + Math.abs(d);
    };
    const diffRate = (n: number, o: number) => {
      const d = (Number.isFinite(n) ? n : 0) - (Number.isFinite(o) ? o : 0);
      const sign = d >= 0 ? '+ ' : '- ';
      return sign + Math.abs(d).toFixed(2) + '%';
    };

    // --- 1) TITLE (A1:I1) ---
    const categoryTitle = activeCategory === 'study' ? 'KẾT QUẢ HỌC TẬP' : 'KẾT QUẢ RÈN LUYỆN';
    const title = `${categoryTitle} - SO SÁNH NĂM HỌC ${oldYear} VÀ ${newYear}`;

    ws_data.push([title, null, null, null, null, null, null, null, null]);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 8 } });
    currentRow++;

    // spacer row
    ws_data.push([]);
    currentRow++;

    // --- 2) CONTENT ---
    fullData.forEach((row) => {
      const titleRank1 = 'Tốt (%)';
      const titleRank2 = 'Khá (%)';
      const titleRank3 = 'Đạt (%)';
      const titleRank4 = 'CĐ (%)';

      // Header row (merge each pair)
      ws_data.push([row.label, titleRank1, null, titleRank2, null, titleRank3, null, titleRank4, null]);
      merges.push(
        { s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 2 } },
        { s: { r: currentRow, c: 3 }, e: { r: currentRow, c: 4 } },
        { s: { r: currentRow, c: 5 }, e: { r: currentRow, c: 6 } },
        { s: { r: currentRow, c: 7 }, e: { r: currentRow, c: 8 } }
      );
      currentRow++;

      // Subheader (merge label cell vertically across 2 header rows)
      ws_data.push([null, 'SL', 'TL', 'SL', 'TL', 'SL', 'TL', 'SL', 'TL']);
      merges.push({ s: { r: currentRow - 1, c: 0 }, e: { r: currentRow, c: 0 } });
      currentRow++;

      // New year row
      ws_data.push([
        newYear,
        row.results.good.newCount, fmtPct(row.results.good.newRate),
        row.results.fair.newCount, fmtPct(row.results.fair.newRate),
        row.results.passed.newCount, fmtPct(row.results.passed.newRate),
        row.results.failed.newCount, fmtPct(row.results.failed.newRate),
      ]);
      currentRow++;

      // Old year row
      ws_data.push([
        oldYear,
        row.results.good.oldCount, fmtPct(row.results.good.oldRate),
        row.results.fair.oldCount, fmtPct(row.results.fair.oldRate),
        row.results.passed.oldCount, fmtPct(row.results.passed.oldRate),
        row.results.failed.oldCount, fmtPct(row.results.failed.oldRate),
      ]);
      currentRow++;

      // ✅ Diff row (KHÔNG MERGE - để khỏi mất số)
      ws_data.push([
        'Tăng/giảm',
        diffCount(row.results.good.newCount, row.results.good.oldCount),
        diffRate(row.results.good.newRate, row.results.good.oldRate),

        diffCount(row.results.fair.newCount, row.results.fair.oldCount),
        diffRate(row.results.fair.newRate, row.results.fair.oldRate),

        diffCount(row.results.passed.newCount, row.results.passed.oldCount),
        diffRate(row.results.passed.newRate, row.results.passed.oldRate),

        diffCount(row.results.failed.newCount, row.results.failed.oldCount),
        diffRate(row.results.failed.newRate, row.results.failed.oldRate),
      ]);
      currentRow++;

      // spacer
      ws_data.push([]);
      currentRow++;
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!merges'] = merges;

    // Optional: set column widths for readability
    ws['!cols'] = [
      { wch: 18 }, // label
      { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Bao_Cao_So_Sanh');
    XLSX.writeFile(wb, `Bao_Cao_Doi_Soat_${activeCategory}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-inter">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg">
              <School size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 leading-tight">School Report Comparator</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Dữ liệu đối soát thông minh</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            { (oldReport && newReport) && (
              <div className="flex gap-2 bg-slate-100 p-1 rounded-xl mr-4">
                <button onClick={() => exportAsImage(reportRef, `Bao_Cao_${activeCategory}`)} title="Xuất Toàn Bộ Ảnh" className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><ImageIcon size={18} /></button>
                <button onClick={() => exportAsPDF(reportRef, `Bao_Cao_${activeCategory}`)} title="Xuất Toàn Bộ PDF" className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><FileText size={18} /></button>
                <button onClick={exportSummaryExcel} title="Xuất Excel" className="p-2 hover:bg-white rounded-lg transition-all text-emerald-600"><FileJson size={18} /></button>
              </div>
            )}
            { (oldReport || newReport) && (
              <button onClick={resetReports} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>
        {loading && <div className="h-0.5 bg-indigo-600 animate-pulse w-full"></div>}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!oldReport || !newReport ? (
          <div className="grid md:grid-cols-2 gap-8 py-12">
            <div className={`bg-white p-12 rounded-[3rem] border-2 border-dashed flex flex-col items-center text-center transition-all ${oldReport ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200 hover:border-indigo-400'}`}>
              <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner ${oldReport ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                {oldReport ? <CheckCircle2 size={48} /> : <Upload size={48} />}
              </div>
              <h3 className="text-2xl font-black mb-2 text-slate-800">Dữ Liệu Năm Cũ</h3>
              <p className="text-slate-500 text-sm mb-4">Tải tệp Excel báo cáo của năm học trước.</p>
              <input 
                type="text" 
                value={oldYear} 
                onChange={(e) => setOldYear(e.target.value)} 
                className="mb-6 bg-slate-100 border-none rounded-lg px-4 py-2 text-xs font-bold text-center w-32 focus:ring-2 focus:ring-indigo-500" 
                placeholder="Năm cũ (vd: 2023 - 2024)"
              />
              <label className="cursor-pointer bg-slate-900 text-white px-10 py-4 rounded-2xl font-black hover:bg-indigo-600 transition-all shadow-xl active:scale-95">
                CHỌN FILE
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'old')} />
              </label>
            </div>
            <div className={`bg-white p-12 rounded-[3rem] border-2 border-dashed flex flex-col items-center text-center transition-all ${newReport ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200 hover:border-emerald-400'}`}>
              <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner ${newReport ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                {newReport ? <CheckCircle2 size={48} /> : <Upload size={48} />}
              </div>
              <h3 className="text-2xl font-black mb-2 text-slate-800">Dữ Liệu Năm Mới</h3>
              <p className="text-slate-500 text-sm mb-4">Tải tệp Excel báo cáo của năm học hiện tại.</p>
              <input 
                type="text" 
                value={newYear} 
                onChange={(e) => setNewYear(e.target.value)} 
                className="mb-6 bg-slate-100 border-none rounded-lg px-4 py-2 text-xs font-bold text-center w-32 focus:ring-2 focus:ring-emerald-500" 
                placeholder="Năm mới (vd: 2024 - 2025)"
              />
              <label className="cursor-pointer bg-slate-900 text-white px-10 py-4 rounded-2xl font-black hover:bg-emerald-600 transition-all shadow-xl active:scale-95">
                CHỌN FILE
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'new')} />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[340px_1fr] gap-8">
            <aside className="space-y-6">
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm sticky top-24">
                <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 mb-6">
                  <button onClick={() => setSidebarTab('old')} className={`flex-1 py-2 text-xs font-black uppercase rounded-xl transition-all ${sidebarTab === 'old' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Năm Cũ</button>
                  <button onClick={() => setSidebarTab('new')} className={`flex-1 py-2 text-xs font-black uppercase rounded-xl transition-all ${sidebarTab === 'new' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Năm Mới</button>
                </div>
                <div className="space-y-6 max-h-[calc(100vh-420px)] overflow-y-auto pr-2 custom-scrollbar">
                  {(sidebarTab === 'old' ? sidebarOld : sidebarNew).map(grade => (
                    <div key={grade.label} className="space-y-3">
                      <div onClick={() => toggleGrade(grade.label, sidebarTab)} className="flex items-center justify-between cursor-pointer p-2 rounded-xl hover:bg-slate-50">
                        <span className="text-sm font-extrabold">{grade.label}</span>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${grade.classes.every(c => (sidebarTab === 'old' ? selectedIdsOld : selectedIdsNew).has(c.id)) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                          <CheckCircle2 size={12} strokeWidth={3} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {grade.classes.map(cls => (
                          <button key={cls.id} onClick={() => toggleClass(cls.id, sidebarTab)} className={`px-3 py-2 text-[11px] rounded-xl border-2 transition-all font-bold truncate ${(sidebarTab === 'old' ? selectedIdsOld : selectedIdsNew).has(cls.id) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-100 text-slate-400'}`}>
                            {cls.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <div className="space-y-6">
              <div className="bg-white p-2 rounded-3xl border border-slate-200 flex flex-col md:flex-row items-center gap-4 shadow-sm">
                <div className="bg-slate-100 p-1.5 rounded-[1.25rem] flex gap-1">
                  <button onClick={() => setActiveCategory('conduct')} className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeCategory === 'conduct' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>RÈN LUYỆN</button>
                  <button onClick={() => setActiveCategory('study')} className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeCategory === 'study' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>HỌC TẬP</button>
                </div>
                
                <div className="h-8 w-px bg-slate-200 hidden md:block"></div>

                <div className="bg-slate-100 p-1.5 rounded-[1.25rem] flex gap-1">
                  <button onClick={() => setViewMode('table')} className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'table' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
                    <TableIcon size={14} /> BẢNG CHI TIẾT
                  </button>
                  <button onClick={() => setViewMode('visual')} className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'visual' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
                    <Presentation size={14} /> TRÌNH CHIẾU
                  </button>
                </div>
              </div>

              {viewMode === 'table' ? (
                <div ref={reportRef}>
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm mb-6 group relative">
                    {/* Control Buttons - Outside export area */}
                    <div className="flex justify-end gap-2 mb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => exportAsImage(chartSectionRef, 'Bieu_Do_Doi_Soat')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 flex items-center gap-2 text-[10px] font-bold">
                        <Download size={14} /> TẢI ẢNH BIỂU ĐỒ
                      </button>
                      <button onClick={() => exportAsPDF(chartSectionRef, 'Bieu_Do_Doi_Soat')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 flex items-center gap-2 text-[10px] font-bold">
                        <FileText size={14} /> TẢI PDF BIỂU ĐỒ
                      </button>
                    </div>

                    <div ref={chartSectionRef} className="p-10 rounded-3xl bg-white flex flex-col items-center">
                       {/* Title Area with enhanced spacing for diacritics */}
                       <div className="text-center w-full max-w-4xl mb-10 pt-10">
                          <textarea
                            value={reportTitle}
                            onChange={(e) => setReportTitle(e.target.value)}
                            className="w-full text-2xl md:text-3xl font-black text-slate-900 bg-transparent border-none focus:ring-0 resize-none text-center uppercase outline-none vietnamese-title"
                            style={{ lineHeight: '1.6', overflow: 'hidden' }}
                            rows={3}
                            placeholder="Nhập tiêu đề báo cáo..."
                          />
                          <div className="w-32 h-1.5 bg-indigo-600 mx-auto rounded-full mt-4"></div>
                       </div>
                       
                      <SummaryChart data={comparisonData} oldYear={oldYear} newYear={newYear} />
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                      {(['good', 'fair', 'passed', 'failed'] as Rank[]).map(r => (
                        <button key={r} onClick={() => setActiveRank(r)} className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeRank === r ? 'bg-slate-900 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-400'}`}>
                          {r === 'good' ? 'Tốt' : r === 'fair' ? 'Khá' : r === 'passed' ? 'Đạt' : 'CĐ'}
                        </button>
                      ))}
                    </div>
                    <ComparisonTable data={comparisonData} category={activeCategory} rank={activeRank} />
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 bg-slate-50 p-4 rounded-[2rem]" ref={reportRef}>
                   <div className="bg-white p-12 rounded-[2.5rem] mb-10 text-center shadow-xl pt-20 pb-16">
                      <h1 className="text-4xl font-black text-slate-900 mb-6 whitespace-pre-wrap uppercase text-center leading-relaxed px-4 vietnamese-title">
                        {reportTitle}
                      </h1>
                      <div className="w-24 h-2 bg-indigo-600 mx-auto rounded-full"></div>
                   </div>
                   <VisualReport data={fullExportData} oldYear={oldYear} newYear={newYear} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
