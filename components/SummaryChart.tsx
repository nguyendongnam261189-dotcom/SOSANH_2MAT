
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { ComparisonRow, RowLevel } from '../types';

interface SummaryChartProps {
  data: ComparisonRow[];
  oldYear: string;
  newYear: string;
}

const CustomizedLabel = (props: any) => {
  const { x, y, width, value } = props;
  return (
    <text 
      x={x + width / 2} 
      y={y - 12} 
      fill="#1e293b" 
      textAnchor="middle" 
      dominantBaseline="middle"
      className="text-[11px] font-black"
    >
      {value}%
    </text>
  );
};

// Tick tùy chỉnh hiển thị tên và Delta ngang bên dưới
const CustomXAxisTick = (props: any) => {
  const { x, y, payload, data } = props;
  const item = data.find((d: any) => d.name === payload.value);
  if (!item) return null;

  const diff = item.newRate - item.oldRate;
  const color = diff > 0 ? '#059669' : diff < 0 ? '#e11d48' : '#64748b';

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Tên đơn vị */}
      <text 
        x={0} 
        y={20} 
        textAnchor="middle" 
        fill="#0f172a" 
        className="text-[14px] font-black"
      >
        {payload.value}
      </text>
      
      {/* Container cho Delta ngang */}
      <g transform={`translate(-35, 30)`}>
        <rect 
          x={0} 
          y={0} 
          width={70} 
          height={20} 
          rx={6} 
          fill={`${color}10`}
        />
        <text 
          x={35} 
          y={13} 
          textAnchor="middle" 
          fill={color} 
          className="text-[10px] font-black"
        >
          {diff > 0 ? '↑ ' : diff < 0 ? '↓ ' : ''}{Math.abs(diff).toFixed(2)}%
        </text>
      </g>
    </g>
  );
};

const SummaryChart: React.FC<SummaryChartProps> = ({ data, oldYear, newYear }) => {
  const chartData = data
    .filter(row => row.level === RowLevel.SCHOOL || row.level === RowLevel.GRADE)
    .map(row => ({
      name: row.label.replace('TỔNG ', '').replace('TOÀN TRƯỜNG', 'Trường'),
      [`NH ${oldYear}`]: parseFloat(row.metrics.oldRate.toFixed(2)),
      [`NH ${newYear}`]: parseFloat(row.metrics.newRate.toFixed(2)),
      oldRate: row.metrics.oldRate, 
      newRate: row.metrics.newRate  
    }));

  const oldKey = `NH ${oldYear}`;
  const newKey = `NH ${newYear}`;

  return (
    <div className="w-full h-[550px] mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
          barGap={12}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            interval={0}
            tick={(props) => <CustomXAxisTick {...props} data={chartData} />}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            unit="%"
            domain={[0, (dataMax: number) => Math.min(100, Math.ceil(dataMax + 15))]}
          />
          <Tooltip 
            cursor={{ fill: '#f8fafc' }}
            contentStyle={{ 
              borderRadius: '16px', 
              border: 'none', 
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              fontWeight: 'bold',
              padding: '12px'
            }}
          />
          <Legend 
            verticalAlign="top" 
            align="right" 
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ 
              paddingBottom: '40px', 
              fontSize: '11px', 
              fontWeight: '800', 
              textTransform: 'uppercase',
              color: '#64748b'
            }}
          />
          <Bar 
            dataKey={oldKey} 
            fill="#cbd5e1" 
            radius={[4, 4, 0, 0]} 
            barSize={50} 
          >
            <LabelList dataKey={oldKey} content={<CustomizedLabel />} />
          </Bar>
          <Bar 
            dataKey={newKey} 
            fill="#4f46e5" 
            radius={[4, 4, 0, 0]} 
            barSize={50} 
          >
            <LabelList dataKey={newKey} content={<CustomizedLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SummaryChart;
