export const exportToCsv = (data: any[], filename: string) => {
    if (data.length === 0) return;

    const replacer = (key: string, value: any) => value === null ? '' : value;
    const header = Object.keys(data[0]);
    
    let csv = data.map(row => 
        header.map(fieldName => {
            let value = row[fieldName];
            if (typeof value === 'object' && value !== null) {
                value = JSON.stringify(value);
            }
            return JSON.stringify(value, replacer);
        }).join(',')
    );

    csv.unshift(header.join(','));
    const csvArray = csv.join('\r\n');

    const blob = new Blob([csvArray], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
