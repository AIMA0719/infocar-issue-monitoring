/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface MetricData {
  count: number;
  status: string;
  level: 'normal' | 'warning' | 'critical';
}

interface DashboardData {
  reviews: MetricData;
  crashes: MetricData;
  updatedAt: string;
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/status');
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStatusColor = (level: string) => {
    switch (level) {
      case 'normal':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'warning':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (level: string) => {
    switch (level) {
      case 'normal':
        return <CheckCircle className="w-4 h-4 mr-1.5" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 mr-1.5" />;
      case 'critical':
        return <XCircle className="w-4 h-4 mr-1.5" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Android Release Monitor
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Google Play Console & Firebase Crashlytics Data (Last 7 Days)
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start">
            <AlertTriangle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Error loading data</p>
              <p className="mt-1 opacity-90">{error}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/3">
                    Metric
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">
                    Count (7 Days)
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Reviews Row */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">1~2 Star Reviews</div>
                    <div className="text-xs text-slate-500 mt-1">Google Play Console</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-lg font-semibold text-slate-700">
                      {loading ? '-' : data?.reviews.count.toLocaleString() ?? '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {loading || !data ? (
                      <div className="h-6 w-24 bg-slate-100 rounded animate-pulse"></div>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(data.reviews.level)}`}>
                        {getStatusIcon(data.reviews.level)}
                        {data.reviews.status}
                      </span>
                    )}
                  </td>
                </tr>

                {/* Crashes Row */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">Crash & ANR Events</div>
                    <div className="text-xs text-slate-500 mt-1">Firebase Crashlytics (via GA4)</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-lg font-semibold text-slate-700">
                      {loading ? '-' : data?.crashes.count.toLocaleString() ?? '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {loading || !data ? (
                      <div className="h-6 w-24 bg-slate-100 rounded animate-pulse"></div>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(data.crashes.level)}`}>
                        {getStatusIcon(data.crashes.level)}
                        {data.crashes.status}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          {data?.updatedAt && (
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-right">
              Last updated: {new Date(data.updatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
