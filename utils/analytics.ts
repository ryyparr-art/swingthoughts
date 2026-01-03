import { analytics } from '@/constants/firebaseConfig';
import { logEvent } from 'firebase/analytics';

export const logAnalyticsEvent = (eventName: string, params?: Record<string, any>) => {
  try {
    // Always log to console in development
    if (__DEV__) {
      console.log(`📊 Analytics: ${eventName}`, params);
    }
    
    // Log to Firebase Analytics (web only for now)
    if (analytics) {
      logEvent(analytics, eventName, params || {});
    }
  } catch (error) {
    console.error('Analytics error:', error);
  }
};