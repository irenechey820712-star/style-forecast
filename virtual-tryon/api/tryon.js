/**
 * 가상 피팅 서버리스 함수 (Vercel / Netlify Functions 호환)
 * ---------------------------------------------------------------
 * 프런트엔드(style-dossier.html)가 보내는 요청:
 *   POST { image: "<data:image/...;base64,...>", prompt: "<영문 지시문>", archetype: "<id>" }
 * 이 함수가 돌려주는 응답:
 *   200 { image: "<https URL 또는 data URL>" }
 *   4xx/5xx { error: "<메시지>" }
 *
 * 기본 예시는 Replicate의 이미지 편집 모델(FLUX Kontext 계열)을 사용합니다.
 * 입력 사진 + 텍스트 지시문 -> 편집된 사진. 별도의 옷 이미지가 필요 없습니다.
 * 다른 제공자(Google Gemini 이미지 편집, OpenAI 이미지 편집 등)로 바꾸려면
 * callModel() 내부만 교체하면 됩니다.
 *
 * 필요한 환경변수:
 *   REPLICATE_API_TOKEN   Replicate API 토큰 (https://replicate.com/account)
 *   TRYON_MODEL           (선택) 모델 슬러그. 기본값: "black-forest-labs/flux-kontext-pro"
 *   ALLOW_ORIGIN          (선택) CORS 허용 오리진. 기본값: "*"
 */

const MODEL = process.env.TRYON_MODEL || "black-forest-labs/flux-kontext-pro";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 허용됩니다." });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ error: "REPLICATE_API_TOKEN 환경변수가 없습니다." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: "JSON 파싱 실패" }); }
  }
  const { image, prompt } = body || {};
  if (!image || !prompt) return res.status(400).json({ error: "image과 prompt가 필요합니다." });
  if (image.length > 8_000_000) return res.status(413).json({ error: "이미지가 너무 큽니다. 더 작은 사진을 올려주세요." });

  try {
    const outUrl = await callModel({ token, image, prompt });
    // 프런트에 그대로 <img src>로 넣을 수 있도록 URL을 반환합니다.
    return res.status(200).json({ image: outUrl });
  } catch (err) {
    return res.status(502).json({ error: String(err && err.message || err) });
  }
};

/* ----------------- 제공자별 구현 ----------------- */
async function callModel({ token, image, prompt }) {
  // 1) 예측 생성
  const create = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait", // 최대 60초까지 동기 대기 시도
    },
    body: JSON.stringify({
      model: MODEL,
      input: {
        prompt,
        input_image: image,       // data URL 그대로 허용됨
        output_format: "jpg",
        aspect_ratio: "3:4",
        safety_tolerance: 2,
      },
    }),
  });

  const data = await create.json();
  if (!create.ok) throw new Error(data.detail || data.title || "Replicate 요청 실패");

  // 2) 아직 처리 중이면 폴링
  let pred = data;
  const started = Date.now();
  while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
    if (Date.now() - started > 110_000) throw new Error("생성 시간 초과");
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${token}` } });
    pred = await poll.json();
  }
  if (pred.status !== "succeeded") throw new Error("모델 처리 실패: " + (pred.error || pred.status));

  const output = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!output) throw new Error("모델이 이미지를 반환하지 않았습니다.");
  return output; // https URL
}

/* ----------------- 다른 제공자로 바꾸려면 (참고) -----------------

// Google Gemini 이미지 편집 (예: gemini-2.5-flash-image):
//   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=API_KEY
//   body: { contents:[{ parts:[ {inline_data:{mime_type,data:<base64>}}, {text: prompt} ]}] }
//   응답의 inlineData(base64)를 "data:image/png;base64," + data 로 감싸 반환

// OpenAI 이미지 편집 (gpt-image-1):
//   POST https://api.openai.com/v1/images/edits  (multipart: image, prompt)
//   응답 b64_json -> "data:image/png;base64," + b64_json

--------------------------------------------------------------- */
