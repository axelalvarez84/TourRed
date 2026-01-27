import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, User, LogOut, Compass, Search, MessageCircle, ChevronDown } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useAuth } from '../context/AuthContext';
import { signOut, supabase } from '../lib/supabase';

const NavBar: React.FC = () => {
  const { user, isAdmin, isAgency, isTraveler, isEmailVerified, isSuperAdmin, permissions } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isToursDropdownOpen, setIsToursDropdownOpen] = useState(false);
  const [isMobileToursOpen, setIsMobileToursOpen] = useState(false);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const navigate = useNavigate();

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const toggleProfile = () => setIsProfileOpen(!isProfileOpen);
  const toggleMobileTours = () => setIsMobileToursOpen(!isMobileToursOpen);

  useEffect(() => {
    const fetchProfilePicture = async () => {
      if (user?.id) {
        const { data } = await supabase
          .from('users')
          .select('profile_picture_url')
          .eq('id', user.id)
          .maybeSingle();

        if (data?.profile_picture_url) {
          setProfilePicture(data.profile_picture_url);
        } else {
          setProfilePicture(null);
        }
      } else {
        setProfilePicture(null);
      }
    };

    fetchProfilePicture();

    if (user?.id) {
      const channel = supabase
        .channel('profile-picture-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: `id=eq.${user.id}`
          },
          (payload) => {
            if (payload.new?.profile_picture_url) {
              setProfilePicture(payload.new.profile_picture_url);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    setIsProfileOpen(false);
  };

  const getDashboardLink = () => {
    if (isAdmin) return '/admin/dashboard';
    if (isAgency) return '/agency/dashboard';
    return '/traveler/dashboard';
  };

  const getProfileLink = () => {
    if (isAdmin) return '/admin/profile';
    if (isAgency) return '/agency/profile';
    return '/traveler/profile';
  };

  const getRoleSpecificMenuItems = () => {
    if (isAdmin) {
      const menuItems = [];

      menuItems.push({ to: '/admin/dashboard', label: 'Panel Admin' });

      if (isSuperAdmin || permissions?.canManageAgencies) {
        menuItems.push({ to: '/admin/agencies', label: 'Agencias' });
      }

      if (isSuperAdmin || permissions?.canManageUsers) {
        menuItems.push({ to: '/admin/users', label: 'Usuarios' });
      }

      if (isSuperAdmin || permissions?.canManageTravelers) {
        menuItems.push({ to: '/admin/travelers', label: 'Viajeros' });
      }

      if (isSuperAdmin || permissions?.canManageDestinations) {
        menuItems.push({ to: '/admin/destinations', label: 'Destinos' });
      }

      if (isSuperAdmin || permissions?.canManageCategories) {
        menuItems.push({ to: '/admin/categories', label: 'Categorías' });
      }

      if (isSuperAdmin || permissions?.canManageDeparturePoints) {
        menuItems.push({ to: '/admin/departure-points', label: 'Puntos de Partida' });
      }

      if (isSuperAdmin || permissions?.canManageReviews) {
        menuItems.push({ to: '/admin/reviews', label: 'Reseñas' });
      }

      if (isSuperAdmin || permissions?.canManageMessages) {
        menuItems.push({ to: '/admin/messages', label: 'Mensajes' });
      }

      if (isSuperAdmin || permissions?.canManageInquiries) {
        menuItems.push({ to: '/admin/international-inquiries', label: 'Cotizaciones Internac.' });
      }

      if (isSuperAdmin || permissions?.canManageSettings) {
        menuItems.push({ to: '/admin/settings', label: 'Configuración' });
      }

      if (isSuperAdmin || permissions?.canManageMemberships) {
        menuItems.push({ to: '/admin/memberships', label: 'Membresías' });
      }

      if (isSuperAdmin || permissions?.canManagePoints) {
        menuItems.push({ to: '/admin/points', label: 'Puntos' });
      }

      if (isSuperAdmin || permissions?.canManageDiscountCodes) {
        menuItems.push({ to: '/admin/discount-codes', label: 'Códigos Descuento' });
      }

      return menuItems;
    }

    if (isAgency) {
      return [
        { to: '/agency/dashboard', label: 'Panel' },
        { to: '/agency/tours', label: 'Tours' },
        { to: '/agency/destinations', label: 'Destinos' },
        { to: '/agency/bookings', label: 'Reservas' },
      ];
    }

    if (isTraveler) {
      return [
        { to: '/traveler/dashboard', label: 'Panel' },
        { to: '/traveler/bookings', label: 'Reservas' },
        { to: '/traveler/membership', label: 'ToursRed Plus' },
        { to: '/traveler/wallet', label: 'ToursRed Cash' },
        { to: '/traveler/points', label: 'ToursRed Points' },
      ];
    }

    return [];
  };

  return (
    <nav className="bg-blue-50 shadow-sm sticky top-0 z-50">
      <div className="container-custom">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <img src="/logo copy.png" alt="ToursRed Logo" loading="lazy" className="h-12 w-auto" />
            </Link>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link to="/" className="border-transparent text-gray-500 hover:border-primary-500 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                Inicio
              </Link>

              <div
                className="relative inline-flex items-center"
                onMouseEnter={() => setIsToursDropdownOpen(true)}
                onMouseLeave={() => setIsToursDropdownOpen(false)}
              >
                <button className="border-transparent text-gray-500 hover:border-primary-500 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  Tours
                  <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isToursDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isToursDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
                    <div className="py-1" role="menu">
                      <Link
                        to="/tours"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-primary-600"
                        role="menuitem"
                      >
                        Tours Nacionales
                      </Link>
                      <div className="border-t border-gray-100"></div>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Tours Internacionales
                      </div>
                      <Link
                        to="/tours/international/mega-travel"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-primary-600"
                        role="menuitem"
                      >
                        Mega Travel
                      </Link>
                      <Link
                        to="/tours/international/exoticca"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-primary-600"
                        role="menuitem"
                      >
                        Exoticca
                      </Link>
                      <Link
                        to="/tours/international/coming-soon"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-primary-600"
                        role="menuitem"
                      >
                        Otras Agencias
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <Link to="/about" className="border-transparent text-gray-500 hover:border-primary-500 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                Nosotros
              </Link>
              <Link to="/contact" className="border-transparent text-gray-500 hover:border-primary-500 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                Contacto
              </Link>
              <Link to="/gift-cards" className="border-transparent text-gray-500 hover:border-primary-500 hover:text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                Tarjetas de Regalo
              </Link>
            </div>
          </div>
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            <Link to="/search" className="p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
              <Search className="h-6 w-6" />
            </Link>

            {user && isEmailVerified && (
              <>
                <div className="ml-3 p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                  <NotificationBell />
                </div>

                <Link to="/messages" className="ml-3 p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                  <MessageCircle className="h-6 w-6" />
                </Link>
              </>
            )}
            
            {user ? (
              <div className="ml-3 relative">
                <div>
                  <button
                    onClick={toggleProfile}
                    className="bg-blue-100 rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    id="user-menu-button"
                    aria-expanded="false"
                    aria-haspopup="true"
                  >
                    <span className="sr-only">Abrir menú de usuario</span>
                    <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 overflow-hidden">
                      {profilePicture ? (
                        <img
                          src={profilePicture}
                          alt="Perfil"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="h-5 w-5" />
                      )}
                    </div>
                  </button>
                </div>
                
                {isProfileOpen && (
                  <div
                    className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-blue-50 ring-1 ring-black ring-opacity-5 focus:outline-none"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="user-menu-button"
                    tabIndex={-1}
                  >
                    {!isEmailVerified ? (
                      <>
                        <Link
                          to="/verify-email"
                          className="block px-4 py-2 text-sm text-orange-600 hover:bg-blue-100 font-medium"
                          role="menuitem"
                          onClick={() => setIsProfileOpen(false)}
                        >
                          Verificar Email
                        </Link>
                        <div className="border-t border-gray-100 my-1"></div>
                      </>
                    ) : (
                      <>
                        {/* Role-specific menu items */}
                        {getRoleSpecificMenuItems().map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-100"
                            role="menuitem"
                            onClick={() => setIsProfileOpen(false)}
                          >
                            {item.label}
                          </Link>
                        ))}

                        {/* Separator if there are role-specific items */}
                        {getRoleSpecificMenuItems().length > 0 && (
                          <div className="border-t border-gray-100 my-1"></div>
                        )}

                        <Link
                          to={getProfileLink()}
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-blue-100"
                          role="menuitem"
                          onClick={() => setIsProfileOpen(false)}
                        >
                          Perfil
                        </Link>
                      </>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-blue-100"
                      role="menuitem"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link to="/login" className="text-gray-500 hover:text-gray-900 text-sm font-medium">
                  Iniciar sesión
                </Link>
                <Link to="/signup" className="btn btn-primary">
                  Registrarse
                </Link>
              </div>
            )}
          </div>
          
          <div className="flex items-center sm:hidden">
            <Link to="/search" className="p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 mr-2">
              <Search className="h-6 w-6" />
            </Link>
            {user && (
              <div className="flex items-center">
                <Link to="/messages" className="p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 mr-2">
                  <MessageCircle className="h-6 w-6" />
                </Link>
                <div className="p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 mr-2">
                  <NotificationBell />
                </div>
              </div>
            )}
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
              aria-expanded="false"
            >
              <span className="sr-only">Abrir menú principal</span>
              {isMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="sm:hidden" id="mobile-menu">
          <div className="pt-2 pb-3 space-y-1">
            <Link
              to="/"
              className="bg-primary-50 border-primary-500 text-primary-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium"
              onClick={toggleMenu}
            >
              Inicio
            </Link>

            <div>
              <button
                onClick={toggleMobileTours}
                className="w-full flex items-center justify-between border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 pl-3 pr-4 py-2 border-l-4 text-base font-medium"
              >
                <span>Tours</span>
                <ChevronDown className={`h-5 w-5 transition-transform ${isMobileToursOpen ? 'rotate-180' : ''}`} />
              </button>

              {isMobileToursOpen && (
                <div className="pl-8 pr-4 py-2 space-y-1 bg-blue-50">
                  <Link
                    to="/tours"
                    className="block py-2 text-sm text-gray-600 hover:text-gray-900"
                    onClick={toggleMenu}
                  >
                    Tours Nacionales
                  </Link>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider py-1">
                    Tours Internacionales
                  </div>
                  <Link
                    to="/tours/international/mega-travel"
                    className="block py-2 text-sm text-gray-600 hover:text-gray-900"
                    onClick={toggleMenu}
                  >
                    Mega Travel
                  </Link>
                  <Link
                    to="/tours/international/exoticca"
                    className="block py-2 text-sm text-gray-600 hover:text-gray-900"
                    onClick={toggleMenu}
                  >
                    Exoticca
                  </Link>
                  <Link
                    to="/tours/international/coming-soon"
                    className="block py-2 text-sm text-gray-600 hover:text-gray-900"
                    onClick={toggleMenu}
                  >
                    Otras Agencias
                  </Link>
                </div>
              )}
            </div>

            <Link
              to="/about"
              className="border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium"
              onClick={toggleMenu}
            >
              Nosotros
            </Link>
            <Link
              to="/contact"
              className="border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium"
              onClick={toggleMenu}
            >
              Contacto
            </Link>
            <Link
              to="/gift-cards"
              className="border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium"
              onClick={toggleMenu}
            >
              Tarjetas de Regalo
            </Link>
          </div>
          <div className="pt-4 pb-3 border-t border-gray-200">
            {user ? (
              <>
                <div className="flex items-center px-4">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700">
                      <User className="h-6 w-6" />
                    </div>
                  </div>
                  <div className="ml-3">
                    <div className="text-base font-medium text-gray-800">
                      {user.email}
                    </div>
                    <div className="text-sm text-gray-500">
                      {isAdmin ? 'Administrador' : isAgency ? 'Agencia' : 'Viajero'}
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {/* Role-specific mobile menu items */}
                  {getRoleSpecificMenuItems().map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-blue-100"
                      onClick={toggleMenu}
                    >
                      {item.label}
                    </Link>
                  ))}

                  <Link
                    to={getProfileLink()}
                    className="block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-blue-100"
                    onClick={toggleMenu}
                  >
                    Perfil
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-blue-100"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-3 space-y-1 px-4">
                <Link
                  to="/login"
                  className="block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-blue-100"
                  onClick={toggleMenu}
                >
                  Iniciar sesión
                </Link>
                <Link
                  to="/signup"
                  className="block px-4 py-2 text-base font-medium bg-primary-600 text-white rounded-md"
                  onClick={toggleMenu}
                >
                  Registrarse
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default NavBar;