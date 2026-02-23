/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ReviewText {
  id: string;
  rating: number;
  text: string;
  date: string;
  author: string;
}

interface MetricData {
  count: number;
  status: string;
  level: 'normal' | 'warning' | 'critical';
  average?: number;
  previousAverage?: number;
  texts?: ReviewText[];
  versions?: { version: string; count: number }[];
  vitals?: any[];
}

interface DashboardData {
  reviews: MetricData;
  crashes: MetricData;
  updatedAt: string;
  debugLog?: string[];
  rawData?: {
    playConsole: any;
    ga4: any;
    vitals: any;
  };
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  const [rangeDays, setRangeDays] = useState(7);
  const [compareType, setCompareType] = useState('week');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setDebugLog([]);
    try {
      const response = await fetch(`/api/status?range=${rangeDays}&compare=${compareType}`);
      const contentType = response.headers.get('content-type');
      
      if (!response.ok) {
        if (contentType && contentType.includes('application/json')) {
          const errData = await response.json();
          if (errData.debugLog) setDebugLog(errData.debugLog);
          throw new Error(errData.error || `HTTP Error ${response.status}`);
        } else {
          const textData = await response.text();
          throw new Error(`Server returned non-JSON (${response.status}): ${textData.substring(0, 150)}...`);
        }
      }
      
      const result = await response.json();
      setData(result);
      if (result.debugLog) setDebugLog(result.debugLog);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [rangeDays, compareType]);

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

