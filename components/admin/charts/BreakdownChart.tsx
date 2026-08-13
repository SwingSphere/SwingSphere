import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

type BreakdownChartProps = {
    data: { name: string; value: number; fill: string; }[];
};

const BreakdownChart: React.FC<BreakdownChartProps> = ({ data }) => {
    const total = data.reduce((sum, entry) => sum + entry.value, 0);

    return (
        <ResponsiveContainer width="100%" height={200}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                </Pie>
                <Tooltip />
                <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-3xl font-bold fill-gray-800">
                    {total}
                </text>
                 <text x="50%" y="50%" dy={20} textAnchor="middle" className="text-sm fill-gray-500">
                    Total Listings
                </text>
            </PieChart>
        </ResponsiveContainer>
    );
};

export default BreakdownChart;
