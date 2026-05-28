import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Schema } from "@google/genai";

const DATA_FILE = process.env.VERCEL 
  ? path.join("/tmp", "sermon_history.json")
  : path.join(process.cwd(), "sermon_history.json");

async function startServer() {
  const app = express();
  const PORT = 3000;

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify([]));
  }

  // Body parser for JSON requests
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.get("/api/history", async (req, res) => {
    try {
      const data = await fs.readFile(DATA_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch (error) {
      console.error("Failed to read history", error);
      res.status(500).json({ error: "Failed to load history." });
    }
  });

  app.delete("/api/history/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = await fs.readFile(DATA_FILE, "utf-8");
      let history = JSON.parse(data);
      history = history.filter((item: any) => item.id !== id);
      await fs.writeFile(DATA_FILE, JSON.stringify(history, null, 2));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete history item", error);
      res.status(500).json({ error: "Failed to delete history item." });
    }
  });

  // API Route for testing Gemini API Key
  app.post("/api/test-key", async (req, res) => {
    try {
      const clientApiKey = req.headers['x-gemini-api-key'] as string;
      const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(401).json({ error: "Gemini API key is missing." });
      }

      const ai = new GoogleGenAI({ apiKey: apiKey });
      
      // Make a tiny generation request to verify the key
      await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "List the first 3 letters of alphabet",
        config: {
            temperature: 0.1,
            maxOutputTokens: 5
        }
      });
      
      res.json({ success: true, message: "Valid API key." });
    } catch (error: any) {
      console.error("API test error:", error);
      res.status(400).json({ error: "유효하지 않은 API 키이거나 연결에 실패했습니다." });
    }
  });

  // API Route for analyzing sermon
  app.post("/api/analyze", async (req, res) => {
    try {
      const { title, text } = req.body;
      const clientApiKey = req.headers['x-gemini-api-key'] as string;
      const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

      if (!text) {
        return res.status(400).json({ error: "Sermon text is required." });
      }

      if (!apiKey) {
        return res.status(401).json({ error: "Gemini API key is missing. Please set your API key in the settings." });
      }

      const ai = new GoogleGenAI({ apiKey: apiKey });

      const schema: Schema = {
        type: Type.OBJECT,
        properties: {
          summary: {
            description: "분석 대상 설교의 핵심 내용을 3문장 이내로 요약 (Sermon Summary)",
            type: Type.STRING
          },
          strengths: {
            description: "존 맥아더의 원칙에 부합하는 긍정적인 부분 목록 (Strengths)",
            type: Type.ARRAY,
            items: { 
              type: Type.OBJECT,
              properties: {
                point: { type: Type.STRING, description: "핵심 요약 (예: 철저한 본문 중심성)" },
                rationale: { type: Type.STRING, description: "존 맥아더의 신학적 근거 및 세부 설명" }
              },
              required: ["point", "rationale"]
            }
          },
          concerns: {
            description: "본문 이탈, 인본주의적 요소, 그리스도 부재 등 맥아더가 경계한 요소들 지적 (Theological Concerns/Critiques)",
            type: Type.ARRAY,
            items: { 
              type: Type.OBJECT,
              properties: {
                point: { type: Type.STRING, description: "핵심 지적 사항" },
                rationale: { type: Type.STRING, description: "존 맥아더의 신학적 근거 및 세부 설명" }
              },
              required: ["point", "rationale"]
            }
          },
          evaluation: {
            description: "이 설교가 더 참된 '강해설교'가 되기 위해 보완해야 할 점 총평 (Overall Evaluation & Suggestions)",
            type: Type.STRING
          },
          macArthurIndex: {
            description: "맥아더의 강해설교 철학에 얼마나 일치하는지 수치화 (0~100) (MacArthur Index)",
            type: Type.INTEGER
          },
          mentionedVerses: {
            description: "본문이나 분석에서 언급된 주요 성경 구절들과 그에 대한 존 맥아더의 주석적 견해 (Mentioned Bible Verses and MacArthur's Exegetical View)",
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                verse: { type: Type.STRING, description: "성경 구절 (예: 로마서 8:28)" },
                exegeticalView: { type: Type.STRING, description: "해당 구절에 대한 존 맥아더의 주석적/강해적 견해 및 해석 원칙" }
              },
              required: ["verse", "exegeticalView"]
            }
          }
        },
        required: ["summary", "strengths", "concerns", "evaluation", "macArthurIndex", "mentionedVerses"]
      };

      const systemInstruction = `
너는 존 맥아더(John MacArthur)의 강해설교 신학(Expository Preaching)을 완벽하게 숙지한 전문 신학 분석가야.
사용자가 제공하는 설교 텍스트나 요약본을 존 맥아더의 '강해설교 마스터 클래스' 원칙에 따라 분석하고 엄격하게 평가하는 것이 네 임무야.

[분석 핵심 기준 (5가지 지표)]
1. 하나님의 권위 vs 설교자의 권위: 설교자가 본문을 정확히 풀어내어 하나님의 음성을 전달하는가, 자신의 생각/견해를 앞세우는가?
2. 본문의 원래 의미(Exegesis): 현대적 적용을 위해 본문을 왜곡하지 않는가? 역사적/문화적/언어적 맥락에 충실한가?
3. 그리스도 중심성: 설교의 결론이나 핵심 동력이 예수 그리스도와 그분의 사역으로 귀결되는가?
4. 성령의 사역과 적용: 인위적인 감정 자극이나 강제 적용을 피하고 말씀을 명확히 설명하여 성령께 적용을 맡기는가?
5. 설교자의 태도: 자신을 주인공으로 삼거나 개인적 예화를 남발하여 하나님의 영광을 가리지 않는가?

제공된 설교 내용을 심도있게 분석하고, 지정된 JSON 스키마 형식에 맞추어 한국어로 응답해줘.
      `;

      let response;
      let attempt = 0;
      const maxRetries = 3;

      while (attempt < maxRetries) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: text,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: schema,
              temperature: 0.2
            },
          });
          break;
        } catch (err: any) {
          attempt++;
          console.error(`Gemini API Error (Attempt ${attempt}):`, err.message || err);
          
          const errString = String(err.message || err).toLowerCase();
          const isRetryable = err.status === 503 || err.status === 429 || err.code === 503 || err.code === 429 ||
                              errString.includes("503") || errString.includes("429") ||
                              errString.includes("high demand") || errString.includes("quota") ||
                              errString.includes("unavailable");
          
          if (attempt >= maxRetries || !isRetryable) {
            // Translate common Gemini errors to user-friendly messages
            if (errString.includes("503") || errString.includes("high demand") || errString.includes("unavailable")) {
              throw new Error("구글 AI(Gemini) 서버에 일시적으로 트래픽이 몰려 지연되고 있습니다. 1~2분 뒤에 다시 시도해주세요.");
            } else if (errString.includes("429") || errString.includes("quota")) {
              throw new Error("API 할당량을 초과했습니다. 잠시 후 오류가 지속되면 관리자에게 문의하세요.");
            }
            throw err;
          }
          
          const waitTime = 1000 + (Math.random() * 500); // wait approx 1-1.5s
          console.log(`Waiting ${Math.round(waitTime)}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      if (!response) {
        throw new Error("Failed to generate content from Gemini after retries.");
      }

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response generated from Gemini.");
      }

      const parsedResult = JSON.parse(responseText);
      const historyItem = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        title: title ? title.substring(0, 100) : parsedResult.summary.substring(0, 50) + "...",
        sermonText: text,
        result: parsedResult
      };

      try {
        const data = await fs.readFile(DATA_FILE, "utf-8");
        const history = JSON.parse(data);
        history.unshift(historyItem);
        await fs.writeFile(DATA_FILE, JSON.stringify(history, null, 2));
      } catch (err) {
        console.error("Failed to save history", err);
      }

      res.json(historyItem);

    } catch (error: any) {
      console.error("API error:", error);
      res.status(500).json({ error: error.message || "Something went wrong" });
    }
  });

  // API Route for reconstructing sermon in MacArthur style
  app.post("/api/reconstruct", async (req, res) => {
    try {
      const { title, text, summary } = req.body;
      const clientApiKey = req.headers['x-gemini-api-key'] as string;
      const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

      if (!text && !summary) {
        return res.status(400).json({ error: "Sermon text or summary is required." });
      }

      if (!apiKey) {
        return res.status(401).json({ error: "Gemini API key is missing. Please set your API key in the settings." });
      }

      const ai = new GoogleGenAI({ apiKey: apiKey });
      
      const systemInstruction = `
너는 존 맥아더(John MacArthur)의 강해설교 신학(Expository Preaching)을 철저히 따르는 수석 목사야.
사용자가 이전에 입력한 설교의 본문과 주제를 기반으로, 존 맥아더라면 이 본문(또는 주제)을 어떻게 설교했을지 20분 분량의 강해설교문으로 작성해줘.

[작성 조건]
1. 설교 제목과 핵심 주제는 사용자가 제공한 내용(또는 요약)을 그대로 활용하여 존 맥아더 스타일로 약간 패러프레이징할 것.
2. 철저한 본문 중심(Exegesis): 역사적, 문화적, 언어적 맥락에 충실하게 본문을 설명할 것.
3. 그리스도 중심성: 결론이나 핵심 동력이 예수 그리스도와 그분의 사역으로 귀결되게 할 것.
4. 성경을 성경으로 해석(상호 참조)하는 방식을 적극적으로 활용할 것.
5. 인간적인 감정 자극이나 강제 적용, 개인적 예화를 지양하고 말씀을 명확히 선포할 것.
6. 전체 설교문은 서론, 본론(대지 2~3개), 결론의 명확한 구조를 갖출 것.
`;

      const prompt = `
[원설교 제목]: ${title || '제목 없음'}
[원설교 텍스트/요약]: ${text || summary || '내용 없음'}

위 내용을 바탕으로 존 맥아더 관점의 20분 분량 강해설교문을 작성해줘.
`;

      let response;
      let attempt = 0;
      const maxRetries = 3;

      while (attempt < maxRetries) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              systemInstruction,
              temperature: 0.3
            },
          });
          break;
        } catch (err: any) {
          attempt++;
          console.error(`Gemini API Error (Attempt ${attempt}):`, err.message || err);
          
          const errString = String(err.message || err).toLowerCase();
          const isRetryable = err.status === 503 || err.status === 429 || err.code === 503 || err.code === 429 ||
                              errString.includes("503") || errString.includes("429") ||
                              errString.includes("high demand") || errString.includes("quota") ||
                              errString.includes("unavailable");
          
          if (attempt >= maxRetries || !isRetryable) {
            if (errString.includes("503") || errString.includes("high demand") || errString.includes("unavailable")) {
              throw new Error("구글 AI(Gemini) 서버에 일시적으로 트래픽이 몰려 지연되고 있습니다. 1~2분 뒤에 다시 시도해주세요.");
            } else if (errString.includes("429") || errString.includes("quota")) {
              throw new Error("API 할당량을 초과했습니다. 잠시 후 에러 현상이 계속되면 관리자에게 문의하세요.");
            }
            throw err;
          }
          
          const waitTime = 1000 + (Math.random() * 500);
          console.log(`Waiting ${Math.round(waitTime)}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      if (!response) {
        throw new Error("Failed to generate content from Gemini after retries.");
      }

      res.json({ sermon: response.text });

    } catch (error: any) {
      console.error("API error:", error);
      res.status(500).json({ error: error.message || "Something went wrong" });
    }
  });

  // API Route for expanding the reconstructed sermon
  app.post("/api/expand-reconstruct", async (req, res) => {
    try {
      const { title, reconstructedSermon } = req.body;
      const clientApiKey = req.headers['x-gemini-api-key'] as string;
      const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

      if (!reconstructedSermon) {
        return res.status(400).json({ error: "Reconstructed sermon text is required." });
      }

      if (!apiKey) {
        return res.status(401).json({ error: "Gemini API key is missing. Please set your API key in the settings." });
      }

      const ai = new GoogleGenAI({ apiKey: apiKey });
      
      const systemInstruction = `
너는 존 맥아더(John MacArthur)의 강해설교 신학(Expository Preaching)을 철저히 따르는 수석 목사야.
제공된 '재구성된 강해설교문'을 바탕으로, 다음의 추가 요청사항을 반영하여 설교문을 다시 작성해줘.

[추가 요청사항]
"강해설교의 본문의 권위를 높여주고, 또는 집중력을 위한 예화를 넣어서 30분 정도의 길이로 작성해달라"

[작성 조건]
1. 존 맥아더 스타일을 유지하되, 성경 본문 자체의 권위를 드러내는 데 효과적인 예화를 적절히 추가할 것. (개인적인 신변잡기적 예화는 금물, 성경적 권위를 뒷받침하는 역사적 예화나 객관적인 비유 활용)
2. 분량을 30분 설교 길이에 맞게 내용을 더 깊이 있고 풍성하게 확장할 것 (각 대지에 대한 설명, 성경 상호 참조, 적용점 등을 충분히 전개).
3. 결론과 핵심은 오직 예수 그리스도를 향하도록 할 것.
`;

      const prompt = `
[원설교 제목]: ${title || '제목 없음'}

[재구성된 20분 분량 강해설교문]:
${reconstructedSermon}

위 설교문을 바탕으로, 본문의 권위를 높이고 집중력을 위한 예화를 포함하여 30분 분량으로 풍성하게 확장 작성해줘.
`;

      let response;
      let attempt = 0;
      const maxRetries = 3;

      while (attempt < maxRetries) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              systemInstruction,
              temperature: 0.3
            },
          });
          break;
        } catch (err: any) {
          attempt++;
          console.error(`Gemini API Error (Attempt ${attempt}):`, err.message || err);
          
          const errString = String(err.message || err).toLowerCase();
          const isRetryable = err.status === 503 || err.status === 429 || err.code === 503 || err.code === 429 ||
                              errString.includes("503") || errString.includes("429") ||
                              errString.includes("high demand") || errString.includes("quota") ||
                              errString.includes("unavailable");
          
          if (attempt >= maxRetries || !isRetryable) {
            if (errString.includes("503") || errString.includes("high demand") || errString.includes("unavailable")) {
              throw new Error("구글 AI(Gemini) 서버에 일시적으로 트래픽이 몰려 지연되고 있습니다. 1~2분 뒤에 다시 시도해주세요.");
            } else if (errString.includes("429") || errString.includes("quota")) {
              throw new Error("API 할당량을 초과했습니다. 잠시 후 에러 현상이 계속되면 관리자에게 문의하세요.");
            }
            throw err;
          }
          
          const waitTime = 1000 + (Math.random() * 500);
          console.log(`Waiting ${Math.round(waitTime)}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      if (!response) {
        throw new Error("Failed to generate content from Gemini after retries.");
      }

      res.json({ sermon: response.text });

    } catch (error: any) {
      console.error("API error:", error);
      res.status(500).json({ error: error.message || "Something went wrong" });
    }
  });

  // Vite middleware for development
  if (!process.env.VERCEL && process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
  
  return app;
}

const appPromise = startServer();
export default async function (req: any, res: any) {
  const app = await appPromise;
  app(req, res);
}
