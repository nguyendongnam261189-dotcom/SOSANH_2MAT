
import * as XLSX from 'xlsx';
import { RawRowData, RowLevel, MetricSet } from '../types';

export const parseExcelReport = async (file: File): Promise<RawRowData[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // --- STEP 1: ROBUST ANCHOR DETECTION ---
        let colIdxLabel = -1;
        let colIdxTotal = -1;
        let colIdxConduct = -1;
        let colIdxStudy = -1;
        let startRow = -1;

        // Scan first 15 rows to find header anchors
        for (let i = 0; i < Math.min(15, jsonData.length); i++) {
          const row = jsonData[i];
          if (!row) continue;
          for (let j = 0; j < row.length; j++) {
            const cellVal = String(row[j] || "").toUpperCase().trim();
            
            // Look for "Lớp" or "Đơn vị"
            if ((cellVal === "LỚP" || cellVal === "TÊN LỚP" || cellVal.includes("ĐƠN VỊ")) && colIdxLabel === -1) {
              colIdxLabel = j;
              startRow = i + 1;
            }
            // Look for "Sĩ số"
            if (cellVal.includes("SĨ SỐ") || cellVal.includes("TỔNG SỐ HS") || cellVal === "TS" || cellVal === "SỐ HS") {
              colIdxTotal = j;
            }
            // Look for start of results (Tốt/Giỏi)
            if (cellVal === "TỐT" || cellVal === "GIỎI" || cellVal === "XUẤT SẮC") {
              if (j < 12 && colIdxConduct === -1) colIdxConduct = j;
              else if (j >= 12 && colIdxStudy === -1) colIdxStudy = j;
            }
          }
        }

        // Fallbacks if detection fails
        if (colIdxLabel === -1) colIdxLabel = 1;
        if (colIdxTotal === -1) colIdxTotal = 3;
        if (colIdxConduct === -1) colIdxConduct = 5;
        if (colIdxStudy === -1) colIdxStudy = 15;
        if (startRow === -1) startRow = 6;

        const rows: RawRowData[] = [];
        let currentGrade: string | null = null;

        const parseNum = (val: any) => {
          if (val === undefined || val === null || val === "") return 0;
          if (typeof val === 'number') return val;
          const clean = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
          return parseFloat(clean) || 0;
        };

        // --- STEP 2: ROW BY ROW PARSING ---
        for (let i = startRow; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length <= colIdxLabel) continue;

          const rawLabel = String(row[colIdxLabel] || "").trim();
          if (!rawLabel) continue;

          const upperLabel = rawLabel.toUpperCase();
          
          // Define Row Level
          let level: RowLevel | null = null;
          if (upperLabel.includes("TOÀN TRƯỜNG")) {
            level = RowLevel.SCHOOL;
          } else if (upperLabel.includes("KHỐI") || upperLabel.startsWith("TỔNG CỘNG KHỐI")) {
            level = RowLevel.GRADE;
            currentGrade = rawLabel;
          } else if (/^\d/.test(rawLabel) || /^[6789][A-Z]/.test(upperLabel)) {
            level = RowLevel.CLASS;
          } else if (currentGrade && !upperLabel.includes("TỔNG") && !upperLabel.includes("CỘNG")) {
            level = RowLevel.CLASS;
          }

          if (level === null) continue;

          // Attempt to extract total students with a fallback for Grade 6 offset issues
          let totalStudents = parseNum(row[colIdxTotal]);
          if (totalStudents === 0 && row[colIdxTotal + 1] !== undefined && !isNaN(parseFloat(String(row[colIdxTotal + 1])))) {
             // Sometimes "Sĩ số" is shifted right by one due to hidden columns or merged cells
             const fallback = parseNum(row[colIdxTotal + 1]);
             if (fallback > 0) totalStudents = fallback;
          }

          // Metric extraction
          const getMetric = (startIdx: number): MetricSet => {
            return {
              goodCount: parseNum(row[startIdx]),
              goodRate: parseNum(row[startIdx + 1]),
              fairCount: parseNum(row[startIdx + 2]),
              fairRate: parseNum(row[startIdx + 3]),
              passedCount: parseNum(row[startIdx + 4]),
              passedRate: parseNum(row[startIdx + 5]),
              failedCount: parseNum(row[startIdx + 6]),
              failedRate: parseNum(row[startIdx + 7]),
            };
          };

          const conduct = getMetric(colIdxConduct);
          const study = getMetric(colIdxStudy);

          // Infer grade if missing
          if (level === RowLevel.CLASS && !currentGrade) {
            const match = rawLabel.match(/^(\d+)/);
            if (match) currentGrade = `KHỐI ${match[1]}`;
          }

          // Unique ID that includes original row index to avoid duplicates in same file
          const id = `${level}-${rawLabel}-${currentGrade || 'root'}-${i}`;

          rows.push({
            id,
            label: rawLabel,
            grade: level === RowLevel.CLASS ? currentGrade : (level === RowLevel.GRADE ? rawLabel : null),
            level,
            totalStudents,
            conduct,
            study,
            originalData: row,
          });
        }

        resolve(rows);
      } catch (err) {
        console.error("Parse Error:", err);
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