  const renderGrowth = (current?: number, previous?: number) => {
    if (current === undefined || previous === undefined || previous === 0) return null;
    const diff = current - previous;
    const percent = (diff / previous) * 100;
    
    if (diff > 0) {
      return (
        <span className="inline-flex items-center text-emerald-600 text-xs font-medium ml-2">
          <TrendingUp className="w-3 h-3 mr-1" />
          +{percent.toFixed(1)}%
        </span>
      );
    } else if (diff < 0) {
      return (
        <span className="inline-flex items-center text-red-600 text-xs font-medium ml-2">
          <TrendingDown className="w-3 h-3 mr-1" />
          {percent.toFixed(1)}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-slate-400 text-xs font-medium ml-2">
        <Minus className="w-3 h-3 mr-1" />
        0%
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Android Release Monitor
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Google Play Console & Firebase Crashlytics Data
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
              <select 
                value={rangeDays} 
                onChange={(e) => setRangeDays(Number(e.target.value))}
                className="bg-transparent text-sm font-medium text-slate-700 px-2 py-1 outline-none cursor-pointer"
              >
                <option value={1}>Last 24 Hours</option>
                <option value={3}>Last 3 Days</option>
                <option value={7}>Last 7 Days</option>
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days</option>
              </select>
              <div className="w-px h-4 bg-slate-200 mx-2"></div>
              <select 
                value={compareType} 
                onChange={(e) => setCompareType(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-700 px-2 py-1 outline-none cursor-pointer"
              >
                <option value="day">vs Previous Period</option>
                <option value="week">vs Previous Week</option>
              </select>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start">
            <AlertTriangle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Error loading data</p>
              <p className="mt-1 opacity-90">{error}</p>
              
              {debugLog.length > 0 && (
                <div className="mt-4 p-3 bg-red-900/10 rounded-lg font-mono text-xs overflow-x-auto">
                  <p className="font-semibold mb-2">Debug Log:</p>
                  {debugLog.map((log, i) => (
                    <div key={i} className="mb-1">{log}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Play Console Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-medium text-slate-900">Google Play Reviews</h3>
                <p className="text-xs text-slate-500 mt-1">Average Rating & Bad Reviews</p>
              </div>
              {data && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(data.reviews.level)}`}>
                  {getStatusIcon(data.reviews.level)}
                  {data.reviews.status}
                </span>
              )}
            </div>
            
            {loading || !data ? (
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-slate-100 rounded w-1/3"></div>
                <div className="h-4 bg-slate-100 rounded w-1/2"></div>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline mb-2">
                  <span className="text-3xl font-semibold text-slate-800">
                    {data.reviews.average?.toFixed(2) || '-'}
                  </span>
                  <span className="text-sm text-slate-500 ml-1">/ 5.0</span>
                  {renderGrowth(data.reviews.average, data.reviews.previousAverage)}
                </div>
                <p className="text-sm text-slate-600">
                  <strong className="text-slate-900">{data.reviews.count}</strong> bad reviews (1~2 stars) in this period.
                </p>
              </div>
            )}
          </div>

          {/* Crashlytics Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-medium text-slate-900">Firebase Crashlytics</h3>
                <p className="text-xs text-slate-500 mt-1">Crash & ANR Events (via GA4)</p>
              </div>
              {data && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(data.crashes.level)}`}>
                  {getStatusIcon(data.crashes.level)}
                  {data.crashes.status}
                </span>
              )}
            </div>
            
            {loading || !data ? (
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-slate-100 rounded w-1/3"></div>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline mb-2">
                  <span className="text-3xl font-semibold text-slate-800">
                    {data.crashes.count.toLocaleString()}
                  </span>
                  <span className="text-sm text-slate-500 ml-2">events</span>
                </div>
                <p className="text-sm text-slate-600">
                  Total exceptions logged in GA4 for this period.
                </p>

                {data.crashes.versions && data.crashes.versions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Crashes by Version</h4>
                    <div className="space-y-2">
                      {data.crashes.versions.slice(0, 5).map((v, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-700 font-medium">v{v.version}</span>
                          <span className="text-slate-500">{v.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Vitals / Top Bugs List */}
        {data?.rawData?.vitals?.error && (
          <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-sm flex items-start">
            <AlertTriangle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Play Console 상세 버그 내역을 보려면 API 활성화가 필요합니다.</p>
              <p className="mt-1 opacity-90">Google Cloud Console에서 <strong>Google Play Developer Reporting API</strong>를 활성화해주세요.</p>
              <p className="mt-1 text-xs opacity-75 font-mono">{data.rawData.vitals.error}</p>
            </div>
          </div>
        )}

        {data?.crashes.vitals && data.crashes.vitals.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-medium text-slate-900">Top Crash & ANR Issues (Play Console Vitals)</h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {data.crashes.vitals.map((issue: any, idx: number) => (
                <div key={idx} className="p-6 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mr-2 ${issue.type === 'ERROR_ISSUE_TYPE_CRASH' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                        {issue.type === 'ERROR_ISSUE_TYPE_CRASH' ? 'CRASH' : 'ANR'}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 break-all">{issue.errorString}</span>
                    </div>
                  </div>
                  {issue.cause && <p className="text-xs text-slate-500 mt-1 font-mono break-all">{issue.cause}</p>}
                  {issue.location && <p className="text-xs text-slate-500 mt-1 font-mono break-all">Location: {issue.location}</p>}
                  {issue.appVersion && <p className="text-xs text-slate-500 mt-1">Version: {issue.appVersion.versionString || issue.appVersion.versionCode}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review Texts List */}
        {data?.reviews.texts && data.reviews.texts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="font-medium text-slate-900">Recent Written Reviews</h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {data.reviews.texts.map((review) => (
                <div key={review.id} className="p-6 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <svg key={star} className={`w-4 h-4 ${star <= review.rating ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                      <span className="text-sm font-medium text-slate-900">{review.author}</span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(review.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{review.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data?.rawData && (
          <div className="mt-8 space-y-6">
            <h2 className="text-lg font-semibold text-slate-900">Raw API Responses (Debug)</h2>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-medium text-slate-700">
                Google Play Console (Reviews)
              </div>
              <div className="p-4 overflow-x-auto bg-slate-900 text-slate-300 text-xs font-mono max-h-96">
                <pre>{JSON.stringify(data.rawData.playConsole, null, 2)}</pre>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-medium text-slate-700">
                Google Play Console (Vitals / Crash Issues)
              </div>
              <div className="p-4 overflow-x-auto bg-slate-900 text-slate-300 text-xs font-mono max-h-96">
                <pre>{JSON.stringify(data.rawData.vitals, null, 2)}</pre>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-medium text-slate-700">
                Firebase Crashlytics (GA4)
              </div>
              <div className="p-4 overflow-x-auto bg-slate-900 text-slate-300 text-xs font-mono max-h-96">
                <pre>{JSON.stringify(data.rawData.ga4, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
