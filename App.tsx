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

  const getFullMatrix = useCallback(() => {
    if (!oldReport || !newReport) return { school: null, grades: [] };
    const oldClasses = oldReport.filter(r => r.level === RowLevel.CLASS && selectedIdsOld.has(r.id));
    const newClasses = newReport.filter(r => r.level === RowLevel.CLASS && selectedIdsNew.has(r.id));
    const allGrades = Array.from(new Set([...oldClasses.map(c => c.grade || 'KHÁC'), ...newClasses.map(c => c.grade || 'KHÁC')])).sort();

    const calc = (oCls: RawRowData[], nCls: RawRowData[]) => {
      const oT = oCls.reduce((s, c) => s + c.totalStudents, 0);
      const nT = nCls.reduce((s, c) => s + c.totalStudents, 0);
      const getSum = (data: RawRowData[], rk: keyof MetricSet) => data.reduce((s, c) => s + c[activeCategory][rk], 0);
      return {
        totalOld: oT,
        totalNew: nT,
        metrics: {
          good: { oSL: getSum(oCls, 'goodCount'), oTL: oT > 0 ? (getSum(oCls, 'goodCount')/oT)*100 : 0, nSL: getSum(nCls, 'goodCount'), nTL: nT > 0 ? (getSum(nCls, 'goodCount')/nT)*100 : 0 },
          fair: { oSL: getSum(oCls, 'fairCount'), oTL: oT > 0 ? (getSum(oCls, 'fairCount')/oT)*100 : 0, nSL: getSum(nCls, 'fairCount'), nTL: nT > 0 ? (getSum(nCls, 'fairCount')/nT)*100 : 0 },
          passed: { oSL: getSum(oCls, 'passedCount'), oTL: oT > 0 ? (getSum(oCls, 'passedCount')/oT)*100 : 0, nSL: getSum(nCls, 'passedCount'), nTL: nT > 0 ? (getSum(nCls, 'passedCount')/nT)*100 : 0 },
          failed: { oSL: getSum(oCls, 'failedCount'), oTL: oT > 0 ? (getSum(oCls, 'failedCount')/oT)*100 : 0, nSL: getSum(nCls, 'failedCount'), nTL: nT > 0 ? (getSum(nCls, 'failedCount')/nT)*100 : 0 },
        }
      };
    };

    const school = { label: 'TOÀN TRƯỜNG', isGroup: true, ...calc(oldClasses, newClasses) };
    const grades = allGrades.map(g => {
      const og = oldClasses.filter(c => (c.grade || 'KHÁC') === g);
      const ng = newClasses.filter(c => (c.grade || 'KHÁC') === g);
      const clsLabels = Array.from(new Set([...og.map(c=>c.label), ...ng.map(c=>c.label)])).sort((a,b)=>a.localeCompare(b, undefined, {numeric: true}));
      return {
        label: g, isGroup: true, ...calc(og, ng),
        classes: clsLabels.map(cl => ({ label: cl, isGroup: false, ...calc(og.filter(c=>c.label===cl), ng.filter(c=>c.label===cl)) }))
      };
    });
    return { school, grades };
  }, [oldReport, newReport, selectedIdsOld, selectedIdsNew, activeCategory]);

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

  // ✅ EXCEL MẪU 2 - NÂNG CẤP GỘP TIÊU ĐỀ (MERGE & SPLIT)
  const exportSummaryExcelMẫu2 = async () => {
    if (!oldReport || !newReport) return;
    try {
      setLoading(true);
      const matrix = getFullMatrix();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Báo Cáo Đối Soát');

      ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, margins: { left: 0.2, right: 0.2, top: 0.5, bottom: 0.5 } };
      const border: ExcelJS.Borders = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F0F8' } };
      const subHeaderFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

      ws.mergeCells('A1:J1');
      ws.getCell('A1').value = `BÁO CÁO SO SÁNH ${activeCategory === 'study' ? 'HỌC TẬP' : 'RÈN LUYỆN'}`;
      ws.getCell('A1').font = { name: 'Times New Roman', size: 16, bold: true };
      ws.getCell('A1').alignment = { horizontal: 'center' };

      let currRow = 3;

      const drawBlock = (title: string, data: any) => {
        ws.mergeCells(`A${currRow}:J${currRow}`);
        ws.getCell(`A${currRow}`).value = title;
        ws.getCell(`A${currRow}`).font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF0000FF' } };
        currRow++;

        // Hàng Tiêu Đề 1 (Gộp ô ngang cho các loại)
        ws.mergeCells(`A${currRow}:A${currRow+1}`); ws.getCell(`A${currRow}`).value = 'Năm học';
        ws.mergeCells(`B${currRow}:B${currRow+1}`); ws.getCell(`B${currRow}`).value = 'Tổng số HS';
        ws.mergeCells(`C${currRow}:D${currRow}`); ws.getCell(`C${currRow}`).value = 'TỐT';
        ws.mergeCells(`E${currRow}:F${currRow}`); ws.getCell(`E${currRow}`).value = 'KHÁ';
        ws.mergeCells(`G${currRow}:H${currRow}`); ws.getCell(`G${currRow}`).value = 'ĐẠT';
        ws.mergeCells(`I${currRow}:J${currRow}`); ws.getCell(`I${currRow}`).value = 'CĐ';

        // Hàng Tiêu Đề 2 (Chia nhỏ SL và Tỉ lệ)
        const subHeaders = ['SL', 'TL (%)', 'SL', 'TL (%)', 'SL', 'TL (%)', 'SL', 'TL (%)'];
        subHeaders.forEach((h, i) => {
           const cell = ws.getCell(currRow + 1, i + 3);
           cell.value = h;
           cell.fill = subHeaderFill;
        });

        // Style cho cả 2 hàng tiêu đề
        for (let r = currRow; r <= currRow + 1; r++) {
          for (let c = 1; c <= 10; c++) {
            const cell = ws.getCell(r, c);
            cell.font = { name: 'Times New Roman', bold: true, size: 10 };
            if (r === currRow) cell.fill = headerFill;
            cell.border = border;
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        }
        currRow += 2;

        const addRow = (yearText: string, total: number, m: any, isDiff = false) => {
          const r = ws.getRow(currRow);
          r.getCell(1).value = yearText; r.getCell(2).value = total;
          r.getCell(3).value = m.good.sl; r.getCell(4).value = m.good.tl / 100;
          r.getCell(5).value = m.fair.sl; r.getCell(6).value = m.fair.tl / 100;
          r.getCell(7).value = m.passed.sl; r.getCell(8).value = m.passed.tl / 100;
          r.getCell(9).value = m.failed.sl; r.getCell(10).value = m.failed.tl / 100;

          for (let c = 1; c <= 10; c++) {
            const cell = r.getCell(c);
            cell.border = border;
            cell.font = { name: 'Times New Roman', size: 10, bold: isDiff };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (c % 2 === 0 && c >= 4) cell.numFmt = '0.00%';
            if (isDiff && c > 1) {
              const val = cell.value as number;
              if (val > 0) cell.font.color = { argb: 'FF008000' };
              else if (val < 0) cell.font.color = { argb: 'FFFF0000' };
            }
          }
          currRow++;
        };

        const metricsOld = {
          good: { sl: data.metrics.good.oSL, tl: data.metrics.good.oTL },
          fair: { sl: data.metrics.fair.oSL, tl: data.metrics.fair.oTL },
          passed: { sl: data.metrics.passed.oSL, tl: data.metrics.passed.oTL },
          failed: { sl: data.metrics.failed.oSL, tl: data.metrics.failed.oTL }
        };
        const metricsNew = {
          good: { sl: data.metrics.good.nSL, tl: data.metrics.good.nTL },
          fair: { sl: data.metrics.fair.nSL, tl: data.metrics.fair.nTL },
          passed: { sl: data.metrics.passed.nSL, tl: data.metrics.passed.nTL },
          failed: { sl: data.metrics.failed.nSL, tl: data.metrics.failed.nTL }
        };
        const metricsDiff = {
          good: { sl: data.metrics.good.nSL - data.metrics.good.oSL, tl: data.metrics.good.nTL - data.metrics.good.oTL },
          fair: { sl: data.metrics.fair.nSL - data.metrics.fair.oSL, tl: data.metrics.fair.nTL - data.metrics.fair.oTL },
          passed: { sl: data.metrics.passed.nSL - data.metrics.passed.oSL, tl: data.metrics.passed.nTL - data.metrics.passed.oTL },
          failed: { sl: data.metrics.failed.nSL - data.metrics.failed.oSL, tl: data.metrics.failed.nTL - data.metrics.failed.oTL }
        };

        addRow(oldYear, data.totalOld, metricsOld);
        addRow(newYear, data.totalNew, metricsNew);
        addRow('Tăng / giảm', data.totalNew - data.totalOld, metricsDiff, true);
        currRow++;
      };

      drawBlock(`I. ${matrix.school.label}`, matrix.school);
      matrix.grades.forEach((g, idx) => {
        drawBlock(`II.${idx+1}. KHỐI: ${g.label.toUpperCase()}`, g);
        g.classes.forEach(c => drawBlock(`Lớp: ${c.label}`, c));
      });

      ws.getColumn(1).width = 15; ws.getColumn(2).width = 10;
      for (let c = 3; c <= 10; c++) ws.getColumn(c).width = 9;

      const finalFileName = activeCategory === 'study' ? 'So sánh học tập' : 'So sánh rèn luyện';
      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `${finalFileName}.xlsx`);
    } catch (e) { setError("Lỗi xuất Excel"); } finally { setLoading(false); }
  };

  // ✅ WORD MẪU 2 - NÂNG CẤP GỘP TIÊU ĐỀ (MERGE & SPLIT)
  const exportSummaryWordMẫu2 = async () => {
    if (!oldReport || !newReport) return;
    try {
      setLoading(true);
      const matrix = getFullMatrix();
      const finalFileName = activeCategory === 'study' ? 'So sánh học tập' : 'So sánh rèn luyện';

      const createCell = (t: string, b = false, align = docx.AlignmentType.CENTER, rSpan = 1, cSpan = 1, bg?: string, color?: string) => new docx.TableCell({
        children: [new docx.Paragraph({ alignment: align, children: [new docx.TextRun({ text: t, bold: b, color: color, font: "Times New Roman", size: 18 })] })],
        verticalAlign: docx.VerticalAlign.CENTER, rowSpan, columnSpan: cSpan, shading: bg ? { fill: bg } : undefined,
        margins: { top: 60, bottom: 60, left: 40, right: 40 }
      });

      const drawTableDocx = (data: any) => {
        const rows = [
          // Hàng tiêu đề 1 (Gộp ngang)
          new docx.TableRow({
            children: [
              createCell("Năm học", true, docx.AlignmentType.CENTER, 2, 1, "E9F0F8"),
              createCell("Tổng số HS", true, docx.AlignmentType.CENTER, 2, 1, "E9F0F8"),
              createCell("TỐT", true, docx.AlignmentType.CENTER, 1, 2, "E9F0F8"),
              createCell("KHÁ", true, docx.AlignmentType.CENTER, 1, 2, "E9F0F8"),
              createCell("ĐẠT", true, docx.AlignmentType.CENTER, 1, 2, "E9F0F8"),
              createCell("CĐ", true, docx.AlignmentType.CENTER, 1, 2, "E9F0F8"),
            ]
          }),
          // Hàng tiêu đề 2 (Chia nhỏ SL/TL)
          new docx.TableRow({
            children: [
              // 2 ô đầu đã bị gộp từ trên xuống (rowSpan=2) nên ở đây không cần khai báo lại hoặc khai báo rỗng
              createCell("SL", true, docx.AlignmentType.CENTER, 1, 1, "F2F2F2"),
              createCell("TL %", true, docx.AlignmentType.CENTER, 1, 1, "F2F2F2"),
              createCell("SL", true, docx.AlignmentType.CENTER, 1, 1, "F2F2F2"),
              createCell("TL %", true, docx.AlignmentType.CENTER, 1, 1, "F2F2F2"),
              createCell("SL", true, docx.AlignmentType.CENTER, 1, 1, "F2F2F2"),
              createCell("TL %", true, docx.AlignmentType.CENTER, 1, 1, "F2F2F2"),
              createCell("SL", true, docx.AlignmentType.CENTER, 1, 1, "F2F2F2"),
              createCell("TL %", true, docx.AlignmentType.CENTER, 1, 1, "F2F2F2"),
            ]
          })
        ];

        const addDataRow = (y: string, t: number, m: any, isDiff = false) => {
          const colorVal = (v: number) => v > 0 ? "008000" : v < 0 ? "FF0000" : "000000";
          const fmt = (v: number, isPct = false) => isPct ? (v > 0 ? "+" : "") + v.toFixed(2) + "%" : (v > 0 ? "+" : "") + v.toString();

          rows.push(new docx.TableRow({
            children: [
              createCell(y, isDiff), createCell(isDiff ? fmt(t) : t.toString(), isDiff, docx.AlignmentType.CENTER, 1, 1, undefined, isDiff ? colorVal(t) : undefined),
              createCell(isDiff ? fmt(m.good.sl) : m.good.sl.toString(), isDiff, docx.AlignmentType.CENTER, 1, 1, undefined, isDiff ? colorVal(m.good.sl) : undefined),
              createCell(isDiff ? fmt(m.good.tl, true) : m.good.tl.toFixed(2) + "%", isDiff, docx.AlignmentType.CENTER, 1, 1, undefined, isDiff ? colorVal(m.good.tl) : undefined),
              createCell(isDiff ? fmt(m.fair.sl) : m.fair.sl.toString(), isDiff, docx.AlignmentType.CENTER, 1, 1, undefined, isDiff ? colorVal(m.fair.sl) : undefined),
              createCell(isDiff ? fmt(m.fair.tl, true) : m.fair.tl.toFixed(2) + "%", isDiff, docx.AlignmentType.CENTER, 1, 1, undefined, isDiff ? colorVal(m.fair.tl) : undefined),
              createCell(isDiff ? fmt(m.passed.sl) : m.passed.sl.toString(), isDiff, docx.AlignmentType.CENTER, 1, 1, undefined, isDiff ? colorVal(m.passed.sl) : undefined),
              createCell(isDiff ? fmt(m.passed.tl, true) : m.passed.tl.toFixed(2) + "%", isDiff, docx.AlignmentType.CENTER, 1, 1, undefined, isDiff ? colorVal(m.passed.tl) : undefined),
              createCell(isDiff ? fmt(m.failed.sl) : m.failed.sl.toString(), isDiff, docx.AlignmentType.CENTER, 1, 1, undefined, isDiff ? colorVal(m.failed.sl) : undefined),
              createCell(isDiff ? fmt(m.failed.tl, true) : m.failed.tl.toFixed(2) + "%", isDiff, docx.AlignmentType.CENTER, 1, 1, undefined, isDiff ? colorVal(m.failed.tl) : undefined),
            ]
          }));
        };

        const mO = { good: { sl: data.metrics.good.oSL, tl: data.metrics.good.oTL }, fair: { sl: data.metrics.fair.oSL, tl: data.metrics.fair.oTL }, passed: { sl: data.metrics.passed.oSL, tl: data.metrics.passed.oTL }, failed: { sl: data.metrics.failed.oSL, tl: data.metrics.failed.oTL } };
        const mN = { good: { sl: data.metrics.good.nSL, tl: data.metrics.good.nTL }, fair: { sl: data.metrics.fair.nSL, tl: data.metrics.fair.nTL }, passed: { sl: data.metrics.passed.nSL, tl: data.metrics.passed.nTL }, failed: { sl: data.metrics.failed.nSL, tl: data.metrics.failed.nTL } };
        const mD = { good: { sl: data.metrics.good.nSL - data.metrics.good.oSL, tl: data.metrics.good.nTL - data.metrics.good.oTL }, fair: { sl: data.metrics.fair.nSL - data.metrics.fair.oSL, tl: data.metrics.fair.nTL - data.metrics.fair.oTL }, passed: { sl: data.metrics.passed.nSL - data.metrics.passed.oSL, tl: data.metrics.passed.nTL - data.metrics.passed.oTL }, failed: { sl: data.metrics.failed.nSL - data.metrics.failed.oSL, tl: data.metrics.failed.nTL - data.metrics.failed.oTL } };

        addDataRow(oldYear, data.totalOld, mO);
        addDataRow(newYear, data.totalNew, mN);
        addDataRow('Tăng / giảm', data.totalNew - data.totalOld, mD, true);

        return new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows });
      };

      const docChildren: any[] = [
        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: `BÁO CÁO SO SÁNH ${activeCategory === 'study' ? 'HỌC TẬP' : 'RÈN LUYỆN'}`, bold: true, size: 28, font: "Times New Roman" })] }),
        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 300 }, children: [new docx.TextRun({ text: `Năm học ${newYear} so với ${oldYear}`, italics: true, size: 22, font: "Times New Roman" })] })
      ];

      docChildren.push(new docx.Paragraph({ children: [new docx.TextRun({ text: `I. ${matrix.school.label}`, bold: true, size: 20, color: "0000FF", font: "Times New Roman" })], spacing: { before: 200, after: 100 } }));
      docChildren.push(drawTableDocx(matrix.school));

      matrix.grades.forEach((g, idx) => {
        docChildren.push(new docx.Paragraph({ children: [new docx.TextRun({ text: `II.${idx+1}. KHỐI: ${g.label.toUpperCase()}`, bold: true, size: 20, color: "0000FF", font: "Times New Roman" })], spacing: { before: 300, after: 100 } }));
        docChildren.push(drawTableDocx(g));
        g.classes.forEach(c => {
          docChildren.push(new docx.Paragraph({ children: [new docx.TextRun({ text: `Lớp: ${c.label}`, bold: true, size: 18, font: "Times New Roman" })], spacing: { before: 150, after: 100 } }));
          docChildren.push(drawTableDocx(c));
        });
      });

      const doc = new docx.Document({
        sections: [{ properties: { page: { size: { orientation: docx.PageOrientation.PORTRAIT }, margin: { top: 720, right: 400, bottom: 720, left: 400 } } }, children: docChildren }]
      });

      const blob = await docx.Packer.toBlob(doc);
      saveAs(blob, `${finalFileName}.docx`);
    } catch (e) { setError("Lỗi xuất Word"); } finally { setLoading(false); }
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
                <button onClick={() => exportAsImage(reportRef, `Bao_Cao`)} className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><ImageIcon size={18} /></button>
                <button onClick={() => exportAsPDF(reportRef, `Bao_Cao`)} className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><FileText size={18} /></button>
                <div className="h-8 w-px bg-slate-300 mx-1"></div>
                <button onClick={exportSummaryExcelMẫu2} className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-all flex items-center gap-1 font-bold text-[10px] border border-emerald-200">
                  <FileJson size={14} /> EXCEL (MẪU 2)
                </button>
                <button onClick={exportSummaryWordMẫu2} className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-all flex items-center gap-1 font-bold text-[10px] border border-blue-200">
                  <FileText size={14} /> WORD (MẪU 2)
                </button>
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
              <h3 className="text-2xl font-black mb-2 text-slate-800">Năm cũ: {oldYear}</h3>
              <input type="text" value={oldYear} onChange={(e) => setOldYear(e.target.value)} className="mb-6 bg-slate-100 border-none rounded-lg px-4 py-2 text-xs font-bold text-center w-40 focus:ring-2 focus:ring-indigo-500" />
              <label className="cursor-pointer bg-slate-900 text-white px-10 py-4 rounded-2xl font-black hover:bg-indigo-600 transition-all shadow-xl active:scale-95">
                CHỌN FILE CŨ
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'old')} />
              </label>
            </div>
            <div className={`bg-white p-12 rounded-[3rem] border-2 border-dashed flex flex-col items-center text-center transition-all ${newReport ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200 hover:border-emerald-400'}`}>
              <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner ${newReport ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                {newReport ? <CheckCircle2 size={48} /> : <Upload size={48} />}
              </div>
              <h3 className="text-2xl font-black mb-2 text-slate-800">Năm mới: {newYear}</h3>
              <input type="text" value={newYear} onChange={(e) => setNewYear(e.target.value)} className="mb-6 bg-slate-100 border-none rounded-lg px-4 py-2 text-xs font-bold text-center w-40 focus:ring-2 focus:ring-emerald-500" />
              <label className="cursor-pointer bg-slate-900 text-white px-10 py-4 rounded-2xl font-black hover:bg-emerald-600 transition-all shadow-xl active:scale-95">
                CHỌN FILE MỚI
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
                <div className="bg-slate-100 p-1.5 rounded-[1.25rem] flex gap-1">
                  <button onClick={() => setViewMode('table')} className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'table' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><TableIcon size={14} /> BẢNG CHI TIẾT</button>
                  <button onClick={() => setViewMode('visual')} className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'visual' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><Presentation size={14} /> TRÌNH CHIẾU</button>
                </div>
              </div>

              {viewMode === 'table' ? (
                <div ref={reportRef}>
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm mb-6 group relative">
                    <div ref={chartSectionRef} className="p-10 rounded-3xl bg-white flex flex-col items-center">
                       <div className="text-center w-full max-w-4xl mb-10 pt-10">
                          <textarea value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} className="w-full text-2xl md:text-3xl font-black text-slate-900 bg-transparent border-none focus:ring-0 resize-none text-center uppercase outline-none vietnamese-title" style={{ lineHeight: '1.6', overflow: 'hidden' }} rows={3} />
                          <div className="w-32 h-1.5 bg-indigo-600 mx-auto rounded-full mt-4"></div>
                       </div>
                      <SummaryChart data={comparisonData} oldYear={oldYear} newYear={newYear} />
                    </div>
                  </div>
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                      {(['good', 'fair', 'passed', 'failed'] as Rank[]).map(r => (
                        <button key={r} onClick={() => setActiveRank(r)} className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeRank === r ? 'bg-slate-900 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-400'}`}>{getRankLabel(r)}</button>
                      ))}
                    </div>
                    <ComparisonTable data={comparisonData} category={activeCategory} rank={activeRank} />
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 bg-slate-50 p-4 rounded-[2rem]" ref={reportRef}>
                   <div className="bg-white p-12 rounded-[2.5rem] mb-10 text-center shadow-xl pt-20 pb-16">
                      <h1 className="text-4xl font-black text-slate-900 mb-6 uppercase leading-relaxed px-4 vietnamese-title">{reportTitle}</h1>
                      <div className="w-24 h-2 bg-indigo-600 mx-auto rounded-full"></div>
                   </div>
                   <VisualReport data={[]} oldYear={oldYear} newYear={newYear} />
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
