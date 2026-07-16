# 회의실 예약 프로그램

회의실1, 회의실2, 회의실3을 로그인 없이 간단히 예약하는 GitHub Pages + Firebase 프로그램입니다.

## 주요 기능

- 기본 화면 08:00~20:00
- 일반 운영시간 09:00~18:00
- 확장시간 08:00~09:00, 18:00~20:00 색상 구분
- 24시간 예약 가능
- 30분 단위, 기본 1시간 예약
- 이름 최초 1회 저장
- 내 예약 보기
- 누구나 예약 삭제 가능
- 삭제 전 경고
- 삭제자·원 예약정보·삭제시각 로그 보관
- 실시간 예약현황 반영

## 1. Firebase 연결

`firebase-config.js` 파일을 열고 Firebase 콘솔에 표시된 값을 붙여 넣습니다.

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## 2. Firestore 규칙 적용

Firebase 콘솔에서 다음 경로로 이동합니다.

`Firestore Database > 규칙`

`firestore.rules`의 전체 내용을 붙여 넣고 **게시**를 누릅니다.

> 이 규칙은 로그인 없는 소규모 내부 사용을 전제로 합니다. 웹주소가 외부에 공개되면 외부인도 접근할 수 있으므로 주소 공유 범위를 제한하세요.

## 3. GitHub 업로드

저장소 최상단에 아래 파일을 모두 업로드합니다.

- `index.html`
- `style.css`
- `app.js`
- `firebase-config.js`
- `firestore.rules`
- `README.md`

## 4. GitHub Pages 켜기

1. 저장소 `Settings`
2. 왼쪽 `Pages`
3. `Build and deployment`
4. Source: `Deploy from a branch`
5. Branch: `main`, 폴더: `/ (root)`
6. `Save`

잠시 후 표시되는 주소로 접속합니다.

## 5. Firestore 색인 오류가 나타나는 경우

`삭제 내역`에서 색인 관련 오류가 나타나면 브라우저 개발자도구의 오류 메시지에 표시되는 Firebase 링크를 열어 색인을 생성합니다. 현재 기본 쿼리는 단일 필드 정렬만 사용하므로 일반적으로 별도 복합 색인이 필요하지 않습니다.

## 주의사항

- 화면에서 삭제할 때는 예약 삭제와 로그 기록을 하나의 batch로 처리합니다.
- 로그인 없는 구조이므로 Firebase 콘솔이나 별도 프로그램으로 직접 접근하는 행위까지 완전히 막을 수는 없습니다.
- 예약 충돌은 화면에서 저장 직전에 다시 검사하지만, 두 사용자가 완전히 동시에 같은 칸을 저장하면 드물게 중복될 수 있습니다. 실제 사용 중 문제가 생기면 Firebase Cloud Functions 또는 인증 기능을 추가해 서버 단위 잠금을 적용할 수 있습니다.
