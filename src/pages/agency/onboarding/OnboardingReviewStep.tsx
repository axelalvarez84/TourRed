import React from 'react';
import { Clock, CheckCircle, AlertCircle, Mail } from 'lucide-react';

const OnboardingReviewStep: React.FC = () => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
    <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-500" />
    <div className="p-8">
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-100 border-2 border-white flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Documentos en revisión</h2>
      <p className="text-gray-500 text-center text-sm mb-8">
        Tu documentación fue recibida y está siendo revisada por nuestro equipo de verificación.
      </p>

      <div className="space-y-3 mb-8">
        {[
          { label: 'Términos aceptados', done: true },
          { label: 'Documentos enviados', done: true },
          { label: 'Revisión por el equipo de ToursRed', done: false, active: true },
          { label: 'Firma del contrato de colaboración', done: false },
          { label: 'Cuenta activa', done: false },
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              step.done ? 'bg-green-100' : step.active ? 'bg-amber-100' : 'bg-gray-100'
            }`}>
              {step.done ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : step.active ? (
                <Clock className="w-4 h-4 text-amber-600" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-gray-300" />
              )}
            </div>
            <span className={`text-sm ${step.done ? 'text-gray-700 font-medium' : step.active ? 'text-amber-700 font-medium' : 'text-gray-400'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-xl p-4 mb-6">
        <p className="text-sm text-blue-800 leading-relaxed">
          El proceso de validación suele tardar <strong>1 a 3 días hábiles</strong>. Recibirás un correo cuando los documentos sean aprobados y puedas proceder a firmar el contrato.
        </p>
      </div>

      <div className="border-t border-gray-100 pt-6 text-center">
        <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">¿Tienes preguntas?</p>
        <a
          href="mailto:contacto@toursred.com"
          className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium bg-primary-50 hover:bg-primary-100 px-4 py-2 rounded-lg transition-colors"
        >
          <Mail className="w-4 h-4" />
          contacto@toursred.com
        </a>
      </div>
    </div>
  </div>
);

export default OnboardingReviewStep;
