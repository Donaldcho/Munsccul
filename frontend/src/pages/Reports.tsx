import React, { useState } from 'react';
import { reportsApi } from '../services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

type ReportType = 'trial-balance' | 'balance-sheet' | 'income-statement' | 'par';
type ExportFormat = 'json' | 'excel' | 'pdf';

const ReportsDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const isCreditOfficer = user?.role === 'CREDIT_OFFICER';

  const [reportType, setReportType] = useState<ReportType>(isCreditOfficer ? 'par' : 'trial-balance');
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  const fetchReport = async (format: ExportFormat) => {
    try {
      setLoading(true);
      const params = { as_of_date: targetDate, end_date: targetDate, start_date: '2020-01-01', format }; // Simple start date for income statement config

      let response;
      switch (reportType) {
        case 'trial-balance':
          response = await reportsApi.getTrialBalance(params);
          break;
        case 'balance-sheet':
          response = await reportsApi.getBalanceSheet(params);
          break;
        case 'income-statement':
          response = await reportsApi.getIncomeStatement({ start_date: '2024-01-01', end_date: targetDate, format });
          break;
        case 'par':
          response = await reportsApi.getParReport(params);
          break;
      }

      if (format === 'json') {
        setPreviewData(response?.data);
        toast.success('Report preview loaded successfully');
      } else {
        // Handle Blob download for PDF/Excel
        if (response?.data) {
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement('a');
          link.href = url;
          const ext = format === 'pdf' ? '.pdf' : '.xlsx';
          link.setAttribute('download', `${reportType}_${targetDate}${ext}`);
          document.body.appendChild(link);
          link.click();
          link.remove();
          toast.success(`${format.toUpperCase()} downloaded successfully`);
        }
      }

    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('Failed to generate report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Regulatory Reports Engine</h1>
          <p className="text-sm text-gray-500 mt-1">COBAC / OHADA Compliant Financial Extractions</p>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Report</label>
            <select
              title="Select Report"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              {!isCreditOfficer && (
                <>
                  <option value="trial-balance">Trial Balance (Balance Générale)</option>
                  <option value="balance-sheet">Balance Sheet (Bilan)</option>
                  <option value="income-statement">Income Statement (Compte de Résultat)</option>
                </>
              )}
              <option value="par">Portfolio At Risk (PAR Analysis)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">As Of Date</label>
            <input
              title="As Of Date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="block w-full pl-3 pr-3 py-2 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            />
          </div>
        </div>

        <div className="flex space-x-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => fetchReport('json')}
            disabled={loading}
            className="inline-flex justify-center items-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Preview Data
          </button>
          <button
            onClick={() => fetchReport('excel')}
            disabled={loading}
            className="inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Export Excel
          </button>
          <button
            onClick={() => fetchReport('pdf')}
            disabled={loading}
            className="inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Export PDF
          </button>
        </div>
      </div>

      {previewData && (
        <div className="bg-gray-900 rounded-lg p-6 overflow-auto max-h-96">
          <h3 className="text-white text-sm font-medium mb-3">JSON Preview Response</h3>
          <pre className="text-green-400 text-xs font-mono">
            {JSON.stringify(previewData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ReportsDashboard;