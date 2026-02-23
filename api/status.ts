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

    // Query parameters
    const rangeDays = parseInt(req.query.range || '7', 10);
    const compareType = req.query.compare || 'week'; // 'day' or 'week'

    let packageName = process.env.ANDROID_PACKAGE_NAME;
    if (!packageName || packageName === 'com.mureung.obdproject') {
      packageName = 'mureung.obdproject';
    }
    log(`Package name: ${packageName}, Range: ${rangeDays} days, Compare: ${compareType}`);

    let playConsoleRaw: any = null;
    let ga4Raw: any = null;

    // --- 1. Google Play Console (Reviews) ---
    let currentReviews: any[] = [];
    let previousReviews: any[] = [];
    let currentAvg = 0;
    let previousAvg = 0;
    let reviewTexts: any[] = [];
    
    let playAuth: any = null;

    try {
      const playJsonStr = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
      if (!playJsonStr) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing.');
      
      const playCredentials = JSON.parse(playJsonStr);
      playAuth = new google.auth.GoogleAuth({
        credentials: playCredentials,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });
      
      const androidpublisher = google.androidpublisher({ version: 'v3', auth: playAuth });
      
      log('Fetching reviews...');
      const response = await androidpublisher.reviews.list({
        packageName,
        maxResults: 100, // Fetching max to do local filtering
      });

      playConsoleRaw = response.data;

      const now = new Date();
      const currentPeriodStart = new Date();
      currentPeriodStart.setDate(now.getDate() - rangeDays);

      const previousPeriodStart = new Date(currentPeriodStart);
      if (compareType === 'day') {
        previousPeriodStart.setDate(previousPeriodStart.getDate() - rangeDays);
      } else {
        // week
        previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);
      }

      const allReviews = response.data.reviews || [];
      
      allReviews.forEach((review: any) => {
        const comment = review.comments?.[0]?.userComment;
        if (!comment) return;
        
        const rating = comment.starRating;
        const text = comment.text?.trim() || '';
        const lastModified = comment.lastModified?.seconds;
        if (!rating || !lastModified) return;
        
        const reviewDate = new Date(parseInt(lastModified, 10) * 1000);

        if (reviewDate >= currentPeriodStart && reviewDate <= now) {
          currentReviews.push(rating);
          if (text) {
            reviewTexts.push({
              id: review.reviewId,
              rating,
              text,
              date: reviewDate.toISOString(),
              author: review.authorName || 'Anonymous'
            });
          }
        } else if (reviewDate >= previousPeriodStart && reviewDate < currentPeriodStart) {
          previousReviews.push(rating);
        }
      });

      currentAvg = currentReviews.length > 0 
        ? currentReviews.reduce((a, b) => a + b, 0) / currentReviews.length 
        : 0;
      
      previousAvg = previousReviews.length > 0 
        ? previousReviews.reduce((a, b) => a + b, 0) / previousReviews.length 
        : 0;

      // Sort reviews by date descending
      reviewTexts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      log(`Play API success. Current Avg: ${currentAvg.toFixed(2)}, Prev Avg: ${previousAvg.toFixed(2)}`);

    } catch (error: any) {
      log(`Play API Error: ${error.message}`);
      playConsoleRaw = { error: error.message };
    }

    // --- 1-B. Google Play Developer Reporting API (Vitals / Detailed Bugs) ---
    let vitalsRaw: any = null;
    let vitalsIssues: any[] = [];
    
    if (playAuth) {
      try {
        log('Initializing Play Developer Reporting API (Vitals)...');
        const reporting = google.playdeveloperreporting({ version: 'v1beta1', auth: playAuth });
        const vitalsRes = await reporting.vitals.errors.issues.search({
          parent: `apps/${packageName}`,
          pageSize: 15,
        });
        vitalsRaw = vitalsRes.data;
        vitalsIssues = vitalsRes.data.errorIssues || [];
        log(`Vitals API success. Found ${vitalsIssues.length} issues.`);
      } catch (e: any) {
        log(`Vitals API Error: ${e.message}`);
        vitalsRaw = { error: e.message };
      }
    } else {
      vitalsRaw = { error: 'Play Console Auth failed, skipping Vitals API.' };
    }

    // --- 2. GA4 (Crashlytics) ---
    let crashCount = 0;
    let crashVersions: any[] = [];
    try {
      const fbJsonStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!fbJsonStr) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing.');
      
      const ga4Id = process.env.GA4_PROPERTY_ID;
      if (!ga4Id) throw new Error('GA4_PROPERTY_ID is missing.');

      const fbCredentials = JSON.parse(fbJsonStr);
      const analyticsDataClient = new BetaAnalyticsDataClient({ credentials: fbCredentials });
      
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${ga4Id}`,
        dateRanges: [{ startDate: `${rangeDays}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'appVersion' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { value: 'app_exception' }
          }
        }
      });

      ga4Raw = response;
      if (response.rows && response.rows.length > 0) {
        crashVersions = response.rows.map((row: any) => ({
          version: row.dimensionValues?.[0]?.value || 'Unknown',
          count: parseInt(row.metricValues?.[0]?.value || '0', 10)
        })).sort((a: any, b: any) => b.count - a.count);
        
        crashCount = crashVersions.reduce((sum, v) => sum + v.count, 0);
      }
      log(`GA4 API success. Crash count: ${crashCount}`);
    } catch (error: any) {
      log(`GA4 API Error: ${error.message}`);
      ga4Raw = { error: error.message };
    }

    // --- 3. Determine Status ---
    // Count 1~2 star reviews in current period for status
    const badReviewCount = currentReviews.filter(r => r <= 2).length;
    
    let reviewStatus = '정상';
    let reviewLevel = 'normal';
    if (playConsoleRaw?.error) {
      reviewStatus = '조회 실패';
      reviewLevel = 'warning';
    } else if (badReviewCount > 6) {
      reviewStatus = '위기 (즉시 중단)';
      reviewLevel = 'critical';
    } else if (badReviewCount >= 5) {
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
      reviews: { 
        count: badReviewCount, 
        status: reviewStatus, 
        level: reviewLevel,
        average: currentAvg,
        previousAverage: previousAvg,
        texts: reviewTexts
      },
      crashes: { 
        count: crashCount, 
        status: crashStatus, 
        level: crashLevel,
        versions: crashVersions,
        vitals: vitalsIssues
      },
      updatedAt: new Date().toISOString(),
      debugLog,
      rawData: { playConsole: playConsoleRaw, ga4: ga4Raw, vitals: vitalsRaw }
    });
  } catch (error: any) {
    log(`FATAL ERROR: ${error.message}`);
    res.status(500).json({ error: error.message, debugLog });
  }
}
