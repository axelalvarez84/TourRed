import React from 'react';

const TravelerDashboard: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Panel del Viajero</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Próximos Viajes</h2>
          <p className="text-gray-600">Ver tus planes de viaje próximos</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Reservas Recientes</h2>
          <p className="text-gray-600">Consulta tus reservas de tours recientes</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Tours Guardados</h2>
          <p className="text-gray-600">Explora tus paquetes de tours guardados</p>
        </div>
      </div>
    </div>
  );
};

export default TravelerDashboard;