import { Navigate, useLocation } from 'react-router-dom';

interface PreserveSearchRedirectProps {
  to: string;
}

export default function PreserveSearchRedirect({
  to,
}: PreserveSearchRedirectProps) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}
