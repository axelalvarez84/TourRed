import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import CookieBanner from './components/CookieBanner';
import GoogleAnalytics from './components/GoogleAnalytics';
import HomePage from './pages/HomePage';
import TourCatalogPage from './pages/TourCatalogPage';
import TourDetailPage from './pages/TourDetailPage';
import MessagingPage from './pages/MessagingPage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import AgencySignupPage from './pages/auth/AgencySignupPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import TravelerDashboard from './pages/traveler/TravelerDashboard';
import TravelerBookings from './pages/traveler/TravelerBookings';
import TravelerProfile from './pages/traveler/TravelerProfile';
import TravelerMembership from './pages/traveler/TravelerMembership';
import AgencyDashboard from './pages/agency/AgencyDashboard';
import AgencyTours from './pages/agency/AgencyTours';
import AgencyBookings from './pages/agency/AgencyBookings';
import AgencyProfile from './pages/agency/AgencyProfile';
import AgencyDestinations from './pages/agency/AgencyDestinations';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminAgencies from './pages/admin/AdminAgencies';
import AdminUsers from './pages/admin/AdminUsers';
import AdminTravelers from './pages/admin/AdminTravelers';
import AdminReviews from './pages/admin/AdminReviews';
import AdminMessages from './pages/admin/AdminMessages';
import AdminDestinations from './pages/admin/AdminDestinations';
import AdminProfile from './pages/admin/AdminProfile';
import AdminSettings from './pages/admin/AdminSettings';
import AdminMemberships from './pages/admin/AdminMemberships';
import AdminInternationalInquiries from './pages/admin/AdminInternationalInquiries';
import MegaTravelPage from './pages/international/MegaTravelPage';
import ComingSoonPage from './pages/international/ComingSoonPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import CookiePolicyPage from './pages/CookiePolicyPage';
import SuccessPage from './pages/SuccessPage';
import CancelPage from './pages/CancelPage';
import BookingSuccessPage from './pages/BookingSuccessPage';
import BookingCancelPage from './pages/BookingCancelPage';
import BookingPendingPage from './pages/BookingPendingPage';
import TravelersInfoPage from './pages/TravelersInfoPage';
import NotificationsPage from './pages/NotificationsPage';
import AgencyPublicProfile from './pages/AgencyPublicProfile';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { UserRole } from './lib/supabase';

const App: React.FC = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <ScrollToTop />
      <GoogleAnalytics />
      <NavBar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tours" element={<TourCatalogPage />} />
          <Route path="/tours/:id" element={<TourDetailPage />} />
          <Route path="/tours/international/mega-travel" element={<MegaTravelPage />} />
          <Route path="/tours/international/coming-soon" element={<ComingSoonPage />} />
          <Route path="/agencies/:agencyId" element={<AgencyPublicProfile />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/aviso-privacidad" element={<PrivacyPolicyPage />} />
          <Route path="/terminos-servicio" element={<TermsOfServicePage />} />
          <Route path="/politica-cookies" element={<CookiePolicyPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/agency-signup" element={<AgencySignupPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/success" element={<SuccessPage />} />
          <Route path="/cancel" element={<CancelPage />} />
          <Route path="/booking-success" element={<BookingSuccessPage />} />
          <Route path="/booking-cancel" element={<BookingCancelPage />} />
          <Route path="/booking-pending/:bookingId" element={<BookingPendingPage />} />
          <Route path="/booking-travelers/:bookingId" element={<TravelersInfoPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />

          {/* Messaging Route - Available to all authenticated users */}
          <Route
            path="/messages"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER, UserRole.AGENCY, UserRole.ADMIN]}>
                <MessagingPage />
              </ProtectedRoute>
            }
          />

          {/* Traveler Routes */}
          <Route
            path="/traveler/dashboard"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER]}>
                <TravelerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traveler/bookings"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER]}>
                <TravelerBookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traveler/profile"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER]}>
                <TravelerProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traveler/membership"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER]}>
                <TravelerMembership />
              </ProtectedRoute>
            }
          />

          {/* Agency Routes */}
          <Route
            path="/agency/dashboard"
            element={
              <ProtectedRoute allowedRoles={[UserRole.AGENCY]}>
                <AgencyDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agency/tours"
            element={
              <ProtectedRoute allowedRoles={[UserRole.AGENCY]}>
                <AgencyTours />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agency/bookings"
            element={
              <ProtectedRoute allowedRoles={[UserRole.AGENCY]}>
                <AgencyBookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agency/profile"
            element={
              <ProtectedRoute allowedRoles={[UserRole.AGENCY]}>
                <AgencyProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agency/destinations"
            element={
              <ProtectedRoute allowedRoles={[UserRole.AGENCY]}>
                <AgencyDestinations />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/agencies"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminAgencies />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminUsers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/travelers"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminTravelers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reviews"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminReviews />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/messages"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminMessages />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/destinations"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminDestinations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/profile"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/memberships"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminMemberships />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/international-inquiries"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminInternationalInquiries />
              </ProtectedRoute>
            }
          />

          {/* Redirects based on role */}
          <Route
            path="/profile"
            element={<ProfileRedirect />}
          />
          <Route
            path="/dashboard"
            element={<DashboardRedirect />}
          />
          
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
      <CookieBanner />
    </div>
  );
};

// Helper components for role-based redirects
const ProfileRedirect: React.FC = () => {
  const { isAdmin, isAgency, isTraveler } = useAuth();
  
  if (isAdmin) return <Navigate to="/admin/profile" />;
  if (isAgency) return <Navigate to="/agency/profile" />;
  if (isTraveler) return <Navigate to="/traveler/profile" />;
  
  return <Navigate to="/login" />;
};

const DashboardRedirect: React.FC = () => {
  const { isAdmin, isAgency, isTraveler } = useAuth();
  
  if (isAdmin) return <Navigate to="/admin/dashboard" />;
  if (isAgency) return <Navigate to="/agency/dashboard" />;
  if (isTraveler) return <Navigate to="/traveler/dashboard" />;
  
  return <Navigate to="/login" />;
};

export default App;