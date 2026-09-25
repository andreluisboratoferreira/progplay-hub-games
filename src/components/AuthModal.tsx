import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Cloud, 
  CheckCircle2, 
  LogOut, 
  AlertCircle, 
  ShieldCheck,
  RefreshCw,
  Award
} from 'lucide-react';
import { User } from 'firebase/auth';
import { 
  signInWithGoogle, 
  signInWithGithub, 
  signOutUser,
  syncUserProgressToCloud 
} from '../services/firebase';
import { GameLanguageId } from '../constants/levels';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  unlockedLevels: Record<GameLanguageId, number>;
  currentLanguage: GameLanguageId;
  onProgressUpdated: (newProgress: Record<GameLanguageId, number>) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  unlockedLevels,
  currentLanguage,
  onProgressUpdated,
}) => {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'github' | 'sync' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setLoadingProvider('google');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const user = await signInWithGoogle();
      await syncUserProgressToCloud(user, unlockedLevels, currentLanguage);
      setSuccessMessage(`Conectado com sucesso como ${user.displayName || user.email}!`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err.message || 'Falha ao autenticar com o Google.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleGithubLogin = async () => {
    setLoadingProvider('github');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const user = await signInWithGithub();
      await syncUserProgressToCloud(user, unlockedLevels, currentLanguage);
      setSuccessMessage(`Conectado com sucesso como ${user.displayName || user.email}!`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err.message || 'Falha ao autenticar com o GitHub.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleManualSync = async () => {
    if (!currentUser) return;
    setLoadingProvider('sync');
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await syncUserProgressToCloud(currentUser, unlockedLevels, currentLanguage);
      setSuccessMessage('Progresso sincronizado na nuvem com sucesso!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao sincronizar dados.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleLogout = async () => {
    setLoadingProvider('sync');
    try {
      await signOutUser();
      setSuccessMessage('Sessão encerrada.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao sair da conta.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const totalCompleted = Object.values(unlockedLevels).reduce((acc, curr) => acc + (curr - 1), 0);

  return (
    <div 
      id="auth-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-[#14161f] border border-[#2b2f3d] rounded-2xl shadow-2xl p-5 sm:p-7 flex flex-col gap-4 text-neutral-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between border-b border-[#252834] pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-semibold mb-2">
              <Cloud className="w-3.5 h-3.5" />
              <span>Nuvem & Sincronização</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>{currentUser ? 'Sua Conta' : 'Salvar seu Progresso'}</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              {currentUser 
                ? 'Seus desafios e fases desbloqueadas estão sincronizados com sua conta.' 
                : 'Faça login com Google ou GitHub para não perder as fases que você já desbloqueou!'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-mono text-[11px] leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex-1 font-medium text-xs">{successMessage}</div>
          </div>
        )}

        {/* Content for Logged-In User */}
        {currentUser ? (
          <div className="flex flex-col gap-4">
            {/* User Profile Card */}
            <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800">
              {currentUser.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt={currentUser.displayName || 'Avatar'} 
                  className="w-12 h-12 rounded-full border-2 border-blue-500/60 object-cover shadow-md"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-600/30 border border-blue-400/40 text-blue-300 font-bold flex items-center justify-center text-lg shadow-md">
                  {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                  <span>{currentUser.displayName || 'Jogador Conectado'}</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-xs text-neutral-400 truncate font-mono">
                  {currentUser.email || 'Autenticado'}
                </div>
              </div>
            </div>

            {/* Progress summary */}
            <div className="p-3 rounded-xl bg-neutral-900/50 border border-neutral-800/80 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  Progresso das Fases:
                </span>
                <span className="font-mono text-emerald-400">{totalCompleted} / 50 Concluídas</span>
              </div>

              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {(['javascript', 'python', 'css', 'html', 'sql'] as GameLanguageId[]).map((lang) => {
                  const lvl = unlockedLevels[lang] || 1;
                  return (
                    <div key={lang} className="bg-neutral-800/60 rounded p-1.5 text-center border border-neutral-700/50">
                      <div className="text-[9px] uppercase font-bold text-neutral-400 truncate">{lang.slice(0, 3)}</div>
                      <div className="text-xs font-mono font-bold text-blue-400">{lvl}/10</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleManualSync}
                disabled={loadingProvider === 'sync'}
                className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingProvider === 'sync' ? 'animate-spin' : ''}`} />
                <span>Sincronizar Agora</span>
              </button>

              <button
                onClick={handleLogout}
                className="py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-red-950/40 hover:text-red-300 text-neutral-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-neutral-700/60"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        ) : (
          /* Content for Unauthenticated User */
          <div className="flex flex-col gap-3 py-1">
            {/* Google Sign In Button */}
            <button
              id="btn-login-google"
              onClick={handleGoogleLogin}
              disabled={loadingProvider !== null}
              className="w-full py-3 px-4 rounded-xl bg-white hover:bg-neutral-100 active:scale-[0.98] text-neutral-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all cursor-pointer shadow-lg disabled:opacity-50 min-h-[46px]"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.04h3.88c2.27-2.09 3.665-5.17 3.665-9.14z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.04c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.27 21.37 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.28c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.59H1.26C.46 8.19 0 10.03 0 12s.46 3.81 1.26 5.41l4.02-3.13z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.27 2.63 1.26 6.59l4.02 3.13c.95-2.83 3.6-4.97 6.72-4.97z"
                />
              </svg>
              <span>{loadingProvider === 'google' ? 'Conectando ao Google...' : 'Continuar com o Google'}</span>
            </button>

            {/* GitHub Sign In Button */}
            <button
              id="btn-login-github"
              onClick={handleGithubLogin}
              disabled={loadingProvider !== null}
              className="w-full py-3 px-4 rounded-xl bg-[#24292f] hover:bg-[#2c323a] active:scale-[0.98] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all cursor-pointer shadow-lg border border-neutral-700/80 disabled:opacity-50 min-h-[46px]"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>{loadingProvider === 'github' ? 'Conectando ao GitHub...' : 'Continuar com o GitHub'}</span>
            </button>

            <div className="text-[11px] text-neutral-400 text-center mt-2 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Autenticação segura via Firebase Authentication</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
