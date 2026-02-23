import express from 'express';
import { createServer as createViteServer } from 'vite';
import { google } from 'googleapis';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/api/status', async (req, res) => {
  const debugLog: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    debugLog.push(msg);
  };

  try {
    log('API route /api/status started.');

    let packageName = process.env.ANDROID_PACKAGE_NAME;
    if (!packageName || packageName === 'com.mureung.obdproject') {
      packageName = 'mureung.obdproject';
    }
    log(`Package name: ${packageName}`);

    let reviewCount = 0;
    let crashCount = 0;
    let playConsoleRaw: any = null;
    let ga4Raw: any = null;

    // 1. Google Play Console
    try {
      const playJsonStr = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
      if (!playJsonStr) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing.');
      
      const playCredentials = JSON.parse(playJsonStr);
      log('Initializing Google Play API...');
      const auth = new google.auth.GoogleAuth({
        credentials: playCredentials,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });
      const androidpublisher = google.androidpublisher({ version: 'v3', auth });
      
      log('Fetching reviews...');
      const response = await androidpublisher.reviews.list({
        packageName,
        maxResults: 100,
      });

      playConsoleRaw = response.data; // Save raw data

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const reviews = response.data.reviews || [];
      const badReviews = reviews.filter((review: any) => {
        const rating = review.comments?.[0]?.userComment?.starRating;
        const lastModified = review.comments?.[0]?.userComment?.lastModified?.seconds;
        if (!rating || !lastModified) return false;
        const reviewDate = new Date(parseInt(lastModified, 10) * 1000);
        return rating <= 2 && reviewDate >= oneWeekAgo;
      });

      reviewCount = badReviews.length;
      log(`Play API success. Bad reviews: ${reviewCount}`);
    } catch (error: any) {
      log(`Play API Error: ${error.message}`);
      playConsoleRaw = { 
        error: error.message, 
        code: error.code, 
        response: error.response?.data || error.response 
      };
    }

    // 2. GA4 (Crashlytics)
    try {
      const fbJsonStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!fbJsonStr) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing.');
      
      const ga4Id = process.env.GA4_PROPERTY_ID;
      if (!ga4Id) throw new Error('GA4_PROPERTY_ID is missing.');

      const fbCredentials = JSON.parse(fbJsonStr);
      log('Initializing GA4 API...');
      const analyticsDataClient = new BetaAnalyticsDataClient({ credentials: fbCredentials });
      
      log('Fetching GA4 report...');
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${ga4Id}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { value: 'app_exception' }
          }
        }
      });

      ga4Raw = response; // Save raw data

      if (response.rows && response.rows.length > 0) {
        crashCount = parseInt(response.rows[0].metricValues?.[0]?.value || '0', 10);
      }
      log(`GA4 API success. Crash count: ${crashCount}`);
    } catch (error: any) {
      log(`GA4 API Error: ${error.message}`);
      ga4Raw = { 
        error: error.message, 
        code: error.code,
        details: error.details
      };
    }

    let reviewStatus = '정상';
    let reviewLevel = 'normal';
    if (playConsoleRaw?.error) {
      reviewStatus = '조회 실패';
      reviewLevel = 'warning';
    } else if (reviewCount > 6) {
      reviewStatus = '위기 (즉시 중단)';
      reviewLevel = 'critical';
    } else if (reviewCount >= 5) {
      reviewStatus = '주의 (내부 공유)';
      reviewLevel = 'warning';
    }

    let crashStatus = '정상';
    let crashLevel = 'normal';
    if (ga4Raw?.error) {
      crashStatus = '조회 실패';
      crashLevel = 'warning';
    } else if (crashCount > 1500) {
      crashStatus = '위기 (즉시 중단)';
      crashLevel = 'critical';
    } else if (crashCount >= 1001) {
      crashStatus = '주의 (내부 공유)';
      crashLevel = 'warning';
    }

    res.status(200).json({
      reviews: { count: reviewCount, status: reviewStatus, level: reviewLevel },
      crashes: { count: crashCount, status: crashStatus, level: crashLevel },
      updatedAt: new Date().toISOString(),
      debugLog,
      rawData: {
        playConsole: playConsoleRaw,
        ga4: ga4Raw
      }
    });
  } catch (error: any) {
    log(`FATAL ERROR: ${error.message}`);
    res.status(500).json({ error: error.message, debugLog });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
