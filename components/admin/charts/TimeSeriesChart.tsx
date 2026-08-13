import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type TimeSeriesChartProps = {
    data: { date: string; clubs: number; events: number; }[];
};

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ data }) => {
    const formattedData = data.map(item => ({
        ...item,
        date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));
    
    return (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart
                data={formattedData}
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#9ca3af" />
                <YAxis tick={{fontSize: 12}} stroke="#9ca3af" />
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e0e0e0',
                        borderRadius: '0.5rem'
                    }} 
                />
                <Legend />
                <Line type="monotone" dataKey="clubs" name="Clubs" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
                <Line type="monotone" dataKey="events" name="Events" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
            </LineChart>
        </ResponsiveContainer>
    );
};

export default TimeSeriesChart;
