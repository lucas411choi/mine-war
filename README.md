# ⛏️ 광산 전쟁 (Mine War)

3D 실시간 1:1 타워 디펜스 / 자원 관리형 전략 게임. **채굴 · 전쟁 · 제작** 3개 팀에 돈을 배분해 상대 메인 타워를 먼저 부수면 승리합니다.
웹 브라우저(PC + 모바일) 크로스 플레이, AI 대전(브라우저 로컬)과 방 코드 온라인 대전(Node.js 서버 권위) 지원.

- 클라이언트: Three.js + Vite (코드로 만든 로우폴리 모델, Bloom/FXAA/컬러그레이딩)
- 서버: Node.js + Express + ws (Express 1개가 정적 파일, `/healthz`, `/ws`를 모두 처리)
- 시뮬레이션: `shared/sim` (렌더링과 분리, 20Hz 고정 틱, 서버/AI 대전/클라이언트가 같은 코드 공유)

## 폴더 구조
```
/ (루트)
├─ package.json        # 루트 package.json 하나만 사용 (scripts: dev, build, start)
├─ render.yaml         # Render 블루프린트
├─ .node-version       # Node 버전 (20.x)
├─ vite.config.js      # Vite root = client/, 빌드 결과 = dist/
├─ client/             # index.html, src/, public/(정적 에셋)
│  └─ src/
│     ├─ main.js            # 화면 흐름, AI/온라인 세션, 이벤트→사운드, 메인 루프
│     ├─ net.js             # WebSocket 클라이언트 (자동 재시도, 하트비트, 세션 토큰)
│     ├─ audio.js           # WebAudio로 만든 효과음/배경음
│     ├─ config/            # texts.js(문구), settings.js(설정), assets.js(에셋 매니페스트), i18n.js
│     ├─ game/session.js    # LocalSession(AI 대전) / OnlineSession(서버 스냅샷 보간)
│     ├─ render/            # stage.js(3분할+포스트프로세싱), warScene.js, workScenes.js(채굴/제작), models.js, particles.js, gfx.js
│     └─ ui/                # hud.js, menus.js, portraits.js, ../style.css
├─ server/
│  ├─ index.js          # Express + ws, 정적 서빙, /healthz, ping 30초, rate limit, 예외 처리
│  ├─ rooms.js          # 방 코드 생성/입장/정리, 재접속(세션 토큰), 연결 끊김 처리
│  ├─ matchRunner.js    # 방별 서버 시뮬레이션 + 10Hz 변경분 스냅샷
│  └─ config.js         # 방 수 상한(기본 20), 타임아웃 등 (환경변수 없이도 기본값으로 동작)
├─ shared/
│  ├─ balance.json      # 모든 수치 (가격, 체력, 공격력, 타워, 마법 ...)
│  ├─ protocol.js       # 메시지 타입/검증 (서버·클라이언트 공유)
│  ├─ snapshot.js       # 스냅샷 인코딩 + 클라이언트 Mirror
│  └─ sim/              # game.js, economy.js, units.js, combat.js, tower.js, magic.js, ai.js, rng.js
└─ scripts/sim-test.mjs # AI vs AI 헤드리스 테스트
```

## 로컬 실행
```bash
npm install
npm run dev                      # 서버(3000) + Vite(5173) 동시 실행 → http://localhost:5173
# 배포 환경과 똑같이 확인하기
npm run build && npm start       # → http://localhost:3000  (/healthz 도 확인)
npm run test:sim                 # (선택) 시뮬레이션/AI 헤드리스 테스트
```
Node 18 이상 필요 (`.node-version`은 20.18.0).

## GitHub 업로드
1. zip을 풉니다. 풀면 **프로젝트 루트에 바로 `package.json`이 보입니다**(바깥 폴더 없음). 만약 압축 프로그램이 폴더를 한 겹 더 만들었다면, `package.json`이 있는 폴더의 *내부 파일 전체*를 저장소 루트에 올리세요.
2. `node_modules/`, `dist/`는 올리지 않습니다 (`.gitignore`에 포함됨).
```bash
cd <압축 푼 폴더>   # package.json이 보이는 곳
git init && git add . && git commit -m "Mine War"
git branch -M main
git remote add origin https://github.com/<내계정>/<저장소>.git
git push -u origin main
```

## Render 배포 (Web Service)
1. Render 대시보드 → **New → Web Service** → GitHub 저장소 연결
2. 설정 (render.yaml이 있으면 Blueprint로도 가능)
   - Runtime: **Node**
   - Build Command: `npm install --include=dev && npm run build`
   - Start Command: `npm start`
   - Health Check Path: `/healthz`
   - 환경변수: **필수 없음** (선택: `MAX_ROOMS` 동시 방 수 상한, 기본 20)
3. 배포가 끝나면 `https://<서비스>.onrender.com` 로 접속. 게임 화면과 WebSocket(`wss://.../ws`)이 **같은 주소 하나**에서 동작합니다 (주소는 `location` 기준으로 자동 결정되므로 코드 수정 불필요).

