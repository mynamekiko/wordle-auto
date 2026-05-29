#!/usr/bin/env node
/**
 * Wordle Auto Blogger
 * - NYT Wordle 날짜 JSON에서 정답을 가져옵니다.
 * - 정답 기반으로 힌트/정답/태그/네이버 블로그 초안을 생성합니다.
 * - Node.js 18+ 에서 동작합니다. GitHub Actions의 Node 20에서 바로 실행됩니다.
 *
 * 사용:
 *   node scripts/generate-wordle.mjs
 *   node scripts/generate-wordle.mjs --date 2026-05-29
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config.json");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getDateInTimeZone(timeZone = "Asia/Seoul") {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const obj = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

function parseDateArg() {
  const argv = process.argv.slice(2);
  const dateIndex = argv.findIndex((v) => v === "--date");
  if (dateIndex >= 0 && argv[dateIndex + 1]) return argv[dateIndex + 1];

  const inline = argv.find((v) => v.startsWith("--date="));
  if (inline) return inline.split("=")[1];

  if (process.env.WORDLE_DATE) return process.env.WORDLE_DATE;

  return null;
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`날짜 형식이 잘못되었습니다: ${date}. YYYY-MM-DD 형식으로 입력하세요.`);
  }
}

function getKoreanDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${year}년 ${month}월 ${day}일(${weekdays[d.getUTCDay()]})`;
}

function getShortDate(date) {
  const [, month, day] = date.split("-");
  return `${month}${day}`;
}

function normalizeAnswer(answer) {
  return String(answer || "").trim().toUpperCase();
}

function analyzeAnswer(answer) {
  const word = normalizeAnswer(answer);
  const letters = [...word];
  const vowels = new Set(["A", "E", "I", "O", "U"]);
  const vowelCount = letters.filter((ch) => vowels.has(ch)).length;
  const counts = {};
  for (const ch of letters) counts[ch] = (counts[ch] || 0) + 1;
  const duplicateLetters = Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([ch]) => ch);
  const hasDuplicate = duplicateLetters.length > 0;

  return {
    answer: word,
    first: letters[0] || "",
    last: letters[letters.length - 1] || "",
    vowelCount,
    hasDuplicate,
    duplicateLetters,
    duplicateText: hasDuplicate ? "있음" : "없음",
    repeatedText: hasDuplicate ? "반복됩니다" : "반복되지 않습니다",
    shape: letters.length === 5 ? `${letters[0]} _ _ _ ${letters[4]}` : letters.map((ch, i) => (i === 0 || i === letters.length - 1 ? ch : "_")).join(" "),
  };
}

function autoDifficulty(analysis) {
  // 아주 단순한 휴리스틱입니다. 실제 체감 난이도는 직접 수정하는 것을 추천합니다.
  const rareLetters = new Set(["J", "Q", "X", "Z", "V", "K"]);
  const rareCount = [...analysis.answer].filter((ch) => rareLetters.has(ch)).length;
  if (analysis.vowelCount <= 1 || rareCount >= 1 || analysis.hasDuplicate) return "중상";
  if (analysis.vowelCount >= 3) return "중하";
  return "중";
}

async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function fetchWordle(date) {
  const url = `https://www.nytimes.com/svc/wordle/v2/${date}.json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "wordle-auto-blogger/1.0 (+https://github.com/)",
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`NYT Wordle 데이터를 가져오지 못했습니다. status=${res.status}, url=${url}`);
  }

  const data = await res.json();
  if (!data.solution) {
    throw new Error(`NYT 응답에 solution이 없습니다: ${JSON.stringify(data)}`);
  }

  return {
    sourceUrl: url,
    raw: data,
    answer: normalizeAnswer(data.solution),
    puzzleNumber: data.days_since_launch ?? data.id ?? "",
    printDate: data.print_date || date,
    editor: data.editor || "",
  };
}

function getWordInfo(answer, config, analysis) {
  const key = normalizeAnswer(answer);
  const info = (config.wordInfo && config.wordInfo[key]) || {};

  return {
    pos: info.pos || "[직접 입력]",
    difficulty: info.difficulty || config.defaultDifficulty || autoDifficulty(analysis),
    category: info.category || "[뜻 범위 직접 입력]",
    hintTopic: info.hintTopic || "[주제 직접 입력]",
    frequency: info.frequency || config.defaultFrequency || "가끔",
    meaningKo: info.meaningKo || "[한국어 뜻 직접 입력]",
    candidateWord: info.candidateWord || config.defaultCandidateWord || "",
    successTry: info.successTry || config.defaultSuccessTry || "",
    extraMemo: info.extraMemo || config.defaultExtraMemo || "",
  };
}

function buildTitle({ date, puzzleNumber }) {
  const shortDate = getShortDate(date);
  const numText = puzzleNumber ? ` #${puzzleNumber}` : "";
  return `[${shortDate}] 오늘의 Wordle 워들${numText} 정답|힌트|뜻 풀이(스포방지)`;
}

function spoilerBlank(lines = 10) {
  return "\n".repeat(lines);
}

function buildBody({ date, puzzleNumber, answer, analysis, info, config }) {
  const dateKo = getKoreanDate(date);
  const numText = puzzleNumber ? ` #${puzzleNumber}` : "";
  const successText = info.successTry ? `[ ${info.successTry} ]번째` : `[  ]번째`;
  const candidateSentence = info.candidateWord
    ? `후보 단어로 ${info.candidateWord.toUpperCase()}도 떠올랐는데 정답은 ${answer}이었네요.`
    : `비슷한 후보 단어들이 있어서 마지막까지 살짝 고민했네요.`;

  const extraMemo = info.extraMemo
    ? `${info.extraMemo},,\n\n`
    : "";

  return `📅 ${dateKo}

Wordle 워들${numText} 1~3단계 순서로 힌트와 정답, 뜻 풀이까지 적어볼게요.

정답을 보지 않고 단계별 힌트를 보고 풀고 싶으신 분들은
스포방지 이미지에서 스크롤을 멈춰주세요!

👇 오늘의 Wordle 워들 단어 맞히기 링크
🔗 Wordle — The New York Times


💙 Wordle 워들 💙

오늘의 Wordle은 체감 난이도 [ ${info.difficulty} ] !

영어 단어가 아주 어렵진 않았지만,
[ 비슷한 후보 단어 ] 때문에
살짝 고민할 수 있는 문제였어요.


💙 Wordle 힌트 요약 💙

- 품사 : [ ${info.pos} ]

- 체감 난이도 : [ ${info.difficulty} ]

- 모음 개수 : [ ${analysis.vowelCount}개 ]

- 중복 글자 : [ ${analysis.duplicateText} ]

- 뜻 범위 : [ ${info.category} ]


[ Wordle 1단계 힌트 ]

오늘의 단어는 [ ${info.hintTopic} ]와 관련된 단어예요.

일상에서 [ ${info.frequency} ] 볼 수 있는 단어이고,
아주 전문적인 단어는 아니었습니다.

아직은 정답과 직접적인 글자 힌트는 없어요!


[ Wordle 2단계 힌트 ]

이제 글자 힌트입니다 !

- 모음은 [ ${analysis.vowelCount} ]개 들어갑니다.

- 같은 글자는 [ ${analysis.repeatedText} ].

- 끝 글자는 [ 흔한 편 ]입니다.

- 첫 글자 : [ ${analysis.first} ] ← 옆 드래그


[ Wordle 3단계 힌트 ]

거의 정답에 가까운 힌트입니다.
옆을 드래그하시면 숨겨진 글자가 보입니다 !

- 마지막 글자 : [ ${analysis.last} ] ← 옆 드래그

- 단어 모양 : [ ${analysis.shape} ] ← 옆 드래그

- 한국어 뜻 : [ ${info.meaningKo} ] ← 옆 드래그


💙 Wordle 정답 공개 💙

드디어 오늘의 Wordle 정답 공개입니다.

아직 직접 풀고 싶으신 분들은 스크롤을 멈춰주세요 !
(정답은 아래 캡처를 확인해 주세요👇)
${spoilerBlank(10)}

오늘의 정답은 [ ${answer} ] 입니다!


정답 단어는
“${info.meaningKo}”라는 뜻으로 볼 수 있어요.

첫 글자에서 [ ${analysis.first} ]가 잡히면 방향은 빨리 잡힐 수 있는데,
${candidateSentence}

${extraMemo}그래도 ${successText} 시도에서 정답 성공!

여러분은 오늘 몇 번 만에 성공하셨나요?


번외)

워들을 다 푸셨다면, 비슷한 방식의 꼬들도 도전해 보세요!
한국어 단어를 맞히는 또 다른 재미가 있답니다.

(클릭👉) 꼬들`;
}

function buildTags({ puzzleNumber, answer, config }) {
  const tags = [
    "#Wordle",
    "#워들",
    "#오늘의워들",
    "#워들힌트",
    "#워들정답",
    "#Wordle힌트",
    "#Wordle정답",
    "#워들풀이",
    "#Wordle풀이",
    "#워들스포방지",
    "#Wordle스포방지",
    "#영어단어게임",
    "#영어퍼즐",
    "#단어게임",
    "#NYTWordle",
    "#뉴욕타임즈워들",
  ];

  if (puzzleNumber) {
    tags.push(`#워들${puzzleNumber}`, `#Wordle${puzzleNumber}`);
  }

  if (config.includeAnswerInTags) {
    tags.push(`#${normalizeAnswer(answer)}`);
  }

  return [...new Set(tags)].join(" ");
}

function buildImageCaptions({ puzzleNumber }) {
  const numText = puzzleNumber ? ` #${puzzleNumber}` : "";
  return [
    `오늘의 Wordle 워들${numText} 스포방지`,
    "Wordle 힌트 요약",
    "Wordle 1단계 힌트",
    "Wordle 2단계 글자 힌트",
    "Wordle 3단계 강한 힌트",
    "오늘의 Wordle 정답 공개",
    "Wordle 풀이 결과",
  ];
}

async function ensureDirs() {
  await fs.mkdir(path.join(ROOT, "data"), { recursive: true });
  await fs.mkdir(path.join(ROOT, "posts"), { recursive: true });
}

async function writeOutputs(payload) {
  await ensureDirs();

  const date = payload.date;
  const jsonText = JSON.stringify(payload, null, 2);
  await fs.writeFile(path.join(ROOT, "data", `${date}.json`), jsonText, "utf8");
  await fs.writeFile(path.join(ROOT, "data", "latest.json"), jsonText, "utf8");

  const fullPost = `${payload.title}

${payload.body}

태그:
${payload.tags}
`;
  await fs.writeFile(path.join(ROOT, "posts", `${date}-wordle.txt`), fullPost, "utf8");
  await fs.writeFile(path.join(ROOT, "posts", "latest.txt"), fullPost, "utf8");

  const md = `# ${payload.title}

${payload.body}

---

${payload.tags}
`;
  await fs.writeFile(path.join(ROOT, "posts", `${date}-wordle.md`), md, "utf8");
}

async function main() {
  const config = await loadConfig();
  const date = parseDateArg() || getDateInTimeZone(config.timeZone || "Asia/Seoul");
  validateDate(date);

  const wordle = await fetchWordle(date);
  const analysis = analyzeAnswer(wordle.answer);
  const info = getWordInfo(wordle.answer, config, analysis);

  const title = buildTitle({ date, puzzleNumber: wordle.puzzleNumber });
  const body = buildBody({
    date,
    puzzleNumber: wordle.puzzleNumber,
    answer: wordle.answer,
    analysis,
    info,
    config,
  });
  const tags = buildTags({ puzzleNumber: wordle.puzzleNumber, answer: wordle.answer, config });
  const imageCaptions = buildImageCaptions({ puzzleNumber: wordle.puzzleNumber });

  const payload = {
    generatedAt: new Date().toISOString(),
    date,
    dateKorean: getKoreanDate(date),
    shortDate: getShortDate(date),
    sourceUrl: wordle.sourceUrl,
    raw: wordle.raw,
    answer: wordle.answer,
    puzzleNumber: wordle.puzzleNumber,
    editor: wordle.editor,
    analysis,
    info,
    title,
    body,
    tags,
    imageCaptions,
    note: "한국어 뜻/품사/체감 난이도는 config.json의 wordInfo에 등록되어 있으면 자동으로 들어가고, 없으면 편집용 문구가 들어갑니다.",
  };

  await writeOutputs(payload);

  console.log(`✅ Wordle blog draft generated`);
  console.log(`date=${date}`);
  console.log(`answer=${wordle.answer}`);
  console.log(`puzzleNumber=${wordle.puzzleNumber}`);
  console.log(`post=posts/${date}-wordle.txt`);
}

main().catch((err) => {
  console.error("❌ 생성 실패:", err);
  process.exit(1);
});
