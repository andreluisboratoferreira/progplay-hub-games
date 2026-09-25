import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Server-side Gemini initialization
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.1-pro-preview',
];

// Resilient helper to generate content across available models
async function callGeminiWithFallback(options: {
  contents: any[];
  config?: any;
}) {
  let lastError: any = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: options.config,
      });
      if (response && response.text) {
        return { text: response.text, modelUsed: model };
      }
    } catch (err: any) {
      console.warn(`[Gemini Fallback] Model ${model} failed (${err?.message || err}). Trying next...`);
      lastError = err;
    }
  }
  throw lastError || new Error('Nenhum modelo Gemini respondeu');
}

// ==========================================
// 1. API: Gerar Curso Personalizado com IA
// ==========================================
app.post('/api/ai/generate-course', async (req, res) => {
  try {
    const { topic, language = 'html', level = 'iniciante' } = req.body;

    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'Tópico de estudo obrigatório' });
    }

    const systemInstruction = `Você é um instrutor de programação sênior especialista em metodologias ativas e computação prática.
O usuário quer aprender a criar: "${topic}" usando a linguagem/tecnologia: "${language}" no nível: "${level}".

Sua tarefa é criar um curso prático, progressivo, empolgante e altamente didático dividido em 4 ou 5 módulos/passos lógicos.
O curso deve ensinar a construir o projeto especificamente solicitado ("${topic}") do zero até ficar completo.
Cada passo deve conter código esqueleto inicial ('starterCode') que realmente contenha a estrutura do projeto solicitado (por exemplo, se for um calendário em HTML, o starterCode do módulo 1 deve ter a estrutura da tabela do mês ou cabeçalhos dos dias da semana).

Responda OBRIGATORIAMENTE em formato JSON válido com a seguinte estrutura:
{
  "title": "Título conciso e empolgante do Curso",
  "summary": "Breve resumo do que o aluno irá construir e dominar sobre ${topic}",
  "language": "${language}",
  "estimatedTime": "ex: 45 min",
  "targetProject": "Descrição clara do projeto final que será criado",
  "modules": [
    {
      "id": 1,
      "title": "Título do Módulo/Passo",
      "concept": "Explicação teórica clara e concisa do conceito abordado neste passo",
      "instructions": "Instruções do que o aluno deve programar neste passo",
      "starterCode": "Código esqueleto inicial relevante para o projeto para o aluno começar",
      "goalCheck": "O que deve funcionar ao concluir este passo",
      "hints": ["Dica conceitual 1", "Dica conceitual 2"]
    }
  ]
}
Não inclua crases markdown extras fora do JSON, responda exclusivamente o JSON puro.`;

    if (!process.env.GEMINI_API_KEY) {
      const fallbackCourse = generateFallbackCourse(topic, language, level);
      return res.json(fallbackCourse);
    }

    const { text } = await callGeminiWithFallback({
      contents: [
        {
          role: 'user',
          parts: [{ text: `Crie o curso personalizado sobre "${topic}" em "${language}".` }],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    return res.json(parsedData);
  } catch (error: any) {
    console.warn('Erro na chamada Gemini (generate-course), usando gerador estruturado:', error?.message);
    const { topic = 'Projeto Web', language = 'html', level = 'iniciante' } = req.body || {};
    const fallbackCourse = generateFallbackCourse(topic, language, level);
    return res.json(fallbackCourse);
  }
});

// ==========================================
// 2. API: Tutor IA no Playground (Socrático)
// ==========================================
app.post('/api/ai/tutor-chat', async (req, res) => {
  try {
    const { message, currentCode, language, courseContext, chatHistory = [] } = req.body;

    const systemInstruction = `Você é o "Tutor IA CodeCraft", um mentor socrático de programação extremamente paciente, encorajador e amigável.
DIRETRIZ INVIOLÁVEL:
NUNCA entregue o código pronto ou a resposta final mastigada.
Seu papel é guiar o aluno fazendo perguntas que estimulem o raciocínio, apontando em qual linha ou conceito ele deve prestar atenção, ou dando pequenas pistas conceituais.
Incentive o aluno e explique o "porquê", não apenas o "como". Se ele perguntar o código pronto, diga gentilmente que como mentor seu dever é ajudá-lo a aprender por si mesmo, e dê uma dica clara para ele tentar.

Contexto atual:
- Linguagem ativa no editor: ${language || 'código'}
- Código atual digitado pelo aluno:
\`\`\`${language || 'text'}
${currentCode || '// Nenhum código digitado ainda'}
\`\`\`
${courseContext ? `- Curso / Desafio atual que o aluno está fazendo:\n${courseContext}` : ''}`;

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        reply: `Olá! Sou seu Tutor IA. Observei seu código em ${language}. Para avançar no objetivo, observe a estrutura das variáveis e funções. O que acontece quando você executa essa lógica? Qual resultado você espera obter nessa linha?`,
      });
    }

    const contents: any[] = [];
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      chatHistory.slice(-4).forEach((msg) => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        });
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: message || 'Pode me dar uma dica sobre o que fazer agora?' }],
    });

    const { text } = await callGeminiWithFallback({
      contents,
      config: {
        systemInstruction,
      },
    });

    return res.json({ reply: text || 'Continue tentando! Qual é o próximo passo que você tem em mente?' });
  } catch (error: any) {
    console.warn('Erro na chamada Gemini (tutor-chat):', error?.message);
    return res.json({
      reply: 'Como seu mentor socrático: analise seu código linha por linha. Tente identificar onde a lógica começa e qual dado precisa ser transformado. Que tal testar imprimindo valores ou inspecionando o resultado?',
    });
  }
});

