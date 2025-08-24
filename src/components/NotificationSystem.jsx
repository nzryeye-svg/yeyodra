import { useState, useEffect } from 'react';
import { FiCheck, FiX, FiAlertTriangle, FiInfo } from 'react-icons/fi';
import './NotificationSystem.scss';

const NotificationSystem = ({ notifications, removeNotification }) => {
  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <FiCheck />;
      case 'error':
        return <FiX />;
      case 'warning':
        return <FiAlertTriangle />;
      default:
        return <FiInfo />;
    }
  };

  return (
    <div className="notification-system">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={removeNotification}
          icon={getIcon(notification.type)}
        />
      ))}
    </div>
  );
};

const NotificationItem = ({ notification, onRemove, icon }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    // Show animation
    setTimeout(() => setIsVisible(true), 50);

    // Auto remove after duration
    const timer = setTimeout(() => {
      handleRemove();
    }, notification.duration || 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleRemove = () => {
    setIsRemoving(true);
    setTimeout(() => {
      onRemove(notification.id);
    }, 300);
  };

  return (
    <div
      className={`notification-item notification-item--${notification.type} ${
        isVisible ? 'notification-item--visible' : ''
      } ${isRemoving ? 'notification-item--removing' : ''}`}
    >
      <div className="notification-item__icon">
        {icon}
      </div>
      <div className="notification-item__content">
        {notification.title && (
          <div className="notification-item__title">{notification.title}</div>
        )}
        <div className="notification-item__message">{notification.message}</div>
      </div>
      <button
        className="notification-item__close"
        onClick={handleRemove}
        aria-label="Close notification"
      >
        <FiX />
      </button>
    </div>
  );
};

export default NotificationSystem;
