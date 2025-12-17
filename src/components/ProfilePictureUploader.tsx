import React, { useState, useRef } from 'react';
import { Camera, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ProfilePictureUploaderProps {
  currentImage?: string;
  onImageChange: (url: string) => void;
  userId: string;
}

const ProfilePictureUploader: React.FC<ProfilePictureUploaderProps> = ({
  currentImage,
  onImageChange,
  userId
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten archivos de imagen');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('La imagen debe ser menor a 5MB');
      return;
    }

    try {
      setIsUploading(true);
      setError('');

      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `profile-pictures/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      onImageChange(publicUrl);
    } catch (err: any) {
      console.error('Error uploading image:', err);
      setError(err.message || 'Error al subir la imagen');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        onClick={handleClick}
        disabled={isUploading}
        className="text-white p-2 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50"
        title="Cambiar foto de perfil"
      >
        {isUploading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Camera className="h-6 w-6" />
        )}
      </button>

      {error && (
        <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 w-64 bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg z-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePictureUploader;
