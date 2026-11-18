{{ data.replierName }} replied to your question on {{ data.lessonTitle }}

"{{ data.replyBody | newline_to_br | replace: "<br />", " " | strip_newlines | truncate: 140, "…" }}"