import { google } from 'googleapis';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const packageName = process.env.ANDROID_PACKAGE_NAME;
    if (!packageName) {
      throw new Error('ANDROID_PACKAGE_NAME environment variable is missing.');
    }

    let reviewCount = 0;
    let crashCount = 0;

    // 1. Get Play Console Reviews (1~2 stars, last 7 days)
    if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
      throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON environment variable is missing.');
    }

    try {
      const credentials = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });
      const androidpublisher = google.androidpublisher({ version: 'v3', auth });
      
      const response = await androidpublisher.reviews.list({
        packageName,
        maxResults: 100, // Adjust as needed
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
    } catch (error: any) {
      console.error('Error fetching Play Console reviews:', error);
      throw new Error(`Google Play API Error: ${error.message}`);
    }

    // 2. Get Crashlytics Data
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable is missing.');
    }

    if (!process.env.GA4_PROPERTY_ID) {
      throw new Error('GA4_PROPERTY_ID environment variable is missing. (Required to fetch Crashlytics data via GA4)');
    }

    try {
      const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      const analyticsDataClient = new BetaAnalyticsDataClient({ credentials });
      
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${process.env.GA4_PROPERTY_ID}`,
        dateRanges: [
          {
            startDate: '7daysAgo',
            endDate: 'today',
          },
        ],
        metrics: [
          {
            name: 'eventCount',
          },
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: {
              value: 'app_exception', // Crashlytics logs crashes as app_exception in GA4
            }
          }
        }
      });

      if (response.rows && response.rows.length > 0) {
        crashCount = parseInt(response.rows[0].metricValues?.[0]?.value || '0', 10);
      }
    } catch (error: any) {
      console.error('Error fetching GA4 Crash data:', error);
      throw new Error(`Firebase/GA4 API Error: ${error.message}`);
    }

    // 3. Determine Status
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
      updatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
