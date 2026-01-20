import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import logoImage from '@/assets/logo.png';

export default function Login() {
  const { language, setLanguage, t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error(language === 'en' ? 'Please fill in all fields' : 'Harap isi semua field');
      return;
    }

    setIsLoading(true);
    
    const result = await login(email, password);
    
    setIsLoading(false);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Login successful!' : 'Login berhasil!');
      navigate('/dashboard');
    } else {
      toast.error(result.error || (language === 'en' ? 'Login failed' : 'Login gagal'));
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-1/2 login-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
        
        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-32 h-32 bg-white/5 rounded-full blur-xl" />
        <div className="absolute bottom-40 right-20 w-48 h-48 bg-white/5 rounded-full blur-2xl" />
        
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-xl">
              <img 
                src={logoImage} 
                alt="Kemika Logo" 
                className="h-12 w-auto object-contain"
              />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl">{t('app.company')}</h1>
              <p className="text-white/70 text-sm">{t('app.tagline')}</p>
            </div>
          </div>

          {/* Main Content */}
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-4xl font-bold leading-tight">
                {t('login.title')}
              </h2>
              <p className="mt-4 text-white/80 text-lg max-w-md">
                {t('login.subtitle')}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-12">
            <div>
              <div className="text-3xl font-bold">4</div>
              <div className="text-white/70 text-sm">{t('login.roles')}</div>
            </div>
            <div>
              <div className="text-3xl font-bold">100%</div>
              <div className="text-white/70 text-sm">{t('login.paperless')}</div>
            </div>
            <div>
              <div className="font-semibold">Real-time</div>
              <div className="text-white/70 text-sm">{t('login.tracking')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col">
        {/* Language Toggle */}
        <div className="flex justify-end p-6">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setLanguage('en')}
              className={`px-2 py-1 rounded transition-colors ${
                language === 'en' 
                  ? 'text-primary font-medium' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              EN
            </button>
            <span className="text-muted-foreground">/</span>
            <button
              onClick={() => setLanguage('id')}
              className={`px-2 py-1 rounded transition-colors ${
                language === 'id' 
                  ? 'text-primary font-medium' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ID
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 flex items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm space-y-8">
            {/* Mobile Logo */}
            <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
              <div className="p-3 bg-primary/10 rounded-xl">
                <img 
                  src={logoImage} 
                  alt="Kemika Logo" 
                  className="h-10 w-auto object-contain"
                />
              </div>
              <div>
                <h1 className="font-display font-bold text-lg text-foreground">{t('app.company')}</h1>
                <p className="text-muted-foreground text-sm">{t('app.tagline')}</p>
              </div>
            </div>

            <div className="text-center">
              <h2 className="font-display text-2xl font-bold text-foreground">
                {t('auth.signInTitle')}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('auth.signInSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t('auth.email')}
                </label>
                <Input
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail className="w-4 h-4" />}
                  iconPosition="left"
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    icon={<Lock className="w-4 h-4" />}
                    iconPosition="left"
                    className="bg-muted/50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="login"
                size="lg"
                disabled={isLoading}
                className="mt-6"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {t('common.loading')}
                  </span>
                ) : (
                  t('auth.signIn')
                )}
              </Button>
            </form>

            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {t('auth.noAccount')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('auth.contactAdmin')}
              </p>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="text-center p-6 text-sm text-muted-foreground">
          {t('login.copyright')}
        </div>
      </div>
    </div>
  );
}
