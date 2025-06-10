import React from 'react';

const TravelerProfile: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Mi Perfil</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Información Personal</h2>
            <p className="text-gray-600">Administra tus datos personales y preferencias</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TravelerProfile;