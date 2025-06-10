import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import TourCatalogPage from './pages/TourCatalogPage';
import TourDetailPage from './pages/TourDetailPage';
import MessagingPage from './pages/MessagingPage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import AgencySignupPage from './pages/auth/AgencySignupPage';
import TravelerDashboard from './pages/traveler/TravelerDashboard';
import TravelerBookings from './pages/traveler/TravelerBookings';
import TravelerProfile from './pages/traveler/TravelerProfile';
import AgencyDashboard from './pages/agency/AgencyDashboard';
import AgencyTours from './pages/agency/AgencyTours';
import AgencyBookings from './pages/agency/AgencyBookings';
import AgencyProfile from './pages/agency/AgencyProfile';
import AgencyDestinations from './pages/agency/AgencyDestinations';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminAgencies from './pages/admin/AdminAgencies';
import AdminUsers from './pages/admin/AdminUsers';
import AdminReviews from './pages/admin/AdminReviews';
import AdminMessages from './pages/admin/AdminMessages';
import AdminProfile from './pages/admin/AdminProfile';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import SuccessPage from './pages/SuccessPage';
import CancelPage from './pages/CancelPage';
import BookingSuccessPage from './pages/BookingSuccessPage';
import BookingCancelPage from './pages/BookingCancelPage';
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
      <NavBar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tours" element={<TourCatalogPage />} />
          <Route path="/tours/:id" element={<TourDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/agency-signup" element={<AgencySignupPage />} />
          <Route path="/success" element={<SuccessPage />} />
          <Route path="/cancel" element={<CancelPage />} />
          <Route path="/booking-success" element={<BookingSuccessPage />} />
          <Route path="/booking-cancel" element={<BookingCancelPage />} />

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
            path="/admin/profile"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AdminProfile />
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