# Wordle 워들 자동 블로그 글 생성기

NYT Wordle 정답을 날짜별로 가져와서 네이버 블로그용 글 초안을 자동 생성하는 도구입니다.

파이썬이 필요 없습니다.  
GitHub Actions가 Node.js로 자동 실행합니다.

## 이 도구가 하는 일

- 오늘 날짜의 Wordle 정답 가져오기
- Wordle 번호 가져오기
- 첫 글자 / 마지막 글자 자동 생성
- 모음 개수 자동 계산
- 중복 글자 여부 자동 계산
- 1~3단계 힌트 템플릿 생성
- 정답 공개 문단 생성
- 네이버 블로그 태그 생성
- `posts/latest.txt`에 복사 가능한 글 저장
- GitHub Pages 화면에서 바로 수정/복사 가능

## 중요한 점

이 도구는 NYT Wordle 페이지에 직접 로그인하거나 직접 타이핑해서 플레이하는 봇이 아닙니다.

날짜별 Wordle JSON endpoint를 조회해서 정답을 가져오고, 그 정답을 바탕으로 블로그 초안을 만드는 방식입니다.

한국어 뜻, 체감 난이도, 실제 내가 몇 번 만에 풀었는지 같은 주관적인 내용은 자동으로 완벽하게 알 수 없습니다.  
그래서 아래 두 방식 중 하나로 보완합니다.

1. `config.json`의 `wordInfo`에 단어 정보를 미리 적어두기
2. GitHub Pages 화면에서 뜻/후기만 직접 수정해서 복사하기

## 파일 구조

```text
.
├─ index.html
├─ config.json
├─ package.json
├─ scripts/
│  └─ generate-wordle.mjs
├─ data/
│  ├─ latest.json
│  └─ 2026-05-29.json
├─ posts/
│  ├─ latest.txt
│  └─ 2026-05-29-wordle.txt
└─ .github/
   └─ workflows/
      └─ update-wordle.yml
```

## GitHub에 올리는 방법

1. GitHub에서 새 저장소를 만듭니다.
2. 저장소는 `Public`으로 만드는 것을 추천합니다.
3. 이 ZIP 파일을 풀고 안의 파일들을 저장소에 업로드합니다.
4. 특히 `.github/workflows/update-wordle.yml` 파일이 업로드되어야 자동 실행됩니다.

Windows에서 `.github` 폴더가 안 보이면 숨김 파일 표시를 켜거나, GitHub에서 직접 새 파일을 만들고 파일명을 아래처럼 입력하세요.

```text
.github/workflows/update-wordle.yml
```

## GitHub Pages 켜는 방법

1. 저장소에서 `Settings` 클릭
2. 왼쪽 메뉴에서 `Pages` 클릭
3. `Build and deployment`에서 `Deploy from a branch` 선택
4. Branch는 `main`, Folder는 `/root` 선택
5. Save 클릭

주소는 보통 아래 형태로 생성됩니다.

```text
https://깃허브아이디.github.io/저장소이름/
```

## 자동 실행 확인하기

자동 실행은 매일 한국 시간 00:17 기준으로 설정되어 있습니다.

```yaml
cron: "17 15 * * *"
```

GitHub Actions의 cron은 UTC 기준이라서, 한국 시간 00:17은 UTC 15:17입니다.

자동 실행이 늦어질 수 있으니 급할 때는 수동 실행하세요.

1. 저장소에서 `Actions` 클릭
2. `Update Wordle Blog Draft` 클릭
3. `Run workflow` 클릭
4. 날짜를 비워두면 한국 날짜 기준 오늘 글 생성
5. 날짜를 넣으면 해당 날짜 글 생성

예시:

```text
2026-05-29
```

## 결과 확인하기

자동 실행이 끝나면 아래 파일들이 생성 또는 갱신됩니다.

```text
data/latest.json
posts/latest.txt
posts/YYYY-MM-DD-wordle.txt
```

가장 편한 방법은 GitHub Pages 주소로 들어가서 `GitHub에 생성된 최신 글 불러오기` 버튼을 누르는 것입니다.

또는 GitHub 저장소에서 직접 아래 파일을 열어 복사해도 됩니다.

```text
posts/latest.txt
```

## config.json 수정 방법

`config.json`에는 자주 쓰는 설정과 단어별 한국어 정보를 넣을 수 있습니다.

예시:

```json
{
  "wordInfo": {
    "CLANG": {
      "pos": "명사 / 동사",
      "difficulty": "중상",
      "category": "일상 단어 / 소리·동작",
      "hintTopic": "소리",
      "frequency": "가끔",
      "meaningKo": "쨍그랑 소리를 내다",
      "candidateWord": "CANAL",
      "successTry": "6",
      "extraMemo": "자주 쓰는 단어가 아니라서 난이도가 약간 높은 듯했지만"
    }
  }
}
```

앞으로 자주 나오는 단어를 여기에 추가하면 자동 생성 글이 더 자연스러워집니다.

모르는 단어는 일단 아래처럼 생성됩니다.

```text
- 품사 : [ 직접 입력 ]
- 뜻 범위 : [ 뜻 범위 직접 입력 ]
- 한국어 뜻 : [ 한국어 뜻 직접 입력 ]
```

그런 뒤 GitHub Pages 화면에서 직접 고치면 됩니다.

## 로컬에서 쓰기

파이썬은 필요 없습니다.  
`index.html`을 더블클릭하면 브라우저에서 열립니다.

다만 브라우저에서 NYT 데이터를 직접 가져오는 버튼은 CORS 정책 때문에 실패할 수 있습니다.  
그럴 때는 GitHub Actions를 실행해서 `data/latest.json`을 만든 뒤 사용하세요.

## 주의

- NYT Wordle JSON endpoint는 공개 문서화된 정식 API가 아니므로 구조가 바뀔 수 있습니다.
- GitHub Actions 예약 실행은 정확한 시각에 반드시 실행된다고 보장되지는 않습니다.
- 블로그에 올리기 전 한국어 뜻, 품사, 맞춤법, 실제 풀이 횟수는 한 번 확인하는 것을 추천합니다.
