import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Upload, FileText, CheckCircle2, ChevronRight, BarChart3, Settings2, Trash2, TrendingUp, Users, LayoutList, Download, PieChart, Calendar, Presentation, Table as TableIcon, Image as ImageIcon, FileJson, School, Edit3, Type } from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import * as docx from 'docx';
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
  
  const [oldYear, setOldYear] = useState('2024 - 2025');
  const [newYear, setNewYear] = useState('2025 - 2026');
  const [reportTitle, setReportTitle] = useState('');

  const reportRef = useRef<HTMLDivElement>(null);
  const chartSectionRef = useRef<HTMLDivElement>(null);

  const getRankLabel = (r: Rank) => {
    switch(r) {
      case 'good': return 'TỐT';
      case 'fair': return 'KHÁ';
      case 'passed': return 'ĐẠT';
      case 'failed': return 'CHƯA ĐẠT (CĐ)';
      default: return '';
    }
  };

  useEffect(() => {
    const categoryName = activeCategory === 'study' ? 'HỌC TẬP' : 'RÈN LUYỆN';
    if (viewMode === 'table') {
      const rankName = getRankLabel(activeRank);
      setReportTitle(`SO SÁNH KẾT QUẢ ${categoryName} XẾP LOẠI ${rankName}\nNĂM HỌC ${oldYear} VÀ ${newYear}`);
    } else {
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
      const dataUrl = await toPng(targetRef.current, { backgroundColor: '#ffffff', cacheBust: true, pixelRatio: 3 });
      const link = document.createElement('a');
      link.download = `${name}_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) { console.error("Export Error:", err); } finally { setLoading(false); }
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
    } catch (err) { console.error("PDF Error:", err); } finally { setLoading(false); }
  };

  // ✅ EXCEL EXPORT NÂNG CẤP KẺ KHUNG & TÔ MÀU (Dùng ExcelJS)
  const exportSummaryExcel = async () => {
    if (!oldReport || !newReport) return;
    try {
      setLoading(true);
      const fullData = fullExportData;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Bao_Cao_So_Sanh');

      const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      const blueFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F0F8' } };
      const thinBorder: ExcelJS.Borders = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
      const boldFont: ExcelJS.Font = { name: 'Times New Roman', size: 11, bold: true };
      const normalFont: ExcelJS.Font = { name: 'Times New Roman', size: 11 };
      const titleFont: ExcelJS.Font = { name: 'Times New Roman', size: 14, bold: true };

      const categoryTitle = activeCategory === 'study' ? 'KẾT QUẢ HỌC TẬP' : 'KẾT QUẢ RÈN LUYỆN';
      ws.mergeCells('A1:N1');
      const titleCell = ws.getCell('A1');
      titleCell.value = `BÁO CÁO SO SÁNH ${categoryTitle}`;
      titleCell.font = titleFont;
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells('A2:N2');
      const subTitleCell = ws.getCell('A2');
      subTitleCell.value = `Năm học ${newYear} so với ${oldYear}`;
      subTitleCell.font = { name: 'Times New Roman', size: 11, italic: true };
      subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells('A4:A5'); ws.getCell('A4').value = 'Đơn vị / Lớp';
      ws.mergeCells('B4:B5'); ws.getCell('B4').value = 'Sĩ số\n(Năm nay)';
      
      ws.mergeCells('C4:E4'); ws.getCell('C4').value = 'KẾT QUẢ TỐT';
      ws.mergeCells('F4:H4'); ws.getCell('F4').value = 'KẾT QUẢ KHÁ';
      ws.mergeCells('I4:K4'); ws.getCell('I4').value = 'KẾT QUẢ ĐẠT';
      ws.mergeCells('L4:N4'); ws.getCell('L4').value = 'CHƯA ĐẠT';

      const subHeaders = ['Năm trước', 'Năm nay', '+/- %'];
      let colIdx = 3;
      for (let i = 0; i < 4; i++) {
        ws.getCell(5, colIdx).value = subHeaders[0];
        ws.getCell(5, colIdx + 1).value = subHeaders[1];
        ws.getCell(5, colIdx + 2).value = subHeaders[2];
        colIdx += 3;
      }

      for (let r = 4; r <= 5; r++) {
        for (let c = 1; c <= 14; c++) {
          const cell = ws.getCell(r, c);
          cell.font = boldFont;
          cell.fill = headerFill;
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = thinBorder;
        }
      }

      let currentRow = 6;
      fullData.forEach(row => {
        const trData = row.results;
        const totalNew = row.totalNew;

        const r = ws.getRow(currentRow);
        r.getCell(1).value = row.label;
        r.getCell(2).value = totalNew;

        r.getCell(3).value = trData.good.oldRate / 100;
        r.getCell(4).value = trData.good.newRate / 100;
        r.getCell(5).value = (trData.good.newRate - trData.good.oldRate) / 100;

        r.getCell(6).value = trData.fair.oldRate / 100;
        r.getCell(7).value = trData.fair.newRate / 100;
        r.getCell(8).value = (trData.fair.newRate - trData.fair.oldRate) / 100;

        r.getCell(9).value = trData.passed.oldRate / 100;
        r.getCell(10).value = trData.passed.newRate / 100;
        r.getCell(11).value = (trData.passed.newRate - trData.passed.oldRate) / 100;

        r.getCell(12).value = trData.failed.oldRate / 100;
        r.getCell(13).value = trData.failed.newRate / 100;
        r.getCell(14).value = (trData.failed.newRate - trData.failed.oldRate) / 100;

        const isGroup = row.label.includes('TOÀN TRƯỜNG') || row.label.includes('KHỐI');
        const isSchool = row.label.includes('TOÀN TRƯỜNG');
        
        for (let c = 1; c <= 14; c++) {
          const cell = r.getCell(c);
          cell.border = thinBorder;
          cell.font = isGroup ? boldFont : normalFont;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          
          if (c === 1) cell.alignment = { horizontal: 'left', vertical: 'middle' };
          if (isSchool) cell.fill = blueFill;

          if (c >= 3) {
            cell.numFmt = '0.00%';
            if ([5, 8, 11, 14].includes(c)) {
              const val = cell.value as number;
              if (val > 0) cell.font = { ...cell.font, color: { argb: 'FF008000' } };
              else if (val < 0) cell.font = { ...cell.font, color: { argb: 'FFFF0000' } };
            }
          }
        }
        currentRow++;
      });

      ws.getColumn(1).width = 25;
      for (let c = 2; c <= 14; c++) ws.getColumn(c).width = 12;

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Bao_Cao_Doi_Soat_${activeCategory}.xlsx`);
    } catch (err) {
      console.error(err);
      setError("Có lỗi khi xuất file Excel.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ WORD EXPORT NÂNG CẤP KẺ KHUNG (Dùng DOCX)
  const exportSummaryWord = async () => {
    if (!oldReport || !newReport) return;
    try {
      setLoading(true);
      const fullData = fullExportData;
      const categoryTitle = activeCategory === 'study' ? 'KẾT QUẢ HỌC TẬP' : 'KẾT QUẢ RÈN LUYỆN';

      const createHeaderCell = (text: string, rowSpan = 1, colSpan = 1) => new docx.TableCell({
          children: [new docx.Paragraph({ text, alignment: docx.AlignmentType.CENTER, style: "HeaderStyle" })],
          rowSpan, columnSpan: colSpan, verticalAlign: docx.VerticalAlign.CENTER,
          shading: { fill: "F2F2F2" }
      });

      const doc = new docx.Document({
          styles: {
              paragraphStyles: [
                  { id: "HeaderStyle", name: "Header Style", basedOn: "Normal", next: "Normal", run: { bold: true, font: "Times New Roman", size: 20 } },
                  { id: "DataStyle", name: "Data Style", basedOn: "Normal", next: "Normal", run: { font: "Times New Roman", size: 20 } },
              ]
          },
          sections: [{
              properties: { page: { margin: { top: 700, right: 700, bottom: 700, left: 700 }, size: { orientation: docx.PageOrientation.LANDSCAPE } } },
              children: [
                  new docx.Paragraph({
                      alignment: docx.AlignmentType.CENTER,
                      children: [new docx.TextRun({ text: `BÁO CÁO SO SÁNH ${categoryTitle}`, bold: true, size: 28, font: "Times New Roman" })]
                  }),
                  new docx.Paragraph({
                      alignment: docx.AlignmentType.CENTER,
                      children: [new docx.TextRun({ text: `Năm học ${newYear} so với ${oldYear}`, italics: true, size: 22, font: "Times New Roman" })],
                      spacing: { after: 300 }
                  }),
                  new docx.Table({
                      width: { size: 100, type: docx.WidthType.PERCENTAGE },
                      rows: [
                          new docx.TableRow({
                              children: [
                                  createHeaderCell("Đơn vị/Lớp", 2, 1),
                                  createHeaderCell("Sĩ số", 2, 1),
                                  createHeaderCell("KẾT QUẢ TỐT", 1, 3),
                                  createHeaderCell("KẾT QUẢ KHÁ", 1, 3),
                                  createHeaderCell("KẾT QUẢ ĐẠT", 1, 3),
                                  createHeaderCell("CHƯA ĐẠT", 1, 3),
                              ]
                          }),
                          new docx.TableRow({
                              children: [
                                  ...['Năm trước', 'Năm nay', '+/- %', 'Năm trước', 'Năm nay', '+/- %', 'Năm trước', 'Năm nay', '+/- %', 'Năm trước', 'Năm nay', '+/- %'].map(t => createHeaderCell(t))
                              ]
                          }),
                          ...fullData.map(row => {
                              const isBold = row.label.includes('TOÀN TRƯỜNG') || row.label.includes('KHỐI');
                              const isSchool = row.label.includes('TOÀN TRƯỜNG');
                              
                              const createCell = (val: string, color?: string, align = docx.AlignmentType.CENTER) => new docx.TableCell({
                                  children: [new docx.Paragraph({
                                      alignment: align,
                                      children: [new docx.TextRun({ text: val, bold: isBold, color: color, font: "Times New Roman", size: 20 })]
                                  })],
                                  shading: isSchool ? { fill: "E9F0F8" } : undefined,
                                  verticalAlign: docx.VerticalAlign.CENTER
                              });

                              const trData = row.results;
                              const getDiffColor = (diff: number) => diff > 0 ? "008000" : diff < 0 ? "FF0000" : "000000";
                              const getDiffStr = (diff: number) => diff > 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
                              
                              return new docx.TableRow({
                                  children: [
                                      createCell(row.label, undefined, docx.AlignmentType.LEFT),
                                      createCell(row.totalNew.toString()),
                                      createCell(trData.good.oldRate.toFixed(2) + '%'),
                                      createCell(trData.good.newRate.toFixed(2) + '%'),
                                      createCell(getDiffStr(trData.good.newRate - trData.good.oldRate), getDiffColor(trData.good.newRate - trData.good.oldRate)),
                                      createCell(trData.fair.oldRate.toFixed(2) + '%'),
                                      createCell(trData.fair.newRate.toFixed(2) + '%'),
                                      createCell(getDiffStr(trData.fair.newRate - trData.fair.oldRate), getDiffColor(trData.fair.newRate - trData.fair.oldRate)),
                                      createCell(trData.passed.oldRate.toFixed(2) + '%'),
                                      createCell(trData.passed.newRate.toFixed(2) + '%'),
                                      createCell(getDiffStr(trData.passed.newRate - trData.passed.oldRate), getDiffColor(trData.passed.newRate - trData.passed.oldRate)),
                                      createCell(trData.failed.oldRate.toFixed(2) + '%'),
                                      createCell(trData.failed.newRate.toFixed(2) + '%'),
                                      createCell(getDiffStr(trData.failed.newRate - trData.failed.oldRate), getDiffColor(trData.failed.newRate - trData.failed.oldRate)),
                                  ]
                              });
                          })
                      ]
                  })
              ]
          }]
      });
      
      const blob = await docx.Packer.toBlob(doc);
      saveAs(blob, `Bao_Cao_Doi_Soat_${activeCategory}.docx`);
    } catch (error) {
      console.error("Lỗi xuất Word:", error);
      setError("Không thể xuất file Word.");
    } finally {
      setLoading(false);
    }
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
                <button onClick={exportSummaryExcel} title="Xuất Excel Chuẩn Form" className="p-2 hover:bg-white rounded-lg transition-all text-emerald-600 flex items-center gap-1 font-bold text-xs"><FileJson size={18} /> EXCEL</button>
                <button onClick={exportSummaryWord} title="Xuất Word Chuẩn Form" className="p-2 hover:bg-white rounded-lg transition-all text-blue-600 flex items-center gap-1 font-bold text-xs"><FileText size={18} /> WORD</button>
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
                placeholder="Năm cũ (vd: 2024 - 2025)"
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
                placeholder="Năm mới (vd: 2025 - 2026)"
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
                    <div className="flex justify-end gap-2 mb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => exportAsImage(chartSectionRef, 'Bieu_Do_Doi_Soat')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 flex items-center gap-2 text-[10px] font-bold">
                        <Download size={14} /> TẢI ẢNH BIỂU ĐỒ
                      </button>
                      <button onClick={() => exportAsPDF(chartSectionRef, 'Bieu_Do_Doi_Soat')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 flex items-center gap-2 text-[10px] font-bold">
                        <FileText size={14} /> TẢI PDF BIỂU ĐỒ
                      </button>
                    </div>

                    <div ref={chartSectionRef} className="p-10 rounded-3xl bg-white flex flex-col items-center">
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
