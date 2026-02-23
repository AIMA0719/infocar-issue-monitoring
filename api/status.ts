import { google } from 'googleapis';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const debugLog: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    debugLog.push(msg);
  };

  try {
    log('API route /api/status started.');

    let packageName = process.env.ANDROID_PACKAGE_NAME;
    // 사용자가 com.mureung.obdproject로 설정했더라도 mureung.obdproject로 강제 변환하여 테스트
    if (!packageName || packageName === 'com.mureung.obdproject') {
      packageName = 'mureung.obdproject';
    }
    log(`Package name: ${packageName}`);

    const playJsonStr = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (!playJsonStr) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing.');
    log(`Play JSON length: ${playJsonStr.length}`);

    const fbJsonStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!fbJsonStr) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing.');
    log(`Firebase JSON length: ${fbJsonStr.length}`);

    const ga4Id = process.env.GA4_PROPERTY_ID;
    if (!ga4Id) throw new Error('GA4_PROPERTY_ID is missing.');
    log(`GA4 Property ID: ${ga4Id}`);

    let playCredentials;
    try {
      playCredentials = JSON.parse(playJsonStr);
      log('Play JSON parsed successfully.');
    } catch (e: any) {
      throw new Error(`Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_JSON. Is it valid JSON? Error: ${e.message}`);
    }

    let fbCredentials;
    try {
      fbCredentials = JSON.parse(fbJsonStr);
      log('Firebase JSON parsed successfully.');
    } catch (e: any) {
      throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. Is it valid JSON? Error: ${e.message}`);
    }

    let reviewCount = 0;
    try {
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
      throw new Error(`Google Play API Error: ${error.message}`);
    }

    let crashCount = 0;
    try {
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

      if (response.rows && response.rows.length > 0) {
        crashCount = parseInt(response.rows[0].metricValues?.[0]?.value || '0', 10);
      }
      log(`GA4 API success. Crash count: ${crashCount}`);
    } catch (error: any) {
      throw new Error(`Firebase/GA4 API Error: ${error.message}`);
    }

    let reviewStatus = '정상';
    let reviewLevel = 'normal';
    if (reviewCount > 6) {
      reviewStatus = '위기 (즉시 중단)';
      reviewLevel = 'critical';
    } else if (reviewCount >= 5) {
      reviewStatus = '주의 (내부 공유)';
      reviewLevel = 'warning';
    }

    let crashStatus = '정상';
    let crashLevel = 'normal';
    if (crashCount > 1500) {
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
      debugLog
    });
  } catch (error: any) {
    log(`FATAL ERROR: ${error.message}`);
    res.status(500).json({ error: error.message, debugLog });
  }
}
