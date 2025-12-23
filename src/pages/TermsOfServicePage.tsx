import { Link } from 'react-router-dom';
import { FileText, Scale, AlertTriangle, CheckCircle } from 'lucide-react';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-green-600 to-green-800 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="h-12 w-12" />
            <h1 className="text-4xl font-bold">Términos y Condiciones de Servicio</h1>
          </div>
          <p className="text-xl text-green-100">
            Última actualización: 23 de diciembre de 2024
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-xl shadow-sm p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Aceptación de los Términos</h2>
            <p className="text-gray-700 leading-relaxed">
              Al acceder y utilizar ToursRed, usted acepta estar sujeto a estos Términos y Condiciones de Servicio, todas las leyes y regulaciones aplicables, y acepta que es responsable del cumplimiento de las leyes locales aplicables. Si no está de acuerdo con alguno de estos términos, tiene prohibido usar o acceder a este sitio.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Descripción del Servicio</h2>
            <p className="text-gray-700 mb-3">
              ToursRed es una plataforma marketplace que conecta a viajeros con agencias de viajes para la reserva de tours y experiencias turísticas. Nuestro servicio incluye:
            </p>
            <div className="grid gap-3">
              <div className="flex items-start gap-3 bg-green-50 rounded-lg p-4">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">Catálogo de tours y experiencias turísticas</p>
              </div>
              <div className="flex items-start gap-3 bg-green-50 rounded-lg p-4">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">Sistema de reservas y pagos en línea</p>
              </div>
              <div className="flex items-start gap-3 bg-green-50 rounded-lg p-4">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">Sistema de mensajería entre usuarios y agencias</p>
              </div>
              <div className="flex items-start gap-3 bg-green-50 rounded-lg p-4">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">Sistema de reseñas y calificaciones</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Registro y Cuentas de Usuario</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">3.1 Requisitos de Registro</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Debe ser mayor de 18 años para crear una cuenta</li>
                  <li>Debe proporcionar información precisa y completa</li>
                  <li>Es responsable de mantener la confidencialidad de su contraseña</li>
                  <li>Debe notificarnos inmediatamente cualquier uso no autorizado de su cuenta</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">3.2 Tipos de Cuentas</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li><strong>Viajeros:</strong> Pueden buscar, reservar y calificar tours</li>
                  <li><strong>Agencias:</strong> Pueden publicar tours, gestionar reservas y recibir pagos</li>
                  <li><strong>Administradores:</strong> Gestionan la plataforma y supervisan el cumplimiento</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Reservas y Pagos</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">4.1 Proceso de Reserva</h3>
                <p className="text-gray-700">
                  Al realizar una reserva, usted ingresa en un contrato directo con la agencia de viajes que ofrece el tour. ToursRed actúa únicamente como intermediario facilitando la transacción.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">4.2 Pagos</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Los pagos se procesan de forma segura a través de Stripe</li>
                  <li>Se requiere un depósito según el porcentaje establecido por la agencia</li>
                  <li>ToursRed cobra una comisión por cada transacción completada</li>
                  <li>Los precios incluyen IVA cuando sea aplicable</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">4.3 Confirmación</h3>
                <p className="text-gray-700">
                  Recibirá una confirmación por correo electrónico una vez que su reserva sea procesada. La agencia tiene derecho a aceptar o rechazar reservas según disponibilidad.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Política de Cancelación y Reembolsos</h2>
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900">Importante</h3>
                  <p className="text-gray-700 text-sm mt-1">
                    Las políticas de cancelación específicas son establecidas por cada agencia de viajes. Revise cuidadosamente la política de cancelación antes de confirmar su reserva.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-gray-700">
              <p><strong>Cancelación por parte del viajero:</strong> Sujeta a los términos de la agencia</p>
              <p><strong>Cancelación por parte de la agencia:</strong> Reembolso completo del depósito</p>
              <p><strong>Comisión de ToursRed:</strong> No reembolsable en caso de cancelación por el viajero</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Responsabilidades de los Usuarios</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">6.1 Viajeros</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Proporcionar información de identificación válida cuando se requiera</li>
                  <li>Cumplir con los términos y condiciones del tour contratado</li>
                  <li>Respetar las normas de conducta durante el tour</li>
                  <li>Realizar reseñas honestas y constructivas</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">6.2 Agencias de Viajes</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Contar con las licencias y permisos necesarios para operar</li>
                  <li>Proporcionar información precisa sobre los tours</li>
                  <li>Mantener estándares de calidad en los servicios ofrecidos</li>
                  <li>Cumplir con las obligaciones fiscales aplicables</li>
                  <li>Responder a consultas y reclamaciones de manera oportuna</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Propiedad Intelectual</h2>
            <p className="text-gray-700">
              Todo el contenido de ToursRed, incluyendo textos, gráficos, logos, iconos, imágenes, clips de audio, descargas digitales y compilaciones de datos, es propiedad de ToursRed o de sus proveedores de contenido y está protegido por las leyes mexicanas e internacionales de derechos de autor.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Limitación de Responsabilidad</h2>
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <p className="text-gray-700">
                ToursRed actúa como intermediario entre viajeros y agencias de viajes. No somos responsables de:
              </p>
              <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4 mt-2">
                <li>La calidad, seguridad o legalidad de los tours ofrecidos</li>
                <li>Lesiones, pérdidas o daños ocurridos durante los tours</li>
                <li>Incumplimiento de contratos por parte de las agencias</li>
                <li>Retrasos, cancelaciones o cambios en los servicios</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Resolución de Disputas</h2>
            <p className="text-gray-700 mb-3">
              En caso de disputas relacionadas con reservas o servicios, recomendamos primero intentar resolver el conflicto directamente con la agencia de viajes. Si no se alcanza una resolución satisfactoria, puede contactarnos para mediar en la situación.
            </p>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700 font-medium">Contacto para disputas:</p>
              <a href="mailto:contacto@toursred.com" className="text-blue-600 hover:text-blue-700 underline">
                contacto@toursred.com
              </a>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Ley Aplicable y Jurisdicción</h2>
            <div className="flex items-start gap-3">
              <Scale className="h-6 w-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <p className="text-gray-700 mb-2">
                  Estos Términos y Condiciones se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier disputa relacionada con estos términos será sometida a la jurisdicción exclusiva de los tribunales competentes de México.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Modificaciones</h2>
            <p className="text-gray-700">
              Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor inmediatamente después de su publicación en el sitio web. Su uso continuado del servicio después de dichos cambios constituye su aceptación de los nuevos términos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Contacto</h2>
            <p className="text-gray-700 mb-2">
              Para preguntas sobre estos Términos y Condiciones, puede contactarnos:
            </p>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700">
                <strong>Email:</strong>{' '}
                <a href="mailto:contacto@toursred.com" className="text-blue-600 hover:text-blue-700 underline">
                  contacto@toursred.com
                </a>
              </p>
            </div>
          </section>

          <div className="border-t pt-6 mt-8">
            <p className="text-sm text-gray-600 text-center">
              Al utilizar ToursRed, usted reconoce que ha leído, entendido y aceptado estos Términos y Condiciones de Servicio.
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-green-600 hover:text-green-700 font-medium"
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
