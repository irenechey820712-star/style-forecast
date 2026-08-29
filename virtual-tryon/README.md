# 가상 피팅 서버 (virtual-tryon)

`style-dossier.html`의 **"내 착용 이미지 만들기"** 버튼을 실제로 동작시키는 서버리스 함수입니다.
아티팩트(Claude) 안에서는 외부 API 호출이 막혀 있으므로, 이 폴더를 정적 호스팅에 함께 배포하고
프런트엔드에 서버 주소만 알려주면 됩니다.

## 동작 구조

```
style-dossier.html  ──POST {image, prompt}──▶  /api/tryon  ──▶  이미지 편집 모델
       ▲                                                              │
       └──────────────  { image: "<url>" }  ◀──────────────────────────┘
```

- 입력 사진 + 텍스트 지시문을 이미지 편집 모델에 넘겨, 그 사람에게 추천 코디를 입힌 사진을 생성합니다.
- 기본 예시는 **Replicate의 FLUX Kontext** 모델입니다(옷 이미지 없이 지시문만으로 편집).
- 얼굴/체형을 유지하는 전용 **가상 피팅(VTON)** 모델을 쓰려면 옷 이미지가 별도로 필요합니다. `api/tryon.js`의 `callModel()`만 교체하세요.

## 배포 (Vercel 기준, 가장 빠름)

1. [replicate.com](https://replicate.com) 가입 → **Account → API tokens**에서 토큰 발급 (사용량만큼 과금, 이미지 1장당 대략 수십 원 수준).
2. 이 `virtual-tryon` 폴더를 GitHub 저장소로 올립니다.
3. [vercel.com](https://vercel.com)에서 New Project → 그 저장소 선택 → Deploy.
4. Vercel 프로젝트 **Settings → Environment Variables**에 추가:
   | 이름 | 값 |
   |---|---|
   | `REPLICATE_API_TOKEN` | 1번에서 발급한 토큰 |
   | `TRYON_MODEL` | (선택) `black-forest-labs/flux-kontext-pro` |
   | `ALLOW_ORIGIN` | 프런트를 올린 주소. 테스트 중엔 `*` 도 가능 |
5. 재배포 후 함수 주소는 `https://<프로젝트>.vercel.app/api/tryon` 입니다.

### Netlify를 쓴다면
`api/tryon.js`를 `netlify/functions/tryon.js`로 옮기면 그대로 동작합니다.
주소는 `https://<사이트>.netlify.app/.netlify/functions/tryon`.

## 프런트엔드 연결

`style-dossier.html` 상단의 이 줄을 배포 주소로 바꿉니다.

```js
var TRYON_ENDPOINT = "https://<프로젝트>.vercel.app/api/tryon";
```

이후 결과 카드의 **"내 착용 이미지 만들기"** 버튼이 활성화되어, 왼쪽에 올린 사진 기반으로
각 추천 스타일의 착용 이미지를 생성합니다. (사진을 안 올리면 버튼은 안내만 표시)

## 비용·주의

- 이미지 생성은 호출당 과금됩니다. 남용 방지를 위해 `ALLOW_ORIGIN`을 실제 도메인으로 제한하고,
  필요하면 함수에 rate limit(예: IP당 하루 N회)을 추가하세요.
- 사진은 서버를 거쳐 모델 제공자에게 전송됩니다. 개인정보 안내 문구를 프런트에 노출하는 것을 권장합니다.
- 미성년자 사진 처리 시 제공자 약관을 반드시 확인하세요.

## 로컬 테스트

```bash
npm i -g vercel
cd virtual-tryon
vercel dev            # http://localhost:3000/api/tryon
```

```bash
curl -X POST http://localhost:3000/api/tryon \
  -H "Content-Type: application/json" \
  -d '{"image":"data:image/jpeg;base64,....","prompt":"Dress this person in a navy tailored blazer..."}'
```
