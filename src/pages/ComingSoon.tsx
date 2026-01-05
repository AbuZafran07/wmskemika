import React from 'react';
import { Construction, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

interface ComingSoonProps {
  title?: string;
  description?: string;
}

export default function ComingSoon({ title, description }: ComingSoonProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
      <div className="p-6 bg-primary/10 rounded-full mb-6">
        <Construction className="w-12 h-12 text-primary" />
      </div>
      <h1 className="text-2xl font-bold font-display mb-2">
        {title || t('common.comingSoon')}
      </h1>
      <p className="text-muted-foreground max-w-md mb-6">
        {description || 'This module is currently under development. Please check back later.'}
      </p>
      <Button onClick={() => navigate('/dashboard')} variant="outline">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Button>
    </div>
  );
}
