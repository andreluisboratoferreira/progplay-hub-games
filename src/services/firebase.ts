import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  GithubAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  getDocFromServer,
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  getDocs,
  limit
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { GameLanguageId } from '../constants/levels';
import { QUIZ_QUESTIONS_BY_LANGUAGE, QuizQuestion } from '../constants/quizQuestions';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Test connection on boot per Firebase skill guidelines
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase: client is offline or database initializing.');
    }
  }
}
testConnection();

// Contextual Error Handling per Firebase Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Authentication Helpers
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signInWithGithub(): Promise<User> {
  const provider = new GithubAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err: any) {
    if (err.code === 'auth/operation-not-allowed') {
      throw new Error(
        'O provedor GitHub precisa ser ativado no console do Firebase (Authentication > Sign-in method > GitHub). Enquanto isso, use o Login com Google!'
      );
    }
    if (err.code === 'auth/account-exists-with-different-credential') {
      throw new Error(
        'Já existe uma conta cadastrada com este mesmo email usando outro método (ex: Google). Conecte-se com o Google primeiro.'
      );
    }
    throw err;
  }
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

// User Profile & Progress Synchronization
export interface CloudUserProfile {
  userId: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  provider?: string;
  unlockedLevels: Record<GameLanguageId, number>;
  currentLanguage?: GameLanguageId;
  createdAt?: string;
  updatedAt?: string;
}