// Fallback course generator
function generateFallbackCourse(topic: string, language: string, level: string) {
  const isWeb = language === 'html' || language === 'css' || language === 'javascript';
  const isPython = language === 'python';

  return {
    title: `Dominando: ${topic}`,
    summary: `Curso passo a passo para construir ${topic} do zero utilizando ${language.toUpperCase()}, com foco em boas práticas e lógica aplicada.`,
    language,
    estimatedTime: '45 minutos',
    targetProject: `Aplicação completa de ${topic} funcional no Playground`,
    modules: [
      {
        id: 1,
        title: 'Módulo 1: Arquitetura & Esqueleto Base',
        concept: `Para criar ${topic}, o primeiro passo é definir os contêineres de dados e a fundação estrutural.`,
        instructions: `Crie a estrutura inicial e declare as variáveis ou elementos centrais para ${topic}.`,
        starterCode: isWeb
          ? `<!-- Estrutura Inicial de ${topic} -->\n<div class="container">\n  <h1>${topic}</h1>\n  <!-- TODO: Adicione os elementos principais aqui -->\n</div>`
          : isPython
          ? `# Estrutura Inicial de ${topic}\n\ndef iniciar_${topic.toLowerCase().replace(/\\s+/g, '_')}():\n    print("Inicializando ${topic}...")\n    # TODO: Defina as variáveis iniciais\n    pass\n`
          : `// Estrutura Inicial de ${topic}\nconst configuracao = {\n  titulo: "${topic}",\n  iniciado: true\n};\n`,
        goalCheck: 'A base estrutural deve estar declarada sem erros de sintaxe.',
        hints: ['Comece simples antes de adicionar detalhes visuais ou lógica avançada.'],
      },
      {
        id: 2,
        title: 'Módulo 2: Modelagem de Dados & Estados',
        concept: 'Qualquer sistema interativo precisa de um estado que armazene os valores que mudam ao longo do tempo.',
        instructions: 'Adicione a lista ou dicionário que manterá os registros e informações dinâmicas.',
        starterCode: isWeb
          ? `<!-- Adicione botões e área de exibição -->\n<div id="display">0</div>\n<button id="btnAcao">Atualizar</button>`
          : isPython
          ? `itens = []\ndef adicionar_item(novo_item):\n    itens.append(novo_item)\n    return len(itens)`
          : `let estado = { contador: 0, lista: [] };`,
        goalCheck: 'O estado deve permitir leitura e gravação.',
        hints: ['Pense em como o usuário irá interagir com esses dados.'],
      },
      {
        id: 3,
        title: 'Módulo 3: Lógica & Comportamento Interativo',
        concept: 'Implementação das regras de negócio que fazem a mágica acontecer.',
        instructions: 'Crie os algoritmos e funções de cálculo ou manipulação para responder às ações.',
        starterCode: isWeb
          ? `<script>\n  // Escute eventos de clique e atualize o DOM\n</script>`
          : isPython
          ? `# Validação e processamento da lógica\ndef processar_dados():\n    pass`
          : `function atualizar() {\n  // Atualiza estado\n}`,
        goalCheck: 'A lógica deve produzir a resposta esperada no console ou na tela.',
        hints: ['Divida a lógica em pequenas funções de responsabilidade única.'],
      },
      {
        id: 4,
        title: 'Módulo 4: Polimento Final & Testes no Playground',
        concept: 'Refinamento visual, tratamento de exceções e teste interativo completo.',
        instructions: `Finalize todos os detalhes de ${topic} e valide seu funcionamento completo no Playground.`,
        starterCode: `// Código completo integrado para teste`,
        goalCheck: `${topic} funcionando de ponta a ponta com sucesso!`,
        hints: ['Teste casos de borda e valores inesperados para garantir robustez.'],
      },
    ],
  };
}

// ==========================================
// Vite Middleware & Static Serving Setup
// ==========================================
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CodeCraft Studio rodando em http://localhost:${PORT}`);
  });
}

startServer();
