import * as Sentry from 'sentry-expo';

Sentry.init({
  dsn: 'https://3e6ce31974045bcc379eaea97db678c2@o4510644939390976.ingest.us.sentry.io/4510644944764928',
  enableInExpoDevelopment: true,
  debug: __DEV__,
  tracesSampleRate: 1.0,
  environment: __DEV__ ? 'development' : 'production',
  beforeSend(event) {
    if (__DEV__) {
      console.log('Sentry Event:', event);
      return null;
    }
    return event;
  },
});