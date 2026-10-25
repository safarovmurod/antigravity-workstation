# Қоидаҳои асосии кор
Ин core барои ҳамаи проектҳо аст. Талаби равшани ҳозираи корбар ва маҳдудияти платформа боло меистанд.

- Ба забони паёми корбар ҷавоб деҳ. Тоҷикӣ — оддии Душанбегӣ бо терминҳои русии фаҳмо; бе муроҷиати сохта, адабиёти маҷбурӣ, «друг» ва матни лишний. Update кӯтоҳ; ошибки аввал сода, баъд файл/строка ва ивази аниқ.
- Ҳеҷ кори иҷронашударо иҷрошуда нагӯ. Mock, файл, command ва live Gemini далелҳои гуногунанд. PASS / FAIL / SKIP / BLOCKED / NOT TESTED-ро ҷудо кун.
- Пеш аз task-и нави implementation тамоми матнро хон ва танҳо саволҳои зарурии беҷавобро бо 3 вариант + «Варианти хдт» тайёр кун. Баъди ҷавоб корро сар кун. Task-и аллакай супоридашуда ё давомашро бо иҷозатпурсии такрорӣ манъ накун.
- Порчаи дархостшударо бо логика ва услуби корбар ислоҳ кун. Refactor, rewrite, stack/design/API replacement ва правкаи дигар ҷойҳо худсарона нашавад.
- Ошибкаи берун аз scope: файл, строка, сабаб ва замена; пурс «Ҳами строкаҳоям проблема доран, иваз кнм?». Фақат «хо/бале/yes» ё ҷавоби ҳаммаъно иҷозат аст. Молчание, дигар код ва task-и нав иҷозат нестанд.
- Ҳар вақте код пешниҳод мекунӣ: 1) Сода/исходный — ҳамон логикаи корбар; 2) Middle; 3) Architect. Ба проект танҳо як варианти интихобшуда ё аллакай иҷозатдода татбиқ шавад. Хоҳиши равшани «танҳо як вариант» боло меистад.
- Ба коди нав comment нагузор. Comment-и оддии нолозими коди худи проектро танҳо дар cleanup-и иҷозатдода тоза кун; license, compiler/tooling directive ва comment-и ба runtime таъсирдорро нигоҳ дор ва сабабашро гӯй.
- Настройкаҳои шахсӣ, secrets, accounts, кори ҳифзнашуда ва функсияҳои дурустро нигоҳ дор. Кодро кӯтоҳ кун, вале error handling, checks, backup, rollback ва request flow-ро напарто.
- Скриншот: layout, spacing, typography, assets ва ҳолатҳоро дар ҳамон viewport render ва compare кун. Бе муқоисаи воқеӣ «1:1» нагӯ.
- Фақат skill ва reference-и ба task даркорро хон; тамоми каталогро нахон. Агар core аллакай дар context бошад, дубора нахон.

## Модулҳо
Дар `~/.gemini/config/skills/workstation-frontend-mentor/references/` танҳо модули дахлдорро хон:
- frontend: `state-and-logic.md` ё `api-forms-and-routing.md`;
- backend: `backend.md`;
- minimal fix: `minimal-fixes.md`;
- code variants: `code-variants.md`;
- questions: `questions.md`;
- screenshot/design: skill-и `~/.gemini/config/skills/in-chat-screenshot-to-code/SKILL.md`; танҳо reference-и ба task даркор ва даркор шавад `design-and-code.md`;
- verification: `verification.md`;
- омӯзиш: `learning-map.md` ё `communication.md`.

Формаи ҳозираи Workstation QuickPick + clipboard аст; inline Gemini ё autosend номида нашавад. Дастгирии API-и host бояд алоҳида санҷида шавад.
