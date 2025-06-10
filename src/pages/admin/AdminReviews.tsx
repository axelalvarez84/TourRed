import React from 'react';

const AdminReviews: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Manage Reviews</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6">
          <p className="text-gray-500">No reviews found.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminReviews;