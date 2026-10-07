import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { recordMemberActivity } from '../lib/analytics/memberActivity';

const publicDiscoveryPath = /^(\/|\/(discover|explore|map|globe)\/?|\/(clubs|events|venues|hosts|resorts|cruises)\/[A-Za-z0-9_-]+|\/(mobile|tablet)(\/?|\/(home|nearby|search)|\/(clubs|events)\/[A-Za-z0-9_-]+))$/;
const MemberActivityTracker = () => {
  const { currentUser } = useAppStore();
  const { pathname } = useLocation();
  useEffect(() => {
    if (currentUser?.id && publicDiscoveryPath.test(pathname)) void recordMemberActivity('page_view', pathname);
  }, [currentUser?.id, pathname]);
  return null;
};
export default MemberActivityTracker;
