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

  // TÍNH TOÁN DỮ LIỆU CHUNG (HỖ TRỢ LẤY TỔNG NĂM CŨ VÀ MỚI)
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

  // -------------------------------------------------------------------
  // ✅ MẪU 2: BẢNG 10 CỘT x 4 HÀNG CHO MỖI KHỐI/LỚP
  // -------------------------------------------------------------------
  
  // XUẤT EXCEL THEO CẤU TRÚC 10 CỘT X 4 HÀNG
  const exportSummaryExcelMẫu2 = async () => {
    if (!oldReport || !newReport) return;
    try {
      setLoading(true);
      const matrix = getFullMatrix();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Báo Cáo Chuẩn A4');

      ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, margins: { left: 0.2, right: 0.2, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
      const border: ExcelJS.Borders = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F0F8' } };

      ws.mergeCells('A1:J1');
      ws.getCell('A1').value = `BÁO CÁO SO SÁNH ${activeCategory === 'study' ? 'HỌC TẬP' : 'RÈN LUYỆN'}`;
      ws.getCell('A1').font = { name: 'Times New Roman', size: 16, bold: true };
      ws.getCell('A1').alignment = { horizontal: 'center' };

      let currRow = 3;

      const drawBlock = (title: string, data: any) => {
        // Tiêu đề đơn vị (Khối/Lớp)
        ws.mergeCells(`A${currRow}:J${currRow}`);
        ws.getCell(`A${currRow}`).value = title;
        ws.getCell(`A${currRow}`).font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF0000FF' } };
        ws.getCell(`A${currRow}`).alignment = { vertical: 'middle', horizontal: 'left' };
        currRow++;

        // Hàng 1: Tiêu đề cột
        const headers = ['Năm học', 'Tổng số HS', 'Tốt (SL)', 'Tốt (%)', 'Khá (SL)', 'Khá (%)', 'Đạt (SL)', 'Đạt (%)', 'CĐ (SL)', 'CĐ (%)'];
        const headerRow = ws.getRow(currRow);
        headers.forEach((h, i) => {
          const cell = headerRow.getCell(i + 1);
          cell.value = h;
          cell.font = { name: 'Times New Roman', bold: true, size: 10 };
          cell.fill = headerFill;
          cell.border = border;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        currRow++;

        // Hàng 2: Năm cũ
        const rOld = ws.getRow(currRow);
        rOld.getCell(1).value = oldYear; rOld.getCell(2).value = data.totalOld;
        rOld.getCell(3).value = data.metrics.good.oSL; rOld.getCell(4).value = data.metrics.good.oTL / 100;
        rOld.getCell(5).value = data.metrics.fair.oSL; rOld.getCell(6).value = data.metrics.fair.oTL / 100;
        rOld.getCell(7).value = data.metrics.passed.oSL; rOld.getCell(8).value = data.metrics.passed.oTL / 100;
        rOld.getCell(9).value = data.metrics.failed.oSL; rOld.getCell(10).value = data.metrics.failed.oTL / 100;
        currRow++;

        // Hàng 3: Năm mới
        const rNew = ws.getRow(currRow);
        rNew.getCell(1).value = newYear; rNew.getCell(2).value = data.totalNew;
        rNew.getCell(3).value = data.metrics.good.nSL; rNew.getCell(4).value = data.metrics.good.nTL / 100;
        rNew.getCell(5).value = data.metrics.fair.nSL; rNew.getCell(6).value = data.metrics.fair.nTL / 100;
        rNew.getCell(7).value = data.metrics.passed.nSL; rNew.getCell(8).value = data.metrics.passed.nTL / 100;
        rNew.getCell(9).value = data.metrics.failed.nSL; rNew.getCell(10).value = data.metrics.failed.nTL / 100;
        currRow++;

        // Hàng 4: Tăng/giảm
        const rDiff = ws.getRow(currRow);
        rDiff.getCell(1).value = 'Tăng / giảm'; rDiff.getCell(2).value = data.totalNew - data.totalOld;
        rDiff.getCell(3).value = data.metrics.good.nSL - data.metrics.good.oSL; rDiff.getCell(4).value = (data.metrics.good.nTL - data.metrics.good.oTL) / 100;
        rDiff.getCell(5).value = data.metrics.fair.nSL - data.metrics.fair.oSL; rDiff.getCell(6).value = (data.metrics.fair.nTL - data.metrics.fair.oTL) / 100;
        rDiff.getCell(7).value = data.metrics.passed.nSL - data.metrics.passed.oSL; rDiff.getCell(8).value = (data.metrics.passed.nTL - data.metrics.passed.oTL) / 100;
        rDiff.getCell(9).value = data.metrics.failed.nSL - data.metrics.failed.oSL; rDiff.getCell(10).value = (data.metrics.failed.nTL - data.metrics.failed.oTL) / 100;
        currRow++;

        // Áp dụng viền, font, màu sắc cho 3 hàng dữ liệu
        for (let r = currRow - 3; r <= currRow - 1; r++) {
          const row = ws.getRow(r);
          for (let c = 1; c <= 10; c++) {
            const cell = row.getCell(c);
            cell.border = border;
            cell.font = { name: 'Times New Roman', size: 10, bold: r === currRow - 1 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            
            // Format % cho các cột chẵn từ cột 4 trở đi
            if (c % 2 === 0 && c >= 4) cell.numFmt = '0.00%'; 
            
            // Đổi màu xanh/đỏ cho hàng Tăng/giảm
            if (r === currRow - 1 && c > 1) {
               const val = cell.value as number;
               if (val > 0) cell.font.color = { argb: 'FF008000' };
               else if (val < 0) cell.font.color = { argb: 'FFFF0000' };
            }
          }
        }
        currRow++; // Xuống dòng cách 1 hàng cho bảng tiếp theo
      };

      drawBlock(`I. ${matrix.school.label}`, matrix.school);
      matrix.grades.forEach((g, idx) => {
        drawBlock(`II.${idx+1}. KHỐI: ${g.label.toUpperCase()}`, g);
        g.classes.forEach(c => drawBlock(`Lớp: ${c.label}`, c));
      });

      // Căn chỉnh độ rộng cột chuẩn A4 dọc
      ws.getColumn(1).width = 15;
      ws.getColumn(2).width = 10;
      for (let c = 3; c <= 10; c++) ws.getColumn(c).width = 9;

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `So_Sanh_Mau_2_${newYear}.xlsx`);
    } catch (e) { setError("Lỗi xuất Excel"); } finally { setLoading(false); }
  };

  // XUẤT WORD THEO CẤU TRÚC 10 CỘT X 4 HÀNG
  const exportSummaryWordMẫu2 = async () => {
    if (!oldReport || !newReport) return;
    try {
      setLoading(true);
      const matrix = getFullMatrix();
      const categoryTitle = activeCategory === 'study' ? 'HỌC TẬP' : 'RÈN LUYỆN';

      const createCell = (t: string, b = false, align = docx.AlignmentType.CENTER, color?: string, bg?: string) => new docx.TableCell({
        children: [new docx.Paragraph({ alignment: align, children: [new docx.TextRun({ text: t, bold: b, color: color, font: "Times New Roman", size: 18 })] })], // size 18 = 9pt
        verticalAlign: docx.VerticalAlign.CENTER, shading: bg ? { fill: bg } : undefined,
        margins: { top: 60, bottom: 60, left: 40, right: 40 }
      });

      const drawTableDocx = (data: any) => {
        const hRow = new docx.TableRow({
          children: ['Năm học', 'Tổng HS', 'Tốt (SL)', 'Tốt (%)', 'Khá (SL)', 'Khá (%)', 'Đạt (SL)', 'Đạt (%)', 'CĐ (SL)', 'CĐ (%)'].map(h => createCell(h, true, docx.AlignmentType.CENTER, undefined, "E9F0F8"))
        });

        const oRow = new docx.TableRow({
          children: [
            createCell(oldYear), createCell(data.totalOld.toString()),
            createCell(data.metrics.good.oSL.toString()), createCell(data.metrics.good.oTL.toFixed(2) + "%"),
            createCell(data.metrics.fair.oSL.toString()), createCell(data.metrics.fair.oTL.toFixed(2) + "%"),
            createCell(data.metrics.passed.oSL.toString()), createCell(data.metrics.passed.oTL.toFixed(2) + "%"),
            createCell(data.metrics.failed.oSL.toString()), createCell(data.metrics.failed.oTL.toFixed(2) + "%"),
          ]
        });

        const nRow = new docx.TableRow({
          children: [
            createCell(newYear), createCell(data.totalNew.toString()),
            createCell(data.metrics.good.nSL.toString()), createCell(data.metrics.good.nTL.toFixed(2) + "%"),
            createCell(data.metrics.fair.nSL.toString()), createCell(data.metrics.fair.nTL.toFixed(2) + "%"),
            createCell(data.metrics.passed.nSL.toString()), createCell(data.metrics.passed.nTL.toFixed(2) + "%"),
            createCell(data.metrics.failed.nSL.toString()), createCell(data.metrics.failed.nTL.toFixed(2) + "%"),
          ]
        });

        const getColor = (v: number) => v > 0 ? "008000" : v < 0 ? "FF0000" : "000000";
        const getVal = (v: number, isPct = false) => v > 0 ? `+${v.toFixed(isPct ? 2 : 0)}${isPct ? '%' : ''}` : `${v.toFixed(isPct ? 2 : 0)}${isPct ? '%' : ''}`;

        const diffRow = new docx.TableRow({
          children: [
            createCell("Tăng/giảm", true), 
            createCell(getVal(data.totalNew - data.totalOld), true, docx.AlignmentType.CENTER, getColor(data.totalNew - data.totalOld)),
            createCell(getVal(data.metrics.good.nSL - data.metrics.good.oSL), true, docx.AlignmentType.CENTER, getColor(data.metrics.good.nSL - data.metrics.good.oSL)),
            createCell(getVal(data.metrics.good.nTL - data.metrics.good.oTL, true), true, docx.AlignmentType.CENTER, getColor(data.metrics.good.nTL - data.metrics.good.oTL)),
            createCell(getVal(data.metrics.fair.nSL - data.metrics.fair.oSL), true, docx.AlignmentType.CENTER, getColor(data.metrics.fair.nSL - data.metrics.fair.oSL)),
            createCell(getVal(data.metrics.fair.nTL - data.metrics.fair.oTL, true), true, docx.AlignmentType.CENTER, getColor(data.metrics.fair.nTL - data.metrics.fair.oTL)),
            createCell(getVal(data.metrics.passed.nSL - data.metrics.passed.oSL), true, docx.AlignmentType.CENTER, getColor(data.metrics.passed.nSL - data.metrics.passed.oSL)),
            createCell(getVal(data.metrics.passed.nTL - data.metrics.passed.oTL, true), true, docx.AlignmentType.CENTER, getColor(data.metrics.passed.nTL - data.metrics.passed.oTL)),
            createCell(getVal(data.metrics.failed.nSL - data.metrics.failed.oSL), true, docx.AlignmentType.CENTER, getColor(data.metrics.failed.nSL - data.metrics.failed.oSL)),
            createCell(getVal(data.metrics.failed.nTL - data.metrics.failed.oTL, true), true, docx.AlignmentType.CENTER, getColor(data.metrics.failed.nTL - data.metrics.failed.oTL)),
          ]
        });

        return new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: [hRow, oRow, nRow, diffRow] });
      };

      const docChildren: any[] = [
        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: `BÁO CÁO SO SÁNH ${categoryTitle}`, bold: true, size: 28, font: "Times New Roman" })] }),
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
      saveAs(blob, `So_Sanh_Mau_2_${newYear}.docx`);
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
                
                {/* NHÓM NÚT XUẤT FILE MẪU 2 (CHUẨN BÁO CÁO A4) */}
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
