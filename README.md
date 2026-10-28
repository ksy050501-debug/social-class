# 무역의 발견 — 우리나라의 생활을 완성하라!

초등학교 6학년 사회 「국가 간 경제활동과 무역」 40분 공개수업용 웹게임입니다.
모둠마다 태블릿 한 대로 나라 하나를 맡아 생산하고, 교사 PC에서 수업 단계와 전체 현황을 실시간으로 관리합니다.

| 주소 | 누가 | 하는 일 |
|---|---|---|
| `/` (index.html) | 학생 태블릿 | 입장 코드 입력 → 나라 고르기 → 우리나라 화면 |
| `/teacher` | 교사 PC | 구글 로그인, 수업 방 만들기, 단계 진행, 관제, 발표 화면 |
| `/check` | 교사 (수업 전) | 실제 서버에서 권한·동시 거래·100% 달성 자동 점검 |
| `/demo` | 누구나 | 인터넷 연동 없이 한 기기에서 전체 흐름 시연 |

- 화면: HTML·CSS·JavaScript만 사용, 설치·빌드 없음
- 실시간 연동: Firebase (Authentication + Firestore), 무료 요금제(Spark)로 충분
- 배포: GitHub 저장소를 Vercel에 연결

---

## 1. 처음 한 번: Firebase 프로젝트 만들기

1. https://console.firebase.google.com 에서 **프로젝트 추가** → 이름 예: `trade-discovery` → Google 애널리틱스는 꺼도 됩니다.
2. **웹 앱 등록**: 프로젝트 개요의 `</>` 아이콘 → 앱 닉네임 입력 → (Hosting 체크 안 함) → 나오는 `firebaseConfig` 값을 복사합니다.
3. 복사한 값을 `js/firebase-config.js`의 빈칸에 붙여 넣습니다. (값을 Claude에게 주면 대신 넣고 커밋할 수 있습니다. 이 값은 공개돼도 되는 주소 정보이고 보안은 4번의 규칙이 맡습니다.)

## 2. 로그인 켜기

**빌드 → Authentication → 시작하기 → 로그인 방법**에서 두 가지를 켭니다.

- **Google**: 사용 설정 → 프로젝트 지원 이메일 선택 → 저장 (교사용)
- **익명**: 사용 설정 → 저장 (학생용, 학생은 계정이 필요 없습니다)

## 3. 데이터베이스 만들기

**빌드 → Firestore Database → 데이터베이스 만들기**

- 위치: `asia-northeast3 (서울)`
- **프로덕션 모드**로 시작

## 4. 보안 규칙 넣기

Firestore Database → **규칙** 탭 → 기존 내용을 모두 지우고 이 저장소의 `firestore.rules` 내용을 붙여 넣은 뒤 **게시**합니다.

이 규칙 덕분에 학생은 자기 나라만 조작할 수 있고, 생산량·재고를 속여 저장하거나 수업 단계를 바꿀 수 없습니다. 입장 코드는 방을 찾는 데만 쓰이고 권한을 주지 않습니다.

## 5. Vercel에 배포하기

1. https://vercel.com → **Add New → Project** → GitHub의 `social-class` 저장소 **Import**
2. Framework Preset: **Other**, Build Command·Output Directory는 비워 둠 → **Deploy**
3. 배포 주소(예: `social-class-xxxx.vercel.app`)를 확인합니다.
4. Firebase 콘솔 → Authentication → **설정 → 승인된 도메인 → 도메인 추가**에 그 주소를 넣습니다. (빠뜨리면 교사 구글 로그인이 "unauthorized-domain"으로 실패합니다.)

이후에는 GitHub에 올라간 변경이 Vercel에 자동으로 배포됩니다.

## 6. 수업 전 점검

교사 PC에서 `배포주소/check`를 열고 **점검 시작**을 누릅니다. 가상 학생 기기 4대로 수업 전체를 자동 진행하며 약 30개 항목을 확인하고, 끝나면 점검용 방을 지웁니다. 모두 "통과"가 나오면 수업에 쓸 수 있습니다.

수업 당일 체크리스트와 예외 상황 대응은 [docs/수업-운영.md](docs/수업-운영.md), 게임 규칙·설정 변경·검증 결과는 [docs/규칙과-검증.md](docs/규칙과-검증.md)를 보세요.

---

## 파일 구성

```
index.html / teacher.html / check.html / demo.html   페이지
css/style.css            디자인
js/logic.js              게임 규칙 (생산량, 확보율, 거래, 단계 전환) — 모든 화면이 공유
js/ui.js                 화면 그리기 (교사·학생·발표 화면)
js/remote.js             Firebase 저장·실시간 동기화 (트랜잭션)
js/local-backend.js      시연 모드 저장 (이 기기에만)
js/teacher.js, student.js, check.js   각 페이지 흐름
js/fb.js, firebase-config.js          Firebase 연결
firestore.rules          서버 보안 규칙
tests/                   규칙 검증·동시 접속 테스트 (배포되지 않음)
```

## 테스트 실행 (개발용)

```bash
node tests/verify.js          # 게임 규칙 수학 검증 (1차 불가능, 2차 가능, 보존, 동시성)
python3 tests/e2e_live.py     # 교사 1 + 학생 4 동시 접속 브라우저 테스트 (가짜 Firebase, Playwright 필요)
```
