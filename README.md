# 해커스 보카 회독 — 설치형 앱 설정 안내

이 폴더의 파일을 웹에 올리고(1단계), Firebase를 만들어 연결하면(2단계) 패드와 폰에서 같은 기록을 이어서 쓸 수 있어요.
2단계를 건너뛰면 기기마다 따로 저장되는 오프라인 앱으로만 작동해요.

## 파일 설명

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 화면 |
| `app.js` | 앱 동작 |
| `core.js` | 기록 구조와 기기 간 병합 규칙 |
| `words.js` | 단어 1800개 데이터 (먼저 외울 뜻 표시 포함) |
| `sync.js` | Firebase 로그인·동기화 |
| `firebase-config.js` | **여기에 Firebase 설정값을 넣어요** (비어 있으면 동기화 꺼짐) |
| `sw.js` | 오프라인 캐시 (서비스 워커) |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | 앱 이름·아이콘 |
| `firestore.rules` | Firebase 콘솔에 붙여넣을 보안 규칙 (업로드 안 해도 됨) |

## 1단계 — GitHub Pages에 올리기 (무료 주소 만들기)

1. https://github.com 에서 계정을 만들고 로그인해요.
2. 오른쪽 위 **+ → New repository** → 이름은 예를 들어 `voca` → **Public** → **Create repository**.
3. **uploading an existing file** 링크를 눌러 이 폴더의 파일을 **전부** 끌어다 놓고 → **Commit changes**.
4. 저장소의 **Settings → Pages** → Build and deployment의 **Branch**를 `main` / `/ (root)`로 고르고 **Save**.
5. 1~2분 뒤 같은 화면 위쪽에 주소가 떠요. 보통 `https://아이디.github.io/voca/` 모양이에요.

## 2단계 — Firebase 만들기 (기기 연동)

1. https://console.firebase.google.com 에 구글 계정으로 로그인 → **프로젝트 추가** → 이름(예: voca) → Google 애널리틱스는 **꺼도 돼요** → 만들기.
2. 프로젝트 첫 화면에서 **</> (웹)** 아이콘 → 앱 닉네임 입력(Firebase 호스팅 체크는 안 함) → **앱 등록** → 화면에 나오는 `firebaseConfig = { ... }` 부분을 복사해 둬요.
3. 왼쪽 메뉴 **빌드 → Authentication → 시작하기 → Sign-in method → Google → 사용 설정** → 지원 이메일 고르고 **저장**.
4. **Authentication → Settings → 승인된 도메인 → 도메인 추가** → 1단계에서 받은 주소의 도메인(`아이디.github.io`)을 추가.
5. **빌드 → Firestore Database → 데이터베이스 만들기** → 위치는 `asia-northeast3 (서울)` → **프로덕션 모드** → 만들기.
6. Firestore의 **규칙** 탭 → 내용을 전부 지우고 `firestore.rules` 파일 내용을 붙여넣기 → **게시**.
7. `firebase-config.js`를 열어 `window.FIREBASE_CONFIG = null;`을 2번에서 복사한 값으로 바꿔요:
   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "voca-xxxx.firebaseapp.com",
     projectId: "voca-xxxx",
     storageBucket: "voca-xxxx.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```
   GitHub에서 그 파일을 열고 연필(편집) 아이콘으로 고친 뒤 **Commit changes** 하면 돼요.

## 3단계 — 패드와 폰에 설치

1. 각 기기의 **크롬**으로 1단계 주소를 열어요.
2. 홈 화면에 **"홈 화면에 앱으로 설치"** 버튼이 뜨면 누르고, 안 뜨면 크롬 메뉴(⋮) → **홈 화면에 추가** 또는 **앱 설치**.
3. 설치된 앱을 열고 오른쪽 위 **구름 모양(기기 연동)** → **구글로 로그인**. 두 기기 모두 같은 계정으로 로그인하면 끝이에요.
4. 이후엔 인터넷이 없어도 앱이 열리고, 기록은 기기에 저장됐다가 연결되면 자동으로 맞춰져요.

## 알아두면 좋은 것

- 두 기기가 모두 오프라인인 상태에서 **같은 묶음**을 각각 진행하면, 다시 연결될 때 **더 많이 진행한 기기**의 진행 상황을 따라가요. 끝낸 회독·별표는 양쪽 것이 모두 합쳐져요.
- **기록 초기화**는 연동된 모든 기기의 기록을 지워요.
- 앱 파일을 바꿔 다시 올리면, 열려 있는 앱에 "새 버전이 있어요" 알림이 떠요.
- 기존에 브라우저에서 쓰던 기록(v1)은 같은 주소에서 열면 자동으로 옮겨와요.
