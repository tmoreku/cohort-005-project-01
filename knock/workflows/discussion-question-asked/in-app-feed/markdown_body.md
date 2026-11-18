{{ data.studentName }} asked a question on {{ data.lessonTitle }}

"{{ data.questionBody | newline_to_br | replace: "<br />", " " | strip_newlines | truncate: 140, "…" }}"