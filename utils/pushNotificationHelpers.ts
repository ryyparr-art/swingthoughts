import { db } from '@/constants/firebaseConfig';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

/**
 * Configure how notifications appear when app is in foreground
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request push notification permissions and get Expo Push Token
 * @param userId - Current user's Firebase UID
 * @returns Expo Push Token or null if failed
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  try {
    // Only works on physical devices
    if (!Device.isDevice) {
      console.log('📱 Push notifications only work on physical devices');
      return null;
    }

    // Check if we already have permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // If not granted, ask for permission
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    // If still not granted, exit
    if (finalStatus !== 'granted') {
      console.log('❌ Push notification permission denied');
      return null;
    }

    // Get the Expo Push Token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '5686fe17-0cdc-427b-8271-50f77a43f14b',
    });
    const token = tokenData.data;

    console.log('✅ Push token obtained:', token);

    // Save token to user's Firestore document
    if (userId && token) {
      await updateDoc(doc(db, 'users', userId), {
        expoPushToken: token,
        pushTokenUpdatedAt: new Date().toISOString(),
      });
      console.log('✅ Push token saved to Firestore');
    }

    // Android-specific: Set notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFD700',
      });
    }

    return token;
  } catch (error) {
    console.error('❌ Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Set up notification response listener
 * Called when user taps on a notification
 */
export function setupNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Set up notification received listener
 * Called when notification arrives while app is open
 */
export function setupNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(handler);
}