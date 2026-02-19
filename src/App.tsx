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
import MembershipCheckout from './pages/traveler/MembershipCheckout';
import TravelerWallet from './pages/traveler/TravelerWallet';
import TravelerPoints from './pages/traveler/TravelerPoints';
import TravelerCompanions from './pages/traveler/TravelerCompanions';
import TravelerReferrals from './pages/traveler/TravelerReferrals';
import AgencyDashboard from './pages/agency/AgencyDashboard';
import AgencyTours from './pages/agency/AgencyTours';
import AgencyBookings from './pages/agency/AgencyBookings';
import AgencyProfile from './pages/agency/AgencyProfile';
import AgencyDestinations from './pages/agency/AgencyDestinations';
import AgencyDiscountCodes from './pages/agency/AgencyDiscountCodes';
import AgencyFinancials from './pages/agency/AgencyFinancials';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminAgencies from './pages/admin/AdminAgencies';
import AdminUsers from './pages/admin/AdminUsers';
import AdminTravelers from './pages/admin/AdminTravelers';
import AdminReviews from './pages/admin/AdminReviews';
import AdminMessages from './pages/admin/AdminMessages';
import AdminDestinations from './pages/admin/AdminDestinations';
import AdminDeparturePoints from './pages/admin/AdminDeparturePoints';
import AdminCategories from './pages/admin/AdminCategories';
import AdminProfile from './pages/admin/AdminProfile';
import AdminSettings from './pages/admin/AdminSettings';
import AdminMemberships from './pages/admin/AdminMemberships';
import AdminPoints from './pages/admin/AdminPoints';
import AdminInternationalInquiries from './pages/admin/AdminInternationalInquiries';
import AdminDiscountCodes from './pages/admin/AdminDiscountCodes';
import AdminPayouts from './pages/admin/AdminPayouts';
import AdminReferrals from './pages/admin/AdminReferrals';
import MegaTravelPage from './pages/international/MegaTravelPage';
import NefertariTravelPage from './pages/international/NefertariTravelPage';
import ExoticcaPage from './pages/international/ExoticcaPage';
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
import GiftCardsPage from './pages/GiftCardsPage';
import GiftCardRedeemPage from './pages/GiftCardRedeemPage';
import GiftCardSuccessPage from './pages/GiftCardSuccessPage';
import PaymentReturnPage from './pages/PaymentReturnPage';
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
          <Route path="/tours/international/nefertari-travel" element={<NefertariTravelPage />} />
          <Route path="/tours/international/exoticca" element={<ExoticcaPage />} />
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
          <Route path="/gift-cards" element={<GiftCardsPage />} />
          <Route path="/gift-card/redeem" element={<GiftCardRedeemPage />} />
          <Route path="/gift-card/success" element={<GiftCardSuccessPage />} />
          <Route path="/payment-return" element={<PaymentReturnPage />} />

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
          <Route
            path="/traveler/membership/checkout"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER]}>
                <MembershipCheckout />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traveler/wallet"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER]}>
                <TravelerWallet />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traveler/points"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER]}>
                <TravelerPoints />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traveler/companions"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER]}>
                <TravelerCompanions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traveler/referrals"
            element={
              <ProtectedRoute allowedRoles={[UserRole.TRAVELER]}>
                <TravelerReferrals />
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
            path="/agency/discount-codes"
            element={
              <ProtectedRoute allowedRoles={[UserRole.AGENCY]}>
                <AgencyDiscountCodes />
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
          <Route
            path="/agency/financials"
            element={
              <ProtectedRoute allowedRoles={[UserRole.AGENCY]}>
                <AgencyFinancials />
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
            path="/admin/departure-points"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminDeparturePoints />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/categories"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminCategories />
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
            path="/admin/points"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminPoints />
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
          <Route
            path="/admin/departure-points"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminDeparturePoints />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/discount-codes"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminDiscountCodes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/payouts"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminPayouts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/referrals"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminReferrals />
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