{{ data.buyerName }} asked for a refund on {{ data.courseTitle }}

"{{ data.reason | newline_to_br | replace: "<br />", " " | strip_newlines | truncate: 140, "…" }}"