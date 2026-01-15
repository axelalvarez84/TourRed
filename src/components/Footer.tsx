import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Facebook, Instagram, Linkedin, Mail, Phone } from 'lucide-react';

const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Por favor ingresa tu email' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/subscribe-newsletter`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: email.trim() }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: data.message || '¡Gracias por suscribirte!' });
        setEmail('');
      } else if (response.status === 409) {
        setMessage({ type: 'error', text: 'Este email ya está suscrito a nuestro boletín' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al procesar la suscripción' });
      }
    } catch (error) {
      console.error('Error subscribing to newsletter:', error);
      setMessage({ type: 'error', text: 'Error de conexión. Intenta nuevamente.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <footer className="bg-blue-900 text-white pt-12 pb-8">
      <div className="container-custom">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center mb-4">
              <img src="/logo copy.png" alt="ToursRed Logo" className="h-12 w-auto" />
            </div>
            <p className="text-gray-400 mb-4">
              Descubre destinos extraordinarios y experiencias inolvidables con nuestros socios de viaje de confianza.
            </p>
            <div className="flex space-x-4">
              <a href="https://www.facebook.com/ToursRedMX" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="https://www.instagram.com/toursredmx" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="https://www.tiktok.com/@toursredmx" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                <img src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/tiktok.svg" alt="TikTok" className="h-5 w-5" />
              </a>
              <a href="https://www.linkedin.com/company/toursredmx" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="https://x.com/ToursRedMX" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Enlaces Rápidos</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-gray-400 hover:text-white transition-colors">Inicio</Link>
              </li>
              <li>
                <Link to="/tours" className="text-gray-400 hover:text-white transition-colors">Tours</Link>
              </li>
              <li>
                <Link to="/about" className="text-gray-400 hover:text-white transition-colors">Nosotros</Link>
              </li>
              <li>
                <Link to="/contact" className="text-gray-400 hover:text-white transition-colors">Contacto</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Para Viajeros</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/login" className="text-gray-400 hover:text-white transition-colors">Iniciar Sesión</Link>
              </li>
              <li>
                <Link to="/signup" className="text-gray-400 hover:text-white transition-colors">Registrarse</Link>
              </li>
              <li>
                <Link to="/booking-guide" className="text-gray-400 hover:text-white transition-colors">Cómo Reservar</Link>
              </li>
              <li>
                <Link to="/faq" className="text-gray-400 hover:text-white transition-colors">Preguntas Frecuentes</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Contáctanos</h3>
            <ul className="space-y-2">
              <li className="flex items-center">
                <Mail className="h-5 w-5 text-gray-400 mr-2" />
                <a href="mailto:contacto@toursred.com" className="text-gray-400 hover:text-white transition-colors">
                  contacto@toursred.com
                </a>
              </li>
              <li className="flex items-center">
                <Phone className="h-5 w-5 text-gray-400 mr-2" />
                <a
                  href="https://wa.me/525547127668"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  +52 55 47127668
                </a>
              </li>
            </ul>
            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2">Suscríbete a nuestro boletín</h4>
              <form onSubmit={handleSubscribe}>
                <div className="flex">
                  <input
                    type="email"
                    placeholder="Tu correo"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="px-3 py-2 rounded-l-md w-full text-gray-900 text-sm disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-primary-600 px-3 py-2 rounded-r-md text-white font-medium text-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Enviando...' : 'Suscribirse'}
                  </button>
                </div>
                {message && (
                  <p className={`text-xs mt-2 ${message.type === 'success' ? 'text-green-300' : 'text-red-300'}`}>
                    {message.text}
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
        
        <div className="border-t border-blue-800 mt-8 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              &copy; {new Date().getFullYear()} ToursRed. Todos los derechos reservados.
            </p>
            <div className="flex flex-wrap gap-4 mt-4 md:mt-0 justify-center">
              <Link to="/aviso-privacidad" className="text-gray-400 hover:text-white text-sm transition-colors">
                Aviso de Privacidad
              </Link>
              <Link to="/terminos-servicio" className="text-gray-400 hover:text-white text-sm transition-colors">
                Términos de Servicio
              </Link>
              <Link to="/politica-cookies" className="text-gray-400 hover:text-white text-sm transition-colors">
                Política de Cookies
              </Link>
              <button
                onClick={() => {
                  localStorage.removeItem('cookie_consent');
                  window.location.reload();
                }}
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                Preferencias de Cookies
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;