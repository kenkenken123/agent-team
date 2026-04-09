export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.warn('浏览器不支持通知功能');
    return;
  }

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
};

export const showNotification = (title: string, options?: NotificationOptions) => {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    // 如果页面处于活跃状态，可以考虑不弹出通知或只在特定情况下弹出
    // if (document.visibilityState === 'visible') return;

    const notification = new Notification(title, {
      icon: '/favicon.ico', // 或者使用项目的 logo
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
};