## 방 코드 사용법 (온라인 대전)
1. 한 명이 **방 만들기** → 영문+숫자 5자리 코드(헷갈리는 0/O/1/I 제외)가 표시됩니다. **복사** 버튼으로 복사해 친구에게 전달.
2. 다른 한 명이 **방 입장**에 코드를 입력.
3. 둘 다 **준비 완료**를 누르면 시작 → 45초 준비 시간(타워 선택, 초기 채굴자 고용) → 전투.
4. 에러 처리: 없는 코드 / 가득 찬 방 / 방장 퇴장(방 닫힘) / 서버 재시작 안내 / 10분 방치된 방 자동 삭제.
5. 연결이 끊기면 30초 안에 같은 브라우저로 다시 접속하면 게임에 복귀합니다(세션 토큰은 localStorage). 30초가 넘으면 상대 승리 처리됩니다.

## Render 무료 플랜 주의사항
- 15분 동안 접속이 없으면 서버가 잠들고, 첫 접속에 30~60초가 걸립니다. 온라인 모드 진입 시 **"서버 깨우는 중..."** 화면이 뜨고 자동으로 재시도합니다.
- **AI 대전은 브라우저에서 실행**되므로 서버가 자고 있어도 플레이할 수 있습니다.
- 재시작/재배포 시 메모리가 초기화되어 방이 모두 사라집니다. 클라이언트에는 "서버가 재시작되었습니다" 안내 후 로비로 돌아갑니다.
- 인스턴스 1개만 가정합니다 (여러 서버 간 방 동기화 없음).
- 서버 부하를 줄이기 위해 서버 틱 20Hz, 스냅샷 10Hz(변경분만 전송), 메시지 크기 2KB·초당 40개 제한, 30초 ws ping을 사용합니다.

## 밸런스 수정
`shared/balance.json` 하나에 모든 수치가 있습니다 (시작 자금, 가격 상승률 8%, 캐릭터별 가격/체력/공격력/속도/쿨타임, 타워 4종, 마법, 시간 설정 등). 수정 후 `npm run build`만 하면 서버·클라이언트·AI가 모두 반영합니다. 문구는 `client/src/config/texts.js`, AI 난이도는 `shared/sim/ai.js`의 `LEVELS`.

## 에셋(GLB, 사운드) 교체
- 기본 상태는 **에셋 파일 0개**입니다 (모델은 코드로 생성, 사운드는 WebAudio 합성).
- GLB 교체: 파일을 `client/public/assets/models/` 에 넣고 `client/src/config/assets.js`에 등록
  ```js
  models: { tim: { url: '/assets/models/tim.glb', scale: 1, y: 0 }, tower_crystal: { url: '/assets/models/crystal_tower.glb' } }
  ```
  키는 캐릭터 id(`jack, robinson, gary, teammine, tim, kimmy, kelly, galion, sammy, sam, bill, ezra`) 또는 `tower_crystal / tower_iron / tower_flame / tower_vein`. GLB는 정적 모델로 표시됩니다(절차적 애니메이션 대신 가벼운 흔들림).
- 사운드 교체: `client/src/audio.js`의 `SFX` 테이블에서 해당 효과음을 `new Audio('/assets/sounds/xxx.mp3')` 재생으로 바꾸면 됩니다.

## 조작
- PC: 전쟁 패널 드래그 = 이동, 마우스 휠 = 줌. 각 패널 하단의 초상화 버튼 클릭 = 고용.
- 모바일: 세로 화면은 전쟁 패널이 위, 채굴/제작은 아래 탭(좌우 스와이프로도 전환). 전쟁 패널은 드래그 이동, 핀치 줌.
- 설정: 소리, 배경음, 그래픽 품질(자동/상/중/하), 패널 비율(1:2:1 / 1:1:1), 언어(한국어/English).

## 구현 시 가정한 사항
- 고용 가격은 *모든* 캐릭터(채굴/전쟁/제작)에서 고용할 때마다 8% 상승. 무료 지급된 잭은 가격 계산에 포함되지 않음.
- 채굴/제작 캐릭터는 종류별 최대 보유 수가 있음(잭 12, 로빈슨 10, 개리 8, 팀 마인 6, 샘/빌/에즈라 5). 전쟁 유닛은 양쪽 각 40기 제한.
- 준비 시간에는 채굴 팀만 고용 가능(수입은 전투 시작부터 발생). 시작 자금 100으로 잭 1명 추가 고용 가능.
- 연장전 후에도 같으면 타워 피해량이 많은 쪽, 그것도 같으면 방장(0번)이 승리.
- 새미(공중)는 근접 유닛과 갈리온(대지 포)에게 공격받지 않고, 궁수·새미·마법·(화염 포대를 제외한) 타워가 공격 가능. 화염 포대는 지상 전용.
- 샘/빌의 버프는 유닛과 메인 타워 모두에 적용. 마법은 샘 버프 대신 에즈라 중첩 배율을 사용.
- 클라이언트 예측은 하지 않고(서버 권위 + 스냅샷 보간), 버튼 반응성은 클라이언트 사전 검사와 즉시 효과음/반짝임으로 보완.
