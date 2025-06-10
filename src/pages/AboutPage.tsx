import React from 'react';

const AboutPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-gray-900 mb-6">Sobre Nosotros</h1>
      <div className="prose max-w-none">
        <p className="text-lg text-gray-700 mb-4">
          Bienvenido a nuestra plataforma de viajes, donde conectamos a viajeros aventureros con agencias de tours 
          excepcionales para crear experiencias inolvidables alrededor del mundo.
        </p>
        <div className="grid md:grid-cols-2 gap-8 my-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Nuestra Misión</h2>
            <p className="text-gray-600">
              Hacer que las experiencias de viaje extraordinarias sean accesibles para todos, conectando a viajeros 
              apasionados con agencias de tours locales de confianza.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Nuestra Visión</h2>
            <p className="text-gray-600">
              Convertirnos en la plataforma más confiable del mundo para descubrir y reservar experiencias de 
              viaje auténticas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;