export async function syncUserProgressToCloud(
  user: User,
  unlockedLevels: Record<GameLanguageId, number>,
  currentLanguage: GameLanguageId
): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const userDocRef = doc(db, 'users', user.uid);
    const existingSnap = await getDoc(userDocRef);

    const now = new Date().toISOString();
    let mergedUnlocked = { ...unlockedLevels };

    if (existingSnap.exists()) {
      const data = existingSnap.data() as CloudUserProfile;
      if (data.unlockedLevels) {
        // Merge highest unlocked level for each language
        const languages: GameLanguageId[] = ['javascript', 'python', 'css', 'html', 'sql'];
        for (const lang of languages) {
          const cloudLvl = data.unlockedLevels[lang] || 1;
          const localLvl = unlockedLevels[lang] || 1;
          mergedUnlocked[lang] = Math.max(cloudLvl, localLvl);
        }
      }
    }

    const payload: CloudUserProfile = {
      userId: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'Jogador',
      email: user.email || '',
      photoURL: user.photoURL || '',
      provider: user.providerData?.[0]?.providerId || 'google.com',
      unlockedLevels: mergedUnlocked,
      currentLanguage,
      createdAt: existingSnap.exists() ? (existingSnap.data()?.createdAt || now) : now,
      updatedAt: now,
    };

    await setDoc(userDocRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUserProgressFromCloud(user: User): Promise<CloudUserProfile | null> {
  const path = `users/${user.uid}`;
  try {
    const userDocRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      return snap.data() as CloudUserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

// ==========================================
// COMPETITION ROOMS & MULTIPLAYER QUIZ (WITH POWERS & INDEPENDENT PROGRESSION)
// ==========================================

export interface PlayerBattleState {
  userId: string;
  name: string;
  photo?: string;
  currentQuestionIndex: number;
  score: number;
  streak: number;
  finished: boolean;
  answers: Record<number, number>;
}

export interface PlayerPowersState {
  freezeUntil?: number; // ms timestamp: if > Date.now(), user is FROZEN (no clicks allowed!)
  fogUntil?: number;    // ms timestamp: if > Date.now(), user is blinded by dense fog
  hasShield?: boolean;  // deflects next freeze or fog attack
  eliminatedOptions?: Record<number, number[]>; // questionIndex -> [optA, optB] (for 50/50 power)
  inventory: {
    freeze: number;
    fog: number;
    shield: number;
    fiftyFifty: number;
  };
}

export interface CombatLogItem {
  id: string;
  timestamp: number;
  text: string;
  type: 'freeze' | 'fog' | 'shield' | 'fiftyFifty' | 'streak' | 'info';
}

export interface CompetitionRoom {
  roomCode: string;
  language: string;
  creatorId: string;
  creatorName: string;
  creatorPhoto?: string;
  participantId?: string;
  participantName?: string;
  participantPhoto?: string;
  status: 'waiting' | 'active' | 'finished';
  questions: QuizQuestion[];
  currentQuestion: number;
  scores: Record<string, number>;
  answers: Record<string, Record<number, number>>;
  // Per-player independent progression and powers
  playerStates: Record<string, PlayerBattleState>;
  playerPowers: Record<string, PlayerPowersState>;
  combatLogs?: CombatLogItem[];
  winnerId?: string | 'tie';
  createdAt: string;
  updatedAt: string;
}

// Generate unique 6-character room code (e.g. HTML74, PY2819)
export function generateRoomCode(language: string = 'CODE'): string {
  const prefix = language.slice(0, 3).toUpperCase();
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${digits}`;
}

export async function createCompetitionRoom(
  user: User,
  language: string
): Promise<CompetitionRoom> {
  const roomCode = generateRoomCode(language);
  const path = `competitions/${roomCode}`;

  const langKey = language.toLowerCase();
  const availableQuestions = QUIZ_QUESTIONS_BY_LANGUAGE[langKey] || QUIZ_QUESTIONS_BY_LANGUAGE.html;
  // Pick 5 questions
  const selectedQuestions = [...availableQuestions].sort(() => 0.5 - Math.random()).slice(0, 5);

  const now = new Date().toISOString();
  const creatorName = user.displayName || user.email?.split('@')[0] || 'Jogador 1';
  const creatorPhoto = user.photoURL || '';

  const initialPlayerState: PlayerBattleState = {
    userId: user.uid,
    name: creatorName,
    photo: creatorPhoto,
    currentQuestionIndex: 0,
    score: 0,
    streak: 0,
    finished: false,
    answers: {},
  };

  const initialPowersState: PlayerPowersState = {
    inventory: {
      freeze: 1,
      fog: 1,
      shield: 1,
      fiftyFifty: 1,
    },
    eliminatedOptions: {},
  };

  const newRoom: CompetitionRoom = {
    roomCode,
    language,
    creatorId: user.uid,
    creatorName,
    creatorPhoto,
    status: 'waiting',
    currentQuestion: 0,
    questions: selectedQuestions,
    scores: {
      [user.uid]: 0,
    },
    answers: {
      [user.uid]: {},
    },
    playerStates: {
      [user.uid]: initialPlayerState,
    },
    playerPowers: {
      [user.uid]: initialPowersState,
    },
    combatLogs: [
      {
        id: `init-${Date.now()}`,
        timestamp: Date.now(),
        text: `⚔️ Sala criada por ${creatorName}. Aguardando desafiante...`,
        type: 'info',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  try {
    const roomRef = doc(db, 'competitions', roomCode);
    await setDoc(roomRef, newRoom);
    return newRoom;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
    return newRoom;
  }
}

export async function joinCompetitionRoom(
  user: User,
  roomCode: string
): Promise<CompetitionRoom> {
  const normalizedCode = roomCode.trim().toUpperCase();
  const path = `competitions/${normalizedCode}`;

  try {
    const roomRef = doc(db, 'competitions', normalizedCode);
    const snap = await getDoc(roomRef);

    if (!snap.exists()) {
      throw new Error(`A sala com o código "${normalizedCode}" não foi encontrada.`);
    }

    const roomData = snap.data() as CompetitionRoom;

    if (roomData.creatorId === user.uid) {
      return roomData; // Creator rejoining their own room
    }

    if (roomData.status !== 'waiting' && roomData.participantId !== user.uid) {
      throw new Error('Esta sala já está em andamento ou lotada com 2 competidores.');
    }

    const now = new Date().toISOString();
    const participantName = user.displayName || user.email?.split('@')[0] || 'Desafiante';
    const participantPhoto = user.photoURL || '';

    const participantPlayerState: PlayerBattleState = roomData.playerStates?.[user.uid] || {
      userId: user.uid,
      name: participantName,
      photo: participantPhoto,
      currentQuestionIndex: 0,
      score: 0,
      streak: 0,
      finished: false,
      answers: {},
    };

    const participantPowersState: PlayerPowersState = roomData.playerPowers?.[user.uid] || {
      inventory: {
        freeze: 1,
        fog: 1,
        shield: 1,
        fiftyFifty: 1,
      },
      eliminatedOptions: {},
    };

    const currentLogs = roomData.combatLogs || [];
    const joinLog: CombatLogItem = {
      id: `join-${Date.now()}`,
      timestamp: Date.now(),
      text: `🔥 ${participantName} entrou na arena! A batalha começou!`,
      type: 'info',
    };

    const updatedRoom: Partial<CompetitionRoom> = {
      participantId: user.uid,
      participantName,
      participantPhoto,
      status: 'active',
      scores: {
        ...roomData.scores,
        [user.uid]: roomData.scores?.[user.uid] || 0,
      },
      answers: {
        ...roomData.answers,
        [user.uid]: roomData.answers?.[user.uid] || {},
      },
      playerStates: {
        ...(roomData.playerStates || {}),
        [user.uid]: participantPlayerState,
      },
      playerPowers: {
        ...(roomData.playerPowers || {}),
        [user.uid]: participantPowersState,
      },
      combatLogs: [joinLog, ...currentLogs].slice(0, 15),
      updatedAt: now,
    };

    await updateDoc(roomRef, updatedRoom);
    return { ...roomData, ...updatedRoom } as CompetitionRoom;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

export function subscribeToCompetitionRoom(
  roomCode: string,
  onUpdate: (room: CompetitionRoom | null) => void
): () => void {
  const normalizedCode = roomCode.trim().toUpperCase();
  const roomRef = doc(db, 'competitions', normalizedCode);

  return onSnapshot(
    roomRef,
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as CompetitionRoom);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.warn('Erro ao escutar sala de competição:', error);
    }
  );
}

export async function submitCompetitionAnswer(
  user: User,
  roomCode: string,
  questionIndex: number,
  answerIndex: number,
  isCorrect: boolean
): Promise<void> {
  const normalizedCode = roomCode.trim().toUpperCase();
  const path = `competitions/${normalizedCode}`;

  try {
    const roomRef = doc(db, 'competitions', normalizedCode);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;

    const room = snap.data() as CompetitionRoom;
    const playerStates = { ...(room.playerStates || {}) };
    const playerPowers = { ...(room.playerPowers || {}) };
    const logs = [...(room.combatLogs || [])];

    const myState: PlayerBattleState = playerStates[user.uid] || {
      userId: user.uid,
      name: user.displayName || 'Jogador',
      photo: user.photoURL || '',
      currentQuestionIndex: questionIndex,
      score: 0,
      streak: 0,
      finished: false,
      answers: {},
    };

    myState.answers = { ...(myState.answers || {}), [questionIndex]: answerIndex };

    if (isCorrect) {
      const pointsGained = 100;
      myState.score = (myState.score || 0) + pointsGained;
      myState.streak = (myState.streak || 0) + 1;

      // Bonus power on streak 2
      if (myState.streak === 2) {
        const myPowers = playerPowers[user.uid] || {
          inventory: { freeze: 0, fog: 0, shield: 0, fiftyFifty: 0 },
        };
        myPowers.inventory.freeze = (myPowers.inventory.freeze || 0) + 1;
        playerPowers[user.uid] = myPowers;

        logs.unshift({
          id: `streak-${Date.now()}`,
          timestamp: Date.now(),
          text: `⚡ Sequência Imbatível! ${myState.name} acertou 2 seguidas e ganhou +1 Raio Congelante!`,
          type: 'streak',
        });
      }
    } else {
      myState.streak = 0;
    }

    playerStates[user.uid] = myState;

    const currentScores = { ...(room.scores || {}), [user.uid]: myState.score };
    const currentAnswers = { ...(room.answers || {}) };
    if (!currentAnswers[user.uid]) currentAnswers[user.uid] = {};
    currentAnswers[user.uid][questionIndex] = answerIndex;

    await updateDoc(roomRef, {
      playerStates,
      playerPowers,
      scores: currentScores,
      answers: currentAnswers,
      combatLogs: logs.slice(0, 15),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// Advances ONLY the current player's question.
// ONLY finishes the room when ALL players have completed all questions!
export async function advancePlayerQuestion(
  user: User,
  roomCode: string,
  nextQuestionIndex: number,
  isFinished: boolean = false
): Promise<void> {
  const normalizedCode = roomCode.trim().toUpperCase();
  const path = `competitions/${normalizedCode}`;

  try {
    const roomRef = doc(db, 'competitions', normalizedCode);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;

    const room = snap.data() as CompetitionRoom;
    const playerStates = { ...(room.playerStates || {}) };

    const myState: PlayerBattleState = playerStates[user.uid] || {
      userId: user.uid,
      name: user.displayName || 'Jogador',
      photo: user.photoURL || '',
      currentQuestionIndex: nextQuestionIndex,
      score: room.scores?.[user.uid] || 0,
      streak: 0,
      finished: isFinished,
      answers: {},
    };

    myState.currentQuestionIndex = nextQuestionIndex;
    myState.finished = isFinished;
    playerStates[user.uid] = myState;

    // Check if ALL participants in the room are finished
    const participantId = room.participantId;
    const creatorId = room.creatorId;

    const creatorState = playerStates[creatorId];
    const participantState = participantId ? playerStates[participantId] : null;

    let roomFinished = false;
    let winnerId: string | 'tie' | undefined = undefined;

    if (creatorState?.finished && (!participantId || participantState?.finished)) {
      roomFinished = true;
      const creatorScore = creatorState.score || 0;
      const participantScore = participantState?.score || 0;
      if (creatorScore > participantScore) {
        winnerId = creatorId;
      } else if (participantScore > creatorScore) {
        winnerId = participantId;
      } else {
        winnerId = 'tie';
      }
    }

    const logs = [...(room.combatLogs || [])];
    if (isFinished) {
      logs.unshift({
        id: `done-${Date.now()}-${user.uid}`,
        timestamp: Date.now(),
        text: `🏁 ${myState.name} terminou todas as perguntas! ${roomFinished ? 'Partida Encerrada!' : 'Aguardando oponente...' }`,
        type: 'info',
      });
    }

    await updateDoc(roomRef, {
      playerStates,
      status: roomFinished ? 'finished' : room.status,
      winnerId: roomFinished ? winnerId : room.winnerId,
      combatLogs: logs.slice(0, 15),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// Cast a battle power (Freeze, Fog, Shield, 50/50)
export async function useCompetitionPower(
  user: User,
  roomCode: string,
  powerType: 'freeze' | 'fog' | 'shield' | 'fiftyFifty',
  targetUserId: string,
  currentQuestion?: QuizQuestion
): Promise<void> {
  const normalizedCode = roomCode.trim().toUpperCase();
  const path = `competitions/${normalizedCode}`;

  try {
    const roomRef = doc(db, 'competitions', normalizedCode);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;

    const room = snap.data() as CompetitionRoom;
    const playerPowers = { ...(room.playerPowers || {}) };
    const logs = [...(room.combatLogs || [])];

    const myPowers: PlayerPowersState = playerPowers[user.uid] || {
      inventory: { freeze: 0, fog: 0, shield: 0, fiftyFifty: 0 },
      eliminatedOptions: {},
    };

    if ((myPowers.inventory[powerType] || 0) <= 0) {
      return; // No charge available
    }

    // Deduct charge
    myPowers.inventory[powerType] = Math.max(0, myPowers.inventory[powerType] - 1);
    playerPowers[user.uid] = myPowers;

    const casterName = room.playerStates?.[user.uid]?.name || user.displayName || 'Jogador';
    const targetName = room.playerStates?.[targetUserId]?.name || 'Oponente';
    const targetPowers: PlayerPowersState = playerPowers[targetUserId] || {
      inventory: { freeze: 0, fog: 0, shield: 0, fiftyFifty: 0 },
      eliminatedOptions: {},
    };

    if (powerType === 'freeze') {
      // 5 Seconds Freeze Attack!
      if (targetPowers.hasShield) {
        targetPowers.hasShield = false;
        playerPowers[targetUserId] = targetPowers;
        logs.unshift({
          id: `power-${Date.now()}`,
          timestamp: Date.now(),
          text: `🛡️ ${targetName} usou o Escudo e bloqueou o Raio Congelante de ${casterName}!`,
          type: 'shield',
        });
      } else {
        targetPowers.freezeUntil = Date.now() + 5000; // 5 full seconds
        playerPowers[targetUserId] = targetPowers;
        logs.unshift({
          id: `power-${Date.now()}`,
          timestamp: Date.now(),
          text: `❄️ ${casterName} CONGELOU ${targetName} por 5 segundos! Cliques bloqueados!`,
          type: 'freeze',
        });
      }
    } else if (powerType === 'fog') {
      // Blind/Fog for 4.5 seconds
      if (targetPowers.hasShield) {
        targetPowers.hasShield = false;
        playerPowers[targetUserId] = targetPowers;
        logs.unshift({
          id: `power-${Date.now()}`,
          timestamp: Date.now(),
          text: `🛡️ ${targetName} usou o Escudo e dissipou a Névoa de ${casterName}!`,
          type: 'shield',
        });
      } else {
        targetPowers.fogUntil = Date.now() + 4500;
        playerPowers[targetUserId] = targetPowers;
        logs.unshift({
          id: `power-${Date.now()}`,
          timestamp: Date.now(),
          text: `🌪️ ${casterName} cegou ${targetName} com Névoa Cósmica por 4 segundos!`,
          type: 'fog',
        });
      }
    } else if (powerType === 'shield') {
      // Self Shield
      myPowers.hasShield = true;
      playerPowers[user.uid] = myPowers;
      logs.unshift({
        id: `power-${Date.now()}`,
        timestamp: Date.now(),
        text: `🛡️ ${casterName} ativou o Escudo Protetor contra o próximo ataque!`,
        type: 'shield',
      });
    } else if (powerType === 'fiftyFifty') {
      // Self 50/50: Eliminate 2 wrong choices
      const myState = room.playerStates?.[user.uid];
      const qIndex = myState?.currentQuestionIndex || 0;
      if (currentQuestion && currentQuestion.options.length >= 4) {
        const correct = currentQuestion.correctAnswer;
        const wrongIndices = currentQuestion.options
          .map((_, idx) => idx)
          .filter((idx) => idx !== correct);
        const shuffledWrongs = wrongIndices.sort(() => 0.5 - Math.random()).slice(0, 2);
        
        myPowers.eliminatedOptions = {
          ...(myPowers.eliminatedOptions || {}),
          [qIndex]: shuffledWrongs,
        };
        playerPowers[user.uid] = myPowers;

        logs.unshift({
          id: `power-${Date.now()}`,
          timestamp: Date.now(),
          text: `⚡ ${casterName} usou 50/50 e eliminou 2 alternativas erradas!`,
          type: 'fiftyFifty',
        });
      }
    }

    await updateDoc(roomRef, {
      playerPowers,
      combatLogs: logs.slice(0, 15),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchOpenCompetitionRooms(): Promise<CompetitionRoom[]> {
  try {
    const roomsRef = collection(db, 'competitions');
    const q = query(roomsRef, where('status', '==', 'waiting'), limit(8));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as CompetitionRoom);
  } catch (err) {
    console.warn('Aviso: salas públicas offline ou vazias');
    return [];
  }
}

