import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Upload, FileText, CheckCircle2, ChevronRight, BarChart3, Settings2, Trash2, TrendingUp, Users, LayoutList, Download, PieChart, Calendar, Presentation, Table as TableIcon, Image as ImageIcon, FileJson, School, Edit3, Type } from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import * as docx from 'docx';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { RawRowData, RowLevel, ComparisonRow, Category, Rank, MetricSet } from './types';
import { parseExcelReport } from './services/excelService';
import { recalculateAndCompare } from './services/aggregatorService';
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
  
  const [oldYear, setOldYear] = useState('2024-2025');
  const [newYear, setNewYear] = useState('2025-2026');
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

  // HÀM TẠO DỮ LIỆU ĐẦY ĐỦ CHI TIẾT TỪNG LỚP & TỪNG KHỐI CHO EXPORT
  const getFullDataMatrix = useCallback(() => {
    if (!oldReport || !newReport) return { school: null, grades: [] };
    
    const oldClasses = oldReport.filter(r => r.level === RowLevel.CLASS && selectedIdsOld.has(r.id));
    const newClasses = newReport.filter(r => r.level === RowLevel.CLASS && selectedIdsNew.has(r.id));
    const allGrades = Array.from(new Set([...oldClasses.map(c => c.grade || 'KHÁC'), ...newClasses.map(c => c.grade || 'KHÁC')])).sort();

    const calcMetrics = (oClasses: RawRowData[], nClasses: RawRowData[]) => {
      const oTotal = oClasses.reduce((s, c) => s + c.totalStudents, 0);
      const nTotal = nClasses.reduce((s, c) => s + c.totalStudents, 0);
      const getOSum = (rk: keyof MetricSet) => oClasses.reduce((s, c) => s + c[activeCategory][rk], 0);
      const getNSum = (rk: keyof MetricSet) => nClasses.reduce((s, c) => s + c[activeCategory][rk], 0);
      
      return {
        totalNew: nTotal,
        results: {
          good: { oldRate: oTotal > 0 ? (getOSum('goodCount')/oTotal)*100 : 0, newRate: nTotal > 0 ? (getNSum('goodCount')/nTotal)*100 : 0 },
          fair: { oldRate: oTotal > 0 ? (getOSum('fairCount')/oTotal)*100 : 0, newRate: nTotal > 0 ? (getNSum('fairCount')/nTotal)*100 : 0 },
          passed: { oldRate: oTotal > 0 ? (getOSum('passedCount')/oTotal)*100 : 0, newRate: nTotal > 0 ? (getNSum('passedCount')/nTotal)*100 : 0 },
          failed: { oldRate: oTotal > 0 ? (getOSum('failedCount')/oTotal)*100 : 0, newRate: nTotal > 0 ? (getNSum('failedCount')/nTotal)*100 : 0 },
        }
      };
    };

    const school = { label: 'TOÀN TRƯỜNG', isTotal: true, ...calcMetrics(oldClasses, newClasses) };
    
    const grades = allGrades.map(g => {
      const oGrade = oldClasses.filter(c => (c.grade || 'KHÁC') === g);
      const nGrade = newClasses.filter(c => (c.grade || 'KHÁC') === g);
      const classLabels = Array.from(new Set([...oGrade.map(c=>c.label), ...nGrade.map(c=>c.label)])).sort((a,b)=>a.localeCompare(b, undefined, {numeric: true}));
      
      const classes = classLabels.map(cl => {
         const oc = oGrade.filter(c => c.label === cl);
         const nc = nGrade.filter(c => c.label === cl);
         return { label: cl, isTotal: false, ...calcMetrics(oc, nc) };
      });

      return {
         label: g,
         isTotal: true,
         ...calcMetrics(oGrade, nGrade),
         classes
      };
    });

    return { school, grades };
  }, [oldReport, newReport, selectedIdsOld, selectedIdsNew, activeCategory]);

  const exportAsImage = async (targetRef: React.RefObject<HTMLDivElement | null>, name: string) => { /*... giữ nguyên ...*/ };
  const exportAsPDF = async (targetRef: React.RefObject<HTMLDivElement | null>, name: string) => { /*... giữ nguyên ...*/ };

  // ✅ EXCEL EXPORT - CHIA TỪNG BẢNG CHO TỪNG KHỐI (A4 DỌC)
  const exportSummaryExcel = async () => {
    if (!oldReport || !newReport) return;
    try {
      setLoading(true);
      const matrix = getFullDataMatrix();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Bao_Cao_So_Sanh');

      ws.pageSetup = {
        paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.2, right: 0.2, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
      };

      const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      const blueFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F0F8' } };
      const thinBorder: ExcelJS.Borders = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      const boldFont: ExcelJS.Font = { name: 'Times New Roman', size: 10, bold: true };
      const normalFont: ExcelJS.Font = { name: 'Times New Roman', size: 10 };
      const titleFont: ExcelJS.Font = { name: 'Times New Roman', size: 14, bold: true };

      const categoryTitle = activeCategory === 'study' ? 'KẾT QUẢ HỌC TẬP' : 'KẾT QUẢ RÈN LUYỆN';
      ws.mergeCells('A1:N1');
      ws.getCell('A1').value = `BÁO CÁO SO SÁNH ${categoryTitle}`;
      ws.getCell('A1').font = titleFont;
      ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells('A2:N2');
      ws.getCell('A2').value = `Năm học ${newYear} so với ${oldYear}`;
      ws.getCell('A2').font = { name: 'Times New Roman', size: 11, italic: true };
      ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

      let currentRow = 4;

      const drawTable = (title: string, dataRows: any[]) => {
        // Tên Khối
        ws.mergeCells(`A${currentRow}:N${currentRow}`);
        ws.getCell(`A${currentRow}`).value = title;
        ws.getCell(`A${currentRow}`).font = { name: 'Times New Roman', size: 12, bold: true };
        currentRow++;

        // Header dòng 1
        ws.mergeCells(`A${currentRow}:A${currentRow+1}`); ws.getCell(`A${currentRow}`).value = 'Đơn vị/Lớp';
        ws.mergeCells(`B${currentRow}:B${currentRow+1}`); ws.getCell(`B${currentRow}`).value = `Sĩ số\n(${newYear})`;
        ws.mergeCells(`C${currentRow}:E${currentRow}`); ws.getCell(`C${currentRow}`).value = 'TỐT (%)';
        ws.mergeCells(`F${currentRow}:H${currentRow}`); ws.getCell(`F${currentRow}`).value = 'KHÁ (%)';
        ws.mergeCells(`I${currentRow}:K${currentRow}`); ws.getCell(`I${currentRow}`).value = 'ĐẠT (%)';
        ws.mergeCells(`L${currentRow}:N${currentRow}`); ws.getCell(`L${currentRow}`).value = 'CĐ (%)';

        // Header dòng 2
        let colIdx = 3;
        for (let i = 0; i < 4; i++) {
          ws.getCell(currentRow+1, colIdx).value = oldYear;
          ws.getCell(currentRow+1, colIdx + 1).value = newYear;
          ws.getCell(currentRow+1, colIdx + 2).value = '+/-';
          colIdx += 3;
        }

        // Style Header
        for (let r = currentRow; r <= currentRow + 1; r++) {
          for (let c = 1; c <= 14; c++) {
            const cell = ws.getCell(r, c);
            cell.font = boldFont; cell.fill = headerFill; cell.border = thinBorder;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          }
        }
        currentRow += 2;

        // Data
        dataRows.forEach(row => {
          const r = ws.getRow(currentRow);
          const tr = row.results;
          r.getCell(1).value = row.label; r.getCell(2).value = row.totalNew;
          
          r.getCell(3).value = tr.good.oldRate / 100; r.getCell(4).value = tr.good.newRate / 100; r.getCell(5).value = (tr.good.newRate - tr.good.oldRate) / 100;
          r.getCell(6).value = tr.fair.oldRate / 100; r.getCell(7).value = tr.fair.newRate / 100; r.getCell(8).value = (tr.fair.newRate - tr.fair.oldRate) / 100;
          r.getCell(9).value = tr.passed.oldRate / 100; r.getCell(10).value = tr.passed.newRate / 100; r.getCell(11).value = (tr.passed.newRate - tr.passed.oldRate) / 100;
          r.getCell(12).value = tr.failed.oldRate / 100; r.getCell(13).value = tr.failed.newRate / 100; r.getCell(14).value = (tr.failed.newRate - tr.failed.oldRate) / 100;

          for (let c = 1; c <= 14; c++) {
            const cell = r.getCell(c);
            cell.border = thinBorder;
            cell.font = row.isTotal ? boldFont : normalFont;
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (c === 1) cell.alignment = { horizontal: 'left', vertical: 'middle' };
            if (row.isTotal) cell.fill = blueFill;

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
        currentRow += 1; // Khoảng trống giữa các khối
      };

      // VẼ BẢNG TOÀN TRƯỜNG
      drawTable('I. TỔNG HỢP TOÀN TRƯỜNG', [matrix.school]);
      
      // VẼ TỪNG BẢNG KHỐI
      ws.getCell(`A${currentRow}`).value = 'II. CHI TIẾT CÁC KHỐI';
      ws.getCell(`A${currentRow}`).font = { name: 'Times New Roman', size: 12, bold: true, italic: true };
      currentRow++;
      
      matrix.grades.forEach((g, idx) => {
        const rows = [...g.classes, { ...g, label: `Tổng ${g.label}` }];
        drawTable(`${idx + 1}. ${g.label.toUpperCase()}`, rows);
      });

      ws.getColumn(1).width = 18; ws.getColumn(2).width = 6;
      for (let c = 3; c <= 14; c++) ws.getColumn(c).width = 7.5;

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Bao_Cao_So_Sanh_${activeCategory}.xlsx`);
    } catch (err) { setError("Có lỗi khi xuất Excel."); } finally { setLoading(false); }
  };

  // ✅ WORD EXPORT - CHIA TỪNG BẢNG CHO TỪNG KHỐI (A4 DỌC CHUẨN)
  const exportSummaryWord = async () => {
    if (!oldReport || !newReport) return;
    try {
      setLoading(true);
      const matrix = getFullDataMatrix();
      const categoryTitle = activeCategory === 'study' ? 'KẾT QUẢ HỌC TẬP' : 'KẾT QUẢ RÈN LUYỆN';

      const createHeaderCell = (text: string, rowSpan = 1, colSpan = 1) => new docx.TableCell({
          children: [new docx.Paragraph({ text, alignment: docx.AlignmentType.CENTER, style: "HeaderStyle" })],
          rowSpan, columnSpan: colSpan, verticalAlign: docx.VerticalAlign.CENTER,
          shading: { fill: "F2F2F2" }, margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      const createTableDocx = (dataRows: any[]) => {
        return new docx.Table({
            width: { size: 100, type: docx.WidthType.PERCENTAGE },
            rows: [
                new docx.TableRow({
                    children: [
                        createHeaderCell("Lớp", 2, 1), createHeaderCell(`Sĩ số\n(${newYear})`, 2, 1),
                        createHeaderCell("TỐT (%)", 1, 3), createHeaderCell("KHÁ (%)", 1, 3),
                        createHeaderCell("ĐẠT (%)", 1, 3), createHeaderCell("CĐ (%)", 1, 3),
                    ]
                }),
                new docx.TableRow({
                    children: [
                        ...[oldYear, newYear, '+/-', oldYear, newYear, '+/-', oldYear, newYear, '+/-', oldYear, newYear, '+/-'].map(t => createHeaderCell(t))
                    ]
                }),
                ...dataRows.map(row => {
                    const createCell = (val: string, color?: string, align = docx.AlignmentType.CENTER) => new docx.TableCell({
                        children: [new docx.Paragraph({
                            alignment: align,
                            children: [new docx.TextRun({ text: val, bold: row.isTotal, color: color, font: "Times New Roman", size: 18 })]
                        })],
                        shading: row.isTotal ? { fill: "E9F0F8" } : undefined,
                        verticalAlign: docx.VerticalAlign.CENTER, margins: { top: 40, bottom: 40, left: 40, right: 40 }
                    });

                    const tr = row.results;
                    const getDiffColor = (diff: number) => diff > 0 ? "008000" : diff < 0 ? "FF0000" : "000000";
                    const getDiffStr = (diff: number) => diff > 0 ? `+${diff.toFixed(1)}` : `${diff.toFixed(1)}`;
                    
                    return new docx.TableRow({
                        children: [
                            createCell(row.label, undefined, docx.AlignmentType.LEFT),
                            createCell(row.totalNew.toString()),
                            createCell(tr.good.oldRate.toFixed(1)), createCell(tr.good.newRate.toFixed(1)), createCell(getDiffStr(tr.good.newRate - tr.good.oldRate), getDiffColor(tr.good.newRate - tr.good.oldRate)),
                            createCell(tr.fair.oldRate.toFixed(1)), createCell(tr.fair.newRate.toFixed(1)), createCell(getDiffStr(tr.fair.newRate - tr.fair.oldRate), getDiffColor(tr.fair.newRate - tr.fair.oldRate)),
                            createCell(tr.passed.oldRate.toFixed(1)), createCell(tr.passed.newRate.toFixed(1)), createCell(getDiffStr(tr.passed.newRate - tr.passed.oldRate), getDiffColor(tr.passed.newRate - tr.passed.oldRate)),
                            createCell(tr.failed.oldRate.toFixed(1)), createCell(tr.failed.newRate.toFixed(1)), createCell(getDiffStr(tr.failed.newRate - tr.failed.oldRate), getDiffColor(tr.failed.newRate - tr.failed.oldRate)),
                        ]
                    });
                })
            ]
        });
      };

      const docChildren: any[] = [
        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: `BÁO CÁO SO SÁNH ${categoryTitle}`, bold: true, size: 28, font: "Times New Roman" })] }),
        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: `Năm học ${newYear} so với ${oldYear}`, italics: true, size: 22, font: "Times New Roman" })], spacing: { after: 300 } }),
        
        new docx.Paragraph({ children: [new docx.TextRun({ text: "I. TỔNG HỢP TOÀN TRƯỜNG", bold: true, size: 24, font: "Times New Roman" })], spacing: { before: 200, after: 100 } }),
        createTableDocx([matrix.school]),
        
        new docx.Paragraph({ children: [new docx.TextRun({ text: "II. CHI TIẾT CÁC KHỐI", bold: true, size: 24, font: "Times New Roman" })], spacing: { before: 400, after: 100 } }),
      ];

      matrix.grades.forEach((g, idx) => {
        docChildren.push(new docx.Paragraph({ children: [new docx.TextRun({ text: `${idx + 1}. ${g.label.toUpperCase()}`, bold: true, size: 20, font: "Times New Roman" })], spacing: { before: 200, after: 100 } }));
        docChildren.push(createTableDocx([...g.classes, { ...g, label: `Tổng ${g.label}` }]));
      });

      const doc = new docx.Document({
          styles: { paragraphStyles: [{ id: "HeaderStyle", name: "Header Style", basedOn: "Normal", run: { bold: true, font: "Times New Roman", size: 16 } }] },
          sections: [{
              properties: { page: { margin: { top: 720, right: 400, bottom: 720, left: 400 }, size: { orientation: docx.PageOrientation.PORTRAIT } } },
              children: docChildren
          }]
      });
      
      const blob = await docx.Packer.toBlob(doc);
      saveAs(blob, `Bao_Cao_So_Sanh_${activeCategory}.docx`);
    } catch (error) { setError("Không thể xuất file Word."); } finally { setLoading(false); }
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
              <div className="flex flex-col gap-2 mb-6">
                <span className="text-[10px] font-bold text-slate-400 uppercase">NHẬP NĂM HỌC CŨ</span>
                <input 
                  type="text" 
                  value={oldYear} 
                  onChange={(e) => setOldYear(e.target.value)} 
                  className="bg-slate-100 border-none rounded-lg px-4 py-2 text-xs font-bold text-center w-40 focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
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
              <div className="flex flex-col gap-2 mb-6">
                <span className="text-[10px] font-bold text-slate-400 uppercase">NHẬP NĂM HỌC MỚI</span>
                <input 
                  type="text" 
                  value={newYear} 
                  onChange={(e) => setNewYear(e.target.value)} 
                  className="bg-slate-100 border-none rounded-lg px-4 py-2 text-xs font-bold text-center w-40 focus:ring-2 focus:ring-emerald-500" 
                />
              </div>
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
