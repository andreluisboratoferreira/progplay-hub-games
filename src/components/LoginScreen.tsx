import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Sparkles, 
  Terminal, 
  Cloud, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  Layers,
  Code2,
  Lock
} from 'lucide-react';
import { User } from 'firebase/auth';
import { Cube3D } from './Cube3D';
import { 
  signInWithGoogle, 
  signInWithGithub 
} from '../services/firebase';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  onGuestAccess?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onGuestAccess,
}) => {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'github' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoadingProvider('google');
    setErrorMessage(null);
    try {
      const user = await signInWithGoogle();
      onLoginSuccess(user);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err.message || 'Falha ao autenticar com a conta Google.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleGithubLogin = async () => {
    setLoadingProvider('github');
    setErrorMessage(null);
    try {
      const user = await signInWithGithub();
      onLoginSuccess(user);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err.message || 'Falha ao autenticar com o GitHub.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <div className="w-screen h-screen bg-[#0a0c12] text-neutral-100 flex flex-col lg:flex-row overflow-hidden select-none font-sans">
      
      {/* LEFT SIDE: 3D ROTATING CUBE (Gira com o mouse) */}
      <div className="w-full lg:w-1/2 h-[45vh] lg:h-full relative flex flex-col items-center justify-center p-6 border-b lg:border-b-0 lg:border-r border-[#1e2330] bg-radial from-[#151926] via-[#0b0d14] to-[#07080c]">
        {/* Top left mini-brand */}
        <div className="absolute top-6 left-6 flex items-center gap-2.5 z-10">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30">
            <Code2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
              <span>ProgPlay</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                v2.0
              </span>
            </div>
            <div className="text-[11px] text-neutral-400 font-mono">
              Aprenda Programando
            </div>
          </div>
        </div>

        {/* 3D Cube Canvas */}
        <div className="w-full h-full flex items-center justify-center pt-8 lg:pt-0">
          <Cube3D />
        </div>

        {/* Bottom Feature Badges */}
        <div className="absolute bottom-6 left-6 right-6 hidden sm:flex items-center justify-center gap-3 text-xs text-neutral-400 font-mono">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/60 border border-neutral-800">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            600 Fases Reais (120/ling.)
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/60 border border-neutral-800">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Superpoderes & IA
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/60 border border-neutral-800">
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            Nuvem Firestore
          </span>
        </div>
      </div>

      {/* RIGHT SIDE: LOGIN SELECTION PANEL */}
      <div className="w-full lg:w-1/2 h-[55vh] lg:h-full flex flex-col justify-center items-center p-6 sm:p-12 lg:p-16 overflow-y-auto bg-[#0d0f17]">
        <div className="w-full max-w-md flex flex-col gap-6">
          
          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-semibold w-fit">
              <Lock className="w-3.5 h-3.5" />
              <span>Acesso Obrigatório para Salvar Progresso</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Entre para Iniciar a Jornada
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              Escolha sua conta para acessar os 600 desafios interativos nas 5 linguagens (120 fases em cada). Seu progresso em cada fase é salvo na nuvem em tempo real.
            </p>
          </div>

          {/* Alerts */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-mono text-[11px] leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Login Buttons */}
          <div className="flex flex-col gap-3.5">
            {/* Google Login Button */}
            <button
              id="login-btn-google"
              onClick={handleGoogleLogin}
              disabled={loadingProvider !== null}
              className="w-full py-3.5 px-5 rounded-xl bg-white hover:bg-neutral-100 active:scale-[0.98] text-neutral-900 font-bold text-sm flex items-center justify-center gap-3.5 transition-all cursor-pointer shadow-xl shadow-black/40 disabled:opacity-50 min-h-[50px]"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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

            {/* GitHub Login Button */}
            <button
              id="login-btn-github"
              onClick={handleGithubLogin}
              disabled={loadingProvider !== null}
              className="w-full py-3.5 px-5 rounded-xl bg-[#24292f] hover:bg-[#2c323a] active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-3.5 transition-all cursor-pointer shadow-xl shadow-black/40 border border-neutral-700/80 disabled:opacity-50 min-h-[50px]"
            >
              <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>{loadingProvider === 'github' ? 'Conectando ao GitHub...' : 'Continuar com o GitHub'}</span>
            </button>
          </div>

          {/* Informative Step Roadmap Card */}
          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 flex flex-col gap-2.5">
            <div className="text-xs font-bold text-neutral-300 flex items-center justify-between">
              <span>Trilha de Aprendizado (100 Níveis):</span>
              <span className="text-[10px] text-emerald-400 font-mono">20 fases / curso</span>
            </div>

            <div className="flex flex-col gap-2 text-xs text-neutral-400">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <strong className="text-neutral-200">Fases 1 a 10: O Segredo da Porta</strong>
                  <p className="text-[11px] text-neutral-500">Lógica, variáveis, booleanos, condições e desbloqueio do portal mecânico.</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <strong className="text-neutral-200">Fases 11 a 20: Construção de Sites Reais</strong>
                  <p className="text-[11px] text-neutral-500">Manipulação de DOM, Flexbox/Grid, APIs REST, formulários e banco de dados relacional.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/60">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Sessão segura com Firebase Auth
            </span>

            {onGuestAccess && (
              <button
                onClick={onGuestAccess}
                className="text-neutral-400 hover:text-white underline cursor-pointer transition-colors"
                title="Experimentar como visitante sem salvar"
              >
                Entrar como Visitante
              </button>
            )}
          </div>

        </div>
      </div>

    </div>
  );
};
