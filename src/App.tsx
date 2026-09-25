import React, { useState, useRef, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { EditorSettings, CursorPosition } from './types';
import { 
  GAME_LANGUAGES, 
  LEVELS_BY_LANGUAGE, 
  GameLanguageId, 
  GameLevel 
} from './constants/levels';
import { THEMES } from './constants/themes';
import { EditorHeader } from './components/EditorHeader';
import { EditorTabs } from './components/EditorTabs';
import { Breadcrumbs } from './components/Breadcrumbs';
import { CodeEditor } from './components/CodeEditor';
import { EditorStatusBar } from './components/EditorStatusBar';
import { OutputPanel, LogEntry } from './components/OutputPanel';
import { DoorStage } from './components/DoorStage';
import { KeypressHUD } from './components/KeypressHUD';
import { LanguageSelectModal } from './components/LanguageSelectModal';
import { AuthModal } from './components/AuthModal';
import { LoginScreen } from './components/LoginScreen';
import { PlaygroundView } from './components/PlaygroundView';
import { AiCourseModal, AiGeneratedCourse } from './components/AiCourseModal';
import { CompetitionModal } from './components/CompetitionModal';
import { auth, syncUserProgressToCloud, fetchUserProgressFromCloud } from './services/firebase';
import { sounds } from './utils/sound';

export default function App() {
  // Application Mode: 'challenges' (Porta/Simulador Fases 1 a 20) | 'playground' (Código Livre e Terminal Python)
  const [appMode, setAppMode] = useState<'challenges' | 'playground'>('challenges');

  // AI Course Generator & Socratic Tutor State
  const [isAiCourseModalOpen, setIsAiCourseModalOpen] = useState<boolean>(false);
  const [activeAiCourse, setActiveAiCourse] = useState<AiGeneratedCourse | null>(null);

  // 1v1 Competition Battle Quiz Modal State
  const [isCompetitionModalOpen, setIsCompetitionModalOpen] = useState<boolean>(false);

  // Authentication & Cloud Sync State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Modal for picking language (5 cards: JavaScript, Python, CSS, HTML, SQL)
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('vscode_door_lang_chosen');
    return !saved;
  });

  const [selectedLanguage, setSelectedLanguage] = useState<GameLanguageId>(() => {
    const saved = localStorage.getItem('vscode_door_language') as GameLanguageId;
    return saved && LEVELS_BY_LANGUAGE[saved] ? saved : 'javascript';
  });

  // Track unlocked level per language (default: 1)
  const [unlockedLevels, setUnlockedLevels] = useState<Record<GameLanguageId, number>>(() => {
    try {
      const saved = localStorage.getItem('vscode_door_progress');
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return {
      javascript: 1,
      python: 1,
      css: 1,
      html: 1,
      sql: 1,
    };
  });

  // Active level index (0 to 9)
  const [currentLevelIndex, setCurrentLevelIndex] = useState<number>(0);
  
  // Mobile & Tablet view: 'editor' | 'door'
  const [activeMobileView, setActiveMobileView] = useState<'editor' | 'door'>('editor');

  const languageLevels = LEVELS_BY_LANGUAGE[selectedLanguage] || LEVELS_BY_LANGUAGE.javascript;
  const currentLevel: GameLevel = languageLevels[currentLevelIndex] || languageLevels[0];
  const unlockedLevel = unlockedLevels[selectedLanguage] || 1;

  const [code, setCode] = useState<string>(currentLevel.initialCode);
  const [isDoorOpen, setIsDoorOpen] = useState<boolean>(false);
  const [validationMessage, setValidationMessage] = useState<string>('');
  const [hasAttempted, setHasAttempted] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const [settings, setSettings] = useState<EditorSettings>({
    theme: 'vs-dark-modern',
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    minimap: false,
    lineNumbers: true,
  });

  const [cursorPos, setCursorPos] = useState<CursorPosition>({ lineNumber: 1, column: 1 });
  const [outputOpen, setOutputOpen] = useState<boolean>(true);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      type: 'info',
      content: `Bem-vindo! Curso selecionado: ${selectedLanguage.toUpperCase()}. Resolva os desafios de código para destrancar a porta!`,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const editorRef = useRef<any>(null);
  const activeTheme = THEMES[settings.theme] || THEMES['vs-dark-modern'];

  // Current file name based on language
  const currentLangConfig = GAME_LANGUAGES.find((l) => l.id === selectedLanguage) || GAME_LANGUAGES[0];
  const fileName = `porta_fase_${currentLevel.id}${currentLangConfig.extension}`;
  const isModified = code !== currentLevel.initialCode;

  // Append log helper
  const addLog = useCallback((type: LogEntry['type'], content: string) => {
    setLogs((prev) => [
      ...prev,
      {
        type,
        content,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  // Save progress helper (local + cloud sync)
  const saveProgress = useCallback((newProgress: Record<GameLanguageId, number>) => {
    setUnlockedLevels(newProgress);
    try {
      localStorage.setItem('vscode_door_progress', JSON.stringify(newProgress));
    } catch {
      // Ignore
    }

    if (currentUser) {
      syncUserProgressToCloud(currentUser, newProgress, selectedLanguage).catch((err) => {
        console.warn('Erro ao sincronizar progresso com a nuvem:', err);
      });
    }
  }, [currentUser, selectedLanguage]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        addLog('info', `☁️ Conectado como ${user.displayName || user.email}. Sincronizando progresso...`);
        try {
          const cloudData = await fetchUserProgressFromCloud(user);
          if (cloudData && cloudData.unlockedLevels) {
            // Merge local and cloud progress (keep maximum unlocked per course)
            const merged: Record<GameLanguageId, number> = {
              javascript: Math.max(unlockedLevels.javascript || 1, cloudData.unlockedLevels.javascript || 1),
              python: Math.max(unlockedLevels.python || 1, cloudData.unlockedLevels.python || 1),
              css: Math.max(unlockedLevels.css || 1, cloudData.unlockedLevels.css || 1),
              html: Math.max(unlockedLevels.html || 1, cloudData.unlockedLevels.html || 1),
              sql: Math.max(unlockedLevels.sql || 1, cloudData.unlockedLevels.sql || 1),
            };
            setUnlockedLevels(merged);
            localStorage.setItem('vscode_door_progress', JSON.stringify(merged));
            addLog('success', '☁️ Progresso sincronizado com a nuvem com sucesso!');
            // Update cloud with merged values
            await syncUserProgressToCloud(user, merged, selectedLanguage);
          } else {
            // First time cloud user: save local progress to cloud
            await syncUserProgressToCloud(user, unlockedLevels, selectedLanguage);
            addLog('success', '☁️ Seu progresso local foi salvo na nuvem pela primeira vez!');
          }
        } catch (e) {
          console.error('Erro na sincronização inicial:', e);
        }
      } else {
        addLog('info', '💡 Dica: Faça login com Google ou GitHub no botão "Salvar Conta" para manter seu progresso salvo.');
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [addLog]);

  // Update code when level or language changes
  useEffect(() => {
    const levels = LEVELS_BY_LANGUAGE[selectedLanguage] || LEVELS_BY_LANGUAGE.javascript;
    const lvl = levels[currentLevelIndex] || levels[0];
    setCode(lvl.initialCode);
    setIsDoorOpen(false);
    setHasAttempted(false);
    setValidationMessage('');
  }, [selectedLanguage, currentLevelIndex]);

  // Handle language selection from cards modal
  const handleSelectLanguage = (langId: GameLanguageId) => {
    setSelectedLanguage(langId);
    setCurrentLevelIndex(0);
    localStorage.setItem('vscode_door_language', langId);
    localStorage.setItem('vscode_door_lang_chosen', 'true');
    sounds.playClick();
    addLog('info', `➔ Trocou de curso para ${langId.toUpperCase()}. Fase 1 carregada!`);
  };

  // Universal Resilient Code Execution Engine
  const executeCode = useCallback(() => {
    setIsEvaluating(true);
    setHasAttempted(true);

    const capturedLogs: string[] = [];
    const customConsole = {
      log: (...args: any[]) => capturedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      warn: (...args: any[]) => capturedLogs.push('[WARN] ' + args.join(' ')),
      error: (...args: any[]) => capturedLogs.push('[ERROR] ' + args.join(' ')),
    };

    try {
      let result = { success: false, doorState: false, message: '' };

      if (selectedLanguage === 'javascript') {
        // JavaScript Execution Sandbox
        const sanitizedUserCode = code
          .replace(/\bconst\s+/g, 'var ')
          .replace(/\blet\s+/g, 'var ');

        const wrappedScript = `
          var True = true;
          var False = false;
          var porta_aberta = false;
          var tem_chave = false;
          var senha_digitada = 0;
          var senha_correta = 777;
          var interruptor_A = true;
          var interruptor_B = false;
          var encantamento = "";
          var cristais = [];
          var voltagem = 0;
          var trava_bloqueada = true;
          var portal = {};

          ${sanitizedUserCode}

          return {
            porta_aberta: porta_aberta,
            tem_chave: tem_chave,
            senha_digitada: senha_digitada,
            senha_correta: senha_correta,
            interruptor_A: interruptor_A,
            interruptor_B: interruptor_B,
            encantamento: encantamento,
            cristais: cristais,
            voltagem: voltagem,
            trava_bloqueada: trava_bloqueada,
            portal: portal,
            destravar: typeof destravar === 'function' ? destravar : undefined
          };
        `;

        try {
          const runner = new Function('console', wrappedScript);
          const scope = runner(customConsole) || {};
          result = currentLevel.validate(code, scope);
        } catch {
          result = currentLevel.validate(code, {});
        }

        if (/\bTrue\b/.test(code) && !/\btrue\b/.test(code)) {
          addLog('info', '💡 Dica: Em JavaScript usa-se "true" minúsculo, mas seu raciocínio está correto!');
        }
      } else {
        // Python, CSS, HTML, SQL Domain Validation
        result = currentLevel.validate(code);
      }

      capturedLogs.forEach((entry) => addLog('log', `console: ${entry}`));
      setValidationMessage(result.message);

      if (result.success && result.doorState) {
        setIsDoorOpen(true);
        sounds.playDoorOpen();
        sounds.playSuccess();
        addLog('success', `[SUCESSO] ${result.message}`);

        // Unlock next level in this language
        if (currentLevel.id >= unlockedLevel && currentLevel.id < languageLevels.length) {
          const updated = {
            ...unlockedLevels,
            [selectedLanguage]: currentLevel.id + 1,
          };
          saveProgress(updated);
        }

        // On mobile, auto-switch to Door view so user sees the door swing open!
        if (window.innerWidth < 1024) {
          setTimeout(() => setActiveMobileView('door'), 350);
        }
      } else {
        setIsDoorOpen(false);
        sounds.playError();
        addLog('warn', `[PORTA FECHADA] ${result.message}`);
      }
    } catch (err: any) {
      const fallbackResult = currentLevel.validate(code);
      if (fallbackResult.success && fallbackResult.doorState) {
        setIsDoorOpen(true);
        sounds.playDoorOpen();
        sounds.playSuccess();
        setValidationMessage(fallbackResult.message);
        addLog('success', `[SUCESSO] ${fallbackResult.message}`);
        if (currentLevel.id >= unlockedLevel && currentLevel.id < languageLevels.length) {
          const updated = {
            ...unlockedLevels,
            [selectedLanguage]: currentLevel.id + 1,
          };
          saveProgress(updated);
        }
        if (window.innerWidth < 1024) {
          setTimeout(() => setActiveMobileView('door'), 350);
        }
      } else {
        setIsDoorOpen(false);
        sounds.playError();
        const errorMsg = err?.message || 'Erro de sintaxe no código';
        setValidationMessage(errorMsg);
        addLog('error', `[ERRO] ${errorMsg}`);
      }
    } finally {
      setIsEvaluating(false);
      setOutputOpen(true);
    }
  }, [code, currentLevel, selectedLanguage, unlockedLevel, unlockedLevels, languageLevels.length, saveProgress, addLog]);

  // Next level transition
  const handleNextLevel = () => {
    sounds.playClick();
    if (currentLevelIndex < languageLevels.length - 1) {
      const nextIndex = currentLevelIndex + 1;
      setCurrentLevelIndex(nextIndex);
      setCode(languageLevels[nextIndex].initialCode);
      setIsDoorOpen(false);
      setHasAttempted(false);
      setValidationMessage('');
      addLog('info', `➔ Iniciando ${languageLevels[nextIndex].title}: ${languageLevels[nextIndex].targetObjective}`);
      
      // On mobile, switch back to editor so user can write code for new level
      if (window.innerWidth < 1024) {
        setActiveMobileView('editor');
      }
    } else {
      addLog('success', `🏆 Parabéns! Você concluiu todos os 10 níveis do curso de ${selectedLanguage.toUpperCase()}!`);
      alert(`🎉 Parabéns! Você completou com sucesso todos os 10 desafios de ${selectedLanguage.toUpperCase()}! Experimente agora outra linguagem!`);
      setIsLanguageModalOpen(true);
    }
  };

  // Reset code
  const handleResetCode = () => {
    sounds.playClick();
    setCode(currentLevel.initialCode);
    setIsDoorOpen(false);
    setHasAttempted(false);
    setValidationMessage('');
    addLog('info', `↺ Código restaurado para o padrão da ${currentLevel.title}.`);
  };

  // Format code
  const handleFormatCode = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
      addLog('info', 'Documento formatado.');
    }
  };

  // Select level directly
  const handleSelectLevel = (levelId: number) => {
    if (levelId <= unlockedLevel) {
      sounds.playClick();
      const targetIndex = levelId - 1;
      setCurrentLevelIndex(targetIndex);
      setCode(languageLevels[targetIndex].initialCode);
      setIsDoorOpen(false);
      setHasAttempted(false);
      setValidationMessage('');
      addLog('info', `Mudou para ${languageLevels[targetIndex].title}`);
    }
  };

  // Global Keyboard shortcut: Ctrl+Enter / Cmd+Enter to Run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeCode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeCode]);

  // Loading state while checking Firebase authentication
  if (authLoading) {
    return (
      <div className="w-screen h-screen bg-[#0a0c12] flex flex-col items-center justify-center text-white select-none">
        <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center animate-pulse mb-4">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="text-sm font-bold tracking-tight">ProgPlay</div>
        <div className="text-xs text-neutral-400 font-mono mt-1">Carregando ambiente seguro...</div>
      </div>
    );
  }

  // MANDATORY LOGIN GATEKEEPER:
  // User must authenticate to use the app, with 3D Rotating Cube on left and Auth options on right
  if (!currentUser) {
    return (
      <LoginScreen 
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setAuthLoading(false);
        }}
        onGuestAccess={() => {
          // Fallback guest access if needed
          const guestUser = {
            uid: 'guest-' + Math.random().toString(36).substring(2, 9),
            displayName: 'Visitante Convidado',
            email: 'visitante@progplay.local',
            photoURL: null,
          } as unknown as User;
          setCurrentUser(guestUser);
          setAuthLoading(false);
        }}
      />
    );
  }

  return (
    <div 
      className="flex flex-col h-screen w-screen overflow-hidden font-sans select-none"
      style={{ backgroundColor: activeTheme.ui.bg }}
    >
      {/* Keystroke HUD - Floating visual feedback with smooth fade effect */}
      <KeypressHUD />

      {/* Language Selection Modal (5 Cards: JavaScript, Python, CSS, HTML, SQL) */}
      <LanguageSelectModal
        isOpen={isLanguageModalOpen}
        selectedLanguage={selectedLanguage}
        onSelectLanguage={handleSelectLanguage}
        onClose={() => setIsLanguageModalOpen(false)}
        progressByLanguage={unlockedLevels}
      />

      {/* Cloud Account & Auth Modal (Google & GitHub login) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        unlockedLevels={unlockedLevels}
        currentLanguage={selectedLanguage}
        onProgressUpdated={(newProg) => setUnlockedLevels(newProg)}
      />

      {/* AI Course Generator Modal */}
      <AiCourseModal
        isOpen={isAiCourseModalOpen}
        onClose={() => setIsAiCourseModalOpen(false)}
        onStartCourseInPlayground={(course) => {
          setActiveAiCourse(course);
          setAppMode('playground');
        }}
      />

      {/* 1v1 Live Competition Battle & Quiz Arena Modal */}
      <CompetitionModal
        isOpen={isCompetitionModalOpen}
        onClose={() => setIsCompetitionModalOpen(false)}
        currentUser={currentUser}
        onPromptLogin={() => setIsAuthModalOpen(true)}
      />

      {/* Top Application Header */}
      <EditorHeader
        fileName={fileName}
        codeContent={code}
        settings={settings}
        onUpdateSettings={(newSettings) => setSettings((s) => ({ ...s, ...newSettings }))}
        onRunCode={executeCode}
        onFormatCode={handleFormatCode}
        onResetCode={handleResetCode}
        isEvaluating={isEvaluating}
        currentLanguage={selectedLanguage}
        onOpenLanguageModal={() => setIsLanguageModalOpen(true)}
        activeMobileView={activeMobileView}
        onSelectMobileView={(v) => setActiveMobileView(v)}
        isDoorOpen={isDoorOpen}
        levelNumber={currentLevel.id}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        appMode={appMode}
        onToggleAppMode={(mode) => setAppMode(mode)}
        onOpenCompetitionModal={() => setIsCompetitionModalOpen(true)}
        onOpenAiCourseModal={() => setIsAiCourseModalOpen(true)}
      />

      {/* RENDER PLAYGROUND OR CHALLENGE STAGE */}
      {appMode === 'playground' ? (
        <div className="flex-1 overflow-hidden">
          <PlaygroundView
            settings={settings}
            onUpdateSettings={(newSettings) => setSettings((s) => ({ ...s, ...newSettings }))}
            onReturnToChallenges={() => setAppMode('challenges')}
            customCourse={activeAiCourse}
            onOpenAiCourseModal={() => setIsAiCourseModalOpen(true)}
          />
        </div>
      ) : (
        /* Main Responsive Split Layout: Left (Editor) & Right (Door Stage) */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          
          {/* LEFT PANE: VS CODE CODE EDITOR (Shown on desktop, or if activeMobileView === 'editor' on mobile/tablet) */}
          <div 
            className={`flex-1 flex-col h-full overflow-hidden border-b lg:border-b-0 lg:border-r border-[#2b2b2b] ${
              activeMobileView === 'editor' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {/* File Tab Bar */}
            <EditorTabs
              fileName={fileName}
              isModified={isModified}
              settings={settings}
              onResetCode={handleResetCode}
            />

            {/* Breadcrumbs */}
            <Breadcrumbs
              fileName={fileName}
              settings={settings}
              cursorLine={cursorPos.lineNumber}
            />

            {/* Monaco Editor Container */}
            <div className="flex-1 relative overflow-hidden">
              <CodeEditor
                code={code}
                language={currentLangConfig.monacoLang}
                settings={settings}
                onChange={(newVal) => setCode(newVal)}
                onCursorChange={(pos) => setCursorPos(pos)}
                onRunCode={executeCode}
                editorRef={editorRef}
              />
            </div>

            {/* Bottom Execution Terminal Drawer */}
            <OutputPanel
              logs={logs}
              isOpen={outputOpen}
              onClose={() => setOutputOpen(false)}
              onClearLogs={() => setLogs([])}
              settings={settings}
              isDoorOpen={isDoorOpen}
              currentCode={code}
              isPythonCourse={selectedLanguage === 'python'}
            />

            {/* VS Code Status Bar */}
            <EditorStatusBar
              fileName={fileName}
              language={currentLangConfig.name}
              cursorPos={cursorPos}
              settings={settings}
              outputOpen={outputOpen}
              onToggleOutput={() => setOutputOpen(!outputOpen)}
              errorCount={logs.filter((l) => l.type === 'error').length}
            />
          </div>

          {/* RIGHT PANE: THE INTERACTIVE DOOR GAME STAGE (Shown on desktop, or if activeMobileView === 'door' on mobile/tablet) */}
          <div 
            className={`w-full lg:w-[48%] xl:w-[45%] h-full shrink-0 flex-col ${
              activeMobileView === 'door' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <DoorStage
              currentLevel={currentLevel}
              totalLevels={languageLevels.length}
              isDoorOpen={isDoorOpen}
              validationMessage={validationMessage}
              hasAttempted={hasAttempted}
              onNextLevel={handleNextLevel}
              onResetCode={handleResetCode}
              onSelectLevel={handleSelectLevel}
              unlockedLevel={unlockedLevel}
              onSwitchToEditor={() => setActiveMobileView('editor')}
            />
          </div>

        </div>
      )}
    </div>
  );
}